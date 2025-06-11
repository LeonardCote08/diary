import RBush from 'rbush';

/**
 * SpatialIndex - High-performance spatial indexing for hotspots
 * Uses RBush R-tree for sub-millisecond hit testing with hundreds of hotspots
 */
class SpatialIndex {
    constructor() {
        // Initialize RBush with optimal node size for our use case
        // 16 is good for datasets with 100-1000 items
        this.tree = new RBush(16);

        // Cache for hotspot data
        this.hotspots = new Map();

        // Performance metrics
        this.metrics = {
            totalQueries: 0,
            totalHitTests: 0,
            averageQueryTime: 0,
            lastRebuildTime: 0
        };
    }

    /**
     * Load hotspots into the spatial index
     */
    loadHotspots(hotspotData) {
        const startTime = performance.now();

        // Clear existing data
        this.tree.clear();
        this.hotspots.clear();

        // Convert hotspots to RBush format
        const items = hotspotData.map(hotspot => {
            // Calculate bounding box for the hotspot
            const bbox = this.calculateBoundingBox(hotspot.coordinates);

            // Store hotspot data
            this.hotspots.set(hotspot.id, hotspot);

            // Return RBush item format
            return {
                minX: bbox.minX,
                minY: bbox.minY,
                maxX: bbox.maxX,
                maxY: bbox.maxY,
                id: hotspot.id,
                type: hotspot.type
            };
        });

        // Bulk load for better performance
        this.tree.load(items);

        this.metrics.lastRebuildTime = performance.now() - startTime;
        console.log(`Spatial index built in ${this.metrics.lastRebuildTime.toFixed(2)}ms for ${items.length} hotspots`);
    }

    /**
     * Query hotspots within a viewport bounds
     */
    queryViewport(bounds, zoom = 1) {
        const startTime = performance.now();

        // Query the R-tree
        const results = this.tree.search({
            minX: bounds.minX,
            minY: bounds.minY,
            maxX: bounds.maxX,
            maxY: bounds.maxY
        });

        // Map results back to hotspot objects
        const hotspots = results.map(item => this.hotspots.get(item.id));

        // Update metrics
        const queryTime = performance.now() - startTime;
        this.updateQueryMetrics(queryTime);

        return hotspots;
    }

    /**
     * Get hotspot at a specific point
     */
    getHotspotAtPoint(x, y) {
        const startTime = performance.now();

        // First, query hotspots whose bounding box contains the point
        const candidates = this.tree.search({
            minX: x,
            minY: y,
            maxX: x,
            maxY: y
        });

        // Then do precise point-in-polygon test
        for (const candidate of candidates) {
            const hotspot = this.hotspots.get(candidate.id);
            if (this.isPointInHotspot(x, y, hotspot)) {
                const queryTime = performance.now() - startTime;
                this.updateHitTestMetrics(queryTime);
                return hotspot;
            }
        }

        const queryTime = performance.now() - startTime;
        this.updateHitTestMetrics(queryTime);
        return null;
    }

    /**
     * Get all hotspots at a specific point (for overlapping hotspots)
     */
    getHotspotsAtPoint(x, y) {
        const candidates = this.tree.search({
            minX: x,
            minY: y,
            maxX: x,
            maxY: y
        });

        return candidates
            .map(candidate => this.hotspots.get(candidate.id))
            .filter(hotspot => this.isPointInHotspot(x, y, hotspot));
    }

    /**
     * Calculate bounding box for polygon coordinates
     */
    calculateBoundingBox(coordinates) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        // Handle single polygon
        if (coordinates.length > 0 && typeof coordinates[0][0] === 'number') {
            for (const point of coordinates) {
                minX = Math.min(minX, point[0]);
                minY = Math.min(minY, point[1]);
                maxX = Math.max(maxX, point[0]);
                maxY = Math.max(maxY, point[1]);
            }
        }
        // Handle multipolygon
        else {
            for (const polygon of coordinates) {
                for (const point of polygon) {
                    minX = Math.min(minX, point[0]);
                    minY = Math.min(minY, point[1]);
                    maxX = Math.max(maxX, point[0]);
                    maxY = Math.max(maxY, point[1]);
                }
            }
        }

        return { minX, minY, maxX, maxY };
    }

    /**
     * Test if a point is inside a hotspot (point-in-polygon test)
     */
    isPointInHotspot(x, y, hotspot) {
        if (hotspot.shape === 'polygon') {
            return this.isPointInPolygon(x, y, hotspot.coordinates);
        } else if (hotspot.shape === 'multipolygon') {
            return hotspot.coordinates.some(polygon =>
                this.isPointInPolygon(x, y, polygon)
            );
        }
        return false;
    }

    /**
     * Ray casting algorithm for point-in-polygon test
     */
    isPointInPolygon(x, y, polygon) {
        let inside = false;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0];
            const yi = polygon[i][1];
            const xj = polygon[j][0];
            const yj = polygon[j][1];

            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

            if (intersect) inside = !inside;
        }

        return inside;
    }

    /**
     * Get nearby hotspots within a radius
     */
    getNearbyHotspots(x, y, radius) {
        const bounds = {
            minX: x - radius,
            minY: y - radius,
            maxX: x + radius,
            maxY: y + radius
        };

        const candidates = this.tree.search(bounds);

        // Filter by actual distance
        return candidates
            .map(candidate => this.hotspots.get(candidate.id))
            .filter(hotspot => {
                const center = this.getHotspotCenter(hotspot);
                const distance = Math.sqrt(
                    Math.pow(center.x - x, 2) + Math.pow(center.y - y, 2)
                );
                return distance <= radius;
            });
    }

    /**
     * Calculate center point of a hotspot
     */
    getHotspotCenter(hotspot) {
        const bbox = this.calculateBoundingBox(hotspot.coordinates);
        return {
            x: (bbox.minX + bbox.maxX) / 2,
            y: (bbox.minY + bbox.maxY) / 2
        };
    }

    /**
     * Get all hotspots of a specific type
     */
    getHotspotsByType(type) {
        return Array.from(this.hotspots.values()).filter(h => h.type === type);
    }

    /**
     * Update query performance metrics
     */
    updateQueryMetrics(queryTime) {
        this.metrics.totalQueries++;
        this.metrics.averageQueryTime =
            (this.metrics.averageQueryTime * (this.metrics.totalQueries - 1) + queryTime) /
            this.metrics.totalQueries;
    }

    /**
     * Update hit test performance metrics
     */
    updateHitTestMetrics(testTime) {
        this.metrics.totalHitTests++;
        // You can add more detailed metrics here if needed
    }

    /**
     * Get performance metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            totalHotspots: this.hotspots.size,
            treeSize: this.tree.all().length
        };
    }

    /**
     * Clear all data
     */
    clear() {
        this.tree.clear();
        this.hotspots.clear();
    }

    /**
     * Add a single hotspot
     */
    addHotspot(hotspot) {
        const bbox = this.calculateBoundingBox(hotspot.coordinates);

        this.hotspots.set(hotspot.id, hotspot);

        this.tree.insert({
            minX: bbox.minX,
            minY: bbox.minY,
            maxX: bbox.maxX,
            maxY: bbox.maxY,
            id: hotspot.id,
            type: hotspot.type
        });
    }

    /**
     * Remove a hotspot
     */
    removeHotspot(hotspotId) {
        const hotspot = this.hotspots.get(hotspotId);
        if (!hotspot) return;

        const bbox = this.calculateBoundingBox(hotspot.coordinates);

        this.tree.remove({
            minX: bbox.minX,
            minY: bbox.minY,
            maxX: bbox.maxX,
            maxY: bbox.maxY,
            id: hotspot.id,
            type: hotspot.type
        }, (a, b) => a.id === b.id);

        this.hotspots.delete(hotspotId);
    }

    /**
     * Get all hotspots
     */
    getAllHotspots() {
        return Array.from(this.hotspots.values());
    }
}

export default SpatialIndex;