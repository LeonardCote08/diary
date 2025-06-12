/**
 * Performance Configuration - Optimized for pixel-perfect text clarity
 * Settings prioritize quality over performance for readable hand-drawn text
 */

const performanceConfig = {
    // OpenSeadragon viewer settings - ADAPTIVE FOR HYBRID TILES
    viewer: {
        // Tile loading optimization
        imageLoaderLimit: 10,              // Balanced loading
        maxImageCacheCount: 1200,          // Good cache for mixed formats
        minPixelRatio: 1.0,                // Force 1:1 pixel rendering
        smoothTileEdgesMinZoom: 3,         // Smooth edges only at very low zoom
        alwaysBlend: true,                 // Smooth transitions

        // Quality settings - Adaptive
        immediateRender: false,            // Wait for quality tiles
        preserveViewport: true,
        visibilityRatio: 1.5,              // Good preloading
        subPixelRendering: true,
        imageSmoothingEnabled: true,       // Will be toggled based on zoom

        // Preload settings
        preload: true,
        placeholderFillStyle: '#000000',

        // Animation settings
        animationTime: 0.4,                // Smooth animations
        springStiffness: 8,                // Responsive
        blendTime: 0.15,                   // Quick blending
        flickEnabled: true,
        flickMinSpeed: 120,
        flickMomentum: 0.3,

        // Zoom settings for detail inspection
        zoomPerScroll: 1.2,
        zoomPerClick: 2.0,
        minZoomLevel: 0.5,
        maxZoomLevel: 20,                  // High zoom for PNG detail
        defaultZoomLevel: 1,
        maxZoomPixelRatio: 10,             // Good pixel ratio limit

        // Tile quality settings
        minZoomImageRatio: 0.4,
        maxTilesPerFrame: 5,               // Balanced processing
        tileRetryMax: 3,
        tileRetryDelay: 300,

        // Rendering quality
        compositeOperation: 'source-over',
        smoothImageZoom: true,             // Will be toggled for PNG levels

        // Viewport constraints
        constrainDuringPan: true,
        wrapHorizontal: false,
        wrapVertical: false,

        // Navigation
        navigatorAutoResize: true,
        showNavigator: false,

        // Canvas rendering
        drawer: 'canvas',
        debugMode: false,
        canvas2dBackingStorePixelRatio: window.devicePixelRatio || 1
    },

    // Tile generation settings - HYBRID APPROACH
    tiles: {
        tileSize: 512,
        overlap: 2,
        jpegQuality: 95,                   // High quality JPEG for overview
        pngCompression: 9,                 // Maximum PNG compression
        format: 'hybrid',                  // Use both JPEG and PNG
        progressive: false,
        chromaSubsampling: null
    },

    // Hotspot rendering - OPTIMIZED FOR PERFORMANCE
    hotspots: {
        batchSize: 30,                     // Reduced batch size
        visibilityCheckInterval: 150,      // Less frequent checks
        renderDebounceTime: 50,            // More debouncing
        fadeInDuration: 200,
        preloadPadding: 0.1,               // Less aggressive preloading
        maxVisibleHotspots: 100,           // Limit visible hotspots
        minZoomForHotspots: 2              // Only show hotspots when zoomed in
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