/**
 * VIPS Configuration - Optimized for pixel-perfect text clarity
 * 
 * Using PNG format for lossless compression of hand-drawn art
 */

export default {
    // VIPS executable path (leave null for auto-detection)
    vipsPath: null,

    // Tile generation settings - OPTIMIZED FOR TEXT CLARITY
    tileSize: 512,        // Larger tiles = fewer seams, better quality
    overlap: 1,           // Minimal overlap for PNG (no blending artifacts)
    quality: 100,         // Not used for PNG, but kept for compatibility
    format: 'png',        // PNG for lossless compression

    // PNG specific settings
    pngCompression: 9,    // Maximum compression (smaller files)
    pngFilter: 'all',     // Try all PNG filters for best compression

    // Deep zoom settings
    depth: 'onepixel',    // Generate all levels down to 1 pixel
    skipLevels: 0,        // Generate all levels for smoothest zoom

    // Interpolation for resizing
    kernel: 'lanczos3',   // Highest quality for text preservation

    // Preview generation settings
    previewWidth: 2048,
    previewHeight: 2048,
    previewQuality: 95,   // JPEG for preview is fine
    previewFormat: 'jpg',

    // Performance settings
    concurrency: null,    // Use all CPU cores
    memoryLimit: null,    // Let VIPS manage memory

    // Advanced options for quality
    background: '0 0 0',  // Black background for transparency
    stripMetadata: true,  // Remove metadata to reduce file size
};