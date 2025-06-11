/**
 * Performance Configuration
 * Centralized settings for optimizing the Interactive Art Diary
 * Based on Deji's scalability and performance requirements
 */

const performanceConfig = {
    // OpenSeadragon viewer settings
    viewer: {
        // Tile loading optimization
        imageLoaderLimit: 8,             // Concurrent tile downloads
        maxImageCacheCount: 500,         // Maximum cached tiles
        minPixelRatio: 0.5,              // Initial low quality for fast load
        smoothTileEdgesMinZoom: 1.5,     // Smooth edges threshold
        alwaysBlend: true,               // Always blend for smoothness

        // Animation settings for smooth zoom/pan
        animationTime: 0.5,              // Smooth but responsive
        springStiffness: 7.5,            // Natural motion feel
        blendTime: 0.3,                  // Smooth tile transitions
        flickEnabled: true,              // Natural touch gestures
        flickMinSpeed: 120,
        flickMomentum: 0.25,

        // Zoom settings
        zoomPerScroll: 1.15,             // 15% per scroll for smoothness
        zoomPerClick: 1.5,               // 50% per click
        minZoomLevel: 0.3,               // See full artwork
        maxZoomLevel: 10,                // Deep zoom capability
        defaultZoomLevel: 0.6,           // Start zoomed out

        // Performance flags
        immediateRender: true,           // No delay on initial render
        preserveViewport: true,          // Maintain position on resize
        visibilityRatio: 0.8,            // Preload nearby tiles
        subPixelRendering: true          // Sharper image quality
    },

    // Tile generation settings
    tiles: {
        tileSize: 512,                   // Larger tiles = fewer requests
        overlap: 2,                      // Seamless edges
        quality: 90,                     // Balance quality/size
        format: 'jpeg',                  // Universal support
        progressive: true,               // Progressive loading
        chromaSubsampling: '4:4:4'       // Better color quality
    },

    // Hotspot rendering
    hotspots: {
        batchSize: 50,                   // Load hotspots in batches
        visibilityCheckInterval: 100,    // ms between visibility checks
        renderDebounceTime: 16,          // ~60fps rendering
        fadeInDuration: 200,             // ms for hotspot fade in
        preloadPadding: 0.2,             // 20% viewport padding
        maxVisibleHotspots: 200          // Performance warning threshold
    },

    // Audio engine
    audio: {
        preloadCount: 10,                // Preload nearby audio files
        crossfadeDuration: 200,          // ms for smooth transitions
        bufferSize: 10,                  // Cached audio files
        html5PoolSize: 10,               // Howler.js HTML5 audio pool
        autoUnlock: true                 // Handle mobile restrictions
    },

    // Viewport management
    viewport: {
        cacheEnabled: true,              // Cache viewport calculations
        cacheTimeout: 50,                // ms cache validity
        updateDebounce: 16,              // ms debounce for updates
        preloadPadding: 0.2              // Extra area for preloading
    },

    // Memory management
    memory: {
        maxCachedImages: 500,            // Limit tile cache
        maxCachedAudio: 20,              // Limit audio cache
        gcInterval: 30000,               // Garbage collection interval (ms)
        lowMemoryThreshold: 100          // MB before reducing quality
    },

    // Network optimization
    network: {
        maxConcurrentRequests: 8,        // Parallel downloads
        retryAttempts: 3,                // Failed request retries
        retryDelay: 1000,                // ms between retries
        timeout: 30000,                  // Request timeout (ms)
        useCDN: true                     // Enable CDN features
    },

    // Device-specific settings
    mobile: {
        reduceQuality: false,            // Keep quality on mobile
        maxZoomLevel: 8,                 // Slightly lower max zoom
        touchSensitivity: 1.2,           // More responsive touch
        doubleTapDelay: 300              // ms for double tap detection
    },

    // Debug and monitoring
    debug: {
        showFPS: false,                  // FPS counter
        showMetrics: false,              // Performance metrics
        logPerformance: false,           // Console performance logs
        warnThreshold: {
            fps: 30,                     // Warn if FPS drops below
            renderTime: 100,             // Warn if render takes > ms
            visibleHotspots: 200         // Warn if too many visible
        }
    }
};

// Device detection and optimization
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const isLowEndDevice = navigator.hardwareConcurrency <= 2 || navigator.deviceMemory <= 2;

// Apply mobile optimizations
if (isMobile) {
    performanceConfig.viewer.imageLoaderLimit = 4;
    performanceConfig.viewer.maxImageCacheCount = 200;
    performanceConfig.hotspots.batchSize = 25;
}

// Apply low-end device optimizations
if (isLowEndDevice) {
    performanceConfig.viewer.minPixelRatio = 0.3;
    performanceConfig.tiles.quality = 80;
    performanceConfig.viewer.animationTime = 0.3;
    performanceConfig.memory.maxCachedImages = 200;
}

// Export configuration
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
        performanceConfig.viewer.minPixelRatio = Math.max(0.3, performanceConfig.viewer.minPixelRatio - 0.1);
        performanceConfig.viewer.animationTime = Math.max(0.2, performanceConfig.viewer.animationTime - 0.1);
        console.log('Performance: Reducing quality settings for better FPS');
    } else if (currentFPS > 50) {
        // Can increase quality
        performanceConfig.viewer.minPixelRatio = Math.min(1, performanceConfig.viewer.minPixelRatio + 0.1);
        performanceConfig.viewer.animationTime = Math.min(0.8, performanceConfig.viewer.animationTime + 0.1);
    }
}