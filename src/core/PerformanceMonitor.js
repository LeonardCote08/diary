/**
 * PerformanceMonitor - Real-time performance tracking with adaptive optimization
 * Works with RenderOptimizer for smooth performance
 */

class PerformanceMonitor {
    constructor(viewer) {
        this.viewer = viewer;
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fps = 60;
        this.fpsHistory = [];
        this.maxHistorySize = 30;

        // Performance thresholds
        this.targetFPS = 50;
        this.minAcceptableFPS = 30;
        this.criticalFPS = 20;

        // Monitoring state
        this.isMonitoring = false;
        this.monitoringInterval = null;

        // Performance metrics
        this.metrics = {
            averageFPS: 60,
            minFPS: 60,
            maxFPS: 60,
            tileLoadTime: 0,
            visibleTiles: 0,
            cachedTiles: 0,
            memoryUsage: 0,
            renderMode: 'static',
            zoomLevel: 1
        };

        // Performance history for trend analysis
        this.performanceHistory = [];
        this.maxPerformanceHistory = 10;
    }

    /**
     * Start monitoring performance
     */
    start() {
        if (this.isMonitoring) return;

        this.isMonitoring = true;
        this.lastTime = performance.now();

        // Monitor FPS
        this.measureFrame();

        // Update metrics every second
        this.monitoringInterval = setInterval(() => {
            this.updateMetrics();
            this.analyzePerformance();
        }, 1000);

        // Track tile loading performance
        this.viewer.addHandler('tile-loaded', this.onTileLoaded.bind(this));
        this.viewer.addHandler('tile-load-failed', this.onTileLoadFailed.bind(this));

        console.log('Performance monitoring started');
    }

    /**
     * Stop monitoring
     */
    stop() {
        this.isMonitoring = false;

        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        this.viewer.removeHandler('tile-loaded', this.onTileLoaded);
        this.viewer.removeHandler('tile-load-failed', this.onTileLoadFailed);

        console.log('Performance monitoring stopped');
    }

    /**
     * Measure frame rate
     */
    measureFrame() {
        if (!this.isMonitoring) return;

        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;

        // Calculate instantaneous FPS
        if (deltaTime > 0) {
            const instantFPS = 1000 / deltaTime;
            this.fpsHistory.push(instantFPS);

            // Keep history size limited
            if (this.fpsHistory.length > this.maxHistorySize) {
                this.fpsHistory.shift();
            }

            // Calculate average FPS
            this.fps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
        }

        this.lastTime = currentTime;
        this.frameCount++;

        // Schedule next measurement
        requestAnimationFrame(() => this.measureFrame());
    }

    /**
     * Update performance metrics
     */
    updateMetrics() {
        // FPS metrics
        this.metrics.averageFPS = Math.round(this.fps);
        this.metrics.minFPS = Math.round(Math.min(...this.fpsHistory));
        this.metrics.maxFPS = Math.round(Math.max(...this.fpsHistory));

        // Zoom level
        this.metrics.zoomLevel = this.viewer.viewport.getZoom(true);

        // Tile metrics
        const world = this.viewer.world;
        if (world.getItemCount() > 0) {
            const tiledImage = world.getItemAt(0);
            this.metrics.visibleTiles = tiledImage._tilesToDraw ? tiledImage._tilesToDraw.length : 0;
            this.metrics.cachedTiles = tiledImage._tileCache ? Object.keys(tiledImage._tileCache).length : 0;
        }

        // Memory usage (if available)
        if (performance.memory) {
            this.metrics.memoryUsage = Math.round(performance.memory.usedJSHeapSize / 1048576); // MB
        }

        // Store performance history
        this.performanceHistory.push({
            timestamp: Date.now(),
            fps: this.metrics.averageFPS,
            tiles: this.metrics.visibleTiles,
            memory: this.metrics.memoryUsage
        });

        if (this.performanceHistory.length > this.maxPerformanceHistory) {
            this.performanceHistory.shift();
        }
    }

    /**
     * Analyze performance and suggest optimizations
     */
    analyzePerformance() {
        const avgFPS = this.metrics.averageFPS;

        // Don't optimize during zoom/pan animations
        if (this.viewer.viewport.getVelocity().length() > 0.01) {
            return;
        }

        // Critical performance issues
        if (avgFPS < this.criticalFPS) {
            console.warn(`Critical performance: ${avgFPS} FPS`);
            this.applyCriticalOptimizations();
        }
        // Poor performance
        else if (avgFPS < this.minAcceptableFPS) {
            console.warn(`Low performance: ${avgFPS} FPS`);
            this.applyModerateOptimizations();
        }
        // Good performance - restore settings
        else if (avgFPS > this.targetFPS) {
            this.restoreOptimalSettings();
        }
    }

    /**
     * Apply critical optimizations for very low FPS
     */
    applyCriticalOptimizations() {
        // Reduce concurrent loads significantly
        if (this.viewer.imageLoaderLimit > 4) {
            this.viewer.imageLoaderLimit = 4;
        }

        // Reduce cache to free memory
        if (this.viewer.maxImageCacheCount > 500) {
            this.viewer.maxImageCacheCount = 500;
        }

        // Slower animations
        if (this.viewer.animationTime < 0.8) {
            this.viewer.animationTime = 0.8;
        }

        console.log('Applied critical performance optimizations');
    }

    /**
     * Apply moderate optimizations
     */
    applyModerateOptimizations() {
        // Reduce concurrent tile loads
        if (this.viewer.imageLoaderLimit > 6) {
            this.viewer.imageLoaderLimit = Math.max(6, this.viewer.imageLoaderLimit - 2);
        }

        // Slightly slower animations
        if (this.viewer.animationTime < 0.6) {
            this.viewer.animationTime = Math.min(0.6, this.viewer.animationTime + 0.1);
        }

        console.log('Applied moderate performance optimizations');
    }

    /**
     * Restore optimal settings when performance is good
     */
    restoreOptimalSettings() {
        // Only restore if performance has been good for multiple samples
        const recentPerformance = this.performanceHistory.slice(-3);
        const allGood = recentPerformance.every(p => p.fps > this.targetFPS);

        if (!allGood) return;

        // Gradually restore settings
        if (this.viewer.imageLoaderLimit < 10) {
            this.viewer.imageLoaderLimit = Math.min(10, this.viewer.imageLoaderLimit + 1);
        }

        if (this.viewer.animationTime > 0.5) {
            this.viewer.animationTime = Math.max(0.5, this.viewer.animationTime - 0.05);
        }

        if (this.viewer.maxImageCacheCount < 1500) {
            this.viewer.maxImageCacheCount = Math.min(1500, this.viewer.maxImageCacheCount + 100);
        }
    }

    /**
     * Handle tile loaded event
     */
    onTileLoaded(event) {
        // Track tile loading performance
        if (event.tiledImage && event.tile) {
            const loadTime = event.tile.loadTime || 0;
            this.metrics.tileLoadTime = (this.metrics.tileLoadTime + loadTime) / 2;
        }
    }

    /**
     * Handle tile load failed event
     */
    onTileLoadFailed(event) {
        // Log errors except for expected missing levels
        if (event.tile && !(event.tile.level >= 9 && event.tile.level <= 11)) {
            console.warn('Tile load failed:', event.tile);
        }
    }

    /**
     * Get current metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            isOptimal: this.metrics.averageFPS >= this.targetFPS,
            performanceLevel: this.getPerformanceLevel(),
            warnings: this.getWarnings()
        };
    }

    /**
     * Get performance level
     */
    getPerformanceLevel() {
        const fps = this.metrics.averageFPS;
        if (fps >= this.targetFPS) return 'optimal';
        if (fps >= this.minAcceptableFPS) return 'good';
        if (fps >= this.criticalFPS) return 'poor';
        return 'critical';
    }

    /**
     * Get performance warnings
     */
    getWarnings() {
        const warnings = [];

        if (this.metrics.averageFPS < this.minAcceptableFPS) {
            warnings.push(`Low FPS: ${this.metrics.averageFPS}`);
        }

        if (this.metrics.tileLoadTime > 500) {
            warnings.push(`Slow tile loading: ${Math.round(this.metrics.tileLoadTime)}ms`);
        }

        if (this.metrics.memoryUsage > 500) {
            warnings.push(`High memory usage: ${this.metrics.memoryUsage}MB`);
        }

        if (this.metrics.cachedTiles > 3000) {
            warnings.push(`Large tile cache: ${this.metrics.cachedTiles} tiles`);
        }

        return warnings;
    }

    /**
     * Enable debug overlay
     */
    enableDebugOverlay() {
        if (this.debugOverlay) return;

        this.debugOverlay = document.createElement('div');
        this.debugOverlay.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px;
            font-family: monospace;
            font-size: 12px;
            border-radius: 4px;
            z-index: 9999;
            min-width: 200px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        `;

        document.body.appendChild(this.debugOverlay);

        // Update overlay
        this.debugInterval = setInterval(() => {
            if (this.isMonitoring && this.debugOverlay) {
                const metrics = this.getMetrics();
                const performanceColor = {
                    optimal: '#4CAF50',
                    good: '#8BC34A',
                    poor: '#FF9800',
                    critical: '#F44336'
                }[metrics.performanceLevel];

                this.debugOverlay.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 5px;">Performance Monitor</div>
                    <div style="color: ${performanceColor};">FPS: ${metrics.averageFPS} (${metrics.minFPS}-${metrics.maxFPS})</div>
                    <div>Zoom: ${metrics.zoomLevel.toFixed(2)}x</div>
                    <div>Tiles: ${metrics.visibleTiles} / ${metrics.cachedTiles}</div>
                    <div>Load: ${Math.round(metrics.tileLoadTime)}ms</div>
                    <div>Memory: ${metrics.memoryUsage}MB</div>
                    <div>Level: <span style="color: ${performanceColor};">${metrics.performanceLevel}</span></div>
                    ${metrics.warnings.length > 0 ? `<div style="color: #ff6b6b; margin-top: 5px;">${metrics.warnings.join('<br>')}</div>` : ''}
                `;
            }
        }, 250);
    }

    /**
     * Disable debug overlay
     */
    disableDebugOverlay() {
        if (this.debugOverlay) {
            this.debugOverlay.remove();
            this.debugOverlay = null;
        }
        if (this.debugInterval) {
            clearInterval(this.debugInterval);
            this.debugInterval = null;
        }
    }
}

export default PerformanceMonitor;