/**
 * HybridTileSource - Enhanced tile source for optimal text clarity
 * Manages JPEG/PNG transitions and rendering quality
 */

import OpenSeadragon from 'openseadragon';

class HybridTileSource {
    /**
     * Create a hybrid tile source with automatic format detection
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
     * Create from hybrid info with enhanced tile URL generation
     */
    static async createFromHybridInfo(baseUrl, hybridInfo) {
        try {
            // Create custom tile source
            const tileSource = {
                width: hybridInfo.imageWidth,
                height: hybridInfo.imageHeight,
                tileSize: hybridInfo.tileSize,
                overlap: hybridInfo.overlap,
                minLevel: 0,
                maxLevel: hybridInfo.totalLevels - 1,

                getTileUrl: function (level, x, y) {
                    // Use PNG for readable levels, JPEG for overview
                    const extension = level >= hybridInfo.pngStartLevel ? 'png' : 'jpg';
                    return `${baseUrl}/zebra_files/${level}/${x}_${y}.${extension}`;
                },

                // Enhanced properties
                tileFormat: 'hybrid',
                jpegLevels: hybridInfo.jpegLevels,
                pngStartLevel: hybridInfo.pngStartLevel,
                pngLevels: hybridInfo.pngLevels,

                // Add quality hints
                getTileQuality: function (level) {
                    return level >= hybridInfo.pngStartLevel ? 'lossless' : 'high';
                }
            };

            console.log('Enhanced hybrid tile source created:', {
                totalLevels: hybridInfo.totalLevels,
                jpegLevels: `0-${hybridInfo.jpegLevels - 1}`,
                pngLevels: `${hybridInfo.pngStartLevel}-${hybridInfo.totalLevels - 1}`,
                strategy: hybridInfo.strategy || 'standard'
            });

            return tileSource;
        } catch (error) {
            console.error('Failed to create hybrid tile source:', error);
            return null;
        }
    }

    /**
     * Configure viewer for optimal rendering based on tile format
     */
    static configureViewer(viewer, tileSource) {
        if (!tileSource || tileSource.tileFormat !== 'hybrid') return;

        const pngStartLevel = tileSource.pngStartLevel;

        // Calculate zoom level from viewport
        const getZoomLevel = () => {
            const zoom = viewer.viewport.getZoom();
            const imageWidth = viewer.source.dimensions.x;
            const containerWidth = viewer.container.clientWidth;
            return Math.floor(Math.log2(zoom * imageWidth / containerWidth));
        };

        // Configure initial rendering
        const configureRendering = () => {
            const context = viewer.drawer.context;
            if (!context) return;

            const currentLevel = getZoomLevel();
            const isPngLevel = currentLevel >= pngStartLevel;

            // Set rendering mode based on current zoom
            if (isPngLevel) {
                // PNG: pixel-perfect rendering
                context.imageSmoothingEnabled = false;
                viewer.drawer.imageSmoothingEnabled = false;
            } else {
                // JPEG: high-quality smoothing
                context.imageSmoothingEnabled = true;
                context.imageSmoothingQuality = 'high';
                viewer.drawer.imageSmoothingEnabled = true;
            }
        };

        // Apply initial configuration
        viewer.addHandler('open', configureRendering);

        // Update rendering on zoom change
        viewer.addHandler('zoom', (event) => {
            configureRendering();

            // Force redraw for quality change
            const currentLevel = getZoomLevel();
            const isPngLevel = currentLevel >= pngStartLevel;

            if (viewer._lastRenderMode !== isPngLevel) {
                viewer._lastRenderMode = isPngLevel;
                viewer.forceRedraw();
            }
        });

        // Configure tile rendering
        viewer.addHandler('tile-drawing', (event) => {
            const tile = event.tile;
            const level = tile.level;
            const context = event.context;

            // Apply rendering settings per tile
            if (level >= pngStartLevel) {
                // PNG tile: disable smoothing
                context.imageSmoothingEnabled = false;
                if (event.tile.element) {
                    event.tile.element.style.imageRendering = 'pixelated';
                }
            } else {
                // JPEG tile: high-quality smoothing
                context.imageSmoothingEnabled = true;
                context.imageSmoothingQuality = 'high';
                if (event.tile.element) {
                    event.tile.element.style.imageRendering = 'auto';
                }
            }
        });

        // Enhance tile loaded handling
        viewer.world.addHandler('add-item', function (event) {
            const tiledImage = event.item;

            tiledImage.addHandler('tile-loaded', function (event) {
                const tile = event.tile;
                const level = tile.level;

                // Get tile URL
                const url = tile.getUrl ? tile.getUrl() : tile.url || '';

                if (tile.element) {
                    if (url.includes('.png') || level >= pngStartLevel) {
                        // PNG: pixel-perfect
                        tile.element.style.imageRendering = 'pixelated';
                        tile.element.style.filter = 'none';
                    } else {
                        // JPEG: optimized
                        tile.element.style.imageRendering = 'auto';
                        tile.element.style.filter = 'none';
                    }

                    // Hardware acceleration
                    tile.element.style.transform = 'translateZ(0)';
                    tile.element.style.willChange = 'transform';
                }
            });
        });

        // Log current rendering mode
        viewer.addHandler('animation-finish', () => {
            const currentLevel = getZoomLevel();
            const renderMode = currentLevel >= pngStartLevel ? 'PNG (pixel-perfect)' : 'JPEG (smooth)';
            console.log(`Rendering mode: ${renderMode} at level ${currentLevel}`);
        });
    }

    /**
     * Create pure PNG tile source for maximum quality
     */
    static createPngOnlySource(dziUrl) {
        // For pure PNG tiles, we just need to ensure proper rendering
        return {
            type: 'legacy-image-pyramid',
            url: dziUrl,
            renderPixelated: true
        };
    }
}

export default HybridTileSource;