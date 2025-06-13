/**
 * Performance Configuration - Optimized for perfect text clarity
 * Based on research recommendations for gigapixel hand-drawn images
 */

const performanceConfig = {
    // OpenSeadragon viewer settings - PIXEL-PERFECT PRIORITY
    viewer: {
        // Tile loading - optimized for 512x512 tiles
        imageLoaderLimit: 12,
        maxImageCacheCount: 2000,
        minPixelRatio: 1.0,
        smoothTileEdgesMinZoom: Infinity,  // Never smooth
        alwaysBlend: false,

        // Critical rendering settings
        immediateRender: true,
        preserveViewport: true,
        visibilityRatio: 1.0,
        subPixelRendering: false,
        imageSmoothingEnabled: false,  // CRITICAL

        // Preload settings
        preload: true,
        placeholderFillStyle: null,

        // Animation settings
        animationTime: 0.3,
        springStiffness: 10,
        blendTime: 0,
        flickEnabled: true,
        flickMinSpeed: 120,
        flickMomentum: 0.25,

        // Zoom settings
        zoomPerScroll: 1.3,
        zoomPerClick: 2.0,
        minZoomLevel: 0.5,
        maxZoomLevel: 50,
        defaultZoomLevel: 1,
        maxZoomPixelRatio: 5,

        // Tile quality settings
        minZoomImageRatio: 0.5,
        maxTilesPerFrame: 8,
        tileRetryMax: 5,
        tileRetryDelay: 200,

        // Rendering
        compositeOperation: null,
        smoothImageZoom: false,

        // Constraints
        constrainDuringPan: true,
        wrapHorizontal: false,
        wrapVertical: false,

        // Navigation
        navigatorAutoResize: true,
        showNavigator: false,

        // Canvas rendering
        useCanvas: true,
        debugMode: false
    },

    // Tile settings - based on research
    tiles: {
        tileSize: 512,      // Optimal for text clarity
        overlap: 8,         // Prevents text cut-off
        jpegQuality: 98,    // High quality
        pngCompression: 6,  // Balanced
        format: 'optimized' // PNG or JPEG 4:4:4
    },

    // Hotspot rendering
    hotspots: {
        batchSize: 50,
        visibilityCheckInterval: 100,
        renderDebounceTime: 30,
        fadeInDuration: 150,
        preloadPadding: 0.2,
        maxVisibleHotspots: 200,
        minZoomForHotspots: 1.5
    },

    // Audio settings
    audio: {
        preloadCount: 15,
        crossfadeDuration: 200,
        bufferSize: 15,
        html5PoolSize: 10,
        autoUnlock: true
    },

    // Viewport management
    viewport: {
        cacheEnabled: true,
        cacheTimeout: 30,
        updateDebounce: 16,
        preloadPadding: 0.5
    },

    // Memory management
    memory: {
        maxCachedImages: 1500,
        maxCachedAudio: 30,
        gcInterval: 90000,
        lowMemoryThreshold: 200
    },

    // Network
    network: {
        maxConcurrentRequests: 12,
        retryAttempts: 5,
        retryDelay: 300,
        timeout: 120000,
        useCDN: true
    },

    // Mobile settings
    mobile: {
        reduceQuality: false,  // Never compromise on quality
        maxZoomLevel: 30,
        touchSensitivity: 1.1,
        doubleTapDelay: 300
    },

    // Debug
    debug: {
        showFPS: false,
        showMetrics: false,
        logPerformance: false,
        warnThreshold: {
            fps: 24,
            renderTime: 150,
            visibleHotspots: 300
        }
    }
};

// Device detection
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const isLowEndDevice = navigator.hardwareConcurrency <= 2 || navigator.deviceMemory <= 2;
const isHighDPI = window.devicePixelRatio > 1;

// Apply minimal mobile optimizations
if (isMobile) {
    performanceConfig.viewer.imageLoaderLimit = 8;
    performanceConfig.viewer.maxImageCacheCount = 1000;
    performanceConfig.hotspots.batchSize = 30;
}

// Low-end device adjustments (without compromising quality)
if (isLowEndDevice) {
    performanceConfig.viewer.animationTime = 0.4;
    performanceConfig.memory.maxCachedImages = 800;
    performanceConfig.network.maxConcurrentRequests = 6;
}

export default performanceConfig;

// Get optimized settings
export function getOptimizedSettings() {
    return {
        ...performanceConfig,
        deviceProfile: {
            isMobile,
            isLowEndDevice,
            isHighDPI,
            cores: navigator.hardwareConcurrency || 2,
            memory: navigator.deviceMemory || 4,
            pixelRatio: window.devicePixelRatio || 1,
            connection: navigator.connection?.effectiveType || 'unknown'
        }
    };
}

// Dynamic performance adjustment (never compromise rendering quality)
export function adjustSettingsForPerformance(currentFPS) {
    if (currentFPS < 24 && currentFPS > 0) {
        // Only reduce non-quality settings
        performanceConfig.viewer.imageLoaderLimit = Math.max(4, performanceConfig.viewer.imageLoaderLimit - 2);
        performanceConfig.viewer.animationTime = Math.min(0.5, performanceConfig.viewer.animationTime + 0.1);
        console.log('Performance: Reduced non-quality settings');
    } else if (currentFPS > 45) {
        // Restore settings
        performanceConfig.viewer.imageLoaderLimit = Math.min(12, performanceConfig.viewer.imageLoaderLimit + 1);
        performanceConfig.viewer.animationTime = Math.max(0.3, performanceConfig.viewer.animationTime - 0.05);
    }

    // Never change these critical settings
    performanceConfig.viewer.imageSmoothingEnabled = false;
    performanceConfig.viewer.smoothTileEdgesMinZoom = Infinity;
    performanceConfig.viewer.subPixelRendering = false;
}