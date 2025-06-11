/**
 * Performance Configuration
 * Centralized settings for optimizing the Interactive Art Diary
 */

const performanceConfig = {
    // OpenSeadragon viewer settings
    viewer: {
        // Tile loading optimization - FIXED for quality
        imageLoaderLimit: 12,            // Increased for faster tile loading
        maxImageCacheCount: 1000,        // Doubled cache for better quality
        minPixelRatio: 1.0,              // FIXED: Full quality from start
        smoothTileEdgesMinZoom: 0.5,     // Enable smoothing earlier
        alwaysBlend: false,              // FIXED: Disable to prevent blur

        // Force high quality tiles
        immediateRender: true,
        preserveViewport: true,
        visibilityRatio: 1.0,            // Load full visible area
        subPixelRendering: true,

        // Preload more aggressively
        preload: true,
        placeholderFillStyle: '#000000',

        // Animation settings for smooth zoom/pan
        animationTime: 0.5,
        springStiffness: 7.5,
        blendTime: 0,                    // FIXED: No blending delay
        flickEnabled: true,
        flickMinSpeed: 120,
        flickMomentum: 0.25,

        // Zoom settings
        zoomPerScroll: 1.15,
        zoomPerClick: 1.5,
        minZoomLevel: 0.3,
        maxZoomLevel: 10,
        defaultZoomLevel: 0.6,

        // Tile quality settings
        minZoomImageRatio: 0.8,          // Keep higher res tiles longer
        maxTilesPerFrame: 4,             // Load more tiles per frame
        tileRetryMax: 3,                 // Retry failed tiles
        tileRetryDelay: 200,

        // Image quality
        compositeOperation: 'source-over',
        imageSmoothingEnabled: false     // FIXED: Disable smoothing
    },

    // Tile generation settings
    tiles: {
        tileSize: 512,
        overlap: 2,
        quality: 95,                     // Increased quality
        format: 'jpeg',
        progressive: true,
        chromaSubsampling: '4:4:4'
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
        preloadPadding: 0.3              // More aggressive preloading
    },

    // Memory management
    memory: {
        maxCachedImages: 1000,           // Increased for quality
        maxCachedAudio: 20,
        gcInterval: 60000,               // Less aggressive GC
        lowMemoryThreshold: 50           // Lower threshold
    },

    // Network optimization
    network: {
        maxConcurrentRequests: 12,       // More parallel downloads
        retryAttempts: 3,
        retryDelay: 500,                 // Faster retries
        timeout: 30000,
        useCDN: true
    },

    // Device-specific settings
    mobile: {
        reduceQuality: false,
        maxZoomLevel: 8,
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

// Apply mobile optimizations
if (isMobile) {
    performanceConfig.viewer.imageLoaderLimit = 8;
    performanceConfig.viewer.maxImageCacheCount = 500;
    performanceConfig.hotspots.batchSize = 25;
}

// Apply low-end device optimizations
if (isLowEndDevice) {
    performanceConfig.viewer.minPixelRatio = 0.8;  // Still high quality
    performanceConfig.tiles.quality = 90;
    performanceConfig.viewer.animationTime = 0.3;
    performanceConfig.memory.maxCachedImages = 500;
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
    if (currentFPS < 30 && currentFPS > 0) {
        // Reduce quality for better performance
        performanceConfig.viewer.minPixelRatio = Math.max(0.8, performanceConfig.viewer.minPixelRatio - 0.1);
        performanceConfig.viewer.animationTime = Math.max(0.2, performanceConfig.viewer.animationTime - 0.1);
        console.log('Performance: Reducing quality settings for better FPS');
    } else if (currentFPS > 50) {
        // Can increase quality
        performanceConfig.viewer.minPixelRatio = Math.min(1.5, performanceConfig.viewer.minPixelRatio + 0.1);
        performanceConfig.viewer.animationTime = Math.min(0.8, performanceConfig.viewer.animationTime + 0.1);
    }
}