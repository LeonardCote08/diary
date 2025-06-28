import OpenSeadragon from 'openseadragon';

export const calculateHotspotBounds = (hotspot, viewer, isMobile) => {
    // Calculate bounds from coordinates
    let bounds;
    if (hotspot.coordinates) {
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

    // Convert to viewport coordinates for proper centering
    const topLeft = viewer.viewport.imageToViewportCoordinates(
        new OpenSeadragon.Point(bounds.minX, bounds.minY)
    );
    const bottomRight = viewer.viewport.imageToViewportCoordinates(
        new OpenSeadragon.Point(bounds.maxX, bounds.maxY)
    );

    const width = bottomRight.x - topLeft.x;
    const height = bottomRight.y - topLeft.y;

    // Calculate center in viewport coordinates
    const centerX = topLeft.x + width / 2;
    const centerY = topLeft.y + height / 2;

    // Get viewport aspect ratio
    const viewportAspectRatio = viewer.viewport.getAspectRatio();

    // Calculate hotspot aspect ratio
    const hotspotAspectRatio = width / height;

    // Determine padding factor
    const paddingFactor = isMobile ? 0.85 : 0.8; // 85% of screen on mobile, 80% on desktop

    // Calculate the final bounds dimensions to maximize screen usage
    let finalWidth, finalHeight;

    if (hotspotAspectRatio > viewportAspectRatio) {
        // Hotspot is wider - fit to width
        finalWidth = width / paddingFactor;
        finalHeight = finalWidth / viewportAspectRatio;
    } else {
        // Hotspot is taller - fit to height
        finalHeight = height / paddingFactor;
        finalWidth = finalHeight * viewportAspectRatio;
    }

    // Create bounds centered on the hotspot
    const zoomBounds = new OpenSeadragon.Rect(
        centerX - finalWidth / 2,
        centerY - finalHeight / 2,
        finalWidth,
        finalHeight
    );

    // Debug logging
    console.log('Hotspot zoom calculation:', {
        hotspotId: hotspot.id,
        originalBounds: bounds,
        viewportCoords: { topLeft, bottomRight },
        center: { x: centerX, y: centerY },
        dimensions: { width: finalWidth, height: finalHeight },
        aspectRatios: {
            hotspot: hotspotAspectRatio.toFixed(2),
            viewport: viewportAspectRatio.toFixed(2)
        },
        paddingFactor,
        zoomBounds
    });

    return zoomBounds;
};