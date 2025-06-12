/**
 * VIPS Configuration - Optimized for high-quality JPEG tiles
 * 
 * Using JPEG with maximum quality settings for sharp images
 */

export default {
    // VIPS executable path (leave null for auto-detection)
    vipsPath: null,

    // Tile generation settings - HIGH QUALITY JPEG
    tileSize: 512,        // Larger tiles = better quality, fewer requests
    overlap: 2,           // Small overlap to prevent seams
    quality: 95,          // Very high JPEG quality
    format: 'jpg',        // JPEG for reasonable file sizes

    // JPEG specific settings
    jpegSubsample: 'off', // Disable chroma subsampling (4:4:4)
    jpegOptimize: true,   // Optimize Huffman coding
    jpegProgressive: false, // Non-progressive for better quality

    // Deep zoom settings
    depth: 'onepixel',    // Generate all levels down to 1 pixel
    skipLevels: 0,        // Generate all levels

    // Interpolation for resizing
    kernel: 'lanczos3',   // High quality for all content

    // Preview generation settings
    previewWidth: 2048,
    previewHeight: 2048,
    previewQuality: 95,
    previewFormat: 'jpg',

    // Performance settings
    concurrency: null,    // Use all CPU cores
    memoryLimit: null,    // Let VIPS manage memory

    // Advanced options
    background: '0 0 0',  // Black background
    stripMetadata: true,  // Remove metadata to reduce file size
};