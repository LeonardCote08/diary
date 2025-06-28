/**
 * TileCascadeFix - Fixes OpenSeadragon 5.0.1 tile cascade performance bug
 * OPTIMIZED VERSION with caching
 */

let levelCache = new Map();
let lastCacheZoom = null;
let cacheTimeout = null;

export function applyTileCascadeFix(OpenSeadragon) {
    console.log('=== APPLYING OPTIMIZED TILE CASCADE FIX ===');

    if (!OpenSeadragon) {
        console.error('OpenSeadragon not provided - cannot apply tile cascade fix');
        return;
    }

    const original_getLevelsInterval = OpenSeadragon.TiledImage.prototype._getLevelsInterval;
    const original_updateLevels = OpenSeadragon.TiledImage.prototype._updateLevels;

    if (!original_getLevelsInterval) {
        console.error('_getLevelsInterval method not found - cannot apply fix');
        return;
    }

    // Optimized version with caching
    OpenSeadragon.TiledImage.prototype._getLevelsInterval = function () {
        const zoom = this.viewer.viewport.getZoom();

        // Check cache validity (zoom hasn't changed significantly)
        if (lastCacheZoom !== null &&
            Math.abs(zoom - lastCacheZoom) < 0.01 &&
            levelCache.has(this)) {
            return levelCache.get(this);
        }

        // Call original method
        const levels = original_getLevelsInterval.call(this);

        if (!levels || typeof levels.lowestLevel === 'undefined') {
            return levels;
        }

        // Only log significant changes
        if (!lastCacheZoom || Math.abs(zoom - lastCacheZoom) > 0.1) {
            console.log(`Zoom: ${zoom.toFixed(2)}, Original levels: ${levels.lowestLevel}-${levels.highestLevel}`);
        }

        // Apply optimizations
        let result = levels;
        if (zoom < 3.0) {
            const optimalLevel = Math.floor(Math.log2(zoom * 1024 / 256));
            const centerLevel = Math.max(8, Math.min(12, optimalLevel + 11));

            result = {
                lowestLevel: Math.max(8, centerLevel - 1),
                highestLevel: Math.min(14, centerLevel + 1)
            };

            if (result.highestLevel - result.lowestLevel > 2) {
                result.lowestLevel = result.highestLevel - 2;
            }
        }

        // Update cache
        levelCache.set(this, result);
        lastCacheZoom = zoom;

        // Clear cache after 100ms of no activity
        if (cacheTimeout) clearTimeout(cacheTimeout);
        cacheTimeout = setTimeout(() => {
            levelCache.clear();
            lastCacheZoom = null;
        }, 100);

        return result;
    };

    // Optimized _updateLevels
    if (original_updateLevels) {
        OpenSeadragon.TiledImage.prototype._updateLevels = function () {
            // Skip if animating
            if (this.viewer.isAnimating()) {
                return;
            }

            const result = original_updateLevels.call(this);

            const zoom = this.viewer.viewport.getZoom();
            if (zoom < 3.0 && this._tilesToDraw) {
                const allowedLevels = this._getLevelsInterval();
                this._tilesToDraw = this._tilesToDraw.filter(tile =>
                    tile.level >= allowedLevels.lowestLevel &&
                    tile.level <= allowedLevels.highestLevel
                );
            }

            return result;
        };
    }

    console.log('=== OPTIMIZED TILE CASCADE FIX APPLIED ===');
}

export function removeTileCascadeFix(OpenSeadragon) {
    // Clear cache
    levelCache.clear();
    lastCacheZoom = null;
    if (cacheTimeout) clearTimeout(cacheTimeout);

    // Restore original methods if needed
    if (OpenSeadragon && OpenSeadragon.TiledImage.prototype._original_getLevelsInterval) {
        OpenSeadragon.TiledImage.prototype._getLevelsInterval =
            OpenSeadragon.TiledImage.prototype._original_getLevelsInterval;
        delete OpenSeadragon.TiledImage.prototype._original_getLevelsInterval;
    }
}