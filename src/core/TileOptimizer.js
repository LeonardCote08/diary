/**
 * TileOptimizer - Advanced tile management with Web Worker support
 * Achieves 60 FPS by offloading processing to background threads
 */
import TileWorkerManager from './TileWorkerManager';

class TileOptimizer {
    constructor(viewer) {
        this.viewer = viewer;

        this.state = {
            isActive: false,
            tileQueue: [],
            loadingTiles: new Set(),
            tilePriorities: new Map(),
            loadTimes: [],
            averageLoadTime: 0,
            lastCleanup: Date.now(),
            useWorker: true, // Enable Web Worker by default
            workerReady: false
        };

        this.config = {
            predictiveRadius: 1.5,
            priorityLevels: 5,
            maxConcurrentLoads: 6,
            cleanupInterval: 30000,
            tileTimeout: 10000,
            maxLoadTimeHistory: 50,
            adaptiveLoading: true,
            webpSupport: this.detectWebPSupport(),
            workerBatchSize: 10, // Process tiles in batches
            workerEnabled: true
        };

        this.intervals = {};

        // Initialize Web Worker manager
        this.workerManager = null;
        if (this.config.workerEnabled) {
            this.initializeWorker();
        }

        // Performance tracking
        this.workerMetrics = {
            tilesProcessedByWorker: 0,
            workerProcessingTime: 0,
            workerErrors: 0
        };

        // Bind handlers once
        this.handleViewportChange = this.handleViewportChange.bind(this);
    }

    async initializeWorker() {
        try {
            this.workerManager = new TileWorkerManager(this.viewer);
            await this.workerManager.initialize();
            this.state.workerReady = true;
            console.log('TileOptimizer: Web Worker initialized successfully');
        } catch (error) {
            console.warn('TileOptimizer: Failed to initialize Web Worker, falling back to main thread', error);
            this.state.useWorker = false;
            this.state.workerReady = false;
        }
    }

    start() {
        if (this.state.isActive) return;

        this.state.isActive = true;

        this.viewer.addHandler('viewport-change', this.handleViewportChange);

        this.intervals.cleanup = setInterval(() => this.performCleanup(), this.config.cleanupInterval);
        this.intervals.queue = setInterval(() => this.processQueue(), 50); // Faster processing
        this.intervals.worker = setInterval(() => this.processWorkerBatch(), 100);

        console.log('TileOptimizer started with Web Worker support:', this.state.workerReady);
    }

    stop() {
        this.state.isActive = false;

        this.viewer.removeHandler('viewport-change', this.handleViewportChange);

        Object.values(this.intervals).forEach(interval => clearInterval(interval));
        this.intervals = {};

        this.state.tileQueue = [];
        this.state.loadingTiles.clear();
        this.state.tilePriorities.clear();

        if (this.workerManager) {
            this.workerManager.destroy();
            this.workerManager = null;
        }

        console.log('TileOptimizer stopped');
    }

    handleViewportChange() {
        this.predictiveLoad();

        // Update worker priorities if ready
        if (this.state.workerReady && this.state.tileQueue.length > 0) {
            this.updateWorkerPriorities();
        }
    }

    async updateWorkerPriorities() {
        try {
            const viewport = this.viewer.viewport;
            const bounds = viewport.getBounds();

            const viewportData = {
                bounds: {
                    minX: bounds.x,
                    minY: bounds.y,
                    maxX: bounds.x + bounds.width,
                    maxY: bounds.y + bounds.height
                },
                zoom: viewport.getZoom()
            };

            const tiles = this.state.tileQueue.slice(0, 50); // Limit to 50 tiles
            const result = await this.workerManager.prioritizeTiles(tiles, viewportData);

            // Update queue with new priorities
            if (result.tiles && result.priorities) {
                result.tiles.forEach((tile, index) => {
                    const priority = result.priorities[index];
                    const queueItem = this.state.tileQueue.find(item =>
                        item.level === tile.level &&
                        item.x === tile.x &&
                        item.y === tile.y
                    );
                    if (queueItem) {
                        queueItem.priority = priority;
                    }
                });

                this.sortQueue();
            }
        } catch (error) {
            console.warn('Failed to update worker priorities:', error);
        }
    }

    calculateTilePriority(level, x, y) {
        const viewport = this.viewer.viewport;
        const bounds = viewport.getBounds();
        const center = viewport.getCenter();
        const zoom = viewport.getZoom();

        // NEW: Skip tiny tiles at low zoom
        if (zoom < 2.0) {
            const tileWidth = this.viewer.source.getTileWidth(level);
            const pixelSize = tileWidth * zoom;
            if (pixelSize < 32) return 999; // Skip rendering
        }

        const tileWidth = this.viewer.source.getTileWidth(level);
        const tileHeight = this.viewer.source.getTileHeight ?
            this.viewer.source.getTileHeight(level) : tileWidth;

        const tileCenterX = (x + 0.5) * tileWidth / this.viewer.source.width;
        const tileCenterY = (y + 0.5) * tileHeight / this.viewer.source.height;

        const distance = Math.sqrt(
            Math.pow(tileCenterX - center.x, 2) +
            Math.pow(tileCenterY - center.y, 2)
        );

        const tileRect = {
            left: x * tileWidth / this.viewer.source.width,
            top: y * tileHeight / this.viewer.source.height,
            right: (x + 1) * tileWidth / this.viewer.source.width,
            bottom: (y + 1) * tileHeight / this.viewer.source.height
        };

        const isVisible = !(
            tileRect.right < bounds.x ||
            tileRect.left > bounds.x + bounds.width ||
            tileRect.bottom < bounds.y ||
            tileRect.top > bounds.y + bounds.height
        );

        // NEW: Prioritize center tiles at low zoom
        if (isVisible) {
            if (zoom < 3.0) {
                // At low zoom, only high priority for center tiles
                const centerDistance = Math.abs(tileCenterX - center.x) +
                    Math.abs(tileCenterY - center.y);
                return centerDistance < 0.2 ? 0 : 1;
            }
            return 0;
        }

        if (distance < bounds.width * this.config.predictiveRadius) return 1;
        return 2;
    }

    enqueueTile(level, x, y, priority) {
        const tileKey = `${level}_${x}_${y}`;

        if (this.state.loadingTiles.has(tileKey)) return;

        const existingIndex = this.state.tileQueue.findIndex(item => item.key === tileKey);
        if (existingIndex >= 0) {
            if (priority < this.state.tileQueue[existingIndex].priority) {
                this.state.tileQueue[existingIndex].priority = priority;
                this.sortQueue();
            }
            return;
        }

        const tileItem = {
            level, x, y, key: tileKey, priority,
            timestamp: Date.now(),
            bounds: this.calculateTileBounds(level, x, y)
        };

        this.state.tileQueue.push(tileItem);
        this.sortQueue();
    }

    calculateTileBounds(level, x, y) {
        const tileWidth = this.viewer.source.getTileWidth(level);
        const tileHeight = this.viewer.source.getTileHeight ?
            this.viewer.source.getTileHeight(level) : tileWidth;
        const sourceWidth = this.viewer.source.width;
        const sourceHeight = this.viewer.source.height;

        return {
            minX: x * tileWidth / sourceWidth,
            minY: y * tileHeight / sourceHeight,
            maxX: (x + 1) * tileWidth / sourceWidth,
            maxY: (y + 1) * tileHeight / sourceHeight
        };
    }

    async processWorkerBatch() {
        if (!this.state.isActive || !this.state.workerReady || this.state.tileQueue.length === 0) return;

        // Get high priority tiles for worker processing
        const highPriorityTiles = this.state.tileQueue
            .filter(tile => tile.priority <= 1)
            .slice(0, this.config.workerBatchSize);

        if (highPriorityTiles.length === 0) return;

        try {
            // Process tiles through worker
            const priorities = highPriorityTiles.map(t => t.priority);
            const startTime = performance.now();

            await this.workerManager.processBatch(highPriorityTiles, priorities);

            const processingTime = performance.now() - startTime;
            this.workerMetrics.tilesProcessedByWorker += highPriorityTiles.length;
            this.workerMetrics.workerProcessingTime += processingTime;

            // Remove processed tiles from queue
            highPriorityTiles.forEach(tile => {
                const index = this.state.tileQueue.findIndex(t => t.key === tile.key);
                if (index >= 0) {
                    this.state.tileQueue.splice(index, 1);
                }
            });

        } catch (error) {
            console.error('Worker batch processing failed:', error);
            this.workerMetrics.workerErrors++;
        }
    }

    processQueue() {
        if (!this.state.isActive ||
            this.state.tileQueue.length === 0 ||
            this.state.loadingTiles.size >= this.config.maxConcurrentLoads) return;

        const tiledImage = this.viewer.world?.getItemAt(0);
        if (!tiledImage) return;

        while (this.state.loadingTiles.size < this.config.maxConcurrentLoads &&
            this.state.tileQueue.length > 0) {
            const item = this.state.tileQueue.shift();

            if (Date.now() - item.timestamp > this.config.tileTimeout) continue;

            this.state.loadingTiles.add(item.key);

            // Force a redraw to trigger tile loading
            this.viewer.forceRedraw();
        }
    }

    sortQueue() {
        this.state.tileQueue.sort((a, b) => {
            // First sort by priority
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            // Then by timestamp (older first)
            return a.timestamp - b.timestamp;
        });
    }

    predictiveLoad() {
        const tiledImage = this.viewer.world?.getItemAt(0);
        if (!tiledImage || !this.viewer.source) return;

        const viewport = this.viewer.viewport;
        const bounds = viewport.getBounds();

        const expandedBounds = {
            x: bounds.x - bounds.width * (this.config.predictiveRadius - 1) / 2,
            y: bounds.y - bounds.height * (this.config.predictiveRadius - 1) / 2,
            width: bounds.width * this.config.predictiveRadius,
            height: bounds.height * this.config.predictiveRadius
        };

        const zoom = viewport.getZoom();
        const level = Math.max(0, Math.min(
            Math.floor(Math.log2(zoom)),
            this.viewer.source.maxLevel || 14
        ));

        const tileWidth = this.viewer.source.getTileWidth(level);
        const tileHeight = this.viewer.source.getTileHeight ?
            this.viewer.source.getTileHeight(level) : tileWidth;
        const sourceWidth = this.viewer.source.width;
        const sourceHeight = this.viewer.source.height;

        const tileRange = {
            startX: Math.max(0, Math.floor(expandedBounds.x * sourceWidth / tileWidth)),
            endX: Math.min(
                Math.ceil(sourceWidth / tileWidth) - 1,
                Math.ceil((expandedBounds.x + expandedBounds.width) * sourceWidth / tileWidth)
            ),
            startY: Math.max(0, Math.floor(expandedBounds.y * sourceHeight / tileHeight)),
            endY: Math.min(
                Math.ceil(sourceHeight / tileHeight) - 1,
                Math.ceil((expandedBounds.y + expandedBounds.height) * sourceHeight / tileHeight)
            )
        };

        for (let x = tileRange.startX; x <= tileRange.endX; x++) {
            for (let y = tileRange.startY; y <= tileRange.endY; y++) {
                const priority = this.calculateTilePriority(level, x, y);
                this.enqueueTile(level, x, y, priority);
            }
        }
    }

    trackLoadTime(loadTime) {
        this.state.loadTimes.push(loadTime);

        if (this.state.loadTimes.length > this.config.maxLoadTimeHistory) {
            this.state.loadTimes.shift();
        }

        this.state.averageLoadTime = this.state.loadTimes.reduce((a, b) => a + b, 0) /
            this.state.loadTimes.length;

        this.adjustLoadingStrategy();
    }

    removeTileFromLoading(tileKey) {
        this.state.loadingTiles.delete(tileKey);
    }

    get loadingTiles() {
        return this.state.loadingTiles;
    }

    adjustLoadingStrategy() {
        const avgTime = this.state.averageLoadTime;
        const currentLoads = this.config.maxConcurrentLoads;

        if (avgTime > 500 && currentLoads > 2) {
            this.config.maxConcurrentLoads--;
            console.log(`Reduced concurrent loads to ${this.config.maxConcurrentLoads} (avg: ${avgTime.toFixed(0)}ms)`);
        } else if (avgTime < 200 && currentLoads < 8) {
            this.config.maxConcurrentLoads++;
            console.log(`Increased concurrent loads to ${this.config.maxConcurrentLoads} (avg: ${avgTime.toFixed(0)}ms)`);
        }
    }

    performCleanup() {
        const now = Date.now();

        this.state.tileQueue = this.state.tileQueue.filter(
            item => now - item.timestamp < this.config.tileTimeout
        );

        this.state.loadingTiles.clear();
        this.state.lastCleanup = now;

        // Clear worker cache periodically
        if (this.workerManager) {
            this.workerManager.clearCache(true, 60000); // Clear tiles older than 1 minute
        }
    }

    clearOldTiles() {
        this.performCleanup();
        if (window.gc) window.gc();
    }

    detectWebPSupport() {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(0, 0, 1, 1);

        try {
            return canvas.toDataURL('image/webp').indexOf('image/webp') === 5;
        } catch (e) {
            return false;
        }
    }

    async getStats() {
        const workerStats = this.workerManager ? await this.workerManager.getStats() : null;

        return {
            queueLength: this.state.tileQueue.length,
            loadingCount: this.state.loadingTiles.size,
            averageLoadTime: this.state.averageLoadTime.toFixed(0) + 'ms',
            maxConcurrentLoads: this.config.maxConcurrentLoads,
            webpSupported: this.config.webpSupport,
            workerEnabled: this.state.workerReady,
            workerMetrics: {
                ...this.workerMetrics,
                averageWorkerTime: this.workerMetrics.tilesProcessedByWorker > 0 ?
                    (this.workerMetrics.workerProcessingTime / this.workerMetrics.tilesProcessedByWorker).toFixed(2) + 'ms' :
                    '0ms'
            },
            workerStats
        };
    }
}

export default TileOptimizer;