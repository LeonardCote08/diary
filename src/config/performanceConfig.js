/**
 * Performance Configuration - Optimized for pixel-perfect text clarity
 * Settings prioritize quality over performance for readable hand-drawn text
 */

const performanceConfig = {
    // OpenSeadragon viewer settings - PIXEL-PERFECT QUALITY
    viewer: {
        // Tile loading optimization - Maximum quality
        imageLoaderLimit: 12,              // Balanced for PNG tiles
        maxImageCacheCount: 1500,          // Large cache for PNG tiles
        minPixelRatio: 1.0,                // Force 1:1 pixel rendering
        smoothTileEdgesMinZoom: Infinity,  // Never smooth edges
        alwaysBlend: false,                // No blending for sharper tiles

        // CRITICAL: Force pixel-perfect rendering
        immediateRender: true,             // Render immediately at full quality
        preserveViewport: true,
        visibilityRatio: 1.5,              // Preload more off-screen tiles
        subPixelRendering: false,          // Disable for sharp pixels
        imageSmoothingEnabled: false,      // CRITICAL: No smoothing

        // Preload settings
        preload: true,
        placeholderFillStyle: '#000000',

        // Animation settings - Smooth but not blurry
        animationTime: 0.4,                // Slightly slower for quality
        springStiffness: 8,                // Less bouncy
        blendTime: 0,                      // No blending
        flickEnabled: true,
        flickMinSpeed: 120,
        flickMomentum: 0.3,

        // Zoom settings for deep inspection
        zoomPerScroll: 1.15,               // Finer zoom control
        zoomPerClick: 1.5,
        minZoomLevel: 0.5,
        maxZoomLevel: 30,                  // Allow extreme zoom
        defaultZoomLevel: 1,
        maxZoomPixelRatio: Infinity,       // No limit on zoom quality

        // Tile quality settings
        minZoomImageRatio: 0.3,            // Keep high res tiles longer
        maxTilesPerFrame: 6,               // Balanced for PNG
        tileRetryMax: 5,
        tileRetryDelay: 200,

        // Rendering quality
        compositeOperation: 'source-over',
        smoothImageZoom: false,            // No smoothing during zoom

        // Viewport constraints
        constrainDuringPan: true,
        wrapHorizontal: false,
        wrapVertical: false,

        // Navigation
        navigatorAutoResize: true,
        showNavigator: false,              // Hide for performance

        // Canvas rendering
        drawer: 'canvas',                  // Use canvas drawer
        debugMode: false,
        canvas2dBackingStorePixelRatio: 1  // Force 1:1 pixel ratio
    },

    // Tile generation settings - Updated for PNG
    tiles: {
        tileSize: 512,
        overlap: 1,
        quality: 100,                      // Not used for PNG
        format: 'png',                     // Lossless format
        progressive: false,                // Not applicable to PNG
        chromaSubsampling: null            // Not applicable to PNG
    },

    // Hotspot rendering
    hotspots: {
        batchSize: 50,
        visibilityCheckInterval: 100,
        renderDebounceTime: 16,
        fadeInDuration: 200,
        preloadPadding: 0.2,
        maxVisibleHotspots: 200
    },

    // Audio engine
    audio: {
        preloadCount: 10,
        crossfadeDuration: 200,
        bufferSize: 10,
        html5PoolSize: 10,
        autoUnlock: true
    },

    // Viewport management
    viewport: {
        cacheEnabled: true,
        cacheTimeout: 50,
        updateDebounce: 16,
        preloadPadding: 0.3
    },

    // Memory management - Adjusted for PNG tiles
    memory: {
        maxCachedImages: 800,              // Reduced due to larger PNG files
        maxCachedAudio: 20,
        gcInterval: 60000,
        lowMemoryThreshold: 100            // Higher threshold for PNG
    },

    // Network optimization
    network: {
        maxConcurrentRequests: 8,          // Reduced for larger PNG files
        retryAttempts: 3,
        retryDelay: 500,
        timeout: 60000,                    // Longer timeout for PNG
        useCDN: true
    },

    // Device-specific settings
    mobile: {
        reduceQuality: false,              // Keep quality on mobile
        maxZoomLevel: 15,                  // Still allow good zoom on mobile
        touchSensitivity: 1.2,
        doubleTapDelay: 300
    },

    // Debug and monitoring
    debug: {
        showFPS: false,
        showMetrics: false,
        logPerformance: false,
        warnThreshold: {
            fps: 30,
            renderTime: 100,
            visibleHotspots: 200
        }
    }
};

// Device detection and optimization
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const isLowEndDevice = navigator.hardwareConcurrency <= 2 || navigator.deviceMemory <= 2;

// Apply mobile optimizations (minimal quality reduction)
if (isMobile) {
    performanceConfig.viewer.imageLoaderLimit = 6;
    performanceConfig.viewer.maxImageCacheCount = 500;
    performanceConfig.hotspots.batchSize = 25;
    // Keep pixel-perfect rendering even on mobile
    performanceConfig.viewer.imageSmoothingEnabled = false;
    performanceConfig.viewer.minPixelRatio = 1.0;
}

// Apply low-end device optimizations
if (isLowEndDevice) {
    performanceConfig.tiles.quality = 100;  // Keep PNG quality
    performanceConfig.viewer.animationTime = 0.5;
    performanceConfig.memory.maxCachedImages = 400;
    // Still maintain pixel-perfect rendering
    performanceConfig.viewer.imageSmoothingEnabled = false;
}

export default performanceConfig;

// Helper function to get device-optimized settings
export function getOptimizedSettings() {
    return {
        ...performanceConfig,
        deviceProfile: {
            isMobile,
            isLowEndDevice,
            cores: navigator.hardwareConcurrency || 2,
            memory: navigator.deviceMemory || 4,
            connection: navigator.connection?.effectiveType || 'unknown'
        }
    };
}

// Function to dynamically adjust settings based on performance
export function adjustSettingsForPerformance(currentFPS) {
    // Never compromise on image smoothing
    if (currentFPS < 30 && currentFPS > 0) {
        // Reduce other settings but keep quality
        performanceConfig.viewer.animationTime = Math.max(0.2, performanceConfig.viewer.animationTime - 0.1);
        performanceConfig.viewer.imageLoaderLimit = Math.max(4, performanceConfig.viewer.imageLoaderLimit - 1);
        console.log('Performance: Adjusting settings for better FPS (quality maintained)');
    } else if (currentFPS > 50) {
        // Can increase other settings
        performanceConfig.viewer.animationTime = Math.min(0.4, performanceConfig.viewer.animationTime + 0.05);
        performanceConfig.viewer.imageLoaderLimit = Math.min(12, performanceConfig.viewer.imageLoaderLimit + 1);
    }

    // NEVER change these quality settings
    performanceConfig.viewer.imageSmoothingEnabled = false;
    performanceConfig.viewer.minPixelRatio = 1.0;
    performanceConfig.viewer.smoothTileEdgesMinZoom = Infinity;
}