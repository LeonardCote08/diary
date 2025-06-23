import OpenSeadragon from 'openseadragon';

/**
 * CanvasHotspotRenderer - Optimized canvas-based renderer for mobile
 * Replaces 600+ DOM elements with a single canvas for 60 FPS performance
 */
class CanvasHotspotRenderer {
    constructor(options = {}) {
        Object.assign(this, {
            viewer: options.viewer,
            spatialIndex: options.spatialIndex,
            onHotspotHover: options.onHotspotHover || (() => { }),
            onHotspotClick: options.onHotspotClick || (() => { }),
            visibilityCheckInterval: options.visibilityCheckInterval || 100,
            debugMode: options.debugMode || false
        });

        this.canvas = null;
        this.ctx = null;
        this.hotspots = [];
        this.visibleHotspots = new Set();
        this.hoveredHotspot = null;
        this.selectedHotspot = null;

        // Performance optimizations
        this.lastRenderTime = 0;
        this.renderThrottle = 16; // ~60 FPS
        this.isRendering = false;

        // Touch tracking
        this.isTouching = false;
        this.touchStartTime = 0;
        this.touchStartPoint = null;

        this.init();
    }

    init() {
        if (!this.viewer.world.getItemCount()) {
            this.viewer.addOnceHandler('open', () => this.init());
            return;
        }

        // Create canvas element
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.left = '0';
        this.canvas.style.top = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none'; // Let all events pass through
        this.canvas.style.zIndex = '1'; // Above the image

        this.ctx = this.canvas.getContext('2d', {
            alpha: true,
            desynchronized: true,
            willReadFrequently: false
        });

        // Add canvas to viewer container
        this.viewer.container.appendChild(this.canvas);

        // Load hotspots from spatial index
        this.hotspots = this.spatialIndex.getAllHotspots();
        console.log(`CanvasHotspotRenderer: Loaded ${this.hotspots.length} hotspots`);

        // Setup event handlers
        this.setupEventHandlers();

        // Start render loop
        this.startRenderLoop();
    }

    setupEventHandlers() {
        // Use animation-frame for smooth updates
        this.viewer.addHandler('animation-frame', () => {
            this.render();
        });

        // Additional update triggers
        this.viewer.addHandler('update-viewport', () => {
            this.render();
        });

        // Handle resize
        this.viewer.addHandler('resize', () => {
            this.canvas.width = 0; // Force size recalculation
            this.render();
        });

        // For even better sync, use canvas-draw event if available
        this.viewer.addHandler('canvas-draw', () => {
            this.render();
        });

        // Track touch/click through viewer's canvas
        const viewerCanvas = this.viewer.canvas;

        // Touch events
        viewerCanvas.addEventListener('touchstart', (e) => {
            this.isTouching = true;
            this.touchStartTime = Date.now();
            if (e.touches.length === 1) {
                this.touchStartPoint = {
                    x: e.touches[0].clientX,
                    y: e.touches[0].clientY
                };
            }
        }, { passive: true });

        viewerCanvas.addEventListener('touchend', (e) => {
            // Check if it was a quick tap
            const touchDuration = Date.now() - this.touchStartTime;
            if (touchDuration < 300 && this.touchStartPoint && e.changedTouches.length === 1) {
                const touch = e.changedTouches[0];
                const distance = Math.sqrt(
                    Math.pow(touch.clientX - this.touchStartPoint.x, 2) +
                    Math.pow(touch.clientY - this.touchStartPoint.y, 2)
                );

                if (distance < 10) {
                    this.handleTap(touch.clientX, touch.clientY);
                }
            }

            this.isTouching = false;
            this.touchStartPoint = null;
        }, { passive: true });

        // Mouse click for desktop
        if (!('ontouchstart' in window)) {
            viewerCanvas.addEventListener('click', (e) => {
                this.handleTap(e.clientX, e.clientY);
            });

            // Mouse move for hover
            viewerCanvas.addEventListener('mousemove', (e) => {
                const rect = this.viewer.element.getBoundingClientRect();
                const pixelPoint = new OpenSeadragon.Point(
                    e.clientX - rect.left,
                    e.clientY - rect.top
                );

                const viewportPoint = this.viewer.viewport.pointFromPixel(pixelPoint);
                const imagePoint = this.viewer.viewport.viewportToImageCoordinates(viewportPoint);
                const hotspot = this.findHotspotAtPoint(imagePoint);

                if (hotspot !== this.hoveredHotspot) {
                    this.hoveredHotspot = hotspot;
                    this.onHotspotHover(hotspot);
                    this.render();
                }

                viewerCanvas.style.cursor = hotspot ? 'pointer' : 'default';
            });
        }
    }

    handleTap(clientX, clientY) {
        const rect = this.viewer.element.getBoundingClientRect();
        const pixelPoint = new OpenSeadragon.Point(
            clientX - rect.left,
            clientY - rect.top
        );

        const viewportPoint = this.viewer.viewport.pointFromPixel(pixelPoint);
        const imagePoint = this.viewer.viewport.viewportToImageCoordinates(viewportPoint);
        const hotspot = this.findHotspotAtPoint(imagePoint);

        if (hotspot) {
            this.selectedHotspot = hotspot;
            this.onHotspotClick(hotspot);
            this.scheduleRender();
        }
    }

    findHotspotAtPoint(imagePoint) {
        // Use spatial index for fast lookup
        const candidates = this.spatialIndex.queryViewport({
            minX: imagePoint.x - 1,
            minY: imagePoint.y - 1,
            maxX: imagePoint.x + 1,
            maxY: imagePoint.y + 1
        });

        // Check only visible hotspots
        for (const hotspot of candidates) {
            if (this.visibleHotspots.has(hotspot.id) &&
                this.isPointInHotspot(imagePoint, hotspot)) {
                return hotspot;
            }
        }

        return null;
    }

    isPointInHotspot(point, hotspot) {
        return this.spatialIndex.isPointInHotspot(point.x, point.y, hotspot);
    }


    scheduleRender() {
        // Remove throttling for smoother updates
        this.render();
    }

    startRenderLoop() {
        setInterval(() => {
            this.updateVisibleHotspots();
        }, this.visibilityCheckInterval);

        this.updateVisibleHotspots();
        this.render();
    }

    updateVisibleHotspots() {
        if (this.updatesPaused) return;
        const viewport = this.viewer.viewport;
        const bounds = viewport.getBounds();
        const topLeft = viewport.viewportToImageCoordinates(bounds.getTopLeft());
        const bottomRight = viewport.viewportToImageCoordinates(bounds.getBottomRight());

        const padding = (bottomRight.x - topLeft.x) * 0.1;

        const viewBounds = {
            minX: topLeft.x - padding,
            minY: topLeft.y - padding,
            maxX: bottomRight.x + padding,
            maxY: bottomRight.y + padding
        };

        const visible = this.spatialIndex.queryViewport(viewBounds);

        this.visibleHotspots.clear();
        visible.forEach(h => this.visibleHotspots.add(h.id));

        if (visible.length !== this.visibleHotspots.size) {
            this.scheduleRender();
        }
    }

    render() {
        if (this.isRendering) return;

        this.isRendering = true;
        this.lastRenderTime = performance.now();

        const viewerElement = this.viewer.element;
        const rect = viewerElement.getBoundingClientRect();

        if (this.canvas.width !== rect.width || this.canvas.height !== rect.height) {
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();

        let renderedCount = 0;
        for (const hotspot of this.hotspots) {
            if (this.visibleHotspots.has(hotspot.id)) {
                this.renderHotspot(hotspot);
                renderedCount++;
            }
        }

        this.ctx.restore();

        if (this.debugMode && renderedCount > 0) {
            console.log(`Rendered ${renderedCount} hotspots`);
        }

        this.isRendering = false;
    }


    renderHotspot(hotspot) {
        const isHovered = this.hoveredHotspot?.id === hotspot.id;
        const isSelected = this.selectedHotspot?.id === hotspot.id;

        if (this.debugMode) {
            const colors = {
                audio_only: 'rgba(0, 203, 244, 0.3)',
                audio_link: 'rgba(73, 243, 0, 0.3)',
                audio_image: 'rgba(255, 5, 247, 0.3)',
                audio_image_link: 'rgba(255, 93, 0, 0.3)',
                audio_sound: 'rgba(255, 176, 0, 0.3)'
            };
            this.ctx.fillStyle = colors[hotspot.type] || colors.audio_only;
            this.ctx.strokeStyle = isHovered || isSelected ? '#fff' : 'transparent';
            this.ctx.lineWidth = isHovered || isSelected ? 2 : 1;
        } else {
            if (isHovered || isSelected) {
                this.ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
                this.ctx.shadowBlur = isSelected ? 15 : 10;
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
                this.ctx.lineWidth = isSelected ? 3 : 2;
            } else {
                this.ctx.shadowBlur = 0;
                this.ctx.fillStyle = 'transparent';
                this.ctx.strokeStyle = 'transparent';
                this.ctx.lineWidth = 0;
            }
        }

        if (hotspot.shape === 'polygon') {
            this.drawPolygon(hotspot.coordinates);
        } else if (hotspot.shape === 'multipolygon') {
            hotspot.coordinates.forEach(polygon => this.drawPolygon(polygon));
        }
    }

    drawPolygon(coordinates) {
        if (coordinates.length < 3) return;

        const viewport = this.viewer.viewport;

        this.ctx.beginPath();

        for (let i = 0; i < coordinates.length; i++) {
            const imageX = coordinates[i][0];
            const imageY = coordinates[i][1];

            const viewportPoint = viewport.imageToViewportCoordinates(
                new OpenSeadragon.Point(imageX, imageY)
            );

            const pixelPoint = viewport.pixelFromPoint(viewportPoint);

            if (i === 0) {
                this.ctx.moveTo(pixelPoint.x, pixelPoint.y);
            } else {
                this.ctx.lineTo(pixelPoint.x, pixelPoint.y);
            }
        }

        this.ctx.closePath();
        this.ctx.fill();

        if (this.ctx.strokeStyle !== 'transparent') {
            this.ctx.stroke();
        }
    }

    // Add this method for compatibility with ArtworkViewer
    updateVisibility() {
        this.updateVisibleHotspots();
    }

    calculateGlowIntensity() {
        if (!this.viewer || !this.viewer.viewport) return 1;

        const zoom = this.viewer.viewport.getZoom();
        const minZoom = 1;
        const maxZoom = 10;

        if (zoom <= minZoom) return 1;
        if (zoom >= maxZoom) return 0.3;

        const progress = (zoom - minZoom) / (maxZoom - minZoom);
        const eased = 1 - Math.pow(progress, 0.5);

        return 0.3 + (eased * 0.7);
    }

    setDebugMode(enabled) {
        this.debugMode = enabled;
        this.scheduleRender();
    }

    pauseUpdates() {
        this.updatesPaused = true;
    }

    resumeUpdates() {
        this.updatesPaused = false;
        this.updateVisibility();
    }

    destroy() {
        // Remove all event handlers
        this.viewer.removeHandler('animation-frame');
        this.viewer.removeHandler('update-viewport');
        this.viewer.removeHandler('canvas-draw');
        this.viewer.removeHandler('resize');

        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }

        this.canvas = null;
        this.ctx = null;
        this.hotspots = [];
        this.visibleHotspots.clear();
    }


}

export default CanvasHotspotRenderer;