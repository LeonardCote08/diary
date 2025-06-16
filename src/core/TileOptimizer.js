/**
 * TileOptimizer - Advanced tile management for 60 FPS performance
 */
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
            lastCleanup: Date.now()
        };

        this.config = {
            predictiveRadius: 1.5,
            priorityLevels: 3,
            maxConcurrentLoads: 6,
            cleanupInterval: 30000,
            tileTimeout: 10000,
            maxLoadTimeHistory: 50,
            adaptiveLoading: true,
            webpSupport: this.detectWebPSupport()
        };

        this.intervals = {};

        // Bind handlers once
        this.handleViewportChange = this.handleViewportChange.bind(this);
    }

    start() {
        if (this.state.isActive) return;

        this.state.isActive = true;

        this.viewer.addHandler('viewport-change', this.handleViewportChange);

        this.intervals.cleanup = setInterval(() => this.performCleanup(), this.config.cleanupInterval);
        this.intervals.queue = setInterval(() => this.processQueue(), 100);

        console.log('TileOptimizer started');
    }

    stop() {
        this.state.isActive = false;

        this.viewer.removeHandler('viewport-change', this.handleViewportChange);

        Object.values(this.intervals).forEach(interval => clearInterval(interval));
        this.intervals = {};

        this.state.tileQueue = [];
        this.state.loadingTiles.clear();
        this.state.tilePriorities.clear();

        console.log('TileOptimizer stopped');
    }

    handleViewportChange() {
        this.predictiveLoad();
    }

    calculateTilePriority(level, x, y) {
        const viewport = this.viewer.viewport;
        const bounds = viewport.getBounds();
        const center = viewport.getCenter();
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

        if (isVisible) return 0;
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

        this.state.tileQueue.push({
            level, x, y, key: tileKey, priority,
            timestamp: Date.now()
        });

        this.sortQueue();
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
        this.state.tileQueue.sort((a, b) => a.priority - b.priority);
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

    getStats() {
        return {
            queueLength: this.state.tileQueue.length,
            loadingCount: this.state.loadingTiles.size,
            averageLoadTime: this.state.averageLoadTime.toFixed(0) + 'ms',
            maxConcurrentLoads: this.config.maxConcurrentLoads,
            webpSupported: this.config.webpSupport
        };
    }
}

export default TileOptimizer;