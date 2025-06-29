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
            renderMode: 'static', // static or animated
            darkeningPaused: false
        };

        // Interpolation state for smooth transitions
        this.interpolation = {
            current: null,  // Current bounds being rendered
            target: null,   // Target bounds to interpolate to
            velocity: { x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0 },
            spring: 0.06,  // Much lower for smoother movement (was 0.12)
            damping: 0.92,   // Higher damping for less bounce (was 0.85)
            disabled: false
        };

        // Animation loop control
        this.animationLoop = {
            isRunning: false,
            frameId: null
        };

        // Configuration
        this.config = {
            maxOpacity: 0.7,
            fadeSpeed: 0.05, // Opacity change per frame
            edgeSoftness: 20, // Pixels for soft edge
            updateThrottle: 16, // ~60 FPS
            enableSoftEdges: false
        };

        // Animation
        this.animationFrame = null;
        this.lastUpdateTime = 0;

        // Timers
        this.animationFrame = null;
        this.lastUpdateTime = 0;
        this.softEdgeTimeout = null;

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
        this.canvas.style.zIndex = '8'; // Above tiles but below hotspots (which are at z-index 10)
        this.canvas.style.willChange = 'transform';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';

        // Get the OpenSeadragon container directly
        const container = this.viewer.container;
        // Insert canvas as first child to ensure proper layering
        container.insertBefore(this.canvas, container.firstChild);

        // Get context
        this.ctx = this.canvas.getContext('2d', {
            alpha: true,
            desynchronized: true // Better performance
        });

        // Set up size
        this.updateCanvasSize();

        // No need for individual handlers - the animation loop handles everything
        this.viewer.addHandler('viewport-change', this.handleViewportChange);
        this.viewer.addHandler('resize', () => this.updateCanvasSize());

        this.isInitialized = true;
        console.log('CanvasOverlayManager initialized');
    }

    updateCanvasSize() {
        const container = this.viewer.container;
        const rect = container.getBoundingClientRect();

        // Set canvas size to match container exactly
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;

        // Scale canvas back down using CSS
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

        // Remove any positioning - canvas should fill its parent
        this.canvas.style.left = '0';
        this.canvas.style.top = '0';

        // Scale context for retina displays
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        // Force redraw
        this.render();
    }

    selectHotspot(hotspot) {
        if (this.state.selectedHotspot?.id === hotspot?.id) return;

        this.state.selectedHotspot = hotspot;
        this.state.targetOpacity = hotspot ? this.config.maxOpacity : 0;

        // Reset interpolation when selecting new hotspot
        if (!hotspot || (this.interpolation.current &&
            (!this.state.selectedHotspot || this.state.selectedHotspot.id !== hotspot.id))) {
            this.interpolation.current = null;
            this.interpolation.velocity = { x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
        }

        // Always start opacity animation when there's a change
        this.startAnimation();

        // Also start render loop if selecting a hotspot
        if (hotspot) {
            this.startAnimationLoop();
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

            // Stop animation loop if no selection
            if (!this.state.selectedHotspot) {
                this.stopAnimationLoop();
            }

            this.render();
            return;
        }

        // Smooth animation - faster speed for post-zoom fade-in
        const speed = this.state.darkeningPaused === false && diff > 0 ? 0.3 : 0.15;
        this.state.opacity += diff * speed;

        // Render frame
        this.render();

        // Continue animation
        this.animationFrame = requestAnimationFrame(() => this.animate());
    }

    render() {

        // Calculate dimensions once
        const width = this.canvas.width / window.devicePixelRatio;
        const height = this.canvas.height / window.devicePixelRatio;

        // Skip rendering if darkening is paused
        if (this.state.darkeningPaused) {
            this.ctx.clearRect(0, 0, width, height);
            return;
        }

        // Clear canvas
        this.ctx.clearRect(0, 0, width, height);

        // Skip if no selection or opacity is 0
        if (!this.state.selectedHotspot || this.state.opacity < 0.01) {
            return;
        }

        // Get hotspot bounds in screen coordinates
        const targetBounds = this.getHotspotScreenBounds(this.state.selectedHotspot);
        if (!targetBounds) return;

        // Use interpolated bounds for smooth transitions
        const bounds = this.interpolateBounds(targetBounds);

        // Save context state
        this.ctx.save();

        // Set composite operation for darkening
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = `rgba(0, 0, 0, ${this.state.opacity})`;

        // Fill entire canvas with dark overlay
        this.ctx.fillRect(0, 0, width, height);

        // Cut out the hotspot area - this makes it visible
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.fillStyle = 'rgba(0, 0, 0, 1)';

        // Draw hotspot shape (this cuts it out from the dark overlay)
        this.drawHotspotShape(bounds, this.state.selectedHotspot);

        // Restore context
        this.ctx.restore();
    }

    interpolateBounds(target) {
        // Skip interpolation if disabled - also reset current to match target
        if (this.interpolation.disabled) {
            console.log('Interpolation DISABLED - returning target directly');
            this.interpolation.current = { ...target };
            this.interpolation.target = { ...target };
            // Reset all velocities to zero
            Object.keys(this.interpolation.velocity).forEach(key => {
                this.interpolation.velocity[key] = 0;
            });
            return target;
        }

        console.log('Interpolation ENABLED - smoothing active');

        if (!this.interpolation.current) {
            // First time - initialize current to target
            this.interpolation.current = { ...target };
            this.interpolation.target = { ...target };
            return this.interpolation.current;
        }

        // Update target
        this.interpolation.target = { ...target };

        // Interpolate each property with spring physics
        const props = ['x', 'y', 'width', 'height', 'centerX', 'centerY'];
        let hasChanged = false;

        props.forEach(prop => {
            const current = this.interpolation.current[prop];
            const target = this.interpolation.target[prop];
            const diff = target - current;

            // Skip if already very close
            if (Math.abs(diff) < 0.1) {
                if (current !== target) {
                    this.interpolation.current[prop] = target;
                    this.interpolation.velocity[prop] = 0;
                }
                return;
            }

            // Apply spring force
            this.interpolation.velocity[prop] += diff * this.interpolation.spring;

            // Apply damping
            this.interpolation.velocity[prop] *= this.interpolation.damping;

            // Update position
            this.interpolation.current[prop] += this.interpolation.velocity[prop];
            hasChanged = true;
        });

        return this.interpolation.current;
    }

    pauseDarkening() {
        this.state.darkeningPaused = true;
        // Clear the canvas immediately
        const width = this.canvas.width / window.devicePixelRatio;
        const height = this.canvas.height / window.devicePixelRatio;
        this.ctx.clearRect(0, 0, width, height);
    }

    resumeDarkening() {
        this.state.darkeningPaused = false;

        // Start with opacity at 0 for smooth fade-in
        const targetOpacity = this.state.opacity;
        this.state.opacity = 0;
        this.state.targetOpacity = targetOpacity;

        // Start fade-in animation immediately
        this.startAnimation();
    }

    startAnimationLoop() {
        if (this.animationLoop.isRunning) return;

        this.animationLoop.isRunning = true;

        const animate = () => {
            if (!this.animationLoop.isRunning) return;

            // Always render if we have a selected hotspot
            if (this.state.selectedHotspot) {
                this.render();
            }

            this.animationLoop.frameId = requestAnimationFrame(animate);
        };

        animate();
    }

    stopAnimationLoop() {
        this.animationLoop.isRunning = false;
        if (this.animationLoop.frameId) {
            cancelAnimationFrame(this.animationLoop.frameId);
            this.animationLoop.frameId = null;
        }
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

    disableInterpolation() {
        console.log('>>> DISABLING interpolation');
        this.interpolation.disabled = true;
    }

    enableInterpolation() {
        console.log('>>> ENABLING interpolation');
        this.interpolation.disabled = false;
    }

    handleViewportChange() {
        // Always render immediately if we have a selection
        if (this.state.selectedHotspot) {
            // Disable soft edges during viewport changes for cleaner animation
            const wasEnabled = this.config.enableSoftEdges;
            this.config.enableSoftEdges = false;

            // Force immediate render during zoom/pan
            this.render();

            // Re-enable soft edges after a delay
            if (wasEnabled) {
                clearTimeout(this.softEdgeTimeout);
                this.softEdgeTimeout = setTimeout(() => {
                    this.config.enableSoftEdges = true;
                    this.render();
                }, 150);
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
        // Stop animation loop
        this.stopAnimationLoop();

        // Clear any pending timeouts
        if (this.softEdgeTimeout) {
            clearTimeout(this.softEdgeTimeout);
            this.softEdgeTimeout = null;
        }

        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }

        if (this.canvas && this.canvas.parentElement) {
            this.canvas.parentElement.removeChild(this.canvas);
        }

        if (this.viewer) {
            this.viewer.removeHandler('viewport-change', this.handleViewportChange);
            this.viewer.removeHandler('resize', this.updateCanvasSize);
            // Note: animation, zoom, pan handlers removed since we're using animation loop instead
        }

        this.canvas = null;
        this.ctx = null;
        this.viewer = null;
        this.isInitialized = false;
    }
}

export default CanvasOverlayManager;