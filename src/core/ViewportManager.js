import OpenSeadragon from 'openseadragon';

/**
 * ViewportManager - Optimized viewport state management
 * Includes intelligent caching for better performance
 */
class ViewportManager {
    constructor(viewer) {
        this.viewer = viewer;

        // Cache settings
        this.cacheEnabled = true;
        this.cacheTimeout = 50; // ms - cache valid for 50ms
        this.lastUpdate = 0;
        this.cachedViewport = null;

        // Viewport padding for pre-loading nearby hotspots
        this.viewportPadding = 0.2; // 20% padding

        // Performance metrics
        this.metrics = {
            cacheHits: 0,
            cacheMisses: 0,
            lastUpdateDuration: 0,
            totalUpdates: 0,
            averageUpdateTime: 0
        };

        // Bind update to animation frame for smooth performance
        this.boundUpdate = this.update.bind(this);
    }

    /**
     * Get current viewport data with intelligent caching
     */
    getCurrentViewport() {
        const now = performance.now();

        // Check if cache is still valid
        if (this.cacheEnabled &&
            this.cachedViewport &&
            (now - this.lastUpdate) < this.cacheTimeout) {
            this.metrics.cacheHits++;
            return this.cachedViewport;
        }

        // Cache miss - update required
        this.metrics.cacheMisses++;
        return this.update();
    }

    /**
     * Force update viewport data
     */
    update() {
        const startTime = performance.now();

        // Get current viewport bounds
        const viewport = this.viewer.viewport;
        const bounds = viewport.getBounds();

        // Convert viewport bounds to image coordinates efficiently
        const topLeft = viewport.viewportToImageCoordinates(bounds.getTopLeft());
        const bottomRight = viewport.viewportToImageCoordinates(bounds.getBottomRight());

        // Calculate viewport dimensions
        const width = bottomRight.x - topLeft.x;
        const height = bottomRight.y - topLeft.y;

        // Calculate padding for preloading
        const paddingX = width * this.viewportPadding;
        const paddingY = height * this.viewportPadding;

        // Get image bounds
        const tiledImage = this.viewer.world.getItemAt(0);
        const imageSize = tiledImage ? tiledImage.getContentSize() : { x: 1, y: 1 };

        // Create padded bounds for pre-loading nearby hotspots
        const paddedBounds = {
            minX: Math.max(0, topLeft.x - paddingX),
            minY: Math.max(0, topLeft.y - paddingY),
            maxX: Math.min(imageSize.x, bottomRight.x + paddingX),
            maxY: Math.min(imageSize.y, bottomRight.y + paddingY)
        };

        // Get current viewport state
        const viewportData = {
            bounds: paddedBounds,
            zoom: viewport.getZoom(true),
            center: viewport.getCenter(true),
            rotation: viewport.getRotation(),
            containerSize: viewport.getContainerSize(),
            imageBounds: {
                minX: topLeft.x,
                minY: topLeft.y,
                maxX: bottomRight.x,
                maxY: bottomRight.y
            },
            pixelRatio: this.calculatePixelRatio(),
            levelOfDetail: this.getLevelOfDetail()
        };

        // Update cache
        this.cachedViewport = viewportData;
        this.lastUpdate = performance.now();

        // Update metrics
        const updateTime = this.lastUpdate - startTime;
        this.metrics.lastUpdateDuration = updateTime;
        this.metrics.totalUpdates++;
        this.metrics.averageUpdateTime =
            (this.metrics.averageUpdateTime * (this.metrics.totalUpdates - 1) + updateTime) /
            this.metrics.totalUpdates;

        return viewportData;
    }

    /**
     * Check if a point is within the current viewport
     */
    isPointInViewport(x, y, usePadding = false) {
        const viewport = this.getCurrentViewport();
        const bounds = usePadding ? viewport.bounds : viewport.imageBounds;

        return x >= bounds.minX && x <= bounds.maxX &&
            y >= bounds.minY && y <= bounds.maxY;
    }

    /**
     * Check if a bounding box intersects the viewport
     */
    isBoxInViewport(minX, minY, maxX, maxY, usePadding = true) {
        const viewport = this.getCurrentViewport();
        const bounds = usePadding ? viewport.bounds : viewport.imageBounds;

        return !(maxX < bounds.minX || minX > bounds.maxX ||
            maxY < bounds.minY || minY > bounds.maxY);
    }

    /**
     * Convert image coordinates to viewport pixel coordinates
     */
    imageToPixel(imageX, imageY) {
        const viewportPoint = this.viewer.viewport.imageToViewportCoordinates(
            new OpenSeadragon.Point(imageX, imageY)
        );
        return this.viewer.viewport.pixelFromPoint(viewportPoint);
    }

    /**
     * Convert viewport pixel coordinates to image coordinates
     */
    pixelToImage(pixelX, pixelY) {
        const viewportPoint = this.viewer.viewport.pointFromPixel(
            new OpenSeadragon.Point(pixelX, pixelY)
        );
        return this.viewer.viewport.viewportToImageCoordinates(viewportPoint);
    }

    /**
     * Calculate the current pixel ratio (pixels per image unit)
     */
    calculatePixelRatio() {
        const viewport = this.viewer.viewport;
        const containerSize = viewport.getContainerSize();
        const bounds = viewport.getBounds();

        // Get the actual image dimensions
        const tiledImage = this.viewer.world.getItemAt(0);
        if (!tiledImage) return 1;

        const imageSize = tiledImage.getContentSize();
        const viewportWidthInImageUnits = bounds.width * imageSize.x;

        return containerSize.x / viewportWidthInImageUnits;
    }

    /**
     * Get level of detail based on current zoom
     */
    getLevelOfDetail() {
        const zoom = this.viewer.viewport.getZoom(true);
        const maxZoom = this.viewer.viewport.getMaxZoom();
        const normalized = zoom / maxZoom;

        // Return LOD from 0 (zoomed out) to 3 (max zoom)
        if (normalized < 0.1) return 0;
        if (normalized < 0.3) return 1;
        if (normalized < 0.6) return 2;
        return 3;
    }

    /**
     * Check if we should render high quality based on zoom level
     */
    shouldRenderHighQuality() {
        return this.getLevelOfDetail() >= 2;
    }

    /**
     * Get viewport area as percentage of total image
     */
    getViewportCoverage() {
        const viewport = this.getCurrentViewport();
        const tiledImage = this.viewer.world.getItemAt(0);
        if (!tiledImage) return 1;

        const imageSize = tiledImage.getContentSize();
        const viewportArea =
            (viewport.imageBounds.maxX - viewport.imageBounds.minX) *
            (viewport.imageBounds.maxY - viewport.imageBounds.minY);
        const totalArea = imageSize.x * imageSize.y;

        return viewportArea / totalArea;
    }

    /**
     * Get viewport metrics for performance monitoring
     */
    getMetrics() {
        const cacheEfficiency = this.metrics.cacheHits + this.metrics.cacheMisses > 0
            ? (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) * 100
            : 0;

        return {
            ...this.metrics,
            cacheEfficiency: cacheEfficiency.toFixed(1) + '%',
            currentZoom: this.viewer.viewport.getZoom(true).toFixed(2),
            viewportCoverage: (this.getViewportCoverage() * 100).toFixed(1) + '%'
        };
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            cacheHits: 0,
            cacheMisses: 0,
            lastUpdateDuration: 0,
            totalUpdates: 0,
            averageUpdateTime: 0
        };
    }

    /**
     * Get visible area in image coordinates
     */
    getVisibleImageArea() {
        const viewport = this.getCurrentViewport();
        return {
            x: viewport.imageBounds.minX,
            y: viewport.imageBounds.minY,
            width: viewport.imageBounds.maxX - viewport.imageBounds.minX,
            height: viewport.imageBounds.maxY - viewport.imageBounds.minY
        };
    }

    /**
     * Enable or disable caching
     */
    setCacheEnabled(enabled) {
        this.cacheEnabled = enabled;
        if (!enabled) {
            this.cachedViewport = null;
        }
    }

    /**
     * Set cache timeout
     */
    setCacheTimeout(timeout) {
        this.cacheTimeout = Math.max(0, timeout);
    }

    /**
     * Set viewport padding for preloading
     */
    setViewportPadding(padding) {
        this.viewportPadding = Math.max(0, Math.min(1, padding));
    }

    /**
     * Clean up
     */
    destroy() {
        this.viewer = null;
        this.cachedViewport = null;
    }
}

export default ViewportManager;