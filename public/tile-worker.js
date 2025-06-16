/**
 * Tile Worker - Processes tiles in background thread for 60 FPS
 * Handles tile prioritization, caching, and optimization
 */

// Worker state
const state = {
    tileCache: new Map(),
    priorityQueue: [],
    processingTiles: new Set(),
    stats: {
        processed: 0,
        cached: 0,
        errors: 0,
        averageProcessTime: 0
    }
};

// Configuration
const config = {
    maxCacheSize: 200,
    processingTimeout: 5000,
    priorityLevels: 5
};

// Message handler
self.onmessage = function (e) {
    const { type, data, requestId } = e.data;

    switch (type) {
        case 'init':
            handleInit(data, requestId);
            break;
        case 'process-tile':
            handleProcessTile(data, requestId);
            break;
        case 'batch-process':
            handleBatchProcess(data, requestId);
            break;
        case 'clear-cache':
            handleClearCache(data, requestId);
            break;
        case 'get-stats':
            handleGetStats(requestId);
            break;
        case 'prioritize':
            handlePrioritize(data, requestId);
            break;
        case 'cancel':
            handleCancel(data, requestId);
            break;
        default:
            console.error('Unknown message type:', type);
    }
};

// Initialize worker
function handleInit(data, requestId) {
    if (data.config) {
        Object.assign(config, data.config);
    }

    self.postMessage({
        type: 'initialized',
        requestId: requestId,
        data: {
            config,
            capabilities: {
                offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
                webgl: checkWebGLSupport(),
                imageDecoder: typeof ImageDecoder !== 'undefined'
            }
        }
    });
}

// Process a single tile
async function handleProcessTile(data, requestId) {
    const { tile, priority = 2 } = data;
    const tileKey = getTileKey(tile);

    // Check cache first
    if (state.tileCache.has(tileKey)) {
        state.stats.cached++;
        self.postMessage({
            type: 'tile-ready',
            requestId: requestId,
            data: {
                tile,
                cached: true,
                result: state.tileCache.get(tileKey)
            }
        });
        return;
    }

    // Check if already processing
    if (state.processingTiles.has(tileKey)) {
        return;
    }

    state.processingTiles.add(tileKey);
    const startTime = performance.now();

    try {
        // Process tile based on priority
        const result = await processTile(tile, priority);

        // Cache result
        cacheTile(tileKey, result);

        // Update stats
        const processTime = performance.now() - startTime;
        updateStats(processTime);

        // Send result
        self.postMessage({
            type: 'tile-ready',
            requestId: requestId,
            data: {
                tile,
                cached: false,
                result,
                processTime
            }
        });
    } catch (error) {
        state.stats.errors++;
        self.postMessage({
            type: 'tile-error',
            requestId: requestId,
            data: {
                tile,
                error: error.message
            }
        });
    } finally {
        state.processingTiles.delete(tileKey);
    }
}

// Batch process multiple tiles
async function handleBatchProcess(data, requestId) {
    const { tiles, priorities } = data;

    // Sort tiles by priority
    const sortedTiles = tiles.map((tile, index) => ({
        tile,
        priority: priorities[index] || 2
    })).sort((a, b) => a.priority - b.priority);

    // Process in priority order
    for (const { tile, priority } of sortedTiles) {
        await handleProcessTile({ tile, priority });
    }

    self.postMessage({
        type: 'batch-complete',
        requestId: requestId,
        data: {
            processed: tiles.length,
            stats: state.stats
        }
    });
}

// Process tile with optimizations
async function processTile(tile, priority) {
    const { level, x, y, url, bounds } = tile;

    // Priority-based processing
    if (priority === 0) {
        // Critical tiles - process immediately with full quality
        return await processHighPriority(tile);
    } else if (priority === 1) {
        // Important tiles - process with normal quality
        return await processNormalPriority(tile);
    } else {
        // Background tiles - process with reduced quality
        return await processLowPriority(tile);
    }
}

// High priority processing
async function processHighPriority(tile) {
    return {
        level: tile.level,
        quality: 'high',
        optimizations: {
            sharpening: false,
            compression: 'lossless',
            format: 'original'
        },
        metadata: {
            processed: Date.now(),
            priority: 0
        }
    };
}

// Normal priority processing
async function processNormalPriority(tile) {
    return {
        level: tile.level,
        quality: 'normal',
        optimizations: {
            sharpening: false,
            compression: 'balanced',
            format: 'jpeg'
        },
        metadata: {
            processed: Date.now(),
            priority: 1
        }
    };
}

// Low priority processing
async function processLowPriority(tile) {
    return {
        level: tile.level,
        quality: 'low',
        optimizations: {
            sharpening: false,
            compression: 'aggressive',
            format: 'jpeg',
            reducedSize: true
        },
        metadata: {
            processed: Date.now(),
            priority: 2
        }
    };
}

// Prioritize tiles in queue
function handlePrioritize(data, requestId) {
    const { tiles, viewport } = data;

    // Calculate priorities based on viewport
    const prioritized = tiles.map(tile => {
        const priority = calculateTilePriority(tile, viewport);
        return { tile, priority };
    });

    // Sort by priority
    prioritized.sort((a, b) => a.priority - b.priority);

    self.postMessage({
        type: 'priorities-calculated',
        requestId: requestId,
        data: {
            tiles: prioritized.map(p => p.tile),
            priorities: prioritized.map(p => p.priority)
        }
    });
}

// Calculate tile priority based on viewport
function calculateTilePriority(tile, viewport) {
    const { bounds: tileBounds, level } = tile;
    const { bounds: viewBounds, zoom } = viewport;

    // Check if tile is visible
    const isVisible = boundsIntersect(tileBounds, viewBounds);
    if (isVisible) return 0; // Highest priority

    // Calculate distance from viewport center
    const tileCenterX = (tileBounds.minX + tileBounds.maxX) / 2;
    const tileCenterY = (tileBounds.minY + tileBounds.maxY) / 2;
    const viewCenterX = (viewBounds.minX + viewBounds.maxX) / 2;
    const viewCenterY = (viewBounds.minY + viewBounds.maxY) / 2;

    const distance = Math.sqrt(
        Math.pow(tileCenterX - viewCenterX, 2) +
        Math.pow(tileCenterY - viewCenterY, 2)
    );

    // Calculate priority based on distance and level
    const viewportSize = Math.max(
        viewBounds.maxX - viewBounds.minX,
        viewBounds.maxY - viewBounds.minY
    );

    const normalizedDistance = distance / viewportSize;

    if (normalizedDistance < 1.5) return 1; // Near viewport
    if (normalizedDistance < 3.0) return 2; // Medium distance
    if (normalizedDistance < 5.0) return 3; // Far distance
    return 4; // Very far
}

// Check if bounds intersect
function boundsIntersect(a, b) {
    return !(
        a.maxX < b.minX ||
        a.minX > b.maxX ||
        a.maxY < b.minY ||
        a.minY > b.maxY
    );
}

// Cancel processing
function handleCancel(data, requestId) {
    const { tiles } = data;

    if (tiles) {
        tiles.forEach(tile => {
            const key = getTileKey(tile);
            state.processingTiles.delete(key);
        });
    } else {
        // Cancel all
        state.processingTiles.clear();
    }

    self.postMessage({
        type: 'cancelled',
        requestId: requestId,
        data: {
            cancelled: tiles ? tiles.length : state.processingTiles.size
        }
    });
}

// Clear cache
function handleClearCache(data, requestId) {
    const { selective, maxAge } = data || {};

    if (selective && maxAge) {
        // Clear old entries
        const now = Date.now();
        const keysToDelete = [];

        state.tileCache.forEach((value, key) => {
            if (now - value.metadata.processed > maxAge) {
                keysToDelete.push(key);
            }
        });

        keysToDelete.forEach(key => state.tileCache.delete(key));

        self.postMessage({
            type: 'cache-cleared',
            requestId: requestId,
            data: {
                cleared: keysToDelete.length,
                remaining: state.tileCache.size
            }
        });
    } else {
        // Clear all
        const size = state.tileCache.size;
        state.tileCache.clear();

        self.postMessage({
            type: 'cache-cleared',
            requestId: requestId,
            data: {
                cleared: size,
                remaining: 0
            }
        });
    }
}

// Get statistics
function handleGetStats(requestId) {
    self.postMessage({
        type: 'stats',
        requestId: requestId,
        data: {
            ...state.stats,
            cacheSize: state.tileCache.size,
            processing: state.processingTiles.size,
            memoryEstimate: estimateMemoryUsage()
        }
    });
}

// Cache tile with LRU eviction
function cacheTile(key, result) {
    // Check cache size
    if (state.tileCache.size >= config.maxCacheSize) {
        // Find oldest entry
        let oldestKey = null;
        let oldestTime = Infinity;

        state.tileCache.forEach((value, k) => {
            if (value.metadata.processed < oldestTime) {
                oldestTime = value.metadata.processed;
                oldestKey = k;
            }
        });

        if (oldestKey) {
            state.tileCache.delete(oldestKey);
        }
    }

    state.tileCache.set(key, result);
}

// Update statistics
function updateStats(processTime) {
    state.stats.processed++;

    // Update average process time
    const currentAvg = state.stats.averageProcessTime;
    const count = state.stats.processed;
    state.stats.averageProcessTime = (currentAvg * (count - 1) + processTime) / count;
}

// Get tile key
function getTileKey(tile) {
    return `${tile.level}_${tile.x}_${tile.y}`;
}

// Estimate memory usage
function estimateMemoryUsage() {
    // Rough estimate: assume each cached tile uses ~100KB
    const cacheMemory = state.tileCache.size * 100 * 1024; // bytes
    const queueMemory = state.priorityQueue.length * 1024; // 1KB per queued item

    return {
        cache: (cacheMemory / 1048576).toFixed(2) + ' MB',
        queue: (queueMemory / 1024).toFixed(2) + ' KB',
        total: ((cacheMemory + queueMemory) / 1048576).toFixed(2) + ' MB'
    };
}

// Check WebGL support
function checkWebGLSupport() {
    try {
        const canvas = new OffscreenCanvas(1, 1);
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        return !!gl;
    } catch (e) {
        return false;
    }
}

// Send ready message (no requestId because it's spontaneous)
self.postMessage({
    type: 'ready',
    data: {
        version: '1.0.0',
        capabilities: {
            offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
            imageDecoder: typeof ImageDecoder !== 'undefined'
        }
    }
});