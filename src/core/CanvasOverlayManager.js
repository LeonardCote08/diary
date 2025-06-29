import OpenSeadragon from 'openseadragon';
/**
 * CanvasOverlayManager - High-performance darkening overlay using Canvas
 * Preserves artwork quality while maintaining 60 FPS with 600+ hotspots
 */
class CanvasOverlayManager {
    constructor(viewer) {
        this.viewer = viewer;
        this.canvas = null;
        this.ctx = null;
        this.isInitialized = false;

        // State
        this.state = {
            selectedHotspot: null,
            opacity: 0,
            targetOpacity: 0,
            isAnimating: false,
            lastRenderTime: 0,
            renderMode: 'static' // static or animated
        };

        // Configuration
        this.config = {
            maxOpacity: 0.7,
            fadeSpeed: 0.05, // Opacity change per frame
            edgeSoftness: 20, // Pixels for soft edge
            updateThrottle: 16, // ~60 FPS
            enableSoftEdges: true
        };

        // Animation
        this.animationFrame = null;
        this.lastUpdateTime = 0;

        // Bind methods
        this.render = this.render.bind(this);
        this.handleViewportChange = this.handleViewportChange.bind(this);
    }

    initialize() {
        if (this.isInitialized) return;

        // Create canvas element
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '5'; // Above tiles, below hotspots
        this.canvas.style.willChange = 'transform';

        // Get container
        const container = this.viewer.canvas.parentElement;
        container.appendChild(this.canvas);

        // Get context
        this.ctx = this.canvas.getContext('2d', {
            alpha: true,
            desynchronized: true // Better performance
        });

        // Set up size
        this.updateCanvasSize();

        // Listen to viewport changes
        this.viewer.addHandler('viewport-change', this.handleViewportChange);
        this.viewer.addHandler('resize', () => this.updateCanvasSize());

        this.isInitialized = true;
        console.log('CanvasOverlayManager initialized');
    }

    updateCanvasSize() {
        const container = this.viewer.container;
        const rect = container.getBoundingClientRect();

        // Set canvas size to match viewer
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;

        // Scale canvas back down using CSS
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

        // Scale context for retina displays
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        // Force redraw
        this.render();
    }

    selectHotspot(hotspot) {
        if (this.state.selectedHotspot?.id === hotspot?.id) return;

        this.state.selectedHotspot = hotspot;
        this.state.targetOpacity = hotspot ? this.config.maxOpacity : 0;

        // Start animation if needed
        if (Math.abs(this.state.targetOpacity - this.state.opacity) > 0.01) {
            this.startAnimation();
        }
    }

    clearSelection() {
        this.selectHotspot(null);
    }

    startAnimation() {
        if (this.state.isAnimating) return;

        this.state.isAnimating = true;
        this.state.renderMode = 'animated';
        this.animate();
    }

    animate() {
        // Update opacity
        const diff = this.state.targetOpacity - this.state.opacity;

        if (Math.abs(diff) < 0.01) {
            // Animation complete
            this.state.opacity = this.state.targetOpacity;
            this.state.isAnimating = false;
            this.state.renderMode = 'static';
            this.render();
            return;
        }

        // Smooth animation
        this.state.opacity += diff * 0.15; // Adjust speed here

        // Render frame
        this.render();

        // Continue animation
        this.animationFrame = requestAnimationFrame(() => this.animate());
    }

    render() {
        const now = performance.now();

        // Throttle renders in static mode
        if (this.state.renderMode === 'static' &&
            now - this.state.lastRenderTime < this.config.updateThrottle) {
            return;
        }

        this.state.lastRenderTime = now;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Skip if no selection or opacity is 0
        if (!this.state.selectedHotspot || this.state.opacity < 0.01) {
            return;
        }

        // Get hotspot bounds in screen coordinates
        const bounds = this.getHotspotScreenBounds(this.state.selectedHotspot);
        if (!bounds) return;

        // Save context state
        this.ctx.save();

        // Set composite operation for darkening
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = `rgba(0, 0, 0, ${this.state.opacity})`;

        // Fill entire canvas
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Cut out hotspot area
        this.ctx.globalCompositeOperation = 'destination-out';

        if (this.config.enableSoftEdges) {
            // Create gradient for soft edges
            const gradient = this.ctx.createRadialGradient(
                bounds.centerX, bounds.centerY,
                Math.min(bounds.width, bounds.height) * 0.3,
                bounds.centerX, bounds.centerY,
                Math.max(bounds.width, bounds.height) * 0.6
            );
            gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
            gradient.addColorStop(0.8, 'rgba(0, 0, 0, 0.8)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

            this.ctx.fillStyle = gradient;
        } else {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 1)';
        }

        // Draw hotspot shape
        this.drawHotspotShape(bounds, this.state.selectedHotspot);

        // Restore context
        this.ctx.restore();
    }

    drawHotspotShape(bounds, hotspot) {
        this.ctx.beginPath();

        if (hotspot.shape === 'polygon' || hotspot.shape === 'multipolygon') {
            // Convert coordinates to screen space
            const coords = hotspot.shape === 'polygon' ?
                [hotspot.coordinates] : hotspot.coordinates;

            coords.forEach(polygon => {
                const screenCoords = this.imageToScreenCoordinates(polygon);
                if (screenCoords.length > 0) {
                    this.ctx.moveTo(screenCoords[0].x, screenCoords[0].y);
                    for (let i = 1; i < screenCoords.length; i++) {
                        this.ctx.lineTo(screenCoords[i].x, screenCoords[i].y);
                    }
                    this.ctx.closePath();
                }
            });
        } else {
            // Fallback to rectangle
            this.ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
        }

        this.ctx.fill();
    }

    getHotspotScreenBounds(hotspot) {
        if (!hotspot.coordinates) return null;

        // Get bounds
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        const processPoints = (points) => {
            points.forEach(([x, y]) => {
                const screen = this.imageToScreen(x, y);
                minX = Math.min(minX, screen.x);
                minY = Math.min(minY, screen.y);
                maxX = Math.max(maxX, screen.x);
                maxY = Math.max(maxY, screen.y);
            });
        };

        if (hotspot.shape === 'polygon') {
            processPoints(hotspot.coordinates);
        } else if (hotspot.shape === 'multipolygon') {
            hotspot.coordinates.forEach(polygon => processPoints(polygon));
        }

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2
        };
    }

    imageToScreen(imageX, imageY) {
        const viewportPoint = this.viewer.viewport.imageToViewportCoordinates(
            new OpenSeadragon.Point(imageX, imageY)
        );
        const pixelPoint = this.viewer.viewport.pixelFromPoint(viewportPoint);
        return { x: pixelPoint.x, y: pixelPoint.y };
    }

    imageToScreenCoordinates(coordinates) {
        return coordinates.map(([x, y]) => this.imageToScreen(x, y));
    }

    handleViewportChange() {
        // Only render if we have a selection
        if (this.state.selectedHotspot && !this.state.isAnimating) {
            // Throttle updates
            const now = performance.now();
            if (now - this.lastUpdateTime > this.config.updateThrottle) {
                this.lastUpdateTime = now;
                this.render();
            }
        }
    }

    updateOpacity(opacity) {
        this.state.opacity = Math.max(0, Math.min(1, opacity));
        this.render();
    }

    prepareForZoom() {
        // Called by RenderOptimizer during cinematic zoom
        // Can reduce quality for better performance if needed
        this.config.enableSoftEdges = false;
    }

    endZoom() {
        // Restore quality after zoom
        this.config.enableSoftEdges = true;
        this.render();
    }

    destroy() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }

        if (this.canvas && this.canvas.parentElement) {
            this.canvas.parentElement.removeChild(this.canvas);
        }

        if (this.viewer) {
            this.viewer.removeHandler('viewport-change', this.handleViewportChange);
            this.viewer.removeHandler('resize', this.updateCanvasSize);
        }

        this.canvas = null;
        this.ctx = null;
        this.viewer = null;
        this.isInitialized = false;
    }
}

export default CanvasOverlayManager;