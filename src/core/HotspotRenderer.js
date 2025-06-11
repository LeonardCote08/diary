/**
 * HotspotRenderer - High-performance Canvas 2D renderer for hotspots
 * Optimized for rendering 600+ hotspots at 60 FPS
 */
class HotspotRenderer {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: true });
        this.viewer = options.viewer;
        this.spatialIndex = options.spatialIndex;
        this.viewportManager = options.viewportManager;
        this.onHotspotHover = options.onHotspotHover || (() => { });
        this.onHotspotClick = options.onHotspotClick || (() => { });

        // Rendering state
        this.hoveredHotspot = null;
        this.selectedHotspot = null;
        this.visibleHotspots = [];

        // Performance optimization flags
        this.needsRedraw = true;
        this.rafId = null;

        // Visual style configuration
        this.styles = {
            // Type 1 - Audio only (Cyan)
            audio_only: {
                fill: 'rgba(0, 203, 244, 0.3)',
                stroke: '#00cbf4',
                hoverFill: 'rgba(0, 203, 244, 0.5)',
                selectedFill: 'rgba(0, 203, 244, 0.7)'
            },
            // Type 2 - Audio + Link (Green)
            audio_link: {
                fill: 'rgba(73, 243, 0, 0.3)',
                stroke: '#49f300',
                hoverFill: 'rgba(73, 243, 0, 0.5)',
                selectedFill: 'rgba(73, 243, 0, 0.7)'
            },
            // Type 3 - Audio + Image (Magenta)
            audio_image: {
                fill: 'rgba(255, 5, 247, 0.3)',
                stroke: '#ff05f7',
                hoverFill: 'rgba(255, 5, 247, 0.5)',
                selectedFill: 'rgba(255, 5, 247, 0.7)'
            },
            // Type 4 - Audio + Image + Link (Orange)
            audio_image_link: {
                fill: 'rgba(255, 93, 0, 0.3)',
                stroke: '#ff5d00',
                hoverFill: 'rgba(255, 93, 0, 0.5)',
                selectedFill: 'rgba(255, 93, 0, 0.7)'
            },
            // Type 5 - Audio + Sound (Yellow)
            audio_sound: {
                fill: 'rgba(255, 176, 0, 0.3)',
                stroke: '#ffb000',
                hoverFill: 'rgba(255, 176, 0, 0.5)',
                selectedFill: 'rgba(255, 176, 0, 0.7)'
            }
        };

        // Bind methods
        this.render = this.render.bind(this);
        this.renderLoop = this.renderLoop.bind(this);
    }

    /**
     * Main render method - called on viewport change or state update
     */
    render() {
        if (!this.viewer || !this.spatialIndex || !this.viewportManager) return;

        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Get visible hotspots from viewport manager
        const viewport = this.viewportManager.getCurrentViewport();
        this.visibleHotspots = this.spatialIndex.queryViewport(
            viewport.bounds,
            viewport.zoom
        );

        // Sort by draw order (larger shapes first to avoid overlapping issues)
        this.visibleHotspots.sort((a, b) => {
            const areaA = this.calculateArea(a.coordinates);
            const areaB = this.calculateArea(b.coordinates);
            return areaB - areaA;
        });

        // Draw each visible hotspot
        this.visibleHotspots.forEach(hotspot => {
            this.drawHotspot(hotspot);
        });

        // Draw hover highlight on top
        if (this.hoveredHotspot && this.isHotspotVisible(this.hoveredHotspot)) {
            this.drawHotspot(this.hoveredHotspot, true);
        }

        this.needsRedraw = false;
    }

    /**
     * Draw a single hotspot
     */
    drawHotspot(hotspot, isHovered = false) {
        const style = this.styles[hotspot.type] || this.styles.audio_only;
        const isSelected = this.selectedHotspot?.id === hotspot.id;

        // Convert image coordinates to viewport coordinates
        const viewportCoords = this.imageToViewportCoordinates(hotspot.coordinates);
        if (!viewportCoords || viewportCoords.length === 0) return;

        // Save context state
        this.ctx.save();

        // Set style based on state
        if (isHovered || hotspot.id === this.hoveredHotspot?.id) {
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

        // Handle different shape types
        if (hotspot.shape === 'polygon') {
            this.drawPolygon(viewportCoords);
        } else if (hotspot.shape === 'multipolygon') {
            viewportCoords.forEach(polygon => {
                this.drawPolygon(polygon);
            });
        }

        // Restore context state
        this.ctx.restore();
    }

    /**
     * Draw a polygon path
     */
    drawPolygon(coordinates) {
        if (!coordinates || coordinates.length < 3) return;

        this.ctx.beginPath();
        this.ctx.moveTo(coordinates[0][0], coordinates[0][1]);

        for (let i = 1; i < coordinates.length; i++) {
            this.ctx.lineTo(coordinates[i][0], coordinates[i][1]);
        }

        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
    }

    /**
     * Convert image coordinates to canvas viewport coordinates
     */
    imageToViewportCoordinates(coordinates) {
        if (!this.viewer) return null;

        const viewport = this.viewer.viewport;

        // Handle single polygon
        if (coordinates.length > 0 && typeof coordinates[0][0] === 'number') {
            return coordinates.map(point => {
                const imagePoint = new OpenSeadragon.Point(point[0], point[1]);
                const viewportPoint = viewport.imageToViewportCoordinates(imagePoint);
                const pixelPoint = viewport.pixelFromPoint(viewportPoint);
                return [pixelPoint.x, pixelPoint.y];
            });
        }

        // Handle multipolygon
        return coordinates.map(polygon => {
            return polygon.map(point => {
                const imagePoint = new OpenSeadragon.Point(point[0], point[1]);
                const viewportPoint = viewport.imageToViewportCoordinates(imagePoint);
                const pixelPoint = viewport.pixelFromPoint(viewportPoint);
                return [pixelPoint.x, pixelPoint.y];
            });
        });
    }

    /**
     * Calculate polygon area for sorting
     */
    calculateArea(coordinates) {
        if (!coordinates || coordinates.length < 3) return 0;

        // Handle multipolygon by summing areas
        if (coordinates.length > 0 && Array.isArray(coordinates[0][0])) {
            return coordinates.reduce((sum, polygon) => sum + this.calculateArea(polygon), 0);
        }

        // Calculate polygon area using shoelace formula
        let area = 0;
        for (let i = 0; i < coordinates.length; i++) {
            const j = (i + 1) % coordinates.length;
            area += coordinates[i][0] * coordinates[j][1];
            area -= coordinates[j][0] * coordinates[i][1];
        }

        return Math.abs(area / 2);
    }

    /**
     * Check if hotspot is visible in current viewport
     */
    isHotspotVisible(hotspot) {
        return this.visibleHotspots.some(h => h.id === hotspot.id);
    }

    /**
     * Set hovered hotspot and trigger re-render
     */
    setHoveredHotspot(hotspot) {
        if (this.hoveredHotspot?.id !== hotspot?.id) {
            this.hoveredHotspot = hotspot;
            this.requestRedraw();
        }
    }

    /**
     * Set selected hotspot and trigger re-render
     */
    setSelectedHotspot(hotspot) {
        if (this.selectedHotspot?.id !== hotspot?.id) {
            this.selectedHotspot = hotspot;
            this.requestRedraw();
        }
    }

    /**
     * Request a redraw on the next animation frame
     */
    requestRedraw() {
        if (!this.needsRedraw) {
            this.needsRedraw = true;
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
            }
            this.rafId = requestAnimationFrame(this.renderLoop);
        }
    }

    /**
     * Render loop for smooth animations
     */
    renderLoop() {
        if (this.needsRedraw) {
            this.render();
        }
        this.rafId = null;
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }
        this.ctx = null;
        this.canvas = null;
        this.viewer = null;
        this.spatialIndex = null;
        this.viewportManager = null;
    }
}

export default HotspotRenderer;