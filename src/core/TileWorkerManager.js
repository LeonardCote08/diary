/**
 * TileWorkerManager - Manages Web Workers for tile processing
 * Offloads heavy computations to background threads for 60 FPS
 */
class TileWorkerManager {
    constructor(viewer) {
        this.viewer = viewer;
        this.worker = null;
        this.isInitialized = false;

        this.state = {
            pendingRequests: new Map(),
            requestId: 0,
            workerReady: false,
            capabilities: null,
            lastError: null
        };

        this.config = {
            workerPath: '/tile-worker.js',
            maxRetries: 3,
            retryDelay: 1000,
            requestTimeout: 10000,
            maxCacheSize: 200,
            enableOffscreenCanvas: true
        };

        this.metrics = {
            requestsSent: 0,
            requestsCompleted: 0,
            requestsFailed: 0,
            cacheHits: 0,
            averageProcessTime: 0,
            totalProcessTime: 0
        };

        // Bind methods
        this.handleWorkerMessage = this.handleWorkerMessage.bind(this);
        this.handleWorkerError = this.handleWorkerError.bind(this);
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            // Check if Web Workers are supported
            if (typeof Worker === 'undefined') {
                throw new Error('Web Workers not supported');
            }

            // Create worker
            this.worker = new Worker(this.config.workerPath);

            // Setup event handlers
            this.worker.onmessage = this.handleWorkerMessage;
            this.worker.onerror = this.handleWorkerError;

            // Wait for worker to be ready
            await this.waitForWorkerReady();

            // Initialize worker with config
            await this.sendToWorker('init', {
                config: {
                    maxCacheSize: this.config.maxCacheSize
                }
            });

            this.isInitialized = true;
            console.log('TileWorkerManager initialized with capabilities:', this.state.capabilities);

        } catch (error) {
            console.error('Failed to initialize TileWorkerManager:', error);
            this.state.lastError = error;
            throw error;
        }
    }

    async processTile(tile, priority = 2) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const requestId = this.generateRequestId();

        return new Promise((resolve, reject) => {
            // Set timeout
            const timeout = setTimeout(() => {
                this.state.pendingRequests.delete(requestId);
                this.metrics.requestsFailed++;
                reject(new Error('Tile processing timeout'));
            }, this.config.requestTimeout);

            // Store pending request
            this.state.pendingRequests.set(requestId, {
                resolve,
                reject,
                timeout,
                startTime: performance.now(),
                tile
            });

            // Send to worker
            this.worker.postMessage({
                type: 'process-tile',
                requestId,
                data: {
                    tile: this.serializeTile(tile),
                    priority
                }
            });

            this.metrics.requestsSent++;
        });
    }

    async processBatch(tiles, priorities = []) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const requestId = this.generateRequestId();

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.state.pendingRequests.delete(requestId);
                this.metrics.requestsFailed++;
                reject(new Error('Batch processing timeout'));
            }, this.config.requestTimeout * tiles.length);

            this.state.pendingRequests.set(requestId, {
                resolve,
                reject,
                timeout,
                startTime: performance.now(),
                tiles
            });

            this.worker.postMessage({
                type: 'batch-process',
                requestId,
                data: {
                    tiles: tiles.map(t => this.serializeTile(t)),
                    priorities
                }
            });

            this.metrics.requestsSent++;
        });
    }

    async prioritizeTiles(tiles, viewport) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const requestId = this.generateRequestId();

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.state.pendingRequests.delete(requestId);
                reject(new Error('Prioritization timeout'));
            }, 2000);

            this.state.pendingRequests.set(requestId, {
                resolve,
                reject,
                timeout
            });

            this.worker.postMessage({
                type: 'prioritize',
                requestId,
                data: {
                    tiles: tiles.map(t => this.serializeTile(t)),
                    viewport: {
                        bounds: viewport.bounds,
                        zoom: viewport.zoom
                    }
                }
            });
        });
    }

    clearCache(selective = false, maxAge = null) {
        if (!this.worker) return;

        this.worker.postMessage({
            type: 'clear-cache',
            data: { selective, maxAge }
        });
    }

    async getStats() {
        if (!this.isInitialized) {
            return this.metrics;
        }

        const requestId = this.generateRequestId();

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.state.pendingRequests.delete(requestId);
                resolve(this.metrics);
            }, 1000);

            this.state.pendingRequests.set(requestId, {
                resolve,
                reject: () => { },
                timeout
            });

            this.worker.postMessage({
                type: 'get-stats',
                requestId
            });
        });
    }

    handleWorkerMessage(event) {
        const { type, requestId, data } = event.data;

        switch (type) {
            case 'ready':
                this.state.workerReady = true;
                break;

            case 'initialized':
                this.state.capabilities = data.capabilities;
                this.handleRequestComplete(requestId, data);
                break;

            case 'tile-ready':
                this.handleTileReady(requestId, data);
                break;

            case 'tile-error':
                this.handleTileError(requestId, data);
                break;

            case 'batch-complete':
                this.handleRequestComplete(requestId, data);
                break;

            case 'priorities-calculated':
                this.handleRequestComplete(requestId, data);
                break;

            case 'stats':
                this.handleStatsReceived(requestId, data);
                break;

            case 'cache-cleared':
                console.log('Worker cache cleared:', data);
                break;

            default:
                console.warn('Unknown worker message type:', type);
        }
    }

    handleWorkerError(error) {
        console.error('Worker error:', error);
        this.state.lastError = error;

        // Reject all pending requests
        this.state.pendingRequests.forEach((request, id) => {
            clearTimeout(request.timeout);
            request.reject(error);
        });
        this.state.pendingRequests.clear();

        // Try to reinitialize
        this.isInitialized = false;
        setTimeout(() => this.initialize(), this.config.retryDelay);
    }

    handleTileReady(requestId, data) {
        const request = this.state.pendingRequests.get(requestId);
        if (!request) return;

        clearTimeout(request.timeout);
        this.state.pendingRequests.delete(requestId);

        // Update metrics
        const processTime = performance.now() - request.startTime;
        this.updateMetrics(processTime, data.cached);

        // Resolve promise
        request.resolve({
            ...data,
            processingTime: processTime
        });
    }

    handleTileError(requestId, data) {
        const request = this.state.pendingRequests.get(requestId);
        if (!request) return;

        clearTimeout(request.timeout);
        this.state.pendingRequests.delete(requestId);

        this.metrics.requestsFailed++;
        request.reject(new Error(data.error));
    }

    handleRequestComplete(requestId, data) {
        const request = this.state.pendingRequests.get(requestId);
        if (!request) return;

        clearTimeout(request.timeout);
        this.state.pendingRequests.delete(requestId);

        request.resolve(data);
    }

    handleStatsReceived(requestId, workerStats) {
        const request = this.state.pendingRequests.get(requestId);
        if (!request) return;

        clearTimeout(request.timeout);
        this.state.pendingRequests.delete(requestId);

        // Merge worker stats with local metrics
        const combinedStats = {
            ...this.metrics,
            worker: workerStats
        };

        request.resolve(combinedStats);
    }

    updateMetrics(processTime, cached) {
        this.metrics.requestsCompleted++;

        if (cached) {
            this.metrics.cacheHits++;
        }

        this.metrics.totalProcessTime += processTime;
        this.metrics.averageProcessTime =
            this.metrics.totalProcessTime / this.metrics.requestsCompleted;
    }

    serializeTile(tile) {
        // Extract serializable properties from tile
        return {
            level: tile.level,
            x: tile.x,
            y: tile.y,
            bounds: tile.bounds ? {
                minX: tile.bounds.x || tile.bounds.minX,
                minY: tile.bounds.y || tile.bounds.minY,
                maxX: (tile.bounds.x || tile.bounds.minX) + (tile.bounds.width || 0),
                maxY: (tile.bounds.y || tile.bounds.minY) + (tile.bounds.height || 0)
            } : null,
            url: tile.url || null
        };
    }

    generateRequestId() {
        return ++this.state.requestId;
    }

    async waitForWorkerReady() {
        return new Promise((resolve) => {
            if (this.state.workerReady) {
                resolve();
                return;
            }

            const checkInterval = setInterval(() => {
                if (this.state.workerReady) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);

            // Timeout after 5 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                resolve(); // Resolve anyway
            }, 5000);
        });
    }

    async sendToWorker(type, data) {
        const requestId = this.generateRequestId();

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.state.pendingRequests.delete(requestId);
                reject(new Error(`Worker request timeout: ${type}`));
            }, 5000);

            this.state.pendingRequests.set(requestId, {
                resolve,
                reject,
                timeout
            });

            this.worker.postMessage({
                type,
                requestId,
                data
            });
        });
    }

    destroy() {
        if (this.worker) {
            // Clear pending requests
            this.state.pendingRequests.forEach((request) => {
                clearTimeout(request.timeout);
                request.reject(new Error('Worker destroyed'));
            });
            this.state.pendingRequests.clear();

            // Terminate worker
            this.worker.terminate();
            this.worker = null;
        }

        this.isInitialized = false;
        this.viewer = null;
    }
}

export default TileWorkerManager;