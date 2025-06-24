/**
 * TileCascadeFix - Fixes OpenSeadragon 5.0.1 tile cascade performance bug
 * Uses _getLevelsInterval to control which pyramid levels are loaded
 */

export function applyTileCascadeFix(OpenSeadragon) {
    console.log('=== ATTEMPTING TO APPLY TILE CASCADE FIX ===');

    if (!OpenSeadragon) {
        console.error('OpenSeadragon not provided - cannot apply tile cascade fix');
        return;
    }

    // Override BOTH methods for complete control
    const original_getLevelsInterval = OpenSeadragon.TiledImage.prototype._getLevelsInterval;
    const original_updateLevels = OpenSeadragon.TiledImage.prototype._updateLevels;

    if (!original_getLevelsInterval) {
        console.error('_getLevelsInterval method not found - cannot apply fix');
        return;
    }

    // First override: Control which levels are calculated
    OpenSeadragon.TiledImage.prototype._getLevelsInterval = function () {
        const levels = original_getLevelsInterval.call(this);

        if (!levels || typeof levels.lowestLevel === 'undefined') {
            return levels;
        }

        const zoom = this.viewer.viewport.getZoom();
        console.log(`Zoom: ${zoom.toFixed(2)}, Original levels: ${levels.lowestLevel}-${levels.highestLevel}`);

        // At low zoom, limit but don't break tile coverage
        if (zoom < 3.0) {
            // More generous level calculation to avoid dark areas
            const optimalLevel = Math.floor(Math.log2(zoom * 1024 / 256)); // Adjusted for 1024px tiles
            const centerLevel = Math.max(8, Math.min(12, optimalLevel + 11));

            // Allow 3 levels instead of 2 to ensure coverage
            levels.lowestLevel = Math.max(8, centerLevel - 1);
            levels.highestLevel = Math.min(14, centerLevel + 1);

            // But still limit total levels
            if (levels.highestLevel - levels.lowestLevel > 2) {
                levels.lowestLevel = levels.highestLevel - 2;
            }

            console.log(`OPTIMIZED to levels: ${levels.lowestLevel}-${levels.highestLevel} at zoom ${zoom.toFixed(2)}`);
        }

        return levels;
    };

    // Second override: Prevent loading of excluded levels
    if (original_updateLevels) {
        OpenSeadragon.TiledImage.prototype._updateLevels = function () {
            // Call original
            const result = original_updateLevels.call(this);

            // Remove tiles from levels we don't want
            const zoom = this.viewer.viewport.getZoom();
            if (zoom < 3.0 && this._tilesToDraw) {
                const allowedLevels = this._getLevelsInterval();

                // Filter out tiles from disallowed levels
                this._tilesToDraw = this._tilesToDraw.filter(tile =>
                    tile.level >= allowedLevels.lowestLevel &&
                    tile.level <= allowedLevels.highestLevel
                );
            }

            return result;
        };
    }

    console.log('=== TILE CASCADE FIX APPLIED SUCCESSFULLY ===');
}
export function removeTileCascadeFix(OpenSeadragon) {
    // Restore original method if needed
    if (OpenSeadragon && OpenSeadragon.TiledImage.prototype._original_getLevelsInterval) {
        OpenSeadragon.TiledImage.prototype._getLevelsInterval =
            OpenSeadragon.TiledImage.prototype._original_getLevelsInterval;
        delete OpenSeadragon.TiledImage.prototype._original_getLevelsInterval;
    }
}