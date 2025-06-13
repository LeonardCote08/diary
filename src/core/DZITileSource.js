import XYZ from 'ol/source/XYZ.js';
import TileGrid from 'ol/tilegrid/TileGrid.js';

/**
 * DZI Tile Source for OpenLayers - Simplified version
 * Uses XYZ source which is more standard for custom tile schemes
 */
class DZITileSource extends XYZ {
    constructor(options) {
        const {
            url,
            width,
            height,
            tileSize = 512,
            overlap = 8,
            format = 'jpg'
        } = options;

        // Calculate zoom levels based on image dimensions
        const maxDimension = Math.max(width, height);

        // Calculate the number of levels needed
        // Level 0 has 1x1 tile, level 1 has 2x2, etc.
        let maxZoom = 0;
        let dimension = tileSize;
        while (dimension < maxDimension) {
            dimension *= 2;
            maxZoom++;
        }

        console.log('DZI configuration:', {
            imageSize: [width, height],
            tileSize,
            format,
            calculatedMaxZoom: maxZoom,
            expectedLevels: `0 to ${maxZoom}`
        });

        // Create resolutions for each zoom level
        // DZI level 0 = smallest image (most zoomed out)
        // DZI level maxZoom = full resolution (most zoomed in)
        const resolutions = [];

        // Start with the most zoomed out (lowest detail)
        for (let dziLevel = 0; dziLevel <= maxZoom; dziLevel++) {
            // At DZI level 'dziLevel', the image has been scaled down by 2^(maxZoom-dziLevel)
            const scale = Math.pow(2, maxZoom - dziLevel);
            resolutions.push(scale);
        }

        console.log('Generated resolutions (from most zoomed out to most zoomed in):', resolutions);

        // Create tile grid
        const tileGrid = new TileGrid({
            extent: [0, 0, width, height],
            origin: [0, 0], // Top-left
            resolutions: resolutions,
            tileSize: [tileSize, tileSize]
        });

        // Initialize XYZ source
        super({
            tileGrid: tileGrid,
            projection: null, // No projection (pixel coordinates)
            tileUrlFunction: (tileCoord, pixelRatio, projection) => {
                if (!tileCoord) return undefined;

                const [z, x, y] = tileCoord;

                // Check if tile coordinate is valid
                if (z < 0 || z > maxZoom) return undefined;

                // OpenLayers zoom level corresponds directly to DZI level
                // OL zoom 0 = DZI level 0 (most zoomed out)
                // OL zoom maxZoom = DZI level maxZoom (most zoomed in)
                const dziLevel = z;

                // Build URL - DZI uses format: {level}/{x}_{y}.{format}
                const tileUrl = `${url}/${dziLevel}/${x}_${y}.${format}`;

                // Debug first few requests
                if (!this._debugCount) this._debugCount = 0;
                if (this._debugCount < 10) {
                    console.log(`Tile ${this._debugCount}: OL[${z},${x},${y}] → DZI level ${dziLevel} → ${tileUrl}`);
                    this._debugCount++;
                }

                return tileUrl;
            },
            crossOrigin: 'anonymous',
            interpolate: false, // Critical for pixel-perfect rendering
            opaque: true,
            transition: 0, // No fade-in
            cacheSize: 2048
        });

        // Store metadata
        this.imageWidth = width;
        this.imageHeight = height;
        this.maxZoom = maxZoom;
        this.dziTileSize = tileSize;
        this.dziOverlap = overlap;
        this.dziFormat = format;
    }

    /**
     * Get the image extent
     */
    getImageExtent() {
        return [0, 0, this.imageWidth, this.imageHeight];
    }

    /**
     * Get the image size
     */
    getImageSize() {
        return [this.imageWidth, this.imageHeight];
    }
}

export default DZITileSource;