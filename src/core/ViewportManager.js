import OpenSeadragon from 'openseadragon';

/**
 * ViewportManager - Manages viewport state with perfect synchronization
 * No caching to ensure hotspots stay perfectly aligned with the image
 */
class ViewportManager {
    constructor(viewer) {
        this.viewer = viewer;

        // Disable caching by default for perfect sync
        this.updateThreshold = 0;

        // Viewport padding for pre-loading nearby hotspots
        this.viewportPadding = 0.2; // 20% padding

        // Performance metrics
        this.metrics = {
            lastUpdateDuration: 0,
            totalUpdates: 0
        };
    }

    /**
     * Get current viewport data - always fresh, no caching
     */
    getCurrentViewport() {
        return this.update();
    }

    /**
     * Update viewport data - always returns fresh data
     */
    update() {
        const startTime = performance.now();

        // Get current viewport bounds
        const viewport = this.viewer.viewport;
        const bounds = viewport.getBounds();

        // Convert viewport bounds to image coordinates
        const topLeft = viewport.viewportToImageCoordinates(
            new OpenSeadragon.Point(bounds.x, bounds.y)
        );
        const bottomRight = viewport.viewportToImageCoordinates(
            new OpenSeadragon.Point(bounds.x + bounds.width, bounds.y + bounds.height)
        );

        // Calculate padding
        const paddingX = (bottomRight.x - topLeft.x) * this.viewportPadding;
        const paddingY = (bottomRight.y - topLeft.y) * this.viewportPadding;

        // Create padded bounds for pre-loading nearby hotspots
        const paddedBounds = {
            minX: Math.max(0, topLeft.x - paddingX),
            minY: Math.max(0, topLeft.y - paddingY),
            maxX: bottomRight.x + paddingX,
            maxY: bottomRight.y + paddingY
        };

        // Get current viewport state
        const viewportData = {
            bounds: paddedBounds,
            zoom: viewport.getZoom(),
            center: viewport.getCenter(),
            rotation: viewport.getRotation(),
            containerSize: viewport.getContainerSize(),
            imageBounds: {
                minX: topLeft.x,
                minY: topLeft.y,
                maxX: bottomRight.x,
                maxY: bottomRight.y
            },
            pixelRatio: this.calculatePixelRatio()
        };

        // Update metrics
        this.metrics.lastUpdateDuration = performance.now() - startTime;
        this.metrics.totalUpdates++;

        return viewportData;
    }

    /**
     * Check if a point is within the current viewport
     */
    isPointInViewport(x, y) {
        const viewport = this.getCurrentViewport();
        const bounds = viewport.imageBounds; // Use exact bounds, not padded

        return x >= bounds.minX && x <= bounds.maxX &&
            y >= bounds.minY && y <= bounds.maxY;
    }

    /**
     * Check if a bounding box intersects the viewport
     */
    isBoxInViewport(minX, minY, maxX, maxY) {
        const viewport = this.getCurrentViewport();
        const bounds = viewport.bounds; // Use padded bounds for pre-loading

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
        const imageWidth = imageSize.x;

        // Calculate how many pixels represent one image unit
        const viewportWidthInImageUnits = bounds.width * imageWidth;
        return containerSize.x / viewportWidthInImageUnits;
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
            averageUpdateTime: this.metrics.totalUpdates > 0
                ? this.metrics.lastUpdateDuration / this.metrics.totalUpdates
                : 0
        };
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            lastUpdateDuration: 0,
            totalUpdates: 0
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
     * Force immediate viewport update
     */
    forceUpdate() {
        return this.update();
    }

    /**
     * Clean up
     */
    destroy() {
        this.viewer = null;
    }
}

export default ViewportManager;