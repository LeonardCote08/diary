/**
 * VIPS Configuration
 * 
 * This file is used to configure VIPS tile generation settings
 * If VIPS is not in your PATH, you can specify the exact path here
 */

export default {
    // VIPS executable path (leave null for auto-detection)
    vipsPath: null,

    // Tile generation settings - OPTIMIZED FOR QUALITY
    tileSize: 256,        // Smaller tiles = better quality at deep zoom
    overlap: 2,           // More overlap = no seams at any zoom level
    quality: 95,          // Higher quality for text readability
    format: 'jpg',        // JPEG for photos, PNG for graphics with text

    // Deep zoom settings
    depth: 'auto',        // Auto-calculate optimal zoom levels
    skipLevels: 0,        // Generate all levels for smoothest zoom

    // Preview generation settings
    previewWidth: 2048,
    previewHeight: 2048,
    previewQuality: 90,

    // Performance settings
    concurrency: null,    // Use all CPU cores
    memoryLimit: null,    // Let VIPS manage memory

    // Advanced options for quality
    compression: 'jpeg',  // Use JPEG compression
    subsample: 'off',     // Disable chroma subsampling for better text
};