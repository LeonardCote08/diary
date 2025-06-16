/**
 * PerformanceMonitor - Enhanced with memory monitoring and 60 FPS targeting
 * Provides real-time metrics and dynamic optimization recommendations
 */

class PerformanceMonitor {
    constructor(viewer) {
        this.viewer = viewer;
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fps = 60;
        this.fpsHistory = [];
        this.maxHistorySize = 60; // 1 second at 60 FPS

        // Performance thresholds
        this.targetFPS = 60;
        this.goodFPS = 55;
        this.acceptableFPS = 45;
        this.poorFPS = 30;
        this.criticalFPS = 20;

        // Monitoring state
        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.rafId = null;

        // Enhanced metrics
        this.metrics = {
            // FPS metrics
            currentFPS: 60,
            averageFPS: 60,
            minFPS: 60,
            maxFPS: 60,

            // Frame timing
            frameTime: 16.67,
            maxFrameTime: 16.67,
            droppedFrames: 0,

            // Tile metrics
            tileLoadTime: 0,
            visibleTiles: 0,
            cachedTiles: 0,
            tilesLoading: 0,

            // Memory metrics
            memoryUsage: 0,
            memoryLimit: 0,
            gcCount: 0,

            // Render metrics
            renderMode: 'static',
            drawCalls: 0,
            canvasSize: 0,

            // System metrics
            zoomLevel: 1,
            viewportCoverage: 0,
            hotspotCount: 0,

            // Performance score (0-100)
            performanceScore: 100
        };

        // Performance history for trend analysis
        this.performanceHistory = [];
        this.maxPerformanceHistory = 300; // 5 seconds at 60 FPS

        // Tracking for optimization
        this.lastOptimization = Date.now();
        this.optimizationCooldown = 1000; // 1 second between optimizations

        // Frame timing analysis
        this.frameTimes = [];
        this.maxFrameTimes = 60;
    }

    /**
     * Start monitoring performance
     */
    start() {
        if (this.isMonitoring) return;

        this.isMonitoring = true;
        this.lastTime = performance.now();

        // Start frame monitoring
        this.measureFrame();

        // Update metrics every 250ms for smoother display
        this.monitoringInterval = setInterval(() => {
            this.updateMetrics();
            this.analyzePerformance();
        }, 250);

        // Track tile loading performance
        this.viewer.addHandler('tile-loaded', this.onTileLoaded.bind(this));
        this.viewer.addHandler('tile-load-failed', this.onTileLoadFailed.bind(this));

        // Track animation state
        this.viewer.addHandler('animation-start', () => {
            this.metrics.renderMode = 'animating';
        });

        this.viewer.addHandler('animation-finish', () => {
            this.metrics.renderMode = 'static';
        });

        console.log('Performance monitoring started - Target: 60 FPS');
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

        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        this.viewer.removeHandler('tile-loaded', this.onTileLoaded.bind(this));
        this.viewer.removeHandler('tile-load-failed', this.onTileLoadFailed.bind(this));

        console.log('Performance monitoring stopped');
    }

    /**
     * Measure frame rate with high precision
     */
    measureFrame() {
        if (!this.isMonitoring) return;

        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;

        // Track frame time
        this.frameTimes.push(deltaTime);
        if (this.frameTimes.length > this.maxFrameTimes) {
            this.frameTimes.shift();
        }

        // Calculate instantaneous FPS
        if (deltaTime > 0) {
            const instantFPS = 1000 / deltaTime;
            this.fpsHistory.push(instantFPS);

            // Keep history size limited
            if (this.fpsHistory.length > this.maxHistorySize) {
                this.fpsHistory.shift();
            }

            // Update current FPS
            this.metrics.currentFPS = instantFPS;

            // Track dropped frames (frame time > 20ms indicates dropped frame at 60 FPS)
            if (deltaTime > 20) {
                this.metrics.droppedFrames++;
            }
        }

        this.lastTime = currentTime;
        this.frameCount++;

        // Schedule next measurement
        this.rafId = requestAnimationFrame(() => this.measureFrame());
    }

    /**
     * Update comprehensive performance metrics
     */
    updateMetrics() {
        // FPS calculations
        if (this.fpsHistory.length > 0) {
            this.metrics.averageFPS = Math.round(
                this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length
            );
            this.metrics.minFPS = Math.round(Math.min(...this.fpsHistory));
            this.metrics.maxFPS = Math.round(Math.max(...this.fpsHistory));
        }

        // Frame timing
        if (this.frameTimes.length > 0) {
            const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
            this.metrics.frameTime = avgFrameTime.toFixed(2);
            this.metrics.maxFrameTime = Math.max(...this.frameTimes).toFixed(2);
        }

        // Zoom level
        this.metrics.zoomLevel = this.viewer.viewport.getZoom(true).toFixed(2);

        // Tile metrics
        const world = this.viewer.world;
        if (world.getItemCount() > 0) {
            const tiledImage = world.getItemAt(0);
            if (tiledImage) {
                // Visible tiles
                this.metrics.visibleTiles = tiledImage._tilesToDraw ? tiledImage._tilesToDraw.length : 0;

                // Cached tiles
                if (tiledImage._tileCache) {
                    const cache = tiledImage._tileCache;
                    if (cache._tilesLoaded && Array.isArray(cache._tilesLoaded)) {
                        this.metrics.cachedTiles = cache._tilesLoaded.length;
                    } else if (cache._imagesLoadedCount !== undefined) {
                        this.metrics.cachedTiles = cache._imagesLoadedCount;
                    }
                }

                // Loading tiles (if TileOptimizer is available)
                if (window.tileOptimizer) {
                    const stats = window.tileOptimizer.getStats();
                    this.metrics.tilesLoading = stats.loadingCount;
                }
            }
        }

        // Memory metrics
        if (performance.memory) {
            this.metrics.memoryUsage = Math.round(performance.memory.usedJSHeapSize / 1048576);
            this.metrics.memoryLimit = Math.round(performance.memory.jsHeapSizeLimit / 1048576);
        }

        // Canvas size
        const canvas = this.viewer.drawer.canvas;
        if (canvas) {
            this.metrics.canvasSize = `${canvas.width}×${canvas.height}`;
        }

        // Viewport coverage
        const viewport = this.viewer.viewport;
        const bounds = viewport.getBounds();
        const homeBounds = this.viewer.world.getHomeBounds();
        const coverage = (bounds.width * bounds.height) / (homeBounds.width * homeBounds.height);
        this.metrics.viewportCoverage = Math.min(100, coverage * 100).toFixed(1);

        // Calculate performance score
        this.calculatePerformanceScore();

        // Store performance history
        this.performanceHistory.push({
            timestamp: Date.now(),
            fps: this.metrics.averageFPS,
            memory: this.metrics.memoryUsage,
            tiles: this.metrics.visibleTiles,
            score: this.metrics.performanceScore
        });

        if (this.performanceHistory.length > this.maxPerformanceHistory) {
            this.performanceHistory.shift();
        }
    }

    /**
     * Calculate overall performance score (0-100)
     */
    calculatePerformanceScore() {
        let score = 100;

        // FPS impact (50% weight)
        const fpsRatio = this.metrics.averageFPS / this.targetFPS;
        const fpsScore = Math.min(100, fpsRatio * 100);
        score = score * 0.5 + fpsScore * 0.5;

        // Frame time consistency (20% weight)
        const targetFrameTime = 1000 / this.targetFPS; // 16.67ms for 60 FPS
        const frameTimeRatio = targetFrameTime / parseFloat(this.metrics.frameTime);
        const frameTimeScore = Math.min(100, frameTimeRatio * 100);
        score = score * 0.8 + frameTimeScore * 0.2;

        // Memory usage (20% weight)
        if (this.metrics.memoryLimit > 0) {
            const memoryRatio = 1 - (this.metrics.memoryUsage / this.metrics.memoryLimit);
            const memoryScore = Math.max(0, Math.min(100, memoryRatio * 100));
            score = score * 0.8 + memoryScore * 0.2;
        }

        // Dropped frames penalty (10% weight)
        const droppedFramePenalty = Math.min(100, this.metrics.droppedFrames * 2);
        score = score * 0.9 + (100 - droppedFramePenalty) * 0.1;

        this.metrics.performanceScore = Math.round(score);
    }

    /**
     * Analyze performance and recommend optimizations
     */
    analyzePerformance() {
        const now = Date.now();
        if (now - this.lastOptimization < this.optimizationCooldown) return;

        const avgFPS = this.metrics.averageFPS;
        const memory = this.metrics.memoryUsage;
        const score = this.metrics.performanceScore;

        // Performance trend analysis
        const trend = this.getPerformanceTrend();

        // Critical performance issues
        if (avgFPS < this.criticalFPS || score < 30) {
            console.error(`CRITICAL: Performance score ${score}, FPS: ${avgFPS}`);
            this.applyCriticalOptimizations();
            this.lastOptimization = now;
        }
        // Poor performance
        else if (avgFPS < this.poorFPS || score < 50) {
            console.warn(`Poor performance: Score ${score}, FPS: ${avgFPS}`);
            if (trend === 'declining') {
                this.applyAggressiveOptimizations();
                this.lastOptimization = now;
            }
        }
        // Below target
        else if (avgFPS < this.goodFPS || score < 80) {
            if (trend === 'declining' || trend === 'stable') {
                this.applyModerateOptimizations();
                this.lastOptimization = now;
            }
        }
        // Good performance - try to restore quality
        else if (avgFPS > this.targetFPS && score > 90) {
            if (trend === 'improving' || trend === 'stable') {
                this.restoreQualitySettings();
            }
        }
    }

    /**
     * Get performance trend
     */
    getPerformanceTrend() {
        if (this.performanceHistory.length < 10) return 'stable';

        const recent = this.performanceHistory.slice(-10);
        const older = this.performanceHistory.slice(-20, -10);

        if (older.length === 0) return 'stable';

        const recentAvg = recent.reduce((sum, p) => sum + p.score, 0) / recent.length;
        const olderAvg = older.reduce((sum, p) => sum + p.score, 0) / older.length;

        const diff = recentAvg - olderAvg;

        if (diff > 5) return 'improving';
        if (diff < -5) return 'declining';
        return 'stable';
    }

    /**
     * Apply critical optimizations
     */
    applyCriticalOptimizations() {
        // Immediately reduce load
        this.viewer.imageLoaderLimit = 2;
        this.viewer.maxImageCacheCount = 100;

        // Disable expensive features
        this.viewer.smoothTileEdgesMinZoom = Infinity;
        this.viewer.alwaysBlend = false;
        this.viewer.immediateRender = true;

        // Faster animations
        this.viewer.animationTime = 0.5;
        this.viewer.springStiffness = 10;

        // Force garbage collection if available
        if (window.gc) window.gc();

        console.log('Applied critical performance optimizations');
    }

    /**
     * Apply aggressive optimizations
     */
    applyAggressiveOptimizations() {
        this.viewer.imageLoaderLimit = Math.max(3, this.viewer.imageLoaderLimit - 1);
        this.viewer.maxImageCacheCount = Math.max(200, this.viewer.maxImageCacheCount - 50);
        this.viewer.animationTime = Math.max(0.8, this.viewer.animationTime - 0.1);

        console.log('Applied aggressive performance optimizations');
    }

    /**
     * Apply moderate optimizations
     */
    applyModerateOptimizations() {
        if (this.viewer.imageLoaderLimit > 4) {
            this.viewer.imageLoaderLimit--;
        }

        console.log('Applied moderate performance optimizations');
    }

    /**
     * Restore quality settings when performance is good
     */
    restoreQualitySettings() {
        const config = window.performanceConfig?.viewer;
        if (!config) return;

        // Gradually restore settings
        if (this.viewer.imageLoaderLimit < config.imageLoaderLimit) {
            this.viewer.imageLoaderLimit = Math.min(
                config.imageLoaderLimit,
                this.viewer.imageLoaderLimit + 1
            );
        }

        if (this.viewer.maxImageCacheCount < config.maxImageCacheCount) {
            this.viewer.maxImageCacheCount = Math.min(
                config.maxImageCacheCount,
                this.viewer.maxImageCacheCount + 50
            );
        }

        if (this.viewer.animationTime > config.animationTime) {
            this.viewer.animationTime = Math.max(
                config.animationTime,
                this.viewer.animationTime - 0.1
            );
        }
    }

    /**
     * Handle tile loaded event
     */
    onTileLoaded(event) {
        if (event.tile && event.tile.loadTime) {
            // Rolling average of tile load times
            this.metrics.tileLoadTime = (this.metrics.tileLoadTime * 0.9) + (event.tile.loadTime * 0.1);
        }
    }

    /**
     * Handle tile load failed event
     */
    onTileLoadFailed(event) {
        console.warn('Tile load failed:', event.tile);
    }



    /**
     * Get current metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            performanceLevel: this.getPerformanceLevel(),
            trend: this.getPerformanceTrend(),
            warnings: this.getWarnings(),
            recommendations: this.getRecommendations()
        };
    }

    /**
     * Get performance level
     */
    getPerformanceLevel() {
        const fps = this.metrics.averageFPS;
        const score = this.metrics.performanceScore;

        if (fps >= this.targetFPS && score >= 90) return 'excellent';
        if (fps >= this.goodFPS && score >= 80) return 'good';
        if (fps >= this.acceptableFPS && score >= 60) return 'acceptable';
        if (fps >= this.poorFPS && score >= 40) return 'poor';
        return 'critical';
    }

    /**
     * Get performance warnings
     */
    getWarnings() {
        const warnings = [];
        const m = this.metrics;

        if (m.averageFPS < this.acceptableFPS) {
            warnings.push(`Low FPS: ${m.averageFPS} (target: ${this.targetFPS})`);
        }

        if (m.droppedFrames > 100) {
            warnings.push(`Dropped frames: ${m.droppedFrames}`);
        }

        if (parseFloat(m.frameTime) > 20) {
            warnings.push(`High frame time: ${m.frameTime}ms`);
        }

        if (m.memoryUsage > 300) {
            warnings.push(`High memory: ${m.memoryUsage}MB`);
        }

        if (m.cachedTiles > 2000) {
            warnings.push(`Large cache: ${m.cachedTiles} tiles`);
        }

        if (m.tileLoadTime > 300) {
            warnings.push(`Slow tile loading: ${Math.round(m.tileLoadTime)}ms`);
        }

        return warnings;
    }

    /**
     * Get optimization recommendations
     */
    getRecommendations() {
        const recs = [];
        const m = this.metrics;

        if (m.averageFPS < this.acceptableFPS) {
            if (m.renderMode === 'animating') {
                recs.push('Reduce animation time for smoother transitions');
            }
            if (m.cachedTiles > 1000) {
                recs.push('Clear tile cache to free memory');
            }
            if (m.visibleTiles > 50) {
                recs.push('Zoom in to reduce visible tiles');
            }
        }

        if (m.memoryUsage > 250) {
            recs.push('Consider reloading the page to clear memory');
        }

        if (m.tileLoadTime > 200) {
            recs.push('Check network connection or reduce concurrent tile loads');
        }

        return recs;
    }

    /**
     * Enable debug overlay with enhanced metrics
     */
    enableDebugOverlay() {
        if (this.debugOverlay) return;

        this.debugOverlay = document.createElement('div');
        this.debugOverlay.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 12px;
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 11px;
            border-radius: 6px;
            z-index: 9999;
            min-width: 250px;
            max-width: 300px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;

        document.body.appendChild(this.debugOverlay);

        // Update overlay more frequently for smoother display
        this.debugInterval = setInterval(() => {
            if (this.isMonitoring && this.debugOverlay) {
                this.updateDebugOverlay();
            }
        }, 100); // 10 FPS update rate
    }

    /**
     * Update debug overlay content
     */
    updateDebugOverlay() {
        const m = this.getMetrics();
        const level = m.performanceLevel;
        const trend = m.trend;

        const levelColors = {
            excellent: '#4CAF50',
            good: '#8BC34A',
            acceptable: '#FFC107',
            poor: '#FF9800',
            critical: '#F44336'
        };

        const trendIcons = {
            improving: '↑',
            stable: '→',
            declining: '↓'
        };

        const levelColor = levelColors[level];
        const trendIcon = trendIcons[trend] || '';

        // Build overlay HTML
        let html = `
            <div style="font-weight: bold; margin-bottom: 8px; font-size: 12px;">
                Performance Monitor
                <span style="float: right; color: ${levelColor};">${m.performanceScore}% ${trendIcon}</span>
            </div>
            <div style="border-bottom: 1px solid rgba(255,255,255,0.2); margin-bottom: 6px; padding-bottom: 6px;">
                <div style="display: flex; justify-content: space-between;">
                    <span>FPS:</span>
                    <span style="color: ${m.currentFPS < 55 ? '#FF9800' : '#4CAF50'};">
                        ${m.currentFPS.toFixed(0)} (avg: ${m.averageFPS})
                    </span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>Frame Time:</span>
                    <span>${m.frameTime}ms</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>Dropped:</span>
                    <span style="color: ${m.droppedFrames > 50 ? '#FF9800' : '#999'};">
                        ${m.droppedFrames} frames
                    </span>
                </div>
            </div>
            <div style="border-bottom: 1px solid rgba(255,255,255,0.2); margin-bottom: 6px; padding-bottom: 6px;">
                <div style="display: flex; justify-content: space-between;">
                    <span>Zoom:</span>
                    <span>${m.zoomLevel}x</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>Tiles:</span>
                    <span>${m.visibleTiles} / ${m.cachedTiles}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>Loading:</span>
                    <span>${m.tilesLoading} tiles</span>
                </div>
            </div>
            <div style="border-bottom: 1px solid rgba(255,255,255,0.2); margin-bottom: 6px; padding-bottom: 6px;">
                <div style="display: flex; justify-content: space-between;">
                    <span>Memory:</span>
                    <span style="color: ${m.memoryUsage > 250 ? '#FF9800' : '#999'};">
                        ${m.memoryUsage}MB
                    </span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>Canvas:</span>
                    <span style="font-size: 10px;">${m.canvasSize}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>Status:</span>
                    <span style="color: ${levelColor}; font-weight: 500;">
                        ${level}
                    </span>
                </div>
            </div>
        `;

        // Add warnings if any
        if (m.warnings.length > 0) {
            html += `
                <div style="color: #ff6b6b; font-size: 10px; margin-top: 4px;">
                    ⚠ ${m.warnings[0]}
                </div>
            `;
        }

        this.debugOverlay.innerHTML = html;
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