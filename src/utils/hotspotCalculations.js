import OpenSeadragon from 'openseadragon';

/**
 * Calculate optimal bounds for hotspot zoom with adaptive padding
 */
export const calculateHotspotBounds = (hotspot, viewer, isMobile) => {
    // For CanvasHotspotRenderer, we don't have overlays, so calculate bounds directly
    let bounds;
    if (hotspot.coordinates) {
        // Fallback: calculate from coordinates
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        const processCoords = (coords) => {
            if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
                coords.forEach(([x, y]) => {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                });
            } else {
                coords.forEach(polygon => {
                    polygon.forEach(([x, y]) => {
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                    });
                });
            }
        };

        processCoords(hotspot.coordinates);
        bounds = { minX, minY, maxX, maxY };
    } else {
        return null;
    }

    // Get image size for calculations
    const tiledImage = viewer.world.getItemAt(0);
    const imageSize = tiledImage.getContentSize();

    // Calculate hotspot size in pixels
    const hotspotWidthPixels = bounds.maxX - bounds.minX;
    const hotspotHeightPixels = bounds.maxY - bounds.minY;
    const hotspotSizePixels = Math.max(hotspotWidthPixels, hotspotHeightPixels);

    // Convert to viewport coordinates
    const topLeft = viewer.viewport.imageToViewportCoordinates(
        new OpenSeadragon.Point(bounds.minX, bounds.minY)
    );
    const bottomRight = viewer.viewport.imageToViewportCoordinates(
        new OpenSeadragon.Point(bounds.maxX, bounds.maxY)
    );

    const width = bottomRight.x - topLeft.x;
    const height = bottomRight.y - topLeft.y;

    // ADAPTIVE PADDING CALCULATION
    const minVisibleAreaPixels = isMobile ? 400 : 600;
    const maxPaddingFactor = isMobile ? 0.5 : 0.3;

    let paddingX, paddingY;

    if (hotspotSizePixels < minVisibleAreaPixels) {
        // For small hotspots, ensure minimum visible area
        const targetSizeViewport = viewer.viewport.imageToViewportCoordinates(
            new OpenSeadragon.Point(minVisibleAreaPixels, 0)
        ).x;

        paddingX = Math.max(0, (targetSizeViewport - width) / 2);
        paddingY = Math.max(0, (targetSizeViewport - height) / 2);
    } else {
        // For larger hotspots, use proportional padding
        paddingX = width * maxPaddingFactor;
        paddingY = height * maxPaddingFactor;
    }

    // Calculate zoom bounds
    const zoomBounds = new OpenSeadragon.Rect(
        topLeft.x - paddingX,
        topLeft.y - paddingY,
        width + (paddingX * 2),
        height + (paddingY * 2)
    );

    // NEW QUALITY-BASED ZOOM CALCULATION
    const viewportSize = viewer.viewport.getContainerSize();

    // Calculate desired visible area in pixels (hotspot + padding)
    const desiredVisiblePixels = Math.max(
        hotspotSizePixels * (1 + maxPaddingFactor * 2),
        minVisibleAreaPixels
    );

    // Calculate zoom that would show this many pixels in the viewport
    const pixelsPerViewportUnit = imageSize.x; // Since viewport width = 1.0 for full image
    const desiredViewportUnits = desiredVisiblePixels / pixelsPerViewportUnit;
    const viewportAspectRatio = viewportSize.x / viewportSize.y;

    // Calculate max zoom that maintains quality
    let maxQualityZoom;
    if (viewportAspectRatio > 1) {
        // Landscape viewport
        maxQualityZoom = 1.0 / desiredViewportUnits;
    } else {
        // Portrait viewport
        maxQualityZoom = viewportAspectRatio / desiredViewportUnits;
    }

    // Apply reasonable limits
    maxQualityZoom = Math.min(maxQualityZoom, 10); // Never zoom more than 10x
    maxQualityZoom = Math.max(maxQualityZoom, 0.5); // Never zoom out beyond 0.5x

    zoomBounds.maxZoom = maxQualityZoom;
    zoomBounds.hotspotSizePixels = hotspotSizePixels;
    zoomBounds.desiredVisiblePixels = desiredVisiblePixels;

    return zoomBounds;
};