import OpenSeadragon from 'openseadragon';

/**
 * HotspotRenderer - Ultra-optimized renderer with transform caching
 * Achieves perfect sync by minimizing calculations during render
 */
class HotspotRenderer {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', {
            alpha: true,
            desynchronized: false, // Keep synchronized for perfect sync
            willReadFrequently: false
        });

        this.viewer = options.viewer;
        this.spatialIndex = options.spatialIndex;
        this.viewportManager = options.viewportManager;
        this.onHotspotHover = options.onHotspotHover || (() => { });
        this.onHotspotClick = options.onHotspotClick || (() => { });

        // State
        this.hoveredHotspot = null;
        this.selectedHotspot = null;
        this.visibleHotspots = [];

        // Transform cache
        this.transformCache = new Map();
        this.lastViewportState = null;

        // Styles
        this.styles = {
            audio_only: {
                fill: 'rgba(0, 203, 244, 0.3)',
                stroke: '#00cbf4',
                hoverFill: 'rgba(0, 203, 244, 0.5)',
                selectedFill: 'rgba(0, 203, 244, 0.7)'
            },
            audio_link: {
                fill: 'rgba(73, 243, 0, 0.3)',
                stroke: '#49f300',
                hoverFill: 'rgba(73, 243, 0, 0.5)',
                selectedFill: 'rgba(73, 243, 0, 0.7)'
            },
            audio_image: {
                fill: 'rgba(255, 5, 247, 0.3)',
                stroke: '#ff05f7',
                hoverFill: 'rgba(255, 5, 247, 0.5)',
                selectedFill: 'rgba(255, 5, 247, 0.7)'
            },
            audio_image_link: {
                fill: 'rgba(255, 93, 0, 0.3)',
                stroke: '#ff5d00',
                hoverFill: 'rgba(255, 93, 0, 0.5)',
                selectedFill: 'rgba(255, 93, 0, 0.7)'
            },
            audio_sound: {
                fill: 'rgba(255, 176, 0, 0.3)',
                stroke: '#ffb000',
                hoverFill: 'rgba(255, 176, 0, 0.5)',
                selectedFill: 'rgba(255, 176, 0, 0.7)'
            }
        };

        // Performance monitoring
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.currentFps = 0;
    }

    /**
     * Render immediately - no scheduling
     */
    render() {
        this.performRender();
    }

    /**
     * Check if viewport has changed significantly
     */
    hasViewportChanged() {
        const viewport = this.viewer.viewport;
        const currentState = {
            zoom: viewport.getZoom(),
            centerX: viewport.getCenter().x,
            centerY: viewport.getCenter().y
        };

        if (!this.lastViewportState) {
            this.lastViewportState = currentState;
            return true;
        }

        const changed =
            Math.abs(currentState.zoom - this.lastViewportState.zoom) > 0.0001 ||
            Math.abs(currentState.centerX - this.lastViewportState.centerX) > 0.0001 ||
            Math.abs(currentState.centerY - this.lastViewportState.centerY) > 0.0001;

        if (changed) {
            this.lastViewportState = currentState;
            this.transformCache.clear(); // Clear cache on viewport change
        }

        return changed;
    }

    /**
     * Get cached transform for a hotspot
     */
    getCachedTransform(hotspotId, coordinates) {
        // Check if viewport has changed
        this.hasViewportChanged();

        // Check cache
        if (this.transformCache.has(hotspotId)) {
            return this.transformCache.get(hotspotId);
        }

        // Calculate and cache transform
        const transform = this.calculateTransform(coordinates);
        this.transformCache.set(hotspotId, transform);
        return transform;
    }

    /**
     * Calculate screen coordinates for polygon
     */
    calculateTransform(imageCoords) {
        if (!imageCoords || imageCoords.length < 3) return null;

        const viewport = this.viewer.viewport;
        const pixelCoords = [];

        for (let i = 0; i < imageCoords.length; i++) {
            const imagePoint = new OpenSeadragon.Point(imageCoords[i][0], imageCoords[i][1]);
            const viewportPoint = viewport.imageToViewportCoordinates(imagePoint);
            const pixel = viewport.pixelFromPoint(viewportPoint);
            pixelCoords.push([pixel.x, pixel.y]);
        }

        return pixelCoords;
    }

    /**
     * Main render method
     */
    performRender() {
        // Update FPS counter
        this.updateFps();

        // Get canvas dimensions
        const dpr = window.devicePixelRatio || 1;
        const width = this.canvas.width / dpr;
        const height = this.canvas.height / dpr;

        // Clear canvas
        this.ctx.clearRect(0, 0, width, height);

        // Get viewport info
        const viewport = this.viewportManager.getCurrentViewport();

        // Query visible hotspots
        this.visibleHotspots = this.spatialIndex.queryViewport(viewport.bounds, viewport.zoom);

        if (this.visibleHotspots.length === 0) return;

        // Setup context for batch rendering
        this.ctx.save();
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';

        // Group hotspots by type for batch rendering
        const hotspotsByType = new Map();

        this.visibleHotspots.forEach(hotspot => {
            if (!hotspotsByType.has(hotspot.type)) {
                hotspotsByType.set(hotspot.type, []);
            }
            hotspotsByType.get(hotspot.type).push(hotspot);
        });

        // Render each type in batches
        hotspotsByType.forEach((hotspots, type) => {
            const style = this.styles[type] || this.styles.audio_only;

            // Draw regular hotspots
            this.ctx.fillStyle = style.fill;
            this.ctx.strokeStyle = style.stroke;
            this.ctx.lineWidth = 1;
            this.ctx.globalAlpha = 0.8;

            hotspots.forEach(hotspot => {
                if (hotspot.id !== this.hoveredHotspot?.id &&
                    hotspot.id !== this.selectedHotspot?.id) {
                    this.drawHotspotOptimized(hotspot);
                }
            });
        });

        // Draw selected hotspot
        if (this.selectedHotspot && this.isHotspotVisible(this.selectedHotspot)) {
            const style = this.styles[this.selectedHotspot.type];
            this.ctx.fillStyle = style.selectedFill;
            this.ctx.strokeStyle = style.stroke;
            this.ctx.lineWidth = 3;
            this.ctx.globalAlpha = 0.9;
            this.drawHotspotOptimized(this.selectedHotspot);
        }

        // Draw hovered hotspot on top
        if (this.hoveredHotspot && this.isHotspotVisible(this.hoveredHotspot)) {
            const style = this.styles[this.hoveredHotspot.type];
            this.ctx.fillStyle = style.hoverFill;
            this.ctx.strokeStyle = style.stroke;
            this.ctx.lineWidth = 2;
            this.ctx.globalAlpha = 0.9;

            // Simple glow effect
            this.ctx.shadowColor = style.stroke;
            this.ctx.shadowBlur = 10;
            this.drawHotspotOptimized(this.hoveredHotspot);
            this.ctx.shadowBlur = 0;
        }

        this.ctx.restore();
    }

    /**
     * Draw hotspot with cached transforms
     */
    drawHotspotOptimized(hotspot) {
        if (hotspot.shape === 'polygon') {
            const coords = this.getCachedTransform(hotspot.id, hotspot.coordinates);
            if (coords) this.drawPolygonOptimized(coords);
        } else if (hotspot.shape === 'multipolygon') {
            hotspot.coordinates.forEach((polygon, index) => {
                const coords = this.getCachedTransform(`${hotspot.id}_${index}`, polygon);
                if (coords) this.drawPolygonOptimized(coords);
            });
        }
    }

    /**
     * Draw polygon from pre-calculated pixel coordinates
     */
    drawPolygonOptimized(pixelCoords) {
        if (!pixelCoords || pixelCoords.length < 3) return;

        this.ctx.beginPath();
        this.ctx.moveTo(pixelCoords[0][0], pixelCoords[0][1]);

        for (let i = 1; i < pixelCoords.length; i++) {
            this.ctx.lineTo(pixelCoords[i][0], pixelCoords[i][1]);
        }

        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
    }

    /**
     * Calculate polygon area
     */
    calculateArea(coordinates) {
        if (!coordinates || coordinates.length < 3) return 0;

        if (Array.isArray(coordinates[0][0])) {
            return coordinates.reduce((sum, polygon) => sum + this.calculateArea(polygon), 0);
        }

        let area = 0;
        const n = coordinates.length;

        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += coordinates[i][0] * coordinates[j][1];
            area -= coordinates[j][0] * coordinates[i][1];
        }

        return Math.abs(area / 2);
    }

    /**
     * Check if hotspot is visible
     */
    isHotspotVisible(hotspot) {
        return this.visibleHotspots.some(h => h.id === hotspot.id);
    }

    /**
     * Set hovered hotspot
     */
    setHoveredHotspot(hotspot) {
        if (this.hoveredHotspot?.id !== hotspot?.id) {
            this.hoveredHotspot = hotspot;
            this.render();
        }
    }

    /**
     * Set selected hotspot
     */
    setSelectedHotspot(hotspot) {
        if (this.selectedHotspot?.id !== hotspot?.id) {
            this.selectedHotspot = hotspot;
            this.render();
        }
    }

    /**
     * Update FPS counter
     */
    updateFps() {
        this.frameCount++;
        const now = performance.now();
        const delta = now - this.lastFpsUpdate;

        if (delta >= 1000) {
            this.currentFps = Math.round((this.frameCount * 1000) / delta);
            this.frameCount = 0;
            this.lastFpsUpdate = now;

            // Log FPS if it drops below 30
            if (this.currentFps < 30 && this.visibleHotspots.length > 0) {
                console.warn(`Low FPS: ${this.currentFps} with ${this.visibleHotspots.length} visible hotspots`);
            }
        }
    }

    /**
     * Clean up
     */
    destroy() {
        this.transformCache.clear();
        this.ctx = null;
        this.canvas = null;
        this.viewer = null;
        this.spatialIndex = null;
        this.viewportManager = null;
    }
}

export default HotspotRenderer;