import OpenSeadragon from 'openseadragon';

/**
 * HotspotRenderer - High-performance Canvas 2D renderer for hotspots
 * Optimized for rendering 600+ hotspots at 60 FPS
 */
class HotspotRenderer {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.viewer = options.viewer;
        this.spatialIndex = options.spatialIndex;
        this.viewportManager = options.viewportManager;
        this.onHotspotHover = options.onHotspotHover || (() => { });
        this.onHotspotClick = options.onHotspotClick || (() => { });

        // Rendering state
        this.hoveredHotspot = null;
        this.selectedHotspot = null;
        this.visibleHotspots = [];
        this.renderRequested = false;

        // Visual style configuration
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
    }

    /**
     * Main render method
     */
    render() {
        if (!this.viewer || !this.spatialIndex || !this.viewportManager) return;

        // Get DPR for clearing
        const dpr = window.devicePixelRatio || 1;

        // Clear canvas with DPR consideration
        this.ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);

        // Get visible hotspots
        const viewport = this.viewportManager.getCurrentViewport();
        this.visibleHotspots = this.spatialIndex.queryViewport(viewport.bounds, viewport.zoom);

        // Sort by area
        this.visibleHotspots.sort((a, b) => {
            const areaA = this.calculateArea(a.coordinates);
            const areaB = this.calculateArea(b.coordinates);
            return areaB - areaA;
        });

        // Draw all hotspots
        this.visibleHotspots.forEach(hotspot => {
            if (hotspot.id !== this.hoveredHotspot?.id) {
                this.drawHotspot(hotspot, false);
            }
        });

        // Draw hovered hotspot on top
        if (this.hoveredHotspot && this.isHotspotVisible(this.hoveredHotspot)) {
            this.drawHotspot(this.hoveredHotspot, true);
        }
    }

    /**
     * Draw a single hotspot
     */
    drawHotspot(hotspot, isHovered) {
        const style = this.styles[hotspot.type] || this.styles.audio_only;
        const isSelected = this.selectedHotspot?.id === hotspot.id;

        // Set styles
        if (isHovered) {
            this.ctx.fillStyle = style.hoverFill;
            this.ctx.strokeStyle = style.stroke;
            this.ctx.lineWidth = 2;
        } else if (isSelected) {
            this.ctx.fillStyle = style.selectedFill;
            this.ctx.strokeStyle = style.stroke;
            this.ctx.lineWidth = 3;
        } else {
            this.ctx.fillStyle = style.fill;
            this.ctx.strokeStyle = style.stroke;
            this.ctx.lineWidth = 1;
        }

        // Draw the shape
        if (hotspot.shape === 'polygon') {
            this.drawPolygonShape(hotspot.coordinates);
        } else if (hotspot.shape === 'multipolygon') {
            hotspot.coordinates.forEach(polygon => this.drawPolygonShape(polygon));
        }
    }

    /**
     * Draw polygon from image coordinates
     */
    drawPolygonShape(imageCoords) {
        if (!imageCoords || imageCoords.length < 3) return;

        const viewport = this.viewer.viewport;

        this.ctx.beginPath();

        // Convert first point
        const firstPoint = new OpenSeadragon.Point(imageCoords[0][0], imageCoords[0][1]);
        const firstViewport = viewport.imageToViewportCoordinates(firstPoint);
        const firstPixel = viewport.pixelFromPoint(firstViewport);
        this.ctx.moveTo(firstPixel.x, firstPixel.y);

        // Convert and draw remaining points
        for (let i = 1; i < imageCoords.length; i++) {
            const point = new OpenSeadragon.Point(imageCoords[i][0], imageCoords[i][1]);
            const viewportPoint = viewport.imageToViewportCoordinates(point);
            const pixelPoint = viewport.pixelFromPoint(viewportPoint);
            this.ctx.lineTo(pixelPoint.x, pixelPoint.y);
        }

        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
    }

    /**
     * Calculate area for sorting
     */
    calculateArea(coordinates) {
        if (!coordinates || coordinates.length < 3) return 0;

        if (Array.isArray(coordinates[0][0])) {
            return coordinates.reduce((sum, polygon) => sum + this.calculateArea(polygon), 0);
        }

        let area = 0;
        for (let i = 0; i < coordinates.length; i++) {
            const j = (i + 1) % coordinates.length;
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
            this.requestRender();
        }
    }

    /**
     * Set selected hotspot
     */
    setSelectedHotspot(hotspot) {
        if (this.selectedHotspot?.id !== hotspot?.id) {
            this.selectedHotspot = hotspot;
            this.requestRender();
        }
    }

    /**
     * Request render on next frame
     */
    requestRender() {
        if (this.renderRequested) return;

        this.renderRequested = true;
        requestAnimationFrame(() => {
            this.renderRequested = false;
            this.render();
        });
    }

    /**
     * Clean up
     */
    destroy() {
        this.ctx = null;
        this.canvas = null;
        this.viewer = null;
        this.spatialIndex = null;
        this.viewportManager = null;
    }
}

export default HotspotRenderer;