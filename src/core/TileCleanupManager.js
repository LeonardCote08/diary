/**
 * TileCleanupManager - Advanced tile cleanup for sustained 60 FPS
 * Works with OpenSeadragon to aggressively manage tile memory
 */
class TileCleanupManager {
    constructor(viewer) {
        this.viewer = viewer;

        this.state = {
            isActive: false,
            lastCleanup: Date.now(),
            lastDeepCleanup: Date.now(),
            cleanupCount: 0,
            tilesRemoved: 0,
            currentPressure: 'normal' // normal, elevated, high, critical
        };

        this.config = {
            // Cleanup intervals
            normalCleanupInterval: 30000,    // 30 seconds
            elevatedCleanupInterval: 15000,  // 15 seconds
            highCleanupInterval: 5000,       // 5 seconds
            criticalCleanupInterval: 1000,   // 1 second
            deepCleanupInterval: 60000,      // 1 minute

            // Tile age thresholds (ms)
            maxTileAge: {
                normal: 60000,    // 1 minute
                elevated: 30000,  // 30 seconds
                high: 15000,      // 15 seconds
                critical: 5000    // 5 seconds
            },

            // Cache size thresholds
            cacheThresholds: {
                normal: 400,
                elevated: 200,
                high: 100,
                critical: 50
            },

            // Viewport distance for keeping tiles (in viewport units)
            keepDistance: {
                normal: 2.0,      // Keep tiles within 2x viewport
                elevated: 1.5,
                high: 1.2,
                critical: 1.0     // Only visible tiles
            },

            // Performance thresholds
            fpsThresholds: {
                good: 55,
                acceptable: 45,
                poor: 30,
                critical: 20
            }
        };

        this.intervals = {};
        this.tileAccessTimes = new Map();
        this.metrics = {
            totalCleaned: 0,
            lastCleanupDuration: 0,
            averageCleanupTime: 0,
            cleanupRuns: 0
        };

        // Bind methods
        this.handleTileLoaded = this.handleTileLoaded.bind(this);
        this.handleViewportChange = this.handleViewportChange.bind(this);
    }

    start() {
        if (this.state.isActive) return;

        this.state.isActive = true;

        // Setup event handlers
        this.viewer.addHandler('tile-loaded', this.handleTileLoaded);
        this.viewer.addHandler('viewport-change', this.handleViewportChange);

        // Start cleanup intervals
        this.updateCleanupInterval();
        this.intervals.deepCleanup = setInterval(() => this.performDeepCleanup(), this.config.deepCleanupInterval);

        // Monitor performance
        this.intervals.monitor = setInterval(() => this.monitorPerformance(), 2000);

        console.log('TileCleanupManager started');
    }

    stop() {
        this.state.isActive = false;

        // Remove event handlers
        this.viewer.removeHandler('tile-loaded', this.handleTileLoaded);
        this.viewer.removeHandler('viewport-change', this.handleViewportChange);

        // Clear intervals
        Object.values(this.intervals).forEach(interval => clearInterval(interval));
        this.intervals = {};

        // Clear tracking data
        this.tileAccessTimes.clear();

        console.log('TileCleanupManager stopped');
    }

    handleTileLoaded(event) {
        if (!event.tile) return;

        const tileKey = this.getTileKey(event.tile);
        this.tileAccessTimes.set(tileKey, Date.now());
    }

    handleViewportChange() {
        // Update visible tiles access time
        const tiledImage = this.viewer.world?.getItemAt(0);
        if (!tiledImage || !tiledImage._tilesToDraw) return;

        const now = Date.now();
        tiledImage._tilesToDraw.forEach(tile => {
            const tileKey = this.getTileKey(tile);
            this.tileAccessTimes.set(tileKey, now);
        });
    }

    getTileKey(tile) {
        return `${tile.level}_${tile.x}_${tile.y}`;
    }

    monitorPerformance() {
        // Get current FPS from performance monitor
        const fps = window.performanceMonitor?.getMetrics()?.averageFPS || 60;
        const previousPressure = this.state.currentPressure;

        // Determine pressure level based on FPS
        if (fps < this.config.fpsThresholds.critical) {
            this.state.currentPressure = 'critical';
        } else if (fps < this.config.fpsThresholds.poor) {
            this.state.currentPressure = 'high';
        } else if (fps < this.config.fpsThresholds.acceptable) {
            this.state.currentPressure = 'elevated';
        } else {
            this.state.currentPressure = 'normal';
        }

        // Update cleanup interval if pressure changed
        if (previousPressure !== this.state.currentPressure) {
            console.log(`Tile cleanup pressure changed: ${previousPressure} → ${this.state.currentPressure} (FPS: ${fps})`);
            this.updateCleanupInterval();

            // Immediate cleanup if critical
            if (this.state.currentPressure === 'critical') {
                this.performCleanup();
            }
        }
    }

    updateCleanupInterval() {
        // Clear existing interval
        if (this.intervals.cleanup) {
            clearInterval(this.intervals.cleanup);
        }

        // Set new interval based on pressure
        const intervalMap = {
            normal: this.config.normalCleanupInterval,
            elevated: this.config.elevatedCleanupInterval,
            high: this.config.highCleanupInterval,
            critical: this.config.criticalCleanupInterval
        };

        const interval = intervalMap[this.state.currentPressure];
        this.intervals.cleanup = setInterval(() => this.performCleanup(), interval);
    }

    performCleanup() {
        if (!this.state.isActive) return;

        const startTime = performance.now();
        const tiledImage = this.viewer.world?.getItemAt(0);
        if (!tiledImage || !tiledImage._tileCache) return;

        const pressure = this.state.currentPressure;
        const maxAge = this.config.maxTileAge[pressure];
        const cacheThreshold = this.config.cacheThresholds[pressure];
        const keepDistance = this.config.keepDistance[pressure];
        const now = Date.now();

        // Get current viewport bounds
        const viewport = this.viewer.viewport;
        const bounds = viewport.getBounds();
        const expandedBounds = {
            x: bounds.x - bounds.width * (keepDistance - 1) / 2,
            y: bounds.y - bounds.height * (keepDistance - 1) / 2,
            width: bounds.width * keepDistance,
            height: bounds.height * keepDistance
        };

        // Get cache info
        const cache = tiledImage._tileCache;
        const cachedTiles = cache._tilesLoaded || [];
        const currentCacheSize = cachedTiles.length;

        if (currentCacheSize === 0) return;

        // Determine tiles to remove
        const tilesToRemove = [];

        cachedTiles.forEach(tile => {
            const tileKey = this.getTileKey(tile);
            const lastAccess = this.tileAccessTimes.get(tileKey) || 0;
            const age = now - lastAccess;

            // Check if tile should be removed
            let shouldRemove = false;

            // Age-based removal
            if (age > maxAge) {
                shouldRemove = true;
            }

            // Distance-based removal
            if (!shouldRemove && pressure !== 'normal') {
                const tileBounds = tile.bounds;
                if (tileBounds) {
                    const isInExpandedView = !(
                        tileBounds.x + tileBounds.width < expandedBounds.x ||
                        tileBounds.x > expandedBounds.x + expandedBounds.width ||
                        tileBounds.y + tileBounds.height < expandedBounds.y ||
                        tileBounds.y > expandedBounds.y + expandedBounds.height
                    );

                    if (!isInExpandedView) {
                        shouldRemove = true;
                    }
                }
            }

            if (shouldRemove) {
                tilesToRemove.push(tile);
            }
        });

        // Cache size-based removal (remove oldest tiles if over threshold)
        if (currentCacheSize > cacheThreshold) {
            const remainingToRemove = currentCacheSize - cacheThreshold;
            if (remainingToRemove > tilesToRemove.length) {
                // Sort remaining tiles by age and remove oldest
                const remainingTiles = cachedTiles.filter(tile => !tilesToRemove.includes(tile));
                remainingTiles.sort((a, b) => {
                    const aKey = this.getTileKey(a);
                    const bKey = this.getTileKey(b);
                    const aTime = this.tileAccessTimes.get(aKey) || 0;
                    const bTime = this.tileAccessTimes.get(bKey) || 0;
                    return aTime - bTime; // Oldest first
                });

                const additionalToRemove = remainingToRemove - tilesToRemove.length;
                tilesToRemove.push(...remainingTiles.slice(0, additionalToRemove));
            }
        }

        // Remove tiles
        if (tilesToRemove.length > 0) {
            // OpenSeadragon doesn't provide selective tile removal, so we clear and let it rebuild
            // This is aggressive but necessary for performance
            cache.clearTilesFor(tiledImage);

            // Clear access times for removed tiles
            tilesToRemove.forEach(tile => {
                const tileKey = this.getTileKey(tile);
                this.tileAccessTimes.delete(tileKey);
            });

            // Update metrics
            this.state.tilesRemoved += tilesToRemove.length;
            this.metrics.totalCleaned += tilesToRemove.length;

            console.log(`Cleaned ${tilesToRemove.length} tiles (pressure: ${pressure}, cache was: ${currentCacheSize})`);
        }

        // Update metrics
        const duration = performance.now() - startTime;
        this.metrics.lastCleanupDuration = duration;
        this.metrics.cleanupRuns++;
        this.metrics.averageCleanupTime =
            (this.metrics.averageCleanupTime * (this.metrics.cleanupRuns - 1) + duration) /
            this.metrics.cleanupRuns;

        this.state.lastCleanup = now;
        this.state.cleanupCount++;
    }

    performDeepCleanup() {
        if (!this.state.isActive) return;

        console.log('Performing deep tile cleanup');
        const startTime = performance.now();

        // Clear all non-visible tiles
        const tiledImage = this.viewer.world?.getItemAt(0);
        if (!tiledImage || !tiledImage._tileCache) return;

        // Force complete cache clear
        tiledImage._tileCache.clearTilesFor(tiledImage);

        // Clear all tracking data older than 5 minutes
        const now = Date.now();
        const maxTrackingAge = 300000; // 5 minutes

        const keysToDelete = [];
        this.tileAccessTimes.forEach((time, key) => {
            if (now - time > maxTrackingAge) {
                keysToDelete.push(key);
            }
        });

        keysToDelete.forEach(key => this.tileAccessTimes.delete(key));

        // Force garbage collection if available
        if (window.gc) {
            window.gc();
            console.log('Forced garbage collection after deep cleanup');
        }

        const duration = performance.now() - startTime;
        this.state.lastDeepCleanup = now;

        console.log(`Deep cleanup completed in ${duration.toFixed(2)}ms, cleared ${keysToDelete.length} old tracking entries`);
    }

    forceCleanup() {
        console.log('Forcing immediate tile cleanup');
        this.performCleanup();
    }

    getMetrics() {
        const tiledImage = this.viewer.world?.getItemAt(0);
        const currentCacheSize = tiledImage?._tileCache?._tilesLoaded?.length || 0;

        return {
            ...this.metrics,
            currentCacheSize,
            pressure: this.state.currentPressure,
            cleanupCount: this.state.cleanupCount,
            tilesRemoved: this.state.tilesRemoved,
            trackingSize: this.tileAccessTimes.size,
            cacheThreshold: this.config.cacheThresholds[this.state.currentPressure]
        };
    }

    setPressure(pressure) {
        if (['normal', 'elevated', 'high', 'critical'].includes(pressure)) {
            this.state.currentPressure = pressure;
            this.updateCleanupInterval();
            console.log(`Tile cleanup pressure manually set to: ${pressure}`);
        }
    }

    destroy() {
        this.stop();
        this.viewer = null;
        this.tileAccessTimes.clear();
    }
}

export default TileCleanupManager;