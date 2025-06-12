/**
 * HybridTileSource - Custom tile source for mixed JPEG/PNG tiles
 * Automatically loads JPEG for overview levels and PNG for detail levels
 */

import OpenSeadragon from 'openseadragon';

class HybridTileSource {
    /**
     * Create a hybrid tile source with automatic format detection
     * @param {string} baseUrl - Base URL to the tiles folder
     * @param {Object} hybridInfo - Information about the hybrid tile structure
     */
    static async createFromHybridInfo(baseUrl, hybridInfo) {
        try {
            // Load hybrid info if not provided
            if (!hybridInfo) {
                const infoUrl = baseUrl + '/hybrid-info.json';
                const response = await fetch(infoUrl);
                hybridInfo = await response.json();
            }

            // Create custom tile source
            const tileSource = {
                width: hybridInfo.imageWidth,
                height: hybridInfo.imageHeight,
                tileSize: hybridInfo.tileSize,
                overlap: hybridInfo.overlap,
                minLevel: 0,
                maxLevel: hybridInfo.totalLevels - 1,

                getTileUrl: function (level, x, y) {
                    // Use PNG for high zoom levels, JPEG for low levels
                    const extension = level >= hybridInfo.pngStartLevel ? 'png' : 'jpg';
                    return `${baseUrl}/zebra_files/${level}/${x}_${y}.${extension}`;
                },

                // Custom properties
                tileFormat: 'hybrid',
                jpegLevels: hybridInfo.jpegLevels,
                pngStartLevel: hybridInfo.pngStartLevel,
                pngLevels: hybridInfo.pngLevels
            };

            console.log('Hybrid tile source created:', {
                totalLevels: hybridInfo.totalLevels,
                jpegLevels: `0-${hybridInfo.jpegLevels - 1}`,
                pngLevels: `${hybridInfo.pngStartLevel}-${hybridInfo.totalLevels - 1}`
            });

            return tileSource;
        } catch (error) {
            console.error('Failed to create hybrid tile source:', error);
            // Fallback to standard DZI
            return null;
        }
    }

    /**
     * Create from standard DZI with automatic detection
     */
    static async createFromDZI(dziUrl) {
        try {
            const baseUrl = dziUrl.substring(0, dziUrl.lastIndexOf('/'));
            const hybridInfoUrl = baseUrl + '/hybrid-info.json';

            // Check if hybrid info exists
            const response = await fetch(hybridInfoUrl);
            if (response.ok) {
                const hybridInfo = await response.json();
                return await this.createFromHybridInfo(baseUrl, hybridInfo);
            }
        } catch (error) {
            console.log('No hybrid info found, using standard tiles');
        }

        // Fallback to standard DZI
        return null;
    }

    /**
     * Configure viewer for optimal hybrid tile performance
     */
    static configureViewer(viewer, tileSource) {
        if (!tileSource || tileSource.tileFormat !== 'hybrid') return;

        const pngStartLevel = tileSource.pngStartLevel;

        // Add handler to manage quality based on zoom level
        viewer.addHandler('zoom', (event) => {
            const currentLevel = Math.floor(
                Math.log2(event.zoom * viewer.source.dimensions.x / viewer.container.clientWidth)
            );

            const context = viewer.drawer.context;
            if (context) {
                if (currentLevel >= pngStartLevel) {
                    // PNG levels: pixel-perfect
                    context.imageSmoothingEnabled = false;
                    context.imageSmoothingQuality = 'low';
                } else {
                    // JPEG levels: smooth
                    context.imageSmoothingEnabled = true;
                    context.imageSmoothingQuality = 'high';
                }
            }
        });

        // Log tile loading for debugging
        viewer.world.addHandler('add-item', function (event) {
            const tiledImage = event.item;
            tiledImage.addHandler('tile-loaded', function (event) {
                const tile = event.tile;
                const url = tile.url;
                if (url.includes('.png')) {
                    tile.element.style.imageRendering = 'pixelated';
                } else {
                    tile.element.style.imageRendering = 'auto';
                }
            });
        });
    }
}

export default HybridTileSource;