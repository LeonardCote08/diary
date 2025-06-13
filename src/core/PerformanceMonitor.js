/**
 * PerformanceMonitor - Real-time performance tracking and optimization
 * Monitors FPS and adjusts settings dynamically without sacrificing quality
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
            memoryUsage: 0
        };
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
            this.optimizeSettings();
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
    }

    /**
     * Optimize settings based on performance
     */
    optimizeSettings() {
        const avgFPS = this.metrics.averageFPS;

        // Only optimize if performance is poor
        if (avgFPS < this.minAcceptableFPS) {
            console.warn(`Low FPS detected: ${avgFPS}. Optimizing...`);

            // Reduce concurrent tile loads
            if (this.viewer.imageLoaderLimit > 8) {
                this.viewer.imageLoaderLimit = Math.max(8, this.viewer.imageLoaderLimit - 2);
                console.log(`Reduced imageLoaderLimit to ${this.viewer.imageLoaderLimit}`);
            }

            // Reduce animation time for faster response
            if (this.viewer.animationTime > 0.2) {
                this.viewer.animationTime = Math.max(0.2, this.viewer.animationTime - 0.1);
                console.log(`Reduced animationTime to ${this.viewer.animationTime}`);
            }

            // Reduce tiles per frame
            if (this.viewer.maxTilesPerFrame > 4) {
                this.viewer.maxTilesPerFrame = Math.max(4, this.viewer.maxTilesPerFrame - 1);
                console.log(`Reduced maxTilesPerFrame to ${this.viewer.maxTilesPerFrame}`);
            }
        }
        // Restore settings if performance is good
        else if (avgFPS > this.targetFPS) {
            // Gradually restore settings
            if (this.viewer.imageLoaderLimit < 16) {
                this.viewer.imageLoaderLimit = Math.min(16, this.viewer.imageLoaderLimit + 1);
            }

            if (this.viewer.animationTime < 0.3) {
                this.viewer.animationTime = Math.min(0.3, this.viewer.animationTime + 0.05);
            }

            if (this.viewer.maxTilesPerFrame < 8) {
                this.viewer.maxTilesPerFrame = Math.min(8, this.viewer.maxTilesPerFrame + 1);
            }
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
        // Don't warn about missing intermediate levels (9-11) - this is normal with VIPS
        if (event.tile && event.tile.level >= 9 && event.tile.level <= 11) {
            return;
        }
        console.warn('Tile load failed:', event.tile);
        // Could implement retry logic here
    }

    /**
     * Get current metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            isOptimal: this.metrics.averageFPS >= this.targetFPS,
            warnings: this.getWarnings()
        };
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
        `;

        document.body.appendChild(this.debugOverlay);

        // Update overlay
        setInterval(() => {
            if (this.isMonitoring && this.debugOverlay) {
                const metrics = this.getMetrics();
                this.debugOverlay.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 5px;">Performance Monitor</div>
                    <div>FPS: ${metrics.averageFPS} (${metrics.minFPS}-${metrics.maxFPS})</div>
                    <div>Tiles: ${metrics.visibleTiles} visible / ${metrics.cachedTiles} cached</div>
                    <div>Load Time: ${Math.round(metrics.tileLoadTime)}ms</div>
                    <div>Memory: ${metrics.memoryUsage}MB</div>
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
    }
}

export default PerformanceMonitor;