import RBush from 'rbush';

/**
 * SpatialIndex - Optimized spatial indexing with faster queries
 */
class SpatialIndex {
    constructor() {
        // RBush with optimal settings for 600+ items
        this.tree = new RBush(9); // Lower node size for faster queries
        this.hotspots = new Map();

        // Cache for frequent queries
        this.queryCache = new Map();
        this.cacheSize = 50;
        this.lastCacheClear = Date.now();
    }

    /**
     * Load hotspots with optimized indexing
     */
    loadHotspots(hotspotData) {
        const startTime = performance.now();

        // Clear existing data
        this.tree.clear();
        this.hotspots.clear();
        this.queryCache.clear();

        // Pre-calculate all bounding boxes
        const items = [];

        hotspotData.forEach(hotspot => {
            const bbox = this.calculateBoundingBox(hotspot.coordinates);

            // Store hotspot
            this.hotspots.set(hotspot.id, {
                ...hotspot,
                bbox // Store bbox for faster access
            });

            // Add to RBush
            items.push({
                minX: bbox.minX,
                minY: bbox.minY,
                maxX: bbox.maxX,
                maxY: bbox.maxY,
                id: hotspot.id
            });
        });

        // Bulk insert for better performance
        this.tree.load(items);

        const loadTime = performance.now() - startTime;
        console.log(`Spatial index built in ${loadTime.toFixed(2)}ms for ${items.length} hotspots`);
    }

    /**
     * Query with caching for repeated viewport queries
     */
    queryViewport(bounds, zoom = 1) {
        // Create cache key
        const key = `${bounds.minX.toFixed(2)},${bounds.minY.toFixed(2)},${bounds.maxX.toFixed(2)},${bounds.maxY.toFixed(2)},${zoom.toFixed(2)}`;

        // Check cache
        if (this.queryCache.has(key)) {
            return this.queryCache.get(key);
        }

        // Clear cache periodically
        if (Date.now() - this.lastCacheClear > 1000) {
            this.queryCache.clear();
            this.lastCacheClear = Date.now();
        }

        // Perform query
        const results = this.tree.search({
            minX: bounds.minX,
            minY: bounds.minY,
            maxX: bounds.maxX,
            maxY: bounds.maxY
        });

        // Map to hotspot objects
        const hotspots = results.map(item => this.hotspots.get(item.id));

        // Cache result if cache not too large
        if (this.queryCache.size < this.cacheSize) {
            this.queryCache.set(key, hotspots);
        }

        return hotspots;
    }

    /**
     * Optimized point-in-hotspot test
     */
    getHotspotAtPoint(x, y) {
        // Query candidates
        const candidates = this.tree.search({
            minX: x,
            minY: y,
            maxX: x,
            maxY: y
        });

        // Test each candidate
        for (const candidate of candidates) {
            const hotspot = this.hotspots.get(candidate.id);
            if (this.isPointInHotspot(x, y, hotspot)) {
                return hotspot;
            }
        }

        return null;
    }

    /**
     * Calculate bounding box
     */
    calculateBoundingBox(coordinates) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        const processPoints = (points) => {
            for (const point of points) {
                minX = Math.min(minX, point[0]);
                minY = Math.min(minY, point[1]);
                maxX = Math.max(maxX, point[0]);
                maxY = Math.max(maxY, point[1]);
            }
        };

        // Handle both polygon and multipolygon
        if (coordinates.length > 0 && typeof coordinates[0][0] === 'number') {
            processPoints(coordinates);
        } else {
            for (const polygon of coordinates) {
                processPoints(polygon);
            }
        }

        return { minX, minY, maxX, maxY };
    }

    /**
     * Point-in-polygon test
     */
    isPointInHotspot(x, y, hotspot) {
        if (hotspot.shape === 'polygon') {
            return this.pointInPolygon(x, y, hotspot.coordinates);
        } else if (hotspot.shape === 'multipolygon') {
            return hotspot.coordinates.some(polygon =>
                this.pointInPolygon(x, y, polygon)
            );
        }
        return false;
    }

    /**
     * Optimized ray casting algorithm
     */
    pointInPolygon(x, y, polygon) {
        let inside = false;
        const n = polygon.length;

        let p1x = polygon[0][0];
        let p1y = polygon[0][1];

        for (let i = 1; i <= n; i++) {
            const p2x = polygon[i % n][0];
            const p2y = polygon[i % n][1];

            if (y > Math.min(p1y, p2y)) {
                if (y <= Math.max(p1y, p2y)) {
                    if (x <= Math.max(p1x, p2x)) {
                        if (p1y !== p2y) {
                            const xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x;
                            if (p1x === p2x || x <= xinters) {
                                inside = !inside;
                            }
                        }
                    }
                }
            }

            p1x = p2x;
            p1y = p2y;
        }

        return inside;
    }

    /**
     * Get all hotspots
     */
    getAllHotspots() {
        return Array.from(this.hotspots.values());
    }

    /**
     * Clear all data
     */
    clear() {
        this.tree.clear();
        this.hotspots.clear();
        this.queryCache.clear();
    }
}

export default SpatialIndex;