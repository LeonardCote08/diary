import OpenSeadragon from 'openseadragon';

/**
 * NativeHotspotRenderer - Uses OpenSeadragon's native overlay system
 * Optimized for performance following Deji's scalability requirements
 */
class NativeHotspotRenderer {
    constructor(options = {}) {
        this.viewer = options.viewer;
        this.spatialIndex = options.spatialIndex;
        this.onHotspotHover = options.onHotspotHover || (() => { });
        this.onHotspotClick = options.onHotspotClick || (() => { });

        // State
        this.overlays = new Map();
        this.hoveredHotspot = null;
        this.selectedHotspot = null;
        this.visibleOverlays = new Set();

        // Performance settings
        this.visibilityCheckInterval = 100; // ms
        this.batchSize = 50; // Process hotspots in batches
        this.renderDebounceTime = 16; // ~60fps

        // Create container div for overlays
        this.overlayContainer = document.createElement('div');
        this.overlayContainer.style.position = 'absolute';
        this.overlayContainer.style.width = '100%';
        this.overlayContainer.style.height = '100%';
        this.overlayContainer.style.pointerEvents = 'none';
        this.overlayContainer.style.overflow = 'hidden';
        this.overlayContainer.className = 'hotspot-overlay-container';

        // Styles
        this.styles = {
            audio_only: {
                fill: 'rgba(0, 203, 244, 0.3)',
                stroke: '#00cbf4',
                strokeWidth: 1,
                hoverFill: 'rgba(0, 203, 244, 0.5)',
                hoverStrokeWidth: 2,
                selectedFill: 'rgba(0, 203, 244, 0.7)',
                selectedStrokeWidth: 3
            },
            audio_link: {
                fill: 'rgba(73, 243, 0, 0.3)',
                stroke: '#49f300',
                strokeWidth: 1,
                hoverFill: 'rgba(73, 243, 0, 0.5)',
                hoverStrokeWidth: 2,
                selectedFill: 'rgba(73, 243, 0, 0.7)',
                selectedStrokeWidth: 3
            },
            audio_image: {
                fill: 'rgba(255, 5, 247, 0.3)',
                stroke: '#ff05f7',
                strokeWidth: 1,
                hoverFill: 'rgba(255, 5, 247, 0.5)',
                hoverStrokeWidth: 2,
                selectedFill: 'rgba(255, 5, 247, 0.7)',
                selectedStrokeWidth: 3
            },
            audio_image_link: {
                fill: 'rgba(255, 93, 0, 0.3)',
                stroke: '#ff5d00',
                strokeWidth: 1,
                hoverFill: 'rgba(255, 93, 0, 0.5)',
                hoverStrokeWidth: 2,
                selectedFill: 'rgba(255, 93, 0, 0.7)',
                selectedStrokeWidth: 3
            },
            audio_sound: {
                fill: 'rgba(255, 176, 0, 0.3)',
                stroke: '#ffb000',
                strokeWidth: 1,
                hoverFill: 'rgba(255, 176, 0, 0.5)',
                hoverStrokeWidth: 2,
                selectedFill: 'rgba(255, 176, 0, 0.7)',
                selectedStrokeWidth: 3
            }
        };

        // Initialize
        this.init();
    }

    /**
     * Initialize the renderer
     */
    async init() {
        // Wait for viewer to be ready
        if (!this.viewer.world.getItemCount()) {
            this.viewer.addOnceHandler('open', () => this.init());
            return;
        }

        // Get the image bounds
        const tiledImage = this.viewer.world.getItemAt(0);
        const imageSize = tiledImage.getContentSize();

        // Create SVG overlay using OpenSeadragon's overlay system
        const svgString = `<svg xmlns="http://www.w3.org/2000/svg" 
                               width="${imageSize.x}" 
                               height="${imageSize.y}" 
                               viewBox="0 0 ${imageSize.x} ${imageSize.y}"
                               style="position: absolute; width: 100%; height: 100%;">
                          </svg>`;

        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
        this.svg = svgDoc.documentElement;

        // Add SVG as overlay
        this.viewer.addOverlay({
            element: this.svg,
            location: new OpenSeadragon.Rect(0, 0, 1, imageSize.y / imageSize.x),
            placement: OpenSeadragon.Placement.TOP_LEFT
        });

        // Load hotspots in batches for better performance
        await this.loadHotspotsInBatches();

        // Setup visibility tracking
        this.startVisibilityTracking();
    }

    /**
     * Load hotspots in batches to avoid blocking
     */
    async loadHotspotsInBatches() {
        const hotspots = this.spatialIndex.getAllHotspots();
        const totalBatches = Math.ceil(hotspots.length / this.batchSize);

        for (let i = 0; i < totalBatches; i++) {
            const start = i * this.batchSize;
            const end = Math.min(start + this.batchSize, hotspots.length);
            const batch = hotspots.slice(start, end);

            // Process batch
            batch.forEach(hotspot => this.createHotspotOverlay(hotspot));

            // Allow browser to breathe
            if (i < totalBatches - 1) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        console.log(`Loaded ${hotspots.length} hotspots in ${totalBatches} batches`);
    }

    /**
     * Create an optimized overlay for a hotspot
     */
    createHotspotOverlay(hotspot) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('data-hotspot-id', hotspot.id);
        g.style.cursor = 'pointer';
        g.style.pointerEvents = 'auto';
        g.style.opacity = '0';
        g.style.transition = 'opacity 0.2s ease-out';

        // Create paths
        if (hotspot.shape === 'polygon') {
            const path = this.createOptimizedPath(hotspot.coordinates);
            g.appendChild(path);
        } else if (hotspot.shape === 'multipolygon') {
            hotspot.coordinates.forEach(polygon => {
                const path = this.createOptimizedPath(polygon);
                g.appendChild(path);
            });
        }

        // Apply initial style
        this.applyStyle(g, hotspot.type, 'normal');

        // Optimized event listeners
        g.addEventListener('pointerenter', () => this.handleHover(hotspot, true), { passive: true });
        g.addEventListener('pointerleave', () => this.handleHover(hotspot, false), { passive: true });
        g.addEventListener('click', (e) => this.handleClick(e, hotspot), { passive: true });

        // Touch support
        g.addEventListener('touchstart', () => this.handleHover(hotspot, true), { passive: true });
        g.addEventListener('touchend', () => {
            this.handleHover(hotspot, false);
            this.handleClick(event, hotspot);
        }, { passive: true });

        // Add to SVG
        this.svg.appendChild(g);

        // Store reference with bounds
        this.overlays.set(hotspot.id, {
            element: g,
            hotspot: hotspot,
            bounds: this.calculateBounds(hotspot.coordinates),
            isVisible: false
        });
    }

    /**
     * Create optimized SVG path
     */
    createOptimizedPath(coordinates) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

        // Build optimized path data
        const pathData = coordinates.reduce((d, point, i) => {
            return d + (i === 0 ? 'M' : 'L') + `${Math.round(point[0])},${Math.round(point[1])}`;
        }, '') + 'Z';

        path.setAttribute('d', pathData);
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        return path;
    }

    /**
     * Apply style efficiently
     */
    applyStyle(group, type, state) {
        const style = this.styles[type] || this.styles.audio_only;
        const paths = group.getElementsByTagName('path');

        // Use CSS classes for better performance
        const className = `hotspot-${type} hotspot-${state}`;
        group.setAttribute('class', className);

        // Apply inline styles only for dynamic properties
        for (let path of paths) {
            if (state === 'hover') {
                path.style.fill = style.hoverFill;
                path.style.stroke = style.stroke;
                path.style.strokeWidth = style.hoverStrokeWidth + 'px';
                path.style.filter = `drop-shadow(0 0 8px ${style.stroke})`;
            } else if (state === 'selected') {
                path.style.fill = style.selectedFill;
                path.style.stroke = style.stroke;
                path.style.strokeWidth = style.selectedStrokeWidth + 'px';
                path.style.filter = '';
            } else {
                path.style.fill = style.fill;
                path.style.stroke = style.stroke;
                path.style.strokeWidth = style.strokeWidth + 'px';
                path.style.filter = '';
            }
        }
    }

    /**
     * Calculate bounds for visibility culling
     */
    calculateBounds(coordinates) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        const processPoints = (points) => {
            for (const point of points) {
                minX = Math.min(minX, point[0]);
                minY = Math.min(minY, point[1]);
                maxX = Math.max(maxX, point[0]);
                maxY = Math.max(maxY, point[1]);
            }
        };

        if (Array.isArray(coordinates[0]) && typeof coordinates[0][0] === 'number') {
            processPoints(coordinates);
        } else {
            coordinates.forEach(polygon => processPoints(polygon));
        }

        return { minX, minY, maxX, maxY };
    }

    /**
     * Start visibility tracking with debouncing
     */
    startVisibilityTracking() {
        let updateTimer = null;

        const scheduleUpdate = () => {
            if (updateTimer) clearTimeout(updateTimer);
            updateTimer = setTimeout(() => {
                this.updateVisibility();
            }, this.renderDebounceTime);
        };

        // Track viewport changes
        this.viewer.addHandler('animation', scheduleUpdate);
        this.viewer.addHandler('animation-finish', () => this.updateVisibility());

        // Initial update
        this.updateVisibility();
    }

    /**
     * Optimized visibility update
     */
    updateVisibility() {
        const viewport = this.viewer.viewport;
        const bounds = viewport.getBounds();

        // Convert viewport bounds to image coordinates
        const topLeft = viewport.viewportToImageCoordinates(bounds.getTopLeft());
        const bottomRight = viewport.viewportToImageCoordinates(bounds.getBottomRight());

        const viewBounds = {
            minX: topLeft.x,
            minY: topLeft.y,
            maxX: bottomRight.x,
            maxY: bottomRight.y
        };

        // Expand bounds for preloading
        const padding = (viewBounds.maxX - viewBounds.minX) * 0.2;
        viewBounds.minX -= padding;
        viewBounds.minY -= padding;
        viewBounds.maxX += padding;
        viewBounds.maxY += padding;

        // Update visibility for overlays
        let visibleCount = 0;
        this.overlays.forEach((overlay, id) => {
            const wasVisible = overlay.isVisible;
            const isVisible = this.boundsIntersect(overlay.bounds, viewBounds);

            if (isVisible !== wasVisible) {
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

        // Performance monitoring
        if (visibleCount > 100) {
            console.log(`Performance note: ${visibleCount} hotspots visible`);
        }
    }

    /**
     * Check if bounds intersect
     */
    boundsIntersect(a, b) {
        return !(a.maxX < b.minX || a.minX > b.maxX ||
            a.maxY < b.minY || a.minY > b.maxY);
    }

    /**
     * Handle hover events
     */
    handleHover(hotspot, isHovering) {
        if (isHovering) {
            this.hoveredHotspot = hotspot;
            this.onHotspotHover(hotspot);

            const overlay = this.overlays.get(hotspot.id);
            if (overlay && hotspot.id !== this.selectedHotspot?.id) {
                this.applyStyle(overlay.element, hotspot.type, 'hover');
            }
        } else {
            if (this.hoveredHotspot?.id === hotspot.id) {
                this.hoveredHotspot = null;
                this.onHotspotHover(null);

                const overlay = this.overlays.get(hotspot.id);
                if (overlay && hotspot.id !== this.selectedHotspot?.id) {
                    this.applyStyle(overlay.element, hotspot.type, 'normal');
                }
            }
        }
    }

    /**
     * Handle click events
     */
    handleClick(event, hotspot) {
        event.stopPropagation();
        this.selectedHotspot = hotspot;
        this.onHotspotClick(hotspot);

        // Update styles
        this.overlays.forEach((overlay, id) => {
            if (id === hotspot.id) {
                this.applyStyle(overlay.element, overlay.hotspot.type, 'selected');
            } else if (id !== this.hoveredHotspot?.id) {
                this.applyStyle(overlay.element, overlay.hotspot.type, 'normal');
            }
        });
    }

    /**
     * Clean up
     */
    destroy() {
        // Remove event handlers
        this.viewer.removeAllHandlers('animation');
        this.viewer.removeAllHandlers('animation-finish');

        // Remove overlay
        if (this.svg) {
            this.viewer.removeOverlay(this.svg);
        }

        // Clear references
        this.overlays.clear();
        this.visibleOverlays.clear();
        this.viewer = null;
    }
}

export default NativeHotspotRenderer;