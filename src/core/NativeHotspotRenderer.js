import OpenSeadragon from 'openseadragon';

/**
 * NativeHotspotRenderer - OpenSeadragon overlay system for interactive hotspots
 * FIXED: Prioritizes smaller hotspots when nested inside larger ones
 */
class NativeHotspotRenderer {
    constructor(options = {}) {
        Object.assign(this, {
            viewer: options.viewer,
            spatialIndex: options.spatialIndex,
            onHotspotHover: options.onHotspotHover || (() => { }),
            onHotspotClick: options.onHotspotClick || (() => { }),
            visibilityCheckInterval: options.visibilityCheckInterval || 100,
            batchSize: options.batchSize || 50,
            renderDebounceTime: options.renderDebounceTime || 16,
            debugMode: options.debugMode || false
        });



        this.overlays = new Map();
        this.visibleOverlays = new Set();
        this.hoveredHotspot = null;
        this.selectedHotspot = null;

        // Track drag state
        this.isDragging = false;
        this.dragStartTime = 0;
        this.dragStartPoint = null;

        // Mobile detection
        this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
            ('ontouchstart' in window);

        // Thresholds for click vs drag
        this.clickTimeThreshold = 300;  // ms
        this.clickDistThreshold = this.isMobile ? 12 : 8;  // pixels

        // Cache for hotspot areas
        this.hotspotAreas = new Map();

        // Pointer event tracking
        this.activePointers = new Map(); // Track active pointers for multi-touch
        this.primaryPointerId = null;
        this.lastPointerDownTime = 0;
        this.lastPointerDownPoint = null;
        this.isPinching = false;

        // Track zoom state to prevent updates during animation
        this.isViewerZooming = false;
        this.lastZoomValue = null;

        // Animation blocking flag
        this.isAnimationInProgress = false;
        this.pendingVisibilityUpdate = false;

        this.initStyles();
        this.init();
    }


    initStyles() {
        const baseStyle = {
            strokeWidth: 1,
            hoverStrokeWidth: 2,
            selectedStrokeWidth: 3
        };

        const colors = {
            audio_only: { fill: [0, 203, 244], stroke: '#00cbf4' },
            audio_link: { fill: [73, 243, 0], stroke: '#49f300' },
            audio_image: { fill: [255, 5, 247], stroke: '#ff05f7' },
            audio_image_link: { fill: [255, 93, 0], stroke: '#ff5d00' },
            audio_sound: { fill: [255, 176, 0], stroke: '#ffb000' }
        };

        this.styles = {};

        // Debug mode: colored fills
        if (this.debugMode) {
            Object.entries(colors).forEach(([type, color]) => {
                this.styles[type] = {
                    ...baseStyle,
                    stroke: color.stroke,
                    fill: `rgba(${color.fill.join(',')}, 0.3)`,
                    hoverFill: `rgba(${color.fill.join(',')}, 0.5)`,
                    selectedFill: `rgba(${color.fill.join(',')}, 0.7)`
                };
            });
        } else {
            // Production mode: subtle/invisible fills
            Object.entries(colors).forEach(([type]) => {
                this.styles[type] = {
                    ...baseStyle,
                    stroke: 'rgba(255, 255, 255, 0)',  // Invisible by default
                    fill: 'rgba(255, 255, 255, 0)',     // Completely transparent
                    hoverFill: 'rgba(255, 255, 255, 0.25)', // More visible on hover
                    hoverStroke: 'rgba(255, 255, 255, 1)', // Bright white border on hover
                    selectedFill: 'rgba(255, 255, 255, 0.35)',
                    selectedStroke: 'rgba(255, 255, 255, 1)'
                };
            });
        }
    }


    async init() {
        if (!this.viewer.world.getItemCount()) {
            this.viewer.addOnceHandler('open', () => this.init());
            return;
        }

        const tiledImage = this.viewer.world.getItemAt(0);
        const imageSize = tiledImage.getContentSize();

        this.svg = this.createSVG(imageSize);

        this.viewer.addOverlay({
            element: this.svg,
            location: new OpenSeadragon.Rect(0, 0, 1, imageSize.y / imageSize.x),
            placement: OpenSeadragon.Placement.TOP_LEFT
        });

        await this.loadHotspotsInBatches();
        this.setupMouseTracking();
        this.setupDragDetection();

        // Update styles on zoom change
        this.viewer.addHandler('zoom', () => {
            // Update all visible hotspots with new glow intensity
            if (this.hoveredHotspot) {
                const overlay = this.overlays.get(this.hoveredHotspot.id);
                if (overlay) {
                    this.applyStyle(overlay.element, this.hoveredHotspot.type, 'hover');
                }
            }
            if (this.selectedHotspot && this.selectedHotspot !== this.hoveredHotspot) {
                const overlay = this.overlays.get(this.selectedHotspot.id);
                if (overlay) {
                    this.applyStyle(overlay.element, this.selectedHotspot.type, 'selected');
                }
            }
        });
        this.startVisibilityTracking();
    }

    createSVG(imageSize) {
        const svgString = `<svg xmlns="http://www.w3.org/2000/svg" 
                           width="${imageSize.x}" height="${imageSize.y}" 
                           viewBox="0 0 ${imageSize.x} ${imageSize.y}"
                           style="position: absolute; width: 100%; height: 100%; pointer-events: auto;"></svg>`;

        return new DOMParser().parseFromString(svgString, 'image/svg+xml').documentElement;
    }

    async loadHotspotsInBatches() {
        const hotspots = this.spatialIndex.getAllHotspots();
        const totalBatches = Math.ceil(hotspots.length / this.batchSize);

        for (let i = 0; i < totalBatches; i++) {
            const batch = hotspots.slice(i * this.batchSize, (i + 1) * this.batchSize);
            batch.forEach(hotspot => this.createHotspotOverlay(hotspot));

            if (i < totalBatches - 1) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        console.log(`Loaded ${hotspots.length} hotspots in ${totalBatches} batches`);
    }

    createHotspotOverlay(hotspot) {
        const g = this.createGroup(hotspot);

        const paths = hotspot.shape === 'polygon'
            ? [this.createPath(hotspot.coordinates)]
            : hotspot.coordinates.map(polygon => this.createPath(polygon));

        paths.forEach(path => g.appendChild(path));

        this.applyStyle(g, hotspot.type, 'normal');

        this.svg.appendChild(g);

        const bounds = this.calculateBounds(hotspot.coordinates);
        const area = this.calculateArea(bounds);

        this.overlays.set(hotspot.id, {
            element: g,
            hotspot: hotspot,
            bounds: bounds,
            area: area,
            isVisible: false
        });

        // Cache the area for performance
        this.hotspotAreas.set(hotspot.id, area);
    }

    createGroup(hotspot) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        Object.assign(g.style, {
            cursor: 'pointer',
            pointerEvents: 'fill',
            opacity: this.debugMode ? '1' : '0',  // Visible in debug, invisible in prod
            transition: 'opacity 0.2s ease-out',
            '-webkit-tap-highlight-color': 'transparent'
        });
        g.setAttribute('data-hotspot-id', hotspot.id);
        return g;
    }

    createPath(coordinates) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = coordinates.reduce((acc, [x, y], i) =>
            acc + (i === 0 ? 'M' : 'L') + `${Math.round(x)},${Math.round(y)}`, '') + 'Z';

        path.setAttribute('d', d);
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        path.style.pointerEvents = 'fill';
        return path;
    }

    setupDragDetection() {
        // Listen to OpenSeadragon's drag events
        this.viewer.addHandler('canvas-drag', () => {
            console.log('canvas-drag detected, setting isDragging = true');
            this.isDragging = true;
        });

        this.viewer.addHandler('canvas-drag-end', () => {
            console.log('canvas-drag-end detected, setting isDragging = false');
            // Reset immediately, no delay
            this.isDragging = false;
        });
    }

    setupMouseTracking() {
        // Ensure SVG can receive pointer events
        this.svg.style.pointerEvents = 'auto';

        // Use pointer events ONLY on container to avoid conflicts
        const container = this.viewer.container;

        container.addEventListener('pointerdown', this.handlePointerDown.bind(this));
        container.addEventListener('pointermove', this.handlePointerMove.bind(this));
        container.addEventListener('pointerup', this.handlePointerUp.bind(this));
        container.addEventListener('pointercancel', this.handlePointerCancel.bind(this));

        // Keep mousemove for hover effects on desktop - on SVG
        this.svg.addEventListener('mousemove', (event) => {
            const rect = this.viewer.element.getBoundingClientRect();
            const pixelPoint = new OpenSeadragon.Point(
                event.clientX - rect.left,
                event.clientY - rect.top
            );

            const viewportPoint = this.viewer.viewport.pointFromPixel(pixelPoint);
            const imagePoint = this.viewer.viewport.viewportToImageCoordinates(viewportPoint);

            // Find the smallest hotspot under cursor
            const foundHotspot = this.findSmallestHotspotAtPoint(imagePoint);

            // Update hover state
            if (foundHotspot !== this.hoveredHotspot) {
                if (this.hoveredHotspot) {
                    const prevOverlay = this.overlays.get(this.hoveredHotspot.id);
                    if (prevOverlay) {
                        this.applyStyle(prevOverlay.element, this.hoveredHotspot.type,
                            this.hoveredHotspot === this.selectedHotspot ? 'selected' : 'normal');
                    }
                }

                this.hoveredHotspot = foundHotspot;
                this.onHotspotHover(foundHotspot);

                if (foundHotspot) {
                    const overlay = this.overlays.get(foundHotspot.id);
                    if (overlay) {
                        this.applyStyle(overlay.element, foundHotspot.type, 'hover');
                    }
                }
            }

            // Update cursor
            this.svg.style.cursor = foundHotspot ? 'pointer' : 'default';
        });
    }

    handlePointerDown(event) {

        // Failsafe: ensure updates are not paused when user interacts
        if (this.updatesPaused) {
            console.warn('Updates were paused during interaction - forcing resume');
            this.resumeUpdates();
        }

        console.log('handlePointerDown', {
            pointerId: event.pointerId,
            activePointersBefore: this.activePointers.size
        });
        // Track all pointers
        this.activePointers.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
            startX: event.clientX,
            startY: event.clientY,
            startTime: Date.now()
        });

        // Prevent default to avoid ghost clicks on touch devices
        if (this.isMobile) {
            event.preventDefault();
        }

        // First pointer becomes primary
        if (this.activePointers.size === 1) {
            this.primaryPointerId = event.pointerId;
            this.lastPointerDownTime = Date.now();
            this.lastPointerDownPoint = { x: event.clientX, y: event.clientY };
        }
    }

    handlePointerMove(event) {
        if (this.activePointers.has(event.pointerId)) {
            const pointer = this.activePointers.get(event.pointerId);
            pointer.x = event.clientX;
            pointer.y = event.clientY;

            // Detect pinch gesture with 2+ pointers
            if (this.activePointers.size >= 2) {
                this.isPinching = true;
            }
        }
    }

    handlePointerUp(event) {
        console.log('handlePointerUp start', {
            pointerId: event.pointerId,
            hasPointer: this.activePointers.has(event.pointerId),
            activePointers: this.activePointers.size
        });

        if (!this.activePointers.has(event.pointerId)) return;

        const pointer = this.activePointers.get(event.pointerId);
        const duration = Date.now() - pointer.startTime;
        const distance = Math.sqrt(
            Math.pow(event.clientX - pointer.startX, 2) +
            Math.pow(event.clientY - pointer.startY, 2)
        );

        console.log('handlePointerUp checks', {
            isPrimary: event.pointerId === this.primaryPointerId,
            primaryPointerId: this.primaryPointerId,
            activePointers: this.activePointers.size,
            isPinching: this.isPinching,
            isDragging: this.isDragging,
            duration: duration,
            clickTimeThreshold: this.clickTimeThreshold,
            distance: distance,
            clickDistThreshold: this.clickDistThreshold
        });

        // Only process click if it's the primary pointer and not pinching
        if (event.pointerId === this.primaryPointerId &&
            this.activePointers.size === 1 &&
            !this.isPinching &&
            !this.isDragging &&
            duration < this.clickTimeThreshold &&
            distance < this.clickDistThreshold) {

            console.log('Conditions passed, calling handleClick');
            // Process as click
            this.handleClick(event);
        } else {
            console.log('Click conditions NOT met');
        }

        // Remove pointer
        this.activePointers.delete(event.pointerId);

        // Reset states when all pointers are released
        if (this.activePointers.size === 0) {
            this.primaryPointerId = null;
            this.isPinching = false;
        }
    }

    handlePointerCancel(event) {
        // Clean up on cancel
        this.activePointers.delete(event.pointerId);
        if (this.activePointers.size === 0) {
            this.primaryPointerId = null;
            this.isPinching = false;
        }
    }

    handleClick(event) {
        console.log('handleClick called', {
            isDragging: this.isDragging,
            isPinching: this.isPinching,
            activePointers: this.activePointers.size,
            timestamp: Date.now()
        });

        // Prevent if clicking on controls
        if (event.target.closest('.openseadragon-controls')) {
            return;
        }

        // OPTIMIZATION: Use cached last hover position on mobile
        if (this.isMobile && this.hoveredHotspot) {
            console.log('Using cached hover hotspot for mobile click');
            event.stopPropagation();
            event.preventDefault();
            this.activateHotspot(this.hoveredHotspot);
            return;
        }

        // Desktop continues with full calculation
        const rect = this.viewer.element.getBoundingClientRect();
        const pixelPoint = new OpenSeadragon.Point(
            event.clientX - rect.left,
            event.clientY - rect.top
        );

        // Convert to viewport then image coordinates
        const viewportPoint = this.viewer.viewport.pointFromPixel(pixelPoint);
        const imagePoint = this.viewer.viewport.viewportToImageCoordinates(viewportPoint);

        // Find the smallest hotspot at this point
        const clickedHotspot = this.findSmallestHotspotAtPoint(imagePoint);

        if (clickedHotspot) {
            event.stopPropagation();
            event.preventDefault();
            this.activateHotspot(clickedHotspot);
        }
    }

    /**
     * Activate a hotspot (common method for touch and click)
     */
    activateHotspot(hotspot) {
        console.log('Activating hotspot:', hotspot.id, Date.now());
        this.selectedHotspot = hotspot;
        this.onHotspotClick(hotspot);

        // Update visual state
        this.overlays.forEach((overlay, id) => {
            const state = id === hotspot.id ? 'selected' :
                (id === this.hoveredHotspot?.id ? 'hover' : 'normal');
            this.applyStyle(overlay.element, overlay.hotspot.type, state);
        });
    }

    /**
     * Find the smallest hotspot at a given point
     * This ensures smaller hotspots take priority over larger ones
     */
    findSmallestHotspotAtPoint(point) {
        const candidates = [];

        // Collect all hotspots containing the point
        this.overlays.forEach((overlay, id) => {
            if (overlay.isVisible && this.isPointInHotspot(point, overlay)) {
                candidates.push({
                    hotspot: overlay.hotspot,
                    area: overlay.area
                });
            }
        });

        // No hotspots found
        if (candidates.length === 0) {
            return null;
        }

        // Sort by area (smallest first) and return the smallest
        candidates.sort((a, b) => a.area - b.area);
        return candidates[0].hotspot;
    }

    /**
     * Check if point is inside hotspot using precise polygon detection
     */
    isPointInHotspot(point, overlay) {
        const hotspot = overlay.hotspot;

        // First check bounding box for performance
        const bounds = overlay.bounds;
        if (point.x < bounds.minX || point.x > bounds.maxX ||
            point.y < bounds.minY || point.y > bounds.maxY) {
            return false;
        }

        // Then do precise polygon check
        if (hotspot.shape === 'polygon') {
            return this.pointInPolygon(point.x, point.y, hotspot.coordinates);
        } else if (hotspot.shape === 'multipolygon') {
            // For multipolygon, check if point is in ANY of the polygons
            return hotspot.coordinates.some(polygon =>
                this.pointInPolygon(point.x, point.y, polygon)
            );
        }

        return false;
    }

    /**
     * Ray casting algorithm for precise point-in-polygon detection
     */
    pointInPolygon(x, y, polygon) {
        let inside = false;
        const n = polygon.length;

        let p1x = polygon[0][0];
        let p1y = polygon[0][1];

        for (let i = 1; i <= n; i++) {
            const p2x = polygon[i % n][0];
            const p2y = polygon[i % n][1];

            if (y > Math.min(p1y, p2y)) {
                if (y <= Math.max(p1y, p2y)) {
                    if (x <= Math.max(p1x, p2x)) {
                        if (p1y !== p2y) {
                            const xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x;
                            if (p1x === p2x || x <= xinters) {
                                inside = !inside;
                            }
                        }
                    }
                }
            }

            p1x = p2x;
            p1y = p2y;
        }

        return inside;
    }


    applyStyle(group, type, state) {
        const style = this.styles[type] || this.styles.audio_only;
        const paths = group.getElementsByTagName('path');
        const glowIntensity = this.calculateGlowIntensity();

        group.setAttribute('class', `hotspot-${type} hotspot-${state}`);

        for (let path of paths) {
            if (this.debugMode) {
                // Debug mode: always show colors
                Object.assign(path.style, {
                    fill: style[`${state}Fill`] || style.fill,
                    stroke: style.stroke,
                    strokeWidth: style[`${state}StrokeWidth`] + 'px' || style.strokeWidth + 'px',
                    filter: state === 'hover' ? `drop-shadow(0 0 8px ${style.stroke})` : '',
                    opacity: '1'
                });
            } else {
                // Production mode: adaptive glow
                const isHover = state === 'hover';
                const isSelected = state === 'selected';

                // Calculate stroke width based on zoom (minimum 2px for visibility)
                let strokeWidth = 0;
                if (isHover || isSelected) {
                    if (glowIntensity > 0.7) {
                        strokeWidth = 4;  // Thick border at low zoom
                    } else if (glowIntensity > 0.5) {
                        strokeWidth = 3;  // Medium border at medium zoom
                    } else {
                        strokeWidth = 2;  // Still visible at high zoom
                    }
                }

                // Always use full opacity for stroke, adjust width instead
                Object.assign(path.style, {
                    fill: style[`${state}Fill`] || style.fill,
                    stroke: (isHover || isSelected) ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0)',
                    strokeWidth: strokeWidth + 'px',
                    strokeOpacity: glowIntensity, // Use strokeOpacity for fading effect
                    transition: 'all 0.2s ease',
                    filter: 'none',
                    opacity: isHover || isSelected ? '1' : '0'
                });

                // Add outer glow at low-medium zoom levels
                if ((isHover || isSelected) && glowIntensity > 0.5) {
                    const glowSize = Math.max(4, 12 * glowIntensity); // Minimum 4px glow
                    path.style.filter = `drop-shadow(0 0 ${glowSize}px rgba(255, 255, 255, ${glowIntensity * 0.6}))`;
                }
            }
        }

        // Set group opacity
        if (this.debugMode) {
            group.style.opacity = '1';
        } else {
            group.style.opacity = (state === 'hover' || state === 'selected') ? '1' : '0';

            // Keep pulsing animation at low-medium zoom only
            if (state === 'hover' && glowIntensity > 0.5) {
                group.style.animation = 'hotspotPulse 1.5s ease-in-out infinite';
            } else {
                group.style.animation = '';
            }
        }
    }

    calculateBounds(coordinates) {
        let bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

        const processPoints = (points) => {
            points.forEach(([x, y]) => {
                bounds.minX = Math.min(bounds.minX, x);
                bounds.minY = Math.min(bounds.minY, y);
                bounds.maxX = Math.max(bounds.maxX, x);
                bounds.maxY = Math.max(bounds.maxY, y);
            });
        };

        if (Array.isArray(coordinates[0]) && typeof coordinates[0][0] === 'number') {
            processPoints(coordinates);
        } else {
            coordinates.forEach(processPoints);
        }

        return bounds;
    }

    /**
     * Calculate approximate area of hotspot using bounding box
     * For performance, we use bounding box area instead of exact polygon area
     */
    calculateArea(bounds) {
        return (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);
    }

    /**
     * Calculate glow intensity based on zoom level
     * Returns opacity value between 0.3 and 1 (never fully transparent)
     */
    calculateGlowIntensity() {
        if (!this.viewer || !this.viewer.viewport) return 1;

        const zoom = this.viewer.viewport.getZoom();
        const minZoom = 1;     // Start reducing at zoom 1
        const maxZoom = 10;    // Maximum reduction at zoom 10

        if (zoom <= minZoom) return 1;       // Full intensity
        if (zoom >= maxZoom) return 0.3;     // Minimum 30% intensity (still visible)

        // Smooth curve for better transition
        const progress = (zoom - minZoom) / (maxZoom - minZoom);
        const eased = 1 - Math.pow(progress, 0.5); // Square root for gentler reduction

        // Map to range [0.3, 1]
        return 0.3 + (eased * 0.7);
    }


    startVisibilityTracking() {
        let updateTimer = null;
        let lastUpdateTime = 0;
        const minUpdateInterval = this.isMobile ? 100 : 50; // Slower updates on mobile

        const scheduleUpdate = () => {
            if (updateTimer) clearTimeout(updateTimer);

            // Block all updates during animation on mobile
            if (this.isAnimationInProgress || (this.isMobile && this.viewer.isAnimating())) {
                this.pendingVisibilityUpdate = true;
                return;
            }

            // Throttle updates
            const now = Date.now();
            const timeSinceLastUpdate = now - lastUpdateTime;

            if (timeSinceLastUpdate < minUpdateInterval) {
                updateTimer = setTimeout(() => {
                    scheduleUpdate();
                }, minUpdateInterval - timeSinceLastUpdate);
                return;
            }

            updateTimer = setTimeout(() => {
                lastUpdateTime = Date.now();
                this.updateVisibility();
            }, this.renderDebounceTime);
        };

        this.viewer.addHandler('animation', scheduleUpdate);
        this.viewer.addHandler('animation-finish', () => {
            // Only update after animation if not paused
            if (!this.updatesPaused && !this.isAnimationInProgress) {
                this.updateVisibility();
            }
        });

        // Remove viewport-change handler on mobile to prevent updates during zoom
        if (!this.isMobile) {
            this.viewer.addHandler('viewport-change', scheduleUpdate);
        }

        // Initial update
        this.updateVisibility();
    }

    updateVisibility() {
        if (this.updatesPaused || this.isAnimationInProgress) {
            console.log('updateVisibility BLOCKED - animation in progress');
            this.pendingVisibilityUpdate = true;
            return;
        }

        // Check if viewer is actively zooming
        const currentZoom = this.viewer.viewport.getZoom();
        const targetZoom = this.viewer.viewport.zoomSpring.target.value;
        const isZooming = Math.abs(currentZoom - targetZoom) > 0.001;

        if (isZooming) {
            console.log('updateVisibility SKIPPED - viewer is zooming');
            this.pendingVisibilityUpdate = true;
            return;
        }

        // Skip during any animation
        if (this.viewer.isAnimating()) {
            console.log('updateVisibility SKIPPED - viewer is animating');
            this.pendingVisibilityUpdate = true;
            return;
        }

        console.log('updateVisibility running');

        const viewport = this.viewer.viewport;
        const currentZoomLevel = viewport.getZoom();

        // Special handling for low zoom
        if (currentZoomLevel < 1.5) {
            // Keep hotspots interactive but invisible at very low zoom
            this.overlays.forEach((overlay) => {
                const isHovered = this.hoveredHotspot?.id === overlay.hotspot.id;
                const isSelected = this.selectedHotspot?.id === overlay.hotspot.id;

                if (isHovered || isSelected) {
                    overlay.element.style.opacity = '1';
                    overlay.element.style.display = 'block';
                } else {
                    overlay.element.style.opacity = '0';
                    overlay.element.style.display = 'block';
                }
                overlay.element.style.pointerEvents = 'auto';
                overlay.isVisible = true;
            });

            // Don't return early - continue with normal processing
        }

        const bounds = viewport.getBounds();
        const topLeft = viewport.viewportToImageCoordinates(bounds.getTopLeft());
        const bottomRight = viewport.viewportToImageCoordinates(bounds.getBottomRight());

        const viewBounds = {
            minX: topLeft.x,
            minY: topLeft.y,
            maxX: bottomRight.x,
            maxY: bottomRight.y
        };

        const padding = (viewBounds.maxX - viewBounds.minX) * 0.2;
        Object.keys(viewBounds).forEach(key => {
            viewBounds[key] += key.startsWith('min') ? -padding : padding;
        });

        let visibleCount = 0;

        this.overlays.forEach((overlay, id) => {
            const isVisible = this.boundsIntersect(overlay.bounds, viewBounds);

            if (isVisible !== overlay.isVisible) {
                overlay.element.style.opacity = isVisible ? '1' : '0';
                overlay.isVisible = isVisible;

                if (isVisible) {
                    this.visibleOverlays.add(id);
                    visibleCount++;
                } else {
                    this.visibleOverlays.delete(id);
                }
            } else if (isVisible) {
                visibleCount++;
            }
        });

        // Force update overlay positions after zoom
        if (this.viewer.world.getItemCount() > 0) {
            this.viewer.updateOverlay(this.svg);
        }

        if (visibleCount > 100) {
            console.log(`Performance note: ${visibleCount} hotspots visible`);
        }
    }


    updateVisibilityLazy() {
        // Lazy visibility update for mobile - spreads work across multiple frames
        if (this.updatesPaused) {
            console.log('updateVisibilityLazy SKIPPED - updates are paused');
            return;
        }

        console.log('updateVisibilityLazy starting - mobile optimized');

        const viewport = this.viewer.viewport;
        const currentZoomLevel = viewport.getZoom();

        // Skip if still animating
        if (this.viewer.isAnimating()) {
            console.log('updateVisibilityLazy deferred - still animating');
            setTimeout(() => this.updateVisibilityLazy(), 100);
            return;
        }

        const bounds = viewport.getBounds();
        const topLeft = viewport.viewportToImageCoordinates(bounds.getTopLeft());
        const bottomRight = viewport.viewportToImageCoordinates(bounds.getBottomRight());

        const viewBounds = {
            minX: topLeft.x,
            minY: topLeft.y,
            maxX: bottomRight.x,
            maxY: bottomRight.y
        };

        // Add padding
        const padding = (viewBounds.maxX - viewBounds.minX) * 0.2;
        Object.keys(viewBounds).forEach(key => {
            viewBounds[key] += key.startsWith('min') ? -padding : padding;
        });

        // Process hotspots in smaller chunks for mobile
        const hotspots = Array.from(this.overlays.entries());
        const chunkSize = 20; // Reduced from 50 to 20 for mobile
        let index = 0;
        let processedInFrame = 0;
        const maxPerFrame = 30; // Maximum hotspots to process per frame

        const processChunk = () => {
            const startTime = performance.now();
            processedInFrame = 0;

            // Process until we hit time limit or chunk size
            while (index < hotspots.length &&
                processedInFrame < maxPerFrame &&
                (performance.now() - startTime) < 8) { // 8ms budget per frame

                const [id, overlay] = hotspots[index];
                const isVisible = this.boundsIntersect(overlay.bounds, viewBounds);

                if (isVisible !== overlay.isVisible) {
                    overlay.element.style.opacity = isVisible ? '1' : '0';
                    overlay.isVisible = isVisible;

                    if (isVisible) {
                        this.visibleOverlays.add(id);
                    } else {
                        this.visibleOverlays.delete(id);
                    }
                }

                index++;
                processedInFrame++;
            }

            // Continue processing if more hotspots remain
            if (index < hotspots.length) {
                // Use requestIdleCallback if available, otherwise requestAnimationFrame
                if ('requestIdleCallback' in window) {
                    requestIdleCallback(() => processChunk(), { timeout: 50 });
                } else {
                    requestAnimationFrame(processChunk);
                }
            } else {
                // All chunks processed - update overlay position once
                if (this.viewer.world.getItemCount() > 0) {
                    requestAnimationFrame(() => {
                        this.viewer.updateOverlay(this.svg);
                        console.log('updateVisibilityLazy complete');
                    });
                }
            }
        };

        // Start processing with idle callback
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => processChunk(), { timeout: 100 });
        } else {
            setTimeout(() => requestAnimationFrame(processChunk), 50);
        }
    }

    boundsIntersect(a, b) {
        return !(
            a.maxX < b.minX ||
            a.minX > b.maxX ||
            a.maxY < b.minY ||
            a.minY > b.maxY
        );
    }

    /**
     * Zoom to hotspot with intelligent framing
     */
    zoomToHotspot(hotspot) {
        const overlay = this.overlays.get(hotspot.id);
        if (!overlay) return;

        const bounds = overlay.bounds;
        const imageSize = this.viewer.world.getItemAt(0).getContentSize();

        // Convert to viewport coordinates
        const viewportBounds = new OpenSeadragon.Rect(
            bounds.minX / imageSize.x,
            bounds.minY / imageSize.y,
            (bounds.maxX - bounds.minX) / imageSize.x,
            (bounds.maxY - bounds.minY) / imageSize.y
        );

        // Add padding based on hotspot size
        const area = overlay.area;
        const imageArea = imageSize.x * imageSize.y;
        const relativeSize = area / imageArea;

        // Smaller hotspots get more padding to be clearly visible
        const paddingFactor = relativeSize < 0.01 ? 1.0 :
            relativeSize < 0.05 ? 0.7 :
                relativeSize < 0.1 ? 0.5 : 0.3;

        const paddingX = viewportBounds.width * paddingFactor;
        const paddingY = viewportBounds.height * paddingFactor;

        const zoomBounds = new OpenSeadragon.Rect(
            viewportBounds.x - paddingX,
            viewportBounds.y - paddingY,
            viewportBounds.width + paddingX * 2,
            viewportBounds.height + paddingY * 2
        );

        this.viewer.viewport.fitBounds(zoomBounds, false);
    }

    /**
     * Get metrics about hotspot overlaps
     */
    getOverlapMetrics() {
        const overlaps = [];
        const overlayArray = Array.from(this.overlays.values());

        for (let i = 0; i < overlayArray.length; i++) {
            for (let j = i + 1; j < overlayArray.length; j++) {
                if (this.boundsIntersect(overlayArray[i].bounds, overlayArray[j].bounds)) {
                    overlaps.push({
                        hotspot1: overlayArray[i].hotspot.id,
                        hotspot2: overlayArray[j].hotspot.id,
                        area1: overlayArray[i].area,
                        area2: overlayArray[j].area
                    });
                }
            }
        }

        return {
            totalOverlaps: overlaps.length,
            overlaps: overlaps
        };
    }

    setDebugMode(enabled) {
        this.debugMode = enabled;
        this.initStyles(); // Reinitialize styles

        // Update all existing hotspots
        this.overlays.forEach((overlay, id) => {
            const state = id === this.selectedHotspot?.id ? 'selected' :
                (id === this.hoveredHotspot?.id ? 'hover' : 'normal');
            this.applyStyle(overlay.element, overlay.hotspot.type, state);
        });
    }

    pauseUpdates() {
        console.log('pauseUpdates called - blocking all visibility updates');
        this.updatesPaused = true;
        this.isAnimationInProgress = true;

        // Hide non-selected hotspots during animation
        if (this.selectedHotspot) {
            this.overlays.forEach((overlay, id) => {
                if (id !== this.selectedHotspot.id && id !== this.hoveredHotspot?.id) {
                    overlay.element.style.visibility = 'hidden';
                }
            });
        }
    }

    resumeUpdates() {
        console.log('resumeUpdates called - unblocking updates');
        this.updatesPaused = false;
        this.isAnimationInProgress = false;

        // Restore visibility of all overlays
        this.overlays.forEach((overlay) => {
            overlay.element.style.visibility = 'visible';
        });

        // Process any pending update
        if (this.pendingVisibilityUpdate) {
            this.pendingVisibilityUpdate = false;
            if (this.isMobile) {
                this.updateVisibilityLazy();
            } else {
                this.updateVisibility();
            }
        }
    }

    hideOverlay() {
        console.log('Hiding entire SVG overlay');
        if (this.svg) {
            this.svg.style.display = 'none';
        }
    }

    showOverlay() {
        console.log('Showing SVG overlay');
        if (this.svg) {
            this.svg.style.display = '';
        }
    }

    destroy() {

        if (this.mouseTracker) {
            this.mouseTracker.destroy();
        }

        this.viewer.removeAllHandlers('animation');
        this.viewer.removeAllHandlers('animation-finish');
        this.viewer.removeAllHandlers('viewport-change');
        this.viewer.removeHandler('canvas-drag');
        this.viewer.removeHandler('canvas-drag-end');
        this.viewer.removeHandler('zoom');

        if (this.svg) {
            // Remove pointer event listeners
            this.svg.removeEventListener('pointerdown', this.handlePointerDown);
            this.svg.removeEventListener('pointermove', this.handlePointerMove);
            this.svg.removeEventListener('pointerup', this.handlePointerUp);
            this.svg.removeEventListener('pointercancel', this.handlePointerCancel);

            this.viewer.removeOverlay(this.svg);
        }

        this.overlays.clear();
        this.visibleOverlays.clear();
        this.hotspotAreas.clear();
        this.viewer = null;
    }
}

export default NativeHotspotRenderer;