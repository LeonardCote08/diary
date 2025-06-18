import OpenSeadragon from 'openseadragon';

/**
 * NativeHotspotRenderer - OpenSeadragon overlay system for interactive hotspots
 * FIXED: Prevents panning when clicking on hotspots
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
            renderDebounceTime: options.renderDebounceTime || 16
        });

        this.overlays = new Map();
        this.visibleOverlays = new Set();
        this.hoveredHotspot = null;
        this.selectedHotspot = null;

        // Track mouse state
        this.mouseTracker = null;
        this.clickStartTime = 0;
        this.clickStartPoint = null;

        // Track if we're over a hotspot
        this.isOverHotspot = false;

        // Mobile detection
        this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
            ('ontouchstart' in window);

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
        Object.entries(colors).forEach(([type, color]) => {
            this.styles[type] = {
                ...baseStyle,
                stroke: color.stroke,
                fill: `rgba(${color.fill.join(',')}, 0.3)`,
                hoverFill: `rgba(${color.fill.join(',')}, 0.5)`,
                selectedFill: `rgba(${color.fill.join(',')}, 0.7)`
            };
        });
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
        this.startVisibilityTracking();
    }

    createSVG(imageSize) {
        const svgString = `<svg xmlns="http://www.w3.org/2000/svg" 
                               width="${imageSize.x}" height="${imageSize.y}" 
                               viewBox="0 0 ${imageSize.x} ${imageSize.y}"
                               style="position: absolute; width: 100%; height: 100%; pointer-events: none;"></svg>`;

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

        this.overlays.set(hotspot.id, {
            element: g,
            hotspot: hotspot,
            bounds: this.calculateBounds(hotspot.coordinates),
            isVisible: false
        });
    }

    createGroup(hotspot) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        Object.assign(g.style, {
            cursor: 'pointer',
            pointerEvents: 'painted',
            opacity: '0',
            transition: 'opacity 0.2s ease-out'
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
        path.style.pointerEvents = 'painted';
        return path;
    }

    setupMouseTracking() {
        // Create mouse tracker on the viewer canvas
        this.mouseTracker = new OpenSeadragon.MouseTracker({
            element: this.viewer.canvas,

            moveHandler: (event) => {
                this.handleMouseMove(event);
            },

            pressHandler: (event) => {
                this.clickStartTime = Date.now();
                this.clickStartPoint = event.position;

                // CRITICAL: If we're over a hotspot, prevent the default panning behavior
                if (this.isOverHotspot) {
                    event.preventDefaultAction = true;
                }
            },

            releaseHandler: (event) => {
                if (this.clickStartPoint) {
                    const deltaTime = Date.now() - this.clickStartTime;
                    const deltaX = Math.abs(event.position.x - this.clickStartPoint.x);
                    const deltaY = Math.abs(event.position.y - this.clickStartPoint.y);

                    // Check if it's a click (not a drag)
                    if (deltaTime < 300 && deltaX < 5 && deltaY < 5) {
                        this.handleClick(event);
                    }
                }
                this.clickStartPoint = null;
            }
        });
    }

    handleMouseMove(event) {
        const viewportPoint = this.viewer.viewport.pointFromPixel(event.position);
        const imagePoint = this.viewer.viewport.viewportToImageCoordinates(viewportPoint);

        // Find hotspot under cursor
        let foundHotspot = null;

        this.overlays.forEach((overlay, id) => {
            if (overlay.isVisible && this.isPointInHotspot(imagePoint, overlay)) {
                foundHotspot = overlay.hotspot;
            }
        });

        // Update isOverHotspot flag
        this.isOverHotspot = foundHotspot !== null;

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
    }

    handleClick(event) {
        const viewportPoint = this.viewer.viewport.pointFromPixel(event.position);
        const imagePoint = this.viewer.viewport.viewportToImageCoordinates(viewportPoint);

        // Find clicked hotspot
        let clickedHotspot = null;

        this.overlays.forEach((overlay, id) => {
            if (overlay.isVisible && this.isPointInHotspot(imagePoint, overlay)) {
                clickedHotspot = overlay.hotspot;
            }
        });

        if (clickedHotspot) {
            console.log(`Hotspot clicked: ${clickedHotspot.id}`);
            event.preventDefaultAction = true;

            this.selectedHotspot = clickedHotspot;
            this.onHotspotClick(clickedHotspot);

            // Update visual state
            this.overlays.forEach((overlay, id) => {
                const state = id === clickedHotspot.id ? 'selected' :
                    (id === this.hoveredHotspot?.id ? 'hover' : 'normal');
                this.applyStyle(overlay.element, overlay.hotspot.type, state);
            });

            // On mobile, zoom to hotspot
            if (this.isMobile) {
                this.zoomToHotspot(clickedHotspot);
            }
        }
    }

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

        // Add padding
        const padding = 0.5;
        const paddingX = viewportBounds.width * padding;
        const paddingY = viewportBounds.height * padding;

        const zoomBounds = new OpenSeadragon.Rect(
            viewportBounds.x - paddingX,
            viewportBounds.y - paddingY,
            viewportBounds.width + paddingX * 2,
            viewportBounds.height + paddingY * 2
        );

        this.viewer.viewport.fitBounds(zoomBounds, false);
    }

    isPointInHotspot(point, overlay) {
        const bounds = overlay.bounds;

        // Quick bounds check first
        if (point.x < bounds.minX || point.x > bounds.maxX ||
            point.y < bounds.minY || point.y > bounds.maxY) {
            return false;
        }

        // For now, just use bounds check
        // Could implement proper polygon point-in-polygon test if needed
        return true;
    }

    applyStyle(group, type, state) {
        const style = this.styles[type] || this.styles.audio_only;
        const paths = group.getElementsByTagName('path');

        group.setAttribute('class', `hotspot-${type} hotspot-${state}`);

        for (let path of paths) {
            Object.assign(path.style, {
                fill: style[`${state}Fill`] || style.fill,
                stroke: style.stroke,
                strokeWidth: style[`${state}StrokeWidth`] + 'px' || style.strokeWidth + 'px',
                filter: state === 'hover' ? `drop-shadow(0 0 8px ${style.stroke})` : ''
            });
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

    startVisibilityTracking() {
        let updateTimer = null;

        const scheduleUpdate = () => {
            if (updateTimer) clearTimeout(updateTimer);
            updateTimer = setTimeout(() => {
                this.updateVisibility();
            }, this.renderDebounceTime);
        };

        this.viewer.addHandler('animation', scheduleUpdate);
        this.viewer.addHandler('animation-finish', () => {
            this.updateVisibility();
        });

        // Also update on viewport change to ensure overlays stay in sync
        this.viewer.addHandler('viewport-change', () => {
            scheduleUpdate();
        });

        // Initial update
        this.updateVisibility();
    }

    updateVisibility() {
        const viewport = this.viewer.viewport;
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

    boundsIntersect(a, b) {
        return !(
            a.maxX < b.minX ||
            a.minX > b.maxX ||
            a.maxY < b.minY ||
            a.minY > b.maxY
        );
    }

    destroy() {
        if (this.mouseTracker) {
            this.mouseTracker.destroy();
        }

        this.viewer.removeAllHandlers('animation');
        this.viewer.removeAllHandlers('animation-finish');
        this.viewer.removeAllHandlers('viewport-change');

        if (this.svg) {
            this.viewer.removeOverlay(this.svg);
        }

        this.overlays.clear();
        this.visibleOverlays.clear();
        this.viewer = null;
    }
}

export default NativeHotspotRenderer;