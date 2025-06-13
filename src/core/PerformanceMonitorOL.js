/**
 * PerformanceMonitor for OpenLayers - Real-time performance tracking
 * Monitors FPS and adjusts settings dynamically without sacrificing quality
 */

class PerformanceMonitor {
    constructor(map) {
        this.map = map;
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
        this.renderFrameCallback = null;

        // Performance metrics
        this.metrics = {
            averageFPS: 60,
            minFPS: 60,
            maxFPS: 60,
            renderTime: 0,
            visibleTiles: 0,
            loadedTiles: 0,
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

        // Monitor FPS through render frames
        this.startFrameMonitoring();

        // Update metrics every second
        this.monitoringInterval = setInterval(() => {
            this.updateMetrics();
            this.optimizeSettings();
        }, 1000);

        // Track tile loading
        this.map.on('tileloadstart', this.onTileLoadStart.bind(this));
        this.map.on('tileloadend', this.onTileLoadEnd.bind(this));
        this.map.on('tileloaderror', this.onTileLoadError.bind(this));

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

        if (this.renderFrameCallback) {
            this.map.un('postrender', this.renderFrameCallback);
            this.renderFrameCallback = null;
        }

        this.map.un('tileloadstart', this.onTileLoadStart);
        this.map.un('tileloadend', this.onTileLoadEnd);
        this.map.un('tileloaderror', this.onTileLoadError);

        console.log('Performance monitoring stopped');
    }

    /**
     * Start frame monitoring
     */
    startFrameMonitoring() {
        let frameStartTime = performance.now();

        this.renderFrameCallback = () => {
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

            // Track render time
            this.metrics.renderTime = currentTime - frameStartTime;

            this.lastTime = currentTime;
            this.frameCount++;

            frameStartTime = currentTime;
        };

        this.map.on('postrender', this.renderFrameCallback);
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
        const tileLayers = this.map.getLayers().getArray()
            .filter(layer => layer.getSource && layer.getSource().getTileGrid);

        if (tileLayers.length > 0) {
            const tileSource = tileLayers[0].getSource();
            const tileCache = tileSource.getTileCacheForProjection ?
                tileSource.getTileCacheForProjection(tileSource.getProjection()) : null;

            if (tileCache) {
                this.metrics.loadedTiles = tileCache.getCount();
            }
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
        const view = this.map.getView();

        // Only optimize if performance is poor
        if (avgFPS < this.minAcceptableFPS && avgFPS > 0) {
            console.warn(`Low FPS detected: ${avgFPS}. Optimizing...`);

            // Reduce animation duration for faster response
            const interactions = this.map.getInteractions();
            interactions.forEach(interaction => {
                if (interaction.setDuration && typeof interaction.setDuration === 'function') {
                    interaction.setDuration(150);
                }
            });

            // Notify about performance issues
            console.log('Consider reducing tile quality or visible hotspots for better performance');
        }
        // Restore settings if performance is good
        else if (avgFPS > this.targetFPS) {
            // Restore default interaction durations
            const interactions = this.map.getInteractions();
            interactions.forEach(interaction => {
                if (interaction.setDuration && typeof interaction.setDuration === 'function') {
                    interaction.setDuration(250);
                }
            });
        }
    }

    /**
     * Handle tile load start
     */
    onTileLoadStart() {
        this.metrics.visibleTiles++;
    }

    /**
     * Handle tile load end
     */
    onTileLoadEnd() {
        this.metrics.loadedTiles++;
    }

    /**
     * Handle tile load error
     */
    onTileLoadError(event) {
        console.warn('Tile load error:', event);
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

        if (this.metrics.renderTime > 16) {
            warnings.push(`Slow rendering: ${Math.round(this.metrics.renderTime)}ms`);
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
            pointer-events: none;
        `;

        document.body.appendChild(this.debugOverlay);

        // Update overlay
        setInterval(() => {
            if (this.isMonitoring && this.debugOverlay) {
                const metrics = this.getMetrics();
                const view = this.map.getView();
                const zoom = view.getZoom();
                const resolution = view.getResolution();

                this.debugOverlay.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 5px;">Performance Monitor</div>
                    <div>FPS: ${metrics.averageFPS} (${metrics.minFPS}-${metrics.maxFPS})</div>
                    <div>Render: ${Math.round(metrics.renderTime)}ms</div>
                    <div>Tiles: ${metrics.visibleTiles} / ${metrics.loadedTiles}</div>
                    <div>Memory: ${metrics.memoryUsage}MB</div>
                    <div>Zoom: ${zoom ? zoom.toFixed(2) : 'N/A'}</div>
                    <div>Resolution: ${resolution ? resolution.toFixed(2) : 'N/A'}</div>
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