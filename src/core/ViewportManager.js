import OpenSeadragon from 'openseadragon';

/**
 * ViewportManager - Manages viewport state and coordinate transformations
 * Optimized for performance with caching and efficient calculations
 */
class ViewportManager {
    constructor(viewer) {
        this.viewer = viewer;

        // Cached viewport state
        this.cachedViewport = null;
        this.lastUpdateTime = 0;
        this.updateThreshold = 16; // ~60fps

        // Viewport padding for smoother transitions
        this.viewportPadding = 0.2; // 20% padding around visible area

        // Performance metrics
        this.metrics = {
            lastUpdateDuration: 0,
            totalUpdates: 0,
            cachedQueries: 0
        };
    }

    /**
     * Update cached viewport data
     */
    update() {
        const now = performance.now();

        // Throttle updates for performance
        if (now - this.lastUpdateTime < this.updateThreshold && this.cachedViewport) {
            this.metrics.cachedQueries++;
            return this.cachedViewport;
        }

        const startTime = performance.now();

        // Get current viewport bounds in image coordinates
        const viewport = this.viewer.viewport;
        const bounds = viewport.getBounds();

        // Convert to image coordinates
        const topLeft = viewport.viewportToImageCoordinates(
            new OpenSeadragon.Point(bounds.x, bounds.y)
        );
        const bottomRight = viewport.viewportToImageCoordinates(
            new OpenSeadragon.Point(bounds.x + bounds.width, bounds.y + bounds.height)
        );

        // Apply padding for smoother scrolling
        const paddingX = (bottomRight.x - topLeft.x) * this.viewportPadding;
        const paddingY = (bottomRight.y - topLeft.y) * this.viewportPadding;

        // Create padded bounds
        const paddedBounds = {
            minX: Math.max(0, topLeft.x - paddingX),
            minY: Math.max(0, topLeft.y - paddingY),
            maxX: bottomRight.x + paddingX,
            maxY: bottomRight.y + paddingY
        };

        // Calculate current zoom level
        const zoom = viewport.getZoom();
        const containerSize = viewport.getContainerSize();

        // Cache the viewport data
        this.cachedViewport = {
            bounds: paddedBounds,
            zoom: zoom,
            center: viewport.getCenter(),
            rotation: viewport.getRotation(),
            containerSize: containerSize,
            imageBounds: {
                minX: topLeft.x,
                minY: topLeft.y,
                maxX: bottomRight.x,
                maxY: bottomRight.y
            },
            pixelRatio: this.calculatePixelRatio()
        };

        // Update metrics
        this.lastUpdateTime = now;
        this.metrics.lastUpdateDuration = performance.now() - startTime;
        this.metrics.totalUpdates++;

        return this.cachedViewport;
    }

    /**
     * Get current viewport data with caching
     */
    getCurrentViewport() {
        if (!this.cachedViewport) {
            return this.update();
        }

        // Check if viewport has changed significantly
        const currentZoom = this.viewer.viewport.getZoom();
        const currentCenter = this.viewer.viewport.getCenter();

        if (Math.abs(currentZoom - this.cachedViewport.zoom) > 0.001 ||
            Math.abs(currentCenter.x - this.cachedViewport.center.x) > 0.001 ||
            Math.abs(currentCenter.y - this.cachedViewport.center.y) > 0.001) {
            return this.update();
        }

        this.metrics.cachedQueries++;
        return this.cachedViewport;
    }

    /**
     * Check if a point is within the current viewport
     */
    isPointInViewport(x, y) {
        const viewport = this.getCurrentViewport();
        const bounds = viewport.bounds;

        return x >= bounds.minX && x <= bounds.maxX &&
            y >= bounds.minY && y <= bounds.maxY;
    }

    /**
     * Check if a bounding box intersects the viewport
     */
    isBoxInViewport(minX, minY, maxX, maxY) {
        const viewport = this.getCurrentViewport();
        const bounds = viewport.bounds;

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

        // Image units per viewport width
        const imageWidth = this.viewer.world.getItemAt(0).getContentSize().x;
        const viewportWidth = bounds.width;

        // Pixels per image unit
        return containerSize.x / (imageWidth * viewportWidth);
    }

    /**
     * Get level of detail based on current zoom
     */
    getLevelOfDetail() {
        const zoom = this.viewer.viewport.getZoom();
        const maxZoom = this.viewer.viewport.getMaxZoom();

        // Return LOD from 0 (zoomed out) to 3 (max zoom)
        if (zoom < 0.5) return 0;
        if (zoom < 1) return 1;
        if (zoom < maxZoom * 0.5) return 2;
        return 3;
    }

    /**
     * Check if we should render details based on zoom level
     */
    shouldRenderDetails() {
        return this.getLevelOfDetail() >= 2;
    }

    /**
     * Get viewport metrics for performance monitoring
     */
    getMetrics() {
        return {
            ...this.metrics,
            currentZoom: this.viewer.viewport.getZoom(),
            cacheHitRate: this.metrics.cachedQueries /
                (this.metrics.totalUpdates + this.metrics.cachedQueries)
        };
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            lastUpdateDuration: 0,
            totalUpdates: 0,
            cachedQueries: 0
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
     * Clean up
     */
    destroy() {
        this.viewer = null;
        this.cachedViewport = null;
    }
}

export default ViewportManager;