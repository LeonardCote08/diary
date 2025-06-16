/**
 * RenderOptimizer - Adaptive rendering for 60 FPS performance
 * FIXED: Removed aggressive optimizations that cause tiles to disappear
 */
class RenderOptimizer {
    constructor(viewer) {
        this.viewer = viewer;

        // State
        this.state = {
            isZoomingActive: false,
            lastBlendTime: null,
            lastStiffness: null,
            isAnimating: false,
            isZooming: false,
            isPanning: false,
            renderMode: 'static',
            consecutiveStaticFrames: 0,
            canvasOptimized: false,
            lastFrameTime: performance.now(),
            frameSkipCount: 0
        };

        // Tracking
        this.lastInteraction = Date.now();
        this.lastZoomLevel = null;
        this.lastCenter = null;
        this.lastOptimizationTime = 0;
        this.zoomStartLevel = null;
        this.zoomVelocity = 0;

        // Configuration - balanced for stability
        this.config = {
            animationEndDelay: 80,          // Slightly longer for stability
            pixelPerfectDelay: 50,
            zoomThreshold: 0.005,           // Less sensitive to avoid flickering
            panThreshold: 0.005,
            smoothTransitionDuration: 150,
            staticFramesBeforeOptimize: 5,
            optimizationCooldown: 100,
            forceGPU: true,
            frameSkipThreshold: 33,         // Only skip if > 33ms (30 FPS)
            zoomVelocityThreshold: 0.03
        };

        // Timers
        this.timers = {};

        this.setupEventHandlers();
        this.applyInitialOptimizations();
    }

    setupEventHandlers() {
        const handlers = {
            'animation-start': () => this.handleAnimationStart(),
            'animation-finish': () => this.handleAnimationFinish(),
            'animation': () => this.handleAnimation(),
            'viewport-change': () => this.handleViewportChange(),
            'canvas-press': () => this.handleInteraction('press'),
            'canvas-drag': () => this.handleInteraction('drag'),
            'canvas-drag-end': () => this.handleInteraction('drag-end'),
            'canvas-scroll': () => this.handleInteraction('scroll'),
            'canvas-pinch': () => this.handleInteraction('pinch')
        };

        Object.entries(handlers).forEach(([event, handler]) =>
            this.viewer.addHandler(event, handler)
        );
    }

    applyInitialOptimizations() {
        const container = this.viewer.container;
        if (container) {
            Object.assign(container.style, {
                transform: 'translateZ(0)',
                willChange: 'transform',
                backfaceVisibility: 'hidden',
                perspective: '1000px'
            });
        }

        // Apply canvas optimizations after a delay to ensure viewer is ready
        setTimeout(() => this.applyCanvasOptimizations(), 100);
    }

    handleAnimationStart() {
        this.clearTimers();
        this.state.isAnimating = true;
        this.state.consecutiveStaticFrames = 0;
        this.setRenderMode('animation');
    }

    handleAnimationFinish() {
        this.state.isAnimating = false;

        this.timers.animationEnd = setTimeout(() => {
            if (!this.isCurrentlyAnimating()) {
                this.setRenderMode('static');
            }
        }, this.config.animationEndDelay);
    }

    handleAnimation() {
        const now = performance.now();
        const frameTime = now - this.state.lastFrameTime;
        this.state.lastFrameTime = now;

        // Only track frame skips, don't apply emergency optimizations
        if (frameTime > this.config.frameSkipThreshold && this.state.renderMode !== 'static') {
            this.state.frameSkipCount++;
        } else {
            this.state.frameSkipCount = 0;
        }

        const timeSinceInteraction = Date.now() - this.lastInteraction;

        if (timeSinceInteraction > 100 && !this.isCurrentlyAnimating()) {
            this.state.consecutiveStaticFrames++;

            if (this.state.consecutiveStaticFrames >= this.config.staticFramesBeforeOptimize) {
                this.setRenderMode('static');
            }
        } else {
            this.state.consecutiveStaticFrames = 0;
        }
    }

    handleViewportChange() {
        const currentZoom = this.viewer.viewport.getZoom(true);
        const currentCenter = this.viewer.viewport.getCenter(true);

        // Track zoom velocity
        if (this.lastZoomLevel !== null) {
            const zoomDelta = Math.abs(currentZoom - this.lastZoomLevel);
            this.zoomVelocity = this.zoomVelocity * 0.7 + zoomDelta * 0.3;

            // Detect zooming
            this.state.isZooming = zoomDelta > this.config.zoomThreshold ||
                this.zoomVelocity > this.config.zoomVelocityThreshold;

            // Apply zoom-specific optimizations
            this.applyZoomOptimizations(this.state.isZooming);


            if (this.state.isZooming) {
                this.lastInteraction = Date.now();
                if (!this.zoomStartLevel) {
                    this.zoomStartLevel = this.lastZoomLevel;
                }
                // Don't immediately switch modes - let animation handlers do it
            } else if (this.zoomStartLevel) {
                // Zoom ended
                this.zoomStartLevel = null;
                this.scheduleStaticMode();
            }
        }

        // Detect panning
        if (this.lastCenter !== null) {
            const panDelta = Math.sqrt(
                Math.pow(currentCenter.x - this.lastCenter.x, 2) +
                Math.pow(currentCenter.y - this.lastCenter.y, 2)
            );
            this.state.isPanning = panDelta > this.config.panThreshold;
            if (this.state.isPanning) {
                this.lastInteraction = Date.now();
            }
        }

        this.lastZoomLevel = currentZoom;
        this.lastCenter = currentCenter;
    }

    applyZoomOptimizations(isZooming) {
        const config = window.performanceConfig?.renderOptimization?.zoomOptimizations;
        if (!config) return;

        if (isZooming && !this.state.isZoomingActive) {
            // Starting zoom - save current values and apply optimizations
            this.state.isZoomingActive = true;

            if (this.viewer.world.getItemCount() > 0) {
                const tiledImage = this.viewer.world.getItemAt(0);
                if (tiledImage) {
                    this.state.lastBlendTime = tiledImage.blendTime;
                    tiledImage.blendTime = 0; // Instant tile switching
                }
            }

            // Increase spring stiffness for snappier zoom
            this.state.lastStiffness = this.viewer.viewport.zoomSpring.springStiffness;
            this.viewer.viewport.zoomSpring.springStiffness = 10.0;
            this.viewer.viewport.centerSpringX.springStiffness = 10.0;
            this.viewer.viewport.centerSpringY.springStiffness = 10.0;

            // Force immediate render during zoom
            this.viewer.immediateRender = true;

        } else if (!isZooming && this.state.isZoomingActive) {
            // Ending zoom - restore values
            this.state.isZoomingActive = false;

            if (this.viewer.world.getItemCount() > 0) {
                const tiledImage = this.viewer.world.getItemAt(0);
                if (tiledImage && this.state.lastBlendTime !== null) {
                    tiledImage.blendTime = this.state.lastBlendTime;
                }
            }

            // Restore spring stiffness
            if (this.state.lastStiffness !== null) {
                this.viewer.viewport.zoomSpring.springStiffness = this.state.lastStiffness;
                this.viewer.viewport.centerSpringX.springStiffness = this.state.lastStiffness;
                this.viewer.viewport.centerSpringY.springStiffness = this.state.lastStiffness;
            }

            // Restore immediate render setting
            this.viewer.immediateRender = false;
        }
    }

    handleInteraction(type) {
        this.lastInteraction = Date.now();

        const actions = {
            'press': () => this.setRenderMode('animation'),
            'drag': () => {
                this.state.isPanning = true;
                this.setRenderMode('animation');
            },
            'drag-end': () => {
                this.state.isPanning = false;
                this.scheduleStaticMode();
            },
            'scroll': () => {
                this.state.isZooming = true;
                this.setRenderMode('animation');
            },
            'pinch': () => {
                this.state.isZooming = true;
                this.setRenderMode('animation');
            }
        };

        actions[type]?.();
    }

    setRenderMode(mode) {
        if (this.state.renderMode === mode) return;

        const previousMode = this.state.renderMode;
        this.state.renderMode = mode;

        if (mode === 'animation') {
            this.removeCanvasOptimizations();
            this.disablePixelPerfect();
        } else if (mode === 'static') {
            requestAnimationFrame(() => {
                this.applyCanvasOptimizations();
                this.enablePixelPerfect();
            });
        }

        if (window.performanceConfig?.debug?.logPerformance) {
            console.log(`Render mode: ${previousMode} → ${mode}`);
        }
    }

    scheduleStaticMode() {
        this.clearTimers();

        this.timers.interaction = setTimeout(() => {
            if (!this.isCurrentlyAnimating()) {
                this.setRenderMode('static');
            }
        }, this.config.animationEndDelay);
    }

    applyCanvasOptimizations() {
        const now = Date.now();
        if (now - this.lastOptimizationTime < this.config.optimizationCooldown) return;

        const canvas = this.viewer.drawer?.canvas;
        const context = this.viewer.drawer?.context;

        if (!canvas || !context) return;

        // GPU acceleration
        Object.assign(canvas.style, {
            transform: 'translateZ(0)',
            willChange: 'transform',
            backfaceVisibility: 'hidden'
        });

        // Smooth rendering for better quality
        this.setContextSmoothing(context, true);
        context.imageSmoothingQuality = 'high';

        this.state.canvasOptimized = true;
        this.lastOptimizationTime = now;
    }

    removeCanvasOptimizations() {
        const context = this.viewer.drawer?.context;

        if (!context) return;

        // Keep smoothing enabled during animations for better quality
        this.setContextSmoothing(context, true);
        context.imageSmoothingQuality = 'medium';

        this.state.canvasOptimized = false;
    }

    setContextSmoothing(context, enabled) {
        const props = ['imageSmoothingEnabled', 'msImageSmoothingEnabled',
            'webkitImageSmoothingEnabled', 'mozImageSmoothingEnabled'];
        props.forEach(prop => {
            if (prop in context) context[prop] = enabled;
        });
    }

    clearTimers() {
        Object.entries(this.timers).forEach(([key, timer]) => {
            clearTimeout(timer);
            delete this.timers[key];
        });
    }

    disablePixelPerfect() {
        this.applyTileStyles({
            imageRendering: 'auto',
            filter: 'none',
            transform: 'translateZ(0)'
        });
    }

    enablePixelPerfect() {
        if (this.state.renderMode !== 'static') return;

        requestAnimationFrame(() => {
            this.applyTileStyles({
                imageRendering: 'auto', // Let browser decide
                transform: 'translateZ(0)',
                willChange: 'auto',
                backfaceVisibility: 'hidden'
            });
        });
    }

    applyTileStyles(styles) {
        const tiles = this.viewer.container.querySelectorAll('.openseadragon-tile');
        tiles.forEach(tile => Object.assign(tile.style, styles));
    }

    isCurrentlyAnimating() {
        return this.state.isAnimating || this.state.isZooming || this.state.isPanning;
    }

    getRenderMode() {
        return this.state.renderMode;
    }

    getStatus() {
        return {
            ...this.state,
            timeSinceInteraction: Date.now() - this.lastInteraction,
            zoomVelocity: this.zoomVelocity.toFixed(4),
            isOptimized: this.state.canvasOptimized
        };
    }

    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
    }

    destroy() {
        this.clearTimers();

        ['animation-start', 'animation-finish', 'animation', 'viewport-change',
            'canvas-press', 'canvas-drag', 'canvas-drag-end', 'canvas-scroll',
            'canvas-pinch']
            .forEach(event => this.viewer.removeAllHandlers(event));

        this.removeCanvasOptimizations();
        this.viewer = null;
    }
}

export default RenderOptimizer;