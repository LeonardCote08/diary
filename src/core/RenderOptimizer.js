/**
 * RenderOptimizer - Adaptive rendering for 60 FPS performance
 */
class RenderOptimizer {
    constructor(viewer) {
        this.viewer = viewer;

        // State
        this.state = {
            isAnimating: false,
            isZooming: false,
            isPanning: false,
            renderMode: 'static',
            consecutiveStaticFrames: 0,
            canvasOptimized: false
        };

        // Tracking
        this.lastInteraction = Date.now();
        this.lastZoomLevel = null;
        this.lastCenter = null;
        this.lastOptimizationTime = 0;

        // Configuration
        this.config = {
            animationEndDelay: 150,
            pixelPerfectDelay: 100,
            zoomThreshold: 0.01,
            panThreshold: 0.01,
            smoothTransitionDuration: 200,
            staticFramesBeforeOptimize: 10,
            optimizationCooldown: 100,
            forceGPU: true,
            useWebGL: this.detectWebGLSupport()
        };

        // Timers
        this.timers = {};

        this.setupEventHandlers();
        this.applyInitialOptimizations();
    }

    detectWebGLSupport() {
        try {
            const canvas = document.createElement('canvas');
            return !!(window.WebGLRenderingContext &&
                (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
        } catch (e) {
            return false;
        }
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
            'canvas-scroll': () => this.handleInteraction('scroll')
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

        requestAnimationFrame(() => this.applyCanvasOptimizations());
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

        if (this.lastZoomLevel !== null) {
            const zoomDelta = Math.abs(currentZoom - this.lastZoomLevel);
            this.state.isZooming = zoomDelta > this.config.zoomThreshold;
            if (this.state.isZooming) {
                this.lastInteraction = Date.now();
                this.handleAnimationStart();
            }
        }

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

    handleInteraction(type) {
        this.lastInteraction = Date.now();

        const actions = {
            'press': () => this.setRenderMode('animation'),
            'drag': () => this.state.isPanning = true,
            'drag-end': () => {
                this.state.isPanning = false;
                this.scheduleStaticMode();
            },
            'scroll': () => {
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

        Object.assign(canvas.style, {
            transform: 'translateZ(0)',
            willChange: 'transform',
            backfaceVisibility: 'hidden'
        });

        if (window.devicePixelRatio > 1) {
            const ratio = Math.round(window.devicePixelRatio);
            if (canvas.width !== canvas.clientWidth * ratio) {
                canvas.width = canvas.clientWidth * ratio;
                canvas.height = canvas.clientHeight * ratio;
                context.scale(ratio, ratio);
            }
        }

        this.setContextSmoothing(context, false);
        context.globalCompositeOperation = 'source-over';

        this.state.canvasOptimized = true;
        this.lastOptimizationTime = now;
    }

    removeCanvasOptimizations() {
        const context = this.viewer.drawer?.context;
        const canvas = this.viewer.drawer?.canvas;

        if (!context || !canvas) return;

        this.setContextSmoothing(context, true);
        canvas.style.transform = 'translateZ(0)';

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

        if (this.viewer.drawer?.context) {
            this.setContextSmoothing(this.viewer.drawer.context, true);
        }
    }

    enablePixelPerfect() {
        if (this.state.renderMode !== 'static') return;

        requestAnimationFrame(() => {
            this.applyTileStyles({
                imageRendering: 'pixelated',
                transform: 'translateZ(0)',
                willChange: 'transform',
                backfaceVisibility: 'hidden',
                filter: 'contrast(1.01)'
            });

            if (this.viewer.drawer?.context) {
                this.setContextSmoothing(this.viewer.drawer.context, false);
            }

            this.viewer.forceRedraw();
        });
    }

    applyTileStyles(styles) {
        const tiles = this.viewer.container.querySelectorAll('.openseadragon-tile');
        tiles.forEach(tile => Object.assign(tile.style, styles));
    }

    forceGPUCompositing() {
        const container = this.viewer.container;
        if (!container) return;

        container.style.transformStyle = 'preserve-3d';
        container.style.perspective = '1000px';

        container.querySelectorAll('*').forEach(child => {
            if (child.style) child.style.transform = 'translateZ(0)';
        });
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
            webGLSupported: this.config.useWebGL
        };
    }

    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
    }

    destroy() {
        this.clearTimers();

        ['animation-start', 'animation-finish', 'animation', 'viewport-change',
            'canvas-press', 'canvas-drag', 'canvas-drag-end', 'canvas-scroll']
            .forEach(event => this.viewer.removeAllHandlers(event));

        this.removeCanvasOptimizations();
        this.viewer = null;
    }
}

export default RenderOptimizer;