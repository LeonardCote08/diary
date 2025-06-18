/**
 * MemoryManager - Proactive memory management for sustained 60 FPS
 * Prevents memory leaks and manages cache aggressively
 */
class MemoryManager {
    constructor(viewer) {
        this.viewer = viewer;

        this.state = {
            isActive: false,
            lastCleanup: Date.now(),
            cleanupCount: 0,
            memoryPressure: 'normal' // normal, high, critical
        };

        this.config = {
            // Memory thresholds (MB)
            warningThreshold: 100,
            highThreshold: 150,
            criticalThreshold: 200,

            // Cache limits by memory pressure
            cacheLimits: {
                normal: { tiles: 500, hotspots: 150 },
                high: { tiles: 200, hotspots: 100 },
                critical: { tiles: 50, hotspots: 50 }
            },

            // Intervals
            monitorInterval: 5000,      // Check every 5 seconds
            cleanupInterval: 30000,     // Cleanup every 30 seconds
            aggressiveCleanupDelay: 60000, // Force cleanup every minute

            // Platform
            hasMemoryAPI: 'memory' in performance,
            hasGC: typeof window.gc === 'function',
            isMobile: /Android|iPhone|iPad/i.test(navigator.userAgent)
        };

        // Adjust for mobile
        if (this.config.isMobile) {
            this.config.warningThreshold = 50;
            this.config.highThreshold = 75;
            this.config.criticalThreshold = 100;
            this.config.monitorInterval = 3000;
        }

        this.intervals = {};
        this.metrics = {
            currentUsage: 0,
            peakUsage: 0,
            cleanups: 0,
            gcCalls: 0
        };
    }

    start() {
        if (this.state.isActive) return;

        this.state.isActive = true;

        // Start monitoring
        this.intervals.monitor = setInterval(() => this.checkMemory(), this.config.monitorInterval);
        this.intervals.cleanup = setInterval(() => this.performScheduledCleanup(), this.config.cleanupInterval);
        this.intervals.aggressive = setInterval(() => this.performAggressiveCleanup(), this.config.aggressiveCleanupDelay);

        // Monitor visibility changes
        document.addEventListener('visibilitychange', this.handleVisibilityChange);

        // Monitor page lifecycle
        if ('onfreeze' in document) {
            document.addEventListener('freeze', this.handleFreeze);
        }

        console.log('MemoryManager started');
    }

    stop() {
        this.state.isActive = false;

        // Clear intervals
        Object.values(this.intervals).forEach(interval => clearInterval(interval));
        this.intervals = {};

        // Remove event listeners
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        document.removeEventListener('freeze', this.handleFreeze);

        console.log('MemoryManager stopped');
    }

    checkMemory() {
        if (!this.config.hasMemoryAPI) return;

        const usage = performance.memory.usedJSHeapSize / 1048576; // Convert to MB
        const limit = performance.memory.jsHeapSizeLimit / 1048576;
        const percentage = (usage / limit) * 100;

        this.metrics.currentUsage = usage;
        this.metrics.peakUsage = Math.max(this.metrics.peakUsage, usage);

        // Determine memory pressure
        const previousPressure = this.state.memoryPressure;

        if (usage > this.config.criticalThreshold || percentage > 80) {
            this.state.memoryPressure = 'critical';
        } else if (usage > this.config.highThreshold || percentage > 60) {
            this.state.memoryPressure = 'high';
        } else {
            this.state.memoryPressure = 'normal';
        }

        // Take action if pressure increased
        if (this.state.memoryPressure !== previousPressure) {
            console.log(`Memory pressure changed: ${previousPressure} → ${this.state.memoryPressure} (${usage.toFixed(0)}MB, ${percentage.toFixed(0)}%)`);

            switch (this.state.memoryPressure) {
                case 'critical':
                    this.performEmergencyCleanup();
                    break;
                case 'high':
                    this.performHighPressureCleanup();
                    break;
            }
        }

        // Update viewer cache limits based on pressure
        this.updateCacheLimits();
    }

    updateCacheLimits() {
        const limits = this.config.cacheLimits[this.state.memoryPressure];

        if (this.viewer.maxImageCacheCount !== limits.tiles) {
            this.viewer.maxImageCacheCount = limits.tiles;
            console.log(`Adjusted tile cache limit to ${limits.tiles}`);
        }
    }

    performScheduledCleanup() {
        if (this.state.memoryPressure === 'normal') return;

        console.log('Performing scheduled cleanup');
        this.cleanupTileCache();
        this.metrics.cleanups++;
    }

    performHighPressureCleanup() {
        console.log('High memory pressure - performing cleanup');

        // Clear tile cache
        this.cleanupTileCache(true);

        // Clear audio cache if available
        if (window.audioEngine && typeof window.audioEngine.destroy === 'function') {
            
        }

        // Suggest garbage collection
        this.suggestGC();

        this.metrics.cleanups++;
    }

    performEmergencyCleanup() {
        console.warn('CRITICAL: Emergency memory cleanup');

        // Get tiled image
        const tiledImage = this.viewer.world?.getItemAt(0);
        if (!tiledImage) return;

        // Clear all tiles
        if (tiledImage._tileCache) {
            tiledImage._tileCache.clearTilesFor(tiledImage);
        }

        // Reduce cache to minimum
        this.viewer.maxImageCacheCount = 30;

        // Clear all component caches
        if (window.tileOptimizer) {
            window.tileOptimizer.clearOldTiles();
        }

        if (window.spatialIndex) {
            window.spatialIndex.queryCache.clear();
        }

        // Force garbage collection
        this.forceGC();

        // Clear image elements
        this.clearUnusedImages();

        this.metrics.cleanups++;
        this.state.lastCleanup = Date.now();
    }

    performAggressiveCleanup() {
        if (!this.state.isActive) return;

        // Only if memory is above warning threshold
        if (this.metrics.currentUsage > this.config.warningThreshold) {
            console.log('Performing aggressive cleanup');
            this.cleanupTileCache(true);
            this.clearUnusedImages();
            this.suggestGC();
        }
    }

    cleanupTileCache(aggressive = false) {
        const tiledImage = this.viewer.world?.getItemAt(0);
        if (!tiledImage?._tileCache) return;

        const cache = tiledImage._tileCache;
        const cacheSize = cache._tilesLoaded?.length || cache._imagesLoadedCount || 0;

        if (aggressive || cacheSize > this.config.cacheLimits[this.state.memoryPressure].tiles) {
            // Calculate how many tiles to remove
            const targetSize = aggressive ?
                Math.floor(this.config.cacheLimits[this.state.memoryPressure].tiles * 0.5) :
                this.config.cacheLimits[this.state.memoryPressure].tiles;

            const tilesToRemove = cacheSize - targetSize;

            if (tilesToRemove > 0) {
                console.log(`Removing ${tilesToRemove} tiles from cache (current: ${cacheSize})`);

                // OpenSeadragon doesn't expose selective tile removal
                // So we clear all and let it rebuild
                cache.clearTilesFor(tiledImage);
            }
        }
    }

    clearUnusedImages() {
        // Find all image elements not currently visible
        const images = document.querySelectorAll('img');
        let cleared = 0;

        images.forEach(img => {
            if (!this.isElementVisible(img) && img.src) {
                // Clear the source to free memory
                img.removeAttribute('src');
                cleared++;
            }
        });

        if (cleared > 0) {
            console.log(`Cleared ${cleared} unused images`);
        }
    }

    isElementVisible(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= window.innerHeight &&
            rect.right <= window.innerWidth
        );
    }

    suggestGC() {
        if (this.config.hasGC) {
            console.log('Suggesting garbage collection');
            // Schedule GC for next idle time
            if ('requestIdleCallback' in window) {
                requestIdleCallback(() => {
                    window.gc();
                    this.metrics.gcCalls++;
                });
            } else {
                setTimeout(() => {
                    window.gc();
                    this.metrics.gcCalls++;
                }, 100);
            }
        }
    }

    forceGC() {
        if (this.config.hasGC) {
            console.log('Forcing immediate garbage collection');
            window.gc();
            this.metrics.gcCalls++;
        }
    }

    handleVisibilityChange = () => {
        if (document.hidden) {
            // Page is hidden - perform cleanup
            console.log('Page hidden - performing cleanup');
            this.performHighPressureCleanup();
        }
    };

    handleFreeze = () => {
        // Page is being frozen - emergency cleanup
        console.log('Page freezing - emergency cleanup');
        this.performEmergencyCleanup();
    };

    getMetrics() {
        const metrics = {
            ...this.metrics,
            memoryPressure: this.state.memoryPressure,
            cacheLimits: this.config.cacheLimits[this.state.memoryPressure]
        };

        if (this.config.hasMemoryAPI) {
            const limit = performance.memory.jsHeapSizeLimit / 1048576;
            metrics.usagePercentage = (this.metrics.currentUsage / limit * 100).toFixed(1) + '%';
            metrics.totalLimit = limit.toFixed(0) + 'MB';
        }

        return metrics;
    }

    destroy() {
        this.stop();
        this.viewer = null;
    }
}

export default MemoryManager;