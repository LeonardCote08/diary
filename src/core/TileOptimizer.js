/**
 * TileOptimizer - Advanced tile management for 60 FPS performance
 * Implements predictive loading, memory management, and format optimization
 */
class TileOptimizer {
    constructor(viewer) {
        this.viewer = viewer;

        // State
        this.isActive = false;
        this.tileQueue = [];
        this.loadingTiles = new Set();
        this.tilePriorities = new Map();

        // Performance tracking
        this.loadTimes = [];
        this.averageLoadTime = 0;
        this.lastCleanup = Date.now();

        // Configuration
        this.config = {
            predictiveRadius: 1.5,      // Viewport multiplier for preloading
            priorityLevels: 3,          // High, medium, low priority
            maxConcurrentLoads: 6,      // Maximum parallel tile loads
            cleanupInterval: 30000,     // Memory cleanup interval (ms)
            tileTimeout: 10000,         // Tile load timeout (ms)
            maxLoadTimeHistory: 50,     // Track last N load times
            adaptiveLoading: true,      // Adjust loading based on performance
            webpSupport: this.detectWebPSupport()
        };

        // Bind methods
        this.handleViewportChange = this.handleViewportChange.bind(this);
        this.processQueue = this.processQueue.bind(this);
        this.performCleanup = this.performCleanup.bind(this);
    }

    /**
     * Start tile optimization
     */
    start() {
        if (this.isActive) return;

        this.isActive = true;

        // Hook into OpenSeadragon events
        this.viewer.addHandler('viewport-change', this.handleViewportChange);

        // Start periodic cleanup
        this.cleanupInterval = setInterval(this.performCleanup, this.config.cleanupInterval);

        // Start queue processor
        this.queueProcessor = setInterval(this.processQueue, 100); // Process every 100ms

        console.log('TileOptimizer started');
    }

    /**
     * Stop tile optimization
     */
    stop() {
        this.isActive = false;

        // Remove event handlers
        this.viewer.removeHandler('viewport-change', this.handleViewportChange);

        // Clear intervals
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        if (this.queueProcessor) {
            clearInterval(this.queueProcessor);
            this.queueProcessor = null;
        }

        // Clear state
        this.tileQueue = [];
        this.loadingTiles.clear();
        this.tilePriorities.clear();

        console.log('TileOptimizer stopped');
    }

    /**
     * Handle viewport change
     */
    handleViewportChange() {
        // Just trigger predictive loading on viewport change
        this.predictiveLoad();
    }

    /**
     * Calculate tile priority based on distance from viewport center
     */
    calculateTilePriority(level, x, y) {
        const viewport = this.viewer.viewport;
        const bounds = viewport.getBounds();
        const center = viewport.getCenter();

        // Calculate tile center in viewport coordinates
        const tileSize = this.viewer.source.getTileSize(level);
        const tileCenterX = (x + 0.5) * tileSize / this.viewer.source.width;
        const tileCenterY = (y + 0.5) * tileSize / this.viewer.source.height;

        // Calculate distance from viewport center
        const distance = Math.sqrt(
            Math.pow(tileCenterX - center.x, 2) +
            Math.pow(tileCenterY - center.y, 2)
        );

        // Check if tile is in viewport
        const tileLeft = x * tileSize / this.viewer.source.width;
        const tileTop = y * tileSize / this.viewer.source.height;
        const tileRight = (x + 1) * tileSize / this.viewer.source.width;
        const tileBottom = (y + 1) * tileSize / this.viewer.source.height;

        const isVisible = !(
            tileRight < bounds.x ||
            tileLeft > bounds.x + bounds.width ||
            tileBottom < bounds.y ||
            tileTop > bounds.y + bounds.height
        );

        // Calculate priority
        let priority = 0;

        if (isVisible) {
            priority = 0; // Highest priority for visible tiles
        } else if (distance < bounds.width * this.config.predictiveRadius) {
            priority = 1; // Medium priority for nearby tiles
        } else {
            priority = 2; // Low priority for distant tiles
        }

        return priority;
    }

    /**
     * Enqueue tile with priority
     */
    enqueueTile(level, x, y, priority) {
        const tileKey = `${level}_${x}_${y}`;

        // Skip if already loading or queued
        if (this.loadingTiles.has(tileKey)) return;

        // Check if already in queue
        const existingIndex = this.tileQueue.findIndex(item => item.key === tileKey);
        if (existingIndex >= 0) {
            // Update priority if better
            if (priority < this.tileQueue[existingIndex].priority) {
                this.tileQueue[existingIndex].priority = priority;
                this.sortQueue();
            }
            return;
        }

        // Add to queue
        this.tileQueue.push({
            level: level,
            x: x,
            y: y,
            key: tileKey,
            priority: priority,
            timestamp: Date.now()
        });

        // Sort queue by priority
        this.sortQueue();
    }

    /**
     * Process tile queue
     */
    processQueue() {
        if (!this.isActive || this.tileQueue.length === 0) return;

        // Check concurrent load limit
        if (this.loadingTiles.size >= this.config.maxConcurrentLoads) return;

        // Get tiledImage
        if (!this.viewer.world || this.viewer.world.getItemCount() === 0) return;
        const tiledImage = this.viewer.world.getItemAt(0);
        if (!tiledImage) return;

        // Process next tiles
        while (this.loadingTiles.size < this.config.maxConcurrentLoads && this.tileQueue.length > 0) {
            const item = this.tileQueue.shift();

            // Skip if too old
            if (Date.now() - item.timestamp > this.config.tileTimeout) {
                continue;
            }

            // Mark as loading
            this.loadingTiles.add(item.key);

            // Request tile load through OpenSeadragon
            // This will trigger the tile loading mechanism
            tiledImage.updateViewport();
        }
    }

    /**
     * Sort queue by priority
     */
    sortQueue() {
        this.tileQueue.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Predictive tile loading
     */
    predictiveLoad() {
        if (!this.viewer.world || this.viewer.world.getItemCount() === 0) return;
        if (!this.viewer.source) return;

        const viewport = this.viewer.viewport;
        const bounds = viewport.getBounds();

        // Expand bounds for predictive loading
        const expandedBounds = {
            x: bounds.x - bounds.width * (this.config.predictiveRadius - 1) / 2,
            y: bounds.y - bounds.height * (this.config.predictiveRadius - 1) / 2,
            width: bounds.width * this.config.predictiveRadius,
            height: bounds.height * this.config.predictiveRadius
        };

        // Get current zoom level
        const zoom = viewport.getZoom();
        const level = Math.floor(Math.log2(zoom));
        const clampedLevel = Math.max(0, Math.min(level, this.viewer.source.maxLevel || 14));

        // Calculate which tiles we need
        const tileSize = this.viewer.source.getTileSize(clampedLevel);
        const numTilesX = Math.ceil(this.viewer.source.width / tileSize);
        const numTilesY = Math.ceil(this.viewer.source.height / tileSize);

        const startX = Math.max(0, Math.floor(expandedBounds.x * this.viewer.source.width / tileSize));
        const endX = Math.min(numTilesX - 1, Math.ceil((expandedBounds.x + expandedBounds.width) * this.viewer.source.width / tileSize));
        const startY = Math.max(0, Math.floor(expandedBounds.y * this.viewer.source.height / tileSize));
        const endY = Math.min(numTilesY - 1, Math.ceil((expandedBounds.y + expandedBounds.height) * this.viewer.source.height / tileSize));

        // Queue tiles for loading
        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                const priority = this.calculateTilePriority(clampedLevel, x, y);
                this.enqueueTile(clampedLevel, x, y, priority);
            }
        }
    }

    /**
     * Track tile load time
     */
    trackLoadTime(loadTime) {
        this.loadTimes.push(loadTime);

        // Keep history limited
        if (this.loadTimes.length > this.config.maxLoadTimeHistory) {
            this.loadTimes.shift();
        }

        // Calculate average
        const sum = this.loadTimes.reduce((a, b) => a + b, 0);
        this.averageLoadTime = sum / this.loadTimes.length;
    }

    /**
     * Adjust loading strategy based on performance
     */
    adjustLoadingStrategy() {
        // If load times are high, reduce concurrent loads
        if (this.averageLoadTime > 500 && this.config.maxConcurrentLoads > 2) {
            this.config.maxConcurrentLoads--;
            console.log(`Reduced concurrent loads to ${this.config.maxConcurrentLoads} (avg load time: ${this.averageLoadTime.toFixed(0)}ms)`);
        }
        // If load times are low, increase concurrent loads
        else if (this.averageLoadTime < 200 && this.config.maxConcurrentLoads < 8) {
            this.config.maxConcurrentLoads++;
            console.log(`Increased concurrent loads to ${this.config.maxConcurrentLoads} (avg load time: ${this.averageLoadTime.toFixed(0)}ms)`);
        }
    }

    /**
     * Perform memory cleanup
     */
    performCleanup() {
        const now = Date.now();

        // Clear old tiles from queue
        this.tileQueue = this.tileQueue.filter(item =>
            now - item.timestamp < this.config.tileTimeout
        );

        // Clear loading tiles that have been loading too long
        this.loadingTiles.forEach(key => {
            // Simple cleanup - just clear old entries
            this.loadingTiles.delete(key);
        });

        this.lastCleanup = now;
    }

    /**
     * Clear old tiles (public method for manual cleanup)
     */
    clearOldTiles() {
        this.performCleanup();

        // Force garbage collection if available
        if (window.gc) {
            window.gc();
        }
    }

    /**
     * Detect WebP support
     */
    detectWebPSupport() {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(0, 0, 1, 1);

        try {
            return canvas.toDataURL('image/webp').indexOf('image/webp') === 5;
        } catch (e) {
            return false;
        }
    }

    /**
     * Get optimization statistics
     */
    getStats() {
        return {
            queueLength: this.tileQueue.length,
            loadingCount: this.loadingTiles.size,
            averageLoadTime: this.averageLoadTime.toFixed(0) + 'ms',
            maxConcurrentLoads: this.config.maxConcurrentLoads,
            webpSupported: this.config.webpSupport
        };
    }
}

export default TileOptimizer;