/**
 * RenderOptimizer - Enhanced for 60 FPS with aggressive optimizations
 * Manages rendering modes, canvas optimizations, and WebGL detection
 */
class RenderOptimizer {
    constructor(viewer) {
        this.viewer = viewer;

        // State management
        this.isAnimating = false;
        this.isZooming = false;
        this.isPanning = false;
        this.lastInteraction = Date.now();
        this.lastZoomLevel = null;
        this.lastCenter = null;
        this.renderMode = 'static';
        this.consecutiveStaticFrames = 0;

        // Timers
        this.animationEndTimer = null;
        this.pixelPerfectTimer = null;
        this.interactionTimer = null;

        // Configuration - More balanced for visual quality
        this.config = {
            animationEndDelay: 150,      // Wait longer before switching
            pixelPerfectDelay: 100,      // Slower application
            zoomThreshold: 0.01,         // Less sensitive
            panThreshold: 0.01,          // Less sensitive
            smoothTransitionDuration: 200,
            staticFramesBeforeOptimize: 10, // Wait more frames
            forceGPU: true,              // Always use GPU acceleration
            useWebGL: this.detectWebGLSupport()
        };

        // Canvas optimization state
        this.canvasOptimized = false;
        this.lastOptimizationTime = 0;
        this.optimizationCooldown = 100;

        // Bind methods
        this.handleAnimationStart = this.handleAnimationStart.bind(this);
        this.handleAnimationFinish = this.handleAnimationFinish.bind(this);
        this.handleViewportChange = this.handleViewportChange.bind(this);
        this.handleAnimation = this.handleAnimation.bind(this);
        this.applyCanvasOptimizations = this.applyCanvasOptimizations.bind(this);
        this.removeCanvasOptimizations = this.removeCanvasOptimizations.bind(this);

        // Initialize
        this.setupEventHandlers();
        this.applyInitialOptimizations();
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // Track all animation states
        this.viewer.addHandler('animation-start', this.handleAnimationStart);
        this.viewer.addHandler('animation-finish', this.handleAnimationFinish);
        this.viewer.addHandler('animation', this.handleAnimation);
        this.viewer.addHandler('viewport-change', this.handleViewportChange);

        // Track interaction states
        this.viewer.addHandler('canvas-press', () => {
            this.lastInteraction = Date.now();
            this.setRenderMode('animation');
        });

        this.viewer.addHandler('canvas-drag', () => {
            this.isPanning = true;
            this.lastInteraction = Date.now();
        });

        this.viewer.addHandler('canvas-drag-end', () => {
            this.isPanning = false;
            this.scheduleStaticMode();
        });

        this.viewer.addHandler('canvas-scroll', () => {
            this.isZooming = true;
            this.lastInteraction = Date.now();
            this.setRenderMode('animation');
        });
    }

    /**
     * Apply initial optimizations
     */
    applyInitialOptimizations() {
        // Force hardware acceleration on container
        const container = this.viewer.container;
        if (container) {
            container.style.transform = 'translateZ(0)';
            container.style.willChange = 'transform';
            container.style.backfaceVisibility = 'hidden';
            container.style.perspective = '1000px';
        }

        // Optimize canvas from the start
        requestAnimationFrame(() => {
            this.applyCanvasOptimizations();
        });
    }

    /**
     * Detect WebGL support
     */
    detectWebGLSupport() {
        try {
            const canvas = document.createElement('canvas');
            return !!(window.WebGLRenderingContext &&
                (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
        } catch (e) {
            return false;
        }
    }

    /**
     * Handle animation start
     */
    handleAnimationStart() {
        this.clearTimers();
        this.isAnimating = true;
        this.consecutiveStaticFrames = 0;
        this.setRenderMode('animation');
    }

    /**
     * Handle animation finish
     */
    handleAnimationFinish() {
        this.isAnimating = false;

        // Quick switch to static mode for 60 FPS
        this.animationEndTimer = setTimeout(() => {
            if (!this.isAnimating && !this.isPanning && !this.isZooming) {
                this.setRenderMode('static');
            }
        }, this.config.animationEndDelay);
    }

    /**
     * Handle animation frame
     */
    handleAnimation() {
        // Track consecutive static frames
        const timeSinceInteraction = Date.now() - this.lastInteraction;

        if (timeSinceInteraction > 100 && !this.isAnimating && !this.isPanning && !this.isZooming) {
            this.consecutiveStaticFrames++;

            if (this.consecutiveStaticFrames >= this.config.staticFramesBeforeOptimize) {
                this.setRenderMode('static');
            }
        } else {
            this.consecutiveStaticFrames = 0;
        }
    }

    /**
     * Handle viewport changes
     */
    handleViewportChange() {
        const currentZoom = this.viewer.viewport.getZoom(true);
        const currentCenter = this.viewer.viewport.getCenter(true);

        // Detect zoom changes
        if (this.lastZoomLevel !== null) {
            const zoomDelta = Math.abs(currentZoom - this.lastZoomLevel);
            if (zoomDelta > this.config.zoomThreshold) {
                this.isZooming = true;
                this.lastInteraction = Date.now();
                this.handleAnimationStart();
            } else {
                this.isZooming = false;
            }
        }

        // Detect pan changes
        if (this.lastCenter !== null) {
            const panDelta = Math.sqrt(
                Math.pow(currentCenter.x - this.lastCenter.x, 2) +
                Math.pow(currentCenter.y - this.lastCenter.y, 2)
            );
            if (panDelta > this.config.panThreshold) {
                this.isPanning = true;
                this.lastInteraction = Date.now();
            } else {
                this.isPanning = false;
            }
        }

        this.lastZoomLevel = currentZoom;
        this.lastCenter = currentCenter;
    }

    /**
     * Set rendering mode with optimizations
     */
    setRenderMode(mode) {
        if (this.renderMode === mode) return;

        const previousMode = this.renderMode;
        this.renderMode = mode;

        if (mode === 'animation') {
            // Remove pixel-perfect for smooth animations
            this.removeCanvasOptimizations();
            this.disablePixelPerfect();
        } else if (mode === 'static') {
            // Apply all optimizations for static viewing
            requestAnimationFrame(() => {
                this.applyCanvasOptimizations();
                this.enablePixelPerfect();
            });
        }

        // Log mode changes for debugging
        if (window.performanceConfig?.debug?.logPerformance) {
            console.log(`Render mode: ${previousMode} → ${mode}`);
        }
    }

    /**
     * Schedule switch to static mode
     */
    scheduleStaticMode() {
        this.clearTimers();

        this.interactionTimer = setTimeout(() => {
            if (!this.isAnimating && !this.isPanning && !this.isZooming) {
                this.setRenderMode('static');
            }
        }, this.config.animationEndDelay);
    }

    /**
     * Apply canvas-level optimizations
     */
    applyCanvasOptimizations() {
        const now = Date.now();
        if (now - this.lastOptimizationTime < this.optimizationCooldown) return;

        if (!this.viewer.drawer || !this.viewer.drawer.canvas) return;

        const canvas = this.viewer.drawer.canvas;
        const context = this.viewer.drawer.context;

        // Canvas style optimizations
        canvas.style.transform = 'translateZ(0)';
        canvas.style.willChange = 'transform';
        canvas.style.backfaceVisibility = 'hidden';

        // Force integer device pixel ratio for sharper rendering
        if (window.devicePixelRatio > 1) {
            const ratio = Math.round(window.devicePixelRatio);
            if (canvas.width !== canvas.clientWidth * ratio) {
                canvas.width = canvas.clientWidth * ratio;
                canvas.height = canvas.clientHeight * ratio;
                context.scale(ratio, ratio);
            }
        }

        // Context optimizations
        if (context) {
            // Disable smoothing for pixel-perfect rendering
            context.imageSmoothingEnabled = false;
            context.msImageSmoothingEnabled = false;
            context.webkitImageSmoothingEnabled = false;
            context.mozImageSmoothingEnabled = false;

            // Set optimal compositing
            context.globalCompositeOperation = 'source-over';

            // Force GPU acceleration hints
            if (context.mozImageSmoothingEnabled !== undefined) {
                context.mozImageSmoothingEnabled = false;
            }
        }

        this.canvasOptimized = true;
        this.lastOptimizationTime = now;
    }

    /**
     * Remove canvas optimizations for animation
     */
    removeCanvasOptimizations() {
        if (!this.viewer.drawer || !this.viewer.drawer.context) return;

        const context = this.viewer.drawer.context;
        const canvas = this.viewer.drawer.canvas;

        // Enable smoothing for animations
        context.imageSmoothingEnabled = true;
        context.msImageSmoothingEnabled = true;
        context.webkitImageSmoothingEnabled = true;
        context.mozImageSmoothingEnabled = true;

        // Keep GPU acceleration
        canvas.style.transform = 'translateZ(0)';

        this.canvasOptimized = false;
    }

    /**
     * Clear all timers
     */
    clearTimers() {
        if (this.animationEndTimer) {
            clearTimeout(this.animationEndTimer);
            this.animationEndTimer = null;
        }
        if (this.pixelPerfectTimer) {
            clearTimeout(this.pixelPerfectTimer);
            this.pixelPerfectTimer = null;
        }
        if (this.interactionTimer) {
            clearTimeout(this.interactionTimer);
            this.interactionTimer = null;
        }
    }

    /**
     * Disable pixel-perfect rendering for smooth animations
     */
    disablePixelPerfect() {
        // Apply to all tile elements immediately
        const tiles = this.viewer.container.querySelectorAll('.openseadragon-tile');
        tiles.forEach(tile => {
            tile.style.imageRendering = 'auto';
            tile.style.filter = 'none';
            // Keep GPU acceleration
            tile.style.transform = 'translateZ(0)';
        });

        // Update viewer settings for smooth animation
        if (this.viewer.drawer && this.viewer.drawer.context) {
            this.viewer.drawer.context.imageSmoothingEnabled = true;
        }
    }

    /**
     * Enable pixel-perfect rendering for static viewing
     */
    enablePixelPerfect() {
        if (this.renderMode !== 'static') return;

        // Apply to all current tiles
        requestAnimationFrame(() => {
            const tiles = this.viewer.container.querySelectorAll('.openseadragon-tile');
            tiles.forEach(tile => {
                // Pixel-perfect rendering
                tile.style.imageRendering = 'pixelated';
                tile.style.imageRendering = 'crisp-edges';
                tile.style.imageRendering = '-moz-crisp-edges';
                tile.style.imageRendering = '-webkit-crisp-edges';

                // GPU acceleration
                tile.style.transform = 'translateZ(0)';
                tile.style.willChange = 'transform';
                tile.style.backfaceVisibility = 'hidden';

                // Prevent blurry edges
                tile.style.filter = 'contrast(1.01)';
            });

            // Update context
            if (this.viewer.drawer && this.viewer.drawer.context) {
                this.viewer.drawer.context.imageSmoothingEnabled = false;
            }

            // Force redraw for changes to take effect
            this.viewer.forceRedraw();
        });
    }

    /**
     * Force GPU compositing
     */
    forceGPUCompositing() {
        const container = this.viewer.container;
        if (!container) return;

        // Create a 3D transform context
        container.style.transformStyle = 'preserve-3d';
        container.style.perspective = '1000px';

        // Force GPU layers for all children
        const children = container.querySelectorAll('*');
        children.forEach(child => {
            if (child.style) {
                child.style.transform = 'translateZ(0)';
            }
        });
    }

    /**
     * Get current render mode
     */
    getRenderMode() {
        return this.renderMode;
    }

    /**
     * Check if currently animating
     */
    isCurrentlyAnimating() {
        return this.isAnimating || this.isZooming || this.isPanning;
    }

    /**
     * Get optimization status
     */
    getStatus() {
        return {
            mode: this.renderMode,
            isAnimating: this.isAnimating,
            isZooming: this.isZooming,
            isPanning: this.isPanning,
            canvasOptimized: this.canvasOptimized,
            consecutiveStaticFrames: this.consecutiveStaticFrames,
            timeSinceInteraction: Date.now() - this.lastInteraction,
            webGLSupported: this.config.useWebGL
        };
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
    }

    /**
     * Cleanup
     */
    destroy() {
        // Clear all timers
        this.clearTimers();

        // Remove event handlers
        this.viewer.removeHandler('animation-start', this.handleAnimationStart);
        this.viewer.removeHandler('animation-finish', this.handleAnimationFinish);
        this.viewer.removeHandler('animation', this.handleAnimation);
        this.viewer.removeHandler('viewport-change', this.handleViewportChange);
        this.viewer.removeHandler('canvas-press');
        this.viewer.removeHandler('canvas-drag');
        this.viewer.removeHandler('canvas-drag-end');
        this.viewer.removeHandler('canvas-scroll');

        // Reset canvas optimizations
        this.removeCanvasOptimizations();

        this.viewer = null;
    }
}

export default RenderOptimizer;