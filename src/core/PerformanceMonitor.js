/**
 * PerformanceMonitor - Real-time performance tracking with 60 FPS targeting
 */
class PerformanceMonitor {
    constructor(viewer) {
        this.viewer = viewer;
        this.isMonitoring = false;

        // FPS tracking
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fpsHistory = [];
        this.frameTimes = [];

        // Performance thresholds
        this.thresholds = {
            fps: { target: 60, good: 55, acceptable: 45, poor: 30, critical: 20 },
            frameTime: { target: 16.67, warning: 20 },
            memory: { warning: 250, critical: 300 }
        };

        // Metrics with defaults
        this.metrics = this.getDefaultMetrics();

        // History tracking
        this.performanceHistory = [];
        this.loadTimes = [];

        // Configuration
        this.config = {
            historySize: { fps: 60, performance: 300, frameTimes: 60, loadTimes: 50 },
            intervals: { monitoring: 250, debug: 100 },
            optimization: { cooldown: 1000 }
        };

        this.lastOptimization = Date.now();
        this.intervals = {};
    }

    getDefaultMetrics() {
        return {
            currentFPS: 60, averageFPS: 60, minFPS: 60, maxFPS: 60,
            frameTime: 16.67, maxFrameTime: 16.67, droppedFrames: 0,
            tileLoadTime: 0, visibleTiles: 0, cachedTiles: 0, tilesLoading: 0,
            memoryUsage: 0, memoryLimit: 0, gcCount: 0,
            renderMode: 'static', drawCalls: 0, canvasSize: 0,
            zoomLevel: 1, viewportCoverage: 0, hotspotCount: 0,
            performanceScore: 100
        };
    }

    start() {
        if (this.isMonitoring) return;

        this.isMonitoring = true;
        this.lastTime = performance.now();

        this.measureFrame();
        this.intervals.monitoring = setInterval(() => {
            this.updateMetrics();
            this.analyzePerformance();
        }, this.config.intervals.monitoring);

        this.setupEventHandlers();
        console.log('Performance monitoring started - Target: 60 FPS');
    }

    stop() {
        this.isMonitoring = false;

        Object.values(this.intervals).forEach(interval => clearInterval(interval));
        this.intervals = {};

        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        this.removeEventHandlers();
        console.log('Performance monitoring stopped');
    }

    setupEventHandlers() {
        const handlers = {
            'tile-loaded': this.onTileLoaded,
            'tile-load-failed': this.onTileLoadFailed,
            'animation-start': () => this.metrics.renderMode = 'animating',
            'animation-finish': () => this.metrics.renderMode = 'static'
        };

        Object.entries(handlers).forEach(([event, handler]) =>
            this.viewer.addHandler(event, handler.bind(this))
        );
    }

    removeEventHandlers() {
        ['tile-loaded', 'tile-load-failed', 'animation-start', 'animation-finish']
            .forEach(event => this.viewer.removeAllHandlers(event));
    }

    measureFrame() {
        if (!this.isMonitoring) return;

        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;

        this.updateFrameMetrics(deltaTime);
        this.lastTime = currentTime;
        this.frameCount++;

        this.rafId = requestAnimationFrame(() => this.measureFrame());
    }

    updateFrameMetrics(deltaTime) {
        this.frameTimes.push(deltaTime);
        this.trimArray(this.frameTimes, this.config.historySize.frameTimes);

        if (deltaTime > 0) {
            const instantFPS = 1000 / deltaTime;
            this.fpsHistory.push(instantFPS);
            this.trimArray(this.fpsHistory, this.config.historySize.fps);

            this.metrics.currentFPS = instantFPS;
            if (deltaTime > 20) this.metrics.droppedFrames++;
        }
    }

    updateMetrics() {
        this.updateFPSMetrics();
        this.updateFrameTimeMetrics();
        this.updateViewerMetrics();
        this.updateTileMetrics();
        this.updateMemoryMetrics();
        this.calculatePerformanceScore();
        this.trackPerformanceHistory();
    }

    updateFPSMetrics() {
        if (this.fpsHistory.length === 0) return;

        this.metrics.averageFPS = Math.round(this.average(this.fpsHistory));
        this.metrics.minFPS = Math.round(Math.min(...this.fpsHistory));
        this.metrics.maxFPS = Math.round(Math.max(...this.fpsHistory));
    }

    updateFrameTimeMetrics() {
        if (this.frameTimes.length === 0) return;

        this.metrics.frameTime = this.average(this.frameTimes).toFixed(2);
        this.metrics.maxFrameTime = Math.max(...this.frameTimes).toFixed(2);
    }

    updateViewerMetrics() {
        this.metrics.zoomLevel = this.viewer.viewport.getZoom(true).toFixed(2);

        const canvas = this.viewer.drawer.canvas;
        if (canvas) {
            this.metrics.canvasSize = `${canvas.width}×${canvas.height}`;
        }

        const viewport = this.viewer.viewport;
        const bounds = viewport.getBounds();
        const homeBounds = this.viewer.world.getHomeBounds();
        const coverage = (bounds.width * bounds.height) / (homeBounds.width * homeBounds.height);
        this.metrics.viewportCoverage = Math.min(100, coverage * 100).toFixed(1);
    }

    updateTileMetrics() {
        const world = this.viewer.world;
        if (world.getItemCount() === 0) return;

        const tiledImage = world.getItemAt(0);
        if (!tiledImage) return;

        this.metrics.visibleTiles = tiledImage._tilesToDraw?.length || 0;

        if (tiledImage._tileCache) {
            const cache = tiledImage._tileCache;
            this.metrics.cachedTiles = cache._tilesLoaded?.length || cache._imagesLoadedCount || 0;
        }

        if (window.tileOptimizer) {
            this.metrics.tilesLoading = window.tileOptimizer.getStats().loadingCount;
        }
    }

    updateMemoryMetrics() {
        if (!performance.memory) return;

        this.metrics.memoryUsage = Math.round(performance.memory.usedJSHeapSize / 1048576);
        this.metrics.memoryLimit = Math.round(performance.memory.jsHeapSizeLimit / 1048576);
    }

    calculatePerformanceScore() {
        const { fps, frameTime, memory } = this.thresholds;

        const scores = {
            fps: Math.min(100, (this.metrics.averageFPS / fps.target) * 100) * 0.5,
            frameTime: Math.min(100, (frameTime.target / parseFloat(this.metrics.frameTime)) * 100) * 0.2,
            memory: this.metrics.memoryLimit > 0
                ? Math.max(0, Math.min(100, (1 - this.metrics.memoryUsage / this.metrics.memoryLimit) * 100)) * 0.2
                : 20,
            droppedFrames: Math.max(0, 100 - Math.min(100, this.metrics.droppedFrames * 2)) * 0.1
        };

        this.metrics.performanceScore = Math.round(Object.values(scores).reduce((a, b) => a + b, 0));
    }

    trackPerformanceHistory() {
        this.performanceHistory.push({
            timestamp: Date.now(),
            fps: this.metrics.averageFPS,
            memory: this.metrics.memoryUsage,
            tiles: this.metrics.visibleTiles,
            score: this.metrics.performanceScore
        });

        this.trimArray(this.performanceHistory, this.config.historySize.performance);
    }

    analyzePerformance() {
        const now = Date.now();
        if (now - this.lastOptimization < this.config.optimization.cooldown) return;

        const { fps } = this.thresholds;
        const avgFPS = this.metrics.averageFPS;
        const score = this.metrics.performanceScore;
        const trend = this.getPerformanceTrend();

        const optimizations = [
            { condition: avgFPS < fps.critical || score < 30, action: this.applyCriticalOptimizations, log: 'CRITICAL' },
            { condition: avgFPS < fps.poor || score < 50, action: this.applyAggressiveOptimizations, log: 'Poor' },
            { condition: avgFPS < fps.good || score < 80, action: this.applyModerateOptimizations, log: 'Below target' },
            {
                condition: avgFPS > fps.target && score > 90 && (trend === 'improving' || trend === 'stable'),
                action: this.restoreQualitySettings, log: null
            }
        ];

        for (const opt of optimizations) {
            if (opt.condition) {
                if (opt.log) console[opt.log === 'CRITICAL' ? 'error' : 'warn'](
                    `${opt.log} performance: Score ${score}, FPS: ${avgFPS}`
                );
                opt.action.call(this);
                this.lastOptimization = now;
                break;
            }
        }
    }

    getPerformanceTrend() {
        if (this.performanceHistory.length < 20) return 'stable';

        const recent = this.performanceHistory.slice(-10);
        const older = this.performanceHistory.slice(-20, -10);

        const recentAvg = this.average(recent.map(p => p.score));
        const olderAvg = this.average(older.map(p => p.score));
        const diff = recentAvg - olderAvg;

        return diff > 5 ? 'improving' : diff < -5 ? 'declining' : 'stable';
    }

    applyCriticalOptimizations() {
        Object.assign(this.viewer, {
            imageLoaderLimit: 2,
            maxImageCacheCount: 100,
            smoothTileEdgesMinZoom: Infinity,
            alwaysBlend: false,
            immediateRender: true,
            animationTime: 0.5,
            springStiffness: 10
        });

        if (window.gc) window.gc();
        console.log('Applied critical performance optimizations');
    }

    applyAggressiveOptimizations() {
        this.viewer.imageLoaderLimit = Math.max(3, this.viewer.imageLoaderLimit - 1);
        this.viewer.maxImageCacheCount = Math.max(200, this.viewer.maxImageCacheCount - 50);
        this.viewer.animationTime = Math.max(0.8, this.viewer.animationTime - 0.1);
        console.log('Applied aggressive performance optimizations');
    }

    applyModerateOptimizations() {
        if (this.viewer.imageLoaderLimit > 4) {
            this.viewer.imageLoaderLimit--;
            console.log('Applied moderate performance optimizations');
        }
    }

    restoreQualitySettings() {
        const config = window.performanceConfig?.viewer;
        if (!config) return;

        const settings = [
            { prop: 'imageLoaderLimit', delta: 1, op: 'increase' },
            { prop: 'maxImageCacheCount', delta: 50, op: 'increase' },
            { prop: 'animationTime', delta: 0.1, op: 'decrease' }
        ];

        settings.forEach(({ prop, delta, op }) => {
            const current = this.viewer[prop];
            const target = config[prop];

            if (op === 'increase' && current < target) {
                this.viewer[prop] = Math.min(target, current + delta);
            } else if (op === 'decrease' && current > target) {
                this.viewer[prop] = Math.max(target, current - delta);
            }
        });
    }

    onTileLoaded(event) {
        if (event.tile?.loadTime) {
            this.metrics.tileLoadTime = this.metrics.tileLoadTime * 0.9 + event.tile.loadTime * 0.1;
        }
    }

    onTileLoadFailed(event) {
        console.warn('Tile load failed:', event.tile);
    }

    trackLoadTime(loadTime) {
        this.loadTimes.push(loadTime);
        this.trimArray(this.loadTimes, this.config.historySize.loadTimes);
        this.averageLoadTime = this.average(this.loadTimes);
    }

    getMetrics() {
        const level = this.getPerformanceLevel();

        return {
            ...this.metrics,
            performanceLevel: level,
            trend: this.getPerformanceTrend(),
            warnings: this.getWarnings(),
            recommendations: this.getRecommendations()
        };
    }

    getPerformanceLevel() {
        const { averageFPS: fps, performanceScore: score } = this.metrics;
        const { fps: thresholds } = this.thresholds;

        const levels = [
            { name: 'excellent', condition: fps >= thresholds.target && score >= 90 },
            { name: 'good', condition: fps >= thresholds.good && score >= 80 },
            { name: 'acceptable', condition: fps >= thresholds.acceptable && score >= 60 },
            { name: 'poor', condition: fps >= thresholds.poor && score >= 40 },
            { name: 'critical', condition: true }
        ];

        return levels.find(l => l.condition).name;
    }

    getWarnings() {
        const warnings = [];
        const m = this.metrics;
        const t = this.thresholds;

        const checks = [
            { condition: m.averageFPS < t.fps.acceptable, message: `Low FPS: ${m.averageFPS} (target: ${t.fps.target})` },
            { condition: m.droppedFrames > 100, message: `Dropped frames: ${m.droppedFrames}` },
            { condition: parseFloat(m.frameTime) > t.frameTime.warning, message: `High frame time: ${m.frameTime}ms` },
            { condition: m.memoryUsage > t.memory.critical, message: `High memory: ${m.memoryUsage}MB` },
            { condition: m.cachedTiles > 2000, message: `Large cache: ${m.cachedTiles} tiles` },
            { condition: m.tileLoadTime > 300, message: `Slow tile loading: ${Math.round(m.tileLoadTime)}ms` }
        ];

        return checks.filter(c => c.condition).map(c => c.message);
    }

    getRecommendations() {
        const recs = [];
        const m = this.metrics;
        const t = this.thresholds;

        if (m.averageFPS < t.fps.acceptable) {
            if (m.renderMode === 'animating') recs.push('Reduce animation time for smoother transitions');
            if (m.cachedTiles > 1000) recs.push('Clear tile cache to free memory');
            if (m.visibleTiles > 50) recs.push('Zoom in to reduce visible tiles');
        }

        if (m.memoryUsage > t.memory.warning) recs.push('Consider reloading the page to clear memory');
        if (m.tileLoadTime > 200) recs.push('Check network connection or reduce concurrent tile loads');

        return recs;
    }

    enableDebugOverlay() {
        if (this.debugOverlay) return;

        this.debugOverlay = document.createElement('div');
        this.debugOverlay.style.cssText = `
            position: fixed; top: 10px; right: 10px; background: rgba(0, 0, 0, 0.85);
            color: white; padding: 12px; font-family: 'SF Mono', Monaco, monospace;
            font-size: 11px; border-radius: 6px; z-index: 9999; min-width: 180px;
            backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;

        document.body.appendChild(this.debugOverlay);
        this.intervals.debug = setInterval(() => this.updateDebugOverlay(), this.config.intervals.debug);
    }

    updateDebugOverlay() {
        if (!this.isMonitoring || !this.debugOverlay) return;

        const m = this.getMetrics();
        const levelColors = {
            excellent: '#4CAF50', good: '#8BC34A', acceptable: '#FFC107',
            poor: '#FF9800', critical: '#F44336'
        };

        const fpsColor = m.currentFPS < 55 ? '#FF9800' : '#4CAF50';
        const memoryColor = m.memoryUsage > 250 ? '#FF9800' : '#4CAF50';

        this.debugOverlay.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px; font-size: 12px;">
                Performance Monitor
                <span style="float: right; color: ${levelColors[m.performanceLevel]};">
                    ${m.performanceScore}%
                </span>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span>FPS:</span>
                <span style="color: ${fpsColor};">
                    ${m.currentFPS.toFixed(0)} (avg: ${m.averageFPS})
                </span>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span>Zoom:</span>
                <span>${m.zoomLevel}x</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span>Memory:</span>
                <span style="color: ${memoryColor};">
                    ${m.memoryUsage}MB
                </span>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span>Status:</span>
                <span style="color: ${levelColors[m.performanceLevel]}; font-weight: 500;">
                    ${m.performanceLevel}
                </span>
            </div>
        `;
    }

    disableDebugOverlay() {
        if (this.debugOverlay) {
            this.debugOverlay.remove();
            this.debugOverlay = null;
        }
        if (this.intervals.debug) {
            clearInterval(this.intervals.debug);
            delete this.intervals.debug;
        }
    }

    // Utility methods
    average(arr) {
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    trimArray(arr, maxLength) {
        while (arr.length > maxLength) arr.shift();
    }
}

export default PerformanceMonitor;