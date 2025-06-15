/**
 * RenderOptimizer - Manages adaptive rendering for smooth zoom while maintaining pixel-perfect quality
 * Intelligently switches between animation and static rendering modes
 */
class RenderOptimizer {
    constructor(viewer) {
        this.viewer = viewer;

        // State management
        this.isAnimating = false;
        this.isZooming = false;
        this.lastZoomLevel = null;
        this.renderMode = 'static'; // 'static' or 'animation'

        // Timers
        this.animationEndTimer = null;
        this.pixelPerfectTimer = null;

        // Configuration
        this.config = {
            animationEndDelay: 150,      // Wait after animation before applying pixel-perfect
            pixelPerfectDelay: 50,       // Debounce for pixel-perfect application
            zoomThreshold: 0.01,         // Minimum zoom change to trigger animation mode
            smoothTransitionDuration: 200 // Transition time between modes
        };

        // Bind methods
        this.handleAnimationStart = this.handleAnimationStart.bind(this);
        this.handleAnimationFinish = this.handleAnimationFinish.bind(this);
        this.handleViewportChange = this.handleViewportChange.bind(this);
        this.applyPixelPerfect = this.applyPixelPerfect.bind(this);

        // Initialize
        this.setupEventHandlers();
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // Track animation state
        this.viewer.addHandler('animation-start', this.handleAnimationStart);
        this.viewer.addHandler('animation-finish', this.handleAnimationFinish);
        this.viewer.addHandler('viewport-change', this.handleViewportChange);
    }

    /**
     * Handle animation start
     */
    handleAnimationStart() {
        if (this.animationEndTimer) {
            clearTimeout(this.animationEndTimer);
            this.animationEndTimer = null;
        }

        this.isAnimating = true;
        this.setRenderMode('animation');
    }

    /**
     * Handle animation finish
     */
    handleAnimationFinish() {
        // Delay before switching back to static mode
        this.animationEndTimer = setTimeout(() => {
            this.isAnimating = false;
            this.setRenderMode('static');
            this.schedulePixelPerfect();
        }, this.config.animationEndDelay);
    }

    /**
     * Handle viewport changes to detect zooming
     */
    handleViewportChange() {
        const currentZoom = this.viewer.viewport.getZoom(true);

        // Detect zoom changes
        if (this.lastZoomLevel !== null) {
            const zoomDelta = Math.abs(currentZoom - this.lastZoomLevel);

            if (zoomDelta > this.config.zoomThreshold) {
                this.isZooming = true;
                this.handleAnimationStart();
            }
        }

        this.lastZoomLevel = currentZoom;
    }

    /**
     * Set rendering mode
     */
    setRenderMode(mode) {
        if (this.renderMode === mode) return;

        this.renderMode = mode;

        if (mode === 'animation') {
            this.disablePixelPerfect();
        } else {
            // Small delay to ensure animation is truly finished
            setTimeout(() => this.enablePixelPerfect(), 50);
        }
    }

    /**
     * Disable pixel-perfect rendering for smooth animations
     */
    disablePixelPerfect() {
        if (!this.viewer.drawer || !this.viewer.drawer.context) return;

        const context = this.viewer.drawer.context;
        const canvas = this.viewer.drawer.canvas;

        // Enable smoothing for animations
        context.imageSmoothingEnabled = true;
        context.msImageSmoothingEnabled = true;
        context.webkitImageSmoothingEnabled = true;
        context.mozImageSmoothingEnabled = true;

        // Use default rendering for smooth animation
        if (canvas) {
            canvas.style.imageRendering = 'auto';
        }

        // Apply to all tile elements
        const tiles = this.viewer.container.querySelectorAll('.openseadragon-tile');
        tiles.forEach(tile => {
            tile.style.imageRendering = 'auto';
            tile.style.transform = 'translateZ(0)'; // Keep hardware acceleration
        });
    }

    /**
     * Enable pixel-perfect rendering for static viewing
     */
    enablePixelPerfect() {
        if (this.renderMode !== 'static') return;

        this.applyPixelPerfect();
    }

    /**
     * Schedule pixel-perfect application with debouncing
     */
    schedulePixelPerfect() {
        if (this.pixelPerfectTimer) {
            clearTimeout(this.pixelPerfectTimer);
        }

        this.pixelPerfectTimer = setTimeout(() => {
            if (this.renderMode === 'static' && !this.isAnimating) {
                this.applyPixelPerfect();
            }
        }, this.config.pixelPerfectDelay);
    }

    /**
     * Apply pixel-perfect rendering
     */
    applyPixelPerfect() {
        if (!this.viewer.drawer || !this.viewer.drawer.context) return;

        const context = this.viewer.drawer.context;
        const canvas = this.viewer.drawer.canvas;

        // Disable smoothing for pixel-perfect rendering
        context.imageSmoothingEnabled = false;
        context.msImageSmoothingEnabled = false;
        context.webkitImageSmoothingEnabled = false;
        context.mozImageSmoothingEnabled = false;

        // Apply pixel-perfect rendering
        if (canvas) {
            canvas.style.imageRendering = 'pixelated';
            canvas.style.imageRendering = 'crisp-edges';
            canvas.style.imageRendering = '-moz-crisp-edges';
            canvas.style.imageRendering = '-webkit-crisp-edges';
            canvas.style.imageRendering = '-webkit-optimize-contrast';
        }

        // Apply to all current tiles
        const tiles = this.viewer.container.querySelectorAll('.openseadragon-tile');
        tiles.forEach(tile => {
            tile.style.imageRendering = 'pixelated';
            tile.style.imageRendering = 'crisp-edges';
            tile.style.imageRendering = '-moz-crisp-edges';
            tile.style.imageRendering = '-webkit-crisp-edges';
            tile.style.imageRendering = '-webkit-optimize-contrast';
            tile.style.transform = 'translateZ(0)';
            tile.style.willChange = 'transform';
            tile.style.backfaceVisibility = 'hidden';
        });

        // Force a redraw to apply changes
        if (this.viewer.world.getItemCount() > 0) {
            this.viewer.forceRedraw();
        }
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
        return this.isAnimating || this.isZooming;
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
        // Clear timers
        if (this.animationEndTimer) {
            clearTimeout(this.animationEndTimer);
        }
        if (this.pixelPerfectTimer) {
            clearTimeout(this.pixelPerfectTimer);
        }

        // Remove event handlers
        this.viewer.removeHandler('animation-start', this.handleAnimationStart);
        this.viewer.removeHandler('animation-finish', this.handleAnimationFinish);
        this.viewer.removeHandler('viewport-change', this.handleViewportChange);

        this.viewer = null;
    }
}

export default RenderOptimizer;