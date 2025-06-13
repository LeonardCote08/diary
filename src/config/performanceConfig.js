/**
 * Performance Configuration - Optimized for text clarity
 * Prioritizes readability over loading speed
 */

const performanceConfig = {
    // OpenSeadragon viewer settings - QUALITY FIRST
    viewer: {
        // Tile loading - increased for better coverage
        imageLoaderLimit: 16,              // More concurrent loads
        maxImageCacheCount: 2000,          // Large cache for tiles
        minPixelRatio: 1.0,                // Always 1:1 pixels
        smoothTileEdgesMinZoom: Infinity,  // Never smooth edges
        alwaysBlend: false,                // Disable blending for sharpness

        // Quality settings - MAXIMUM
        immediateRender: true,             // Render immediately
        preserveViewport: true,
        visibilityRatio: 2.0,              // Load more tiles ahead
        subPixelRendering: false,          // Disable for pixel-perfect
        imageSmoothingEnabled: false,      // Critical for text

        // Preload settings
        preload: true,
        placeholderFillStyle: '#f0f0f0',

        // Animation settings - faster for responsiveness
        animationTime: 0.3,
        springStiffness: 10,
        blendTime: 0,                      // No blending
        flickEnabled: true,
        flickMinSpeed: 120,
        flickMomentum: 0.25,

        // Zoom settings for text inspection
        zoomPerScroll: 1.3,
        zoomPerClick: 2.0,
        minZoomLevel: 0.5,
        maxZoomLevel: 50,                  // Very high zoom
        defaultZoomLevel: 1,
        maxZoomPixelRatio: Infinity,       // No limit

        // Tile quality settings
        minZoomImageRatio: 0.5,
        maxTilesPerFrame: 8,
        tileRetryMax: 5,
        tileRetryDelay: 200,

        // Rendering - pixel perfect
        compositeOperation: 'source-over',
        smoothImageZoom: false,            // Never smooth

        // Constraints
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

    // Tile settings - for generation scripts
    tiles: {
        tileSize: 256,                     // Standard size for better coverage
        overlap: 1,
        jpegQuality: 95,
        pngCompression: 6,                 // Balanced compression
        format: 'hybrid'                   // Use both JPEG and PNG
    },

    // Hotspot rendering
    hotspots: {
        batchSize: 50,
        visibilityCheckInterval: 100,
        renderDebounceTime: 30,
        fadeInDuration: 150,
        preloadPadding: 0.2,
        maxVisibleHotspots: 200,
        minZoomForHotspots: 1.5            // Show earlier
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
        preloadPadding: 0.5                // More aggressive preload
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
        timeout: 90000,
        useCDN: true
    },

    // Mobile settings - maintain quality
    mobile: {
        reduceQuality: false,
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

// Apply mobile optimizations (minimal)
if (isMobile) {
    performanceConfig.viewer.imageLoaderLimit = 8;
    performanceConfig.viewer.maxImageCacheCount = 800;
    performanceConfig.hotspots.batchSize = 30;
    // NEVER compromise on smoothing settings
}

// Low-end device adjustments
if (isLowEndDevice) {
    performanceConfig.viewer.animationTime = 0.4;
    performanceConfig.memory.maxCachedImages = 600;
    performanceConfig.network.maxConcurrentRequests = 6;
}

// High DPI screen adjustments
if (isHighDPI) {
    performanceConfig.viewer.minPixelRatio = window.devicePixelRatio;
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

// Dynamic performance adjustment (never compromise quality)
export function adjustSettingsForPerformance(currentFPS) {
    if (currentFPS < 24 && currentFPS > 0) {
        // Reduce other settings but NEVER touch image quality
        performanceConfig.viewer.imageLoaderLimit = Math.max(4, performanceConfig.viewer.imageLoaderLimit - 2);
        performanceConfig.viewer.animationTime = Math.min(0.5, performanceConfig.viewer.animationTime + 0.1);
        console.log('Performance: Reduced non-quality settings');
    } else if (currentFPS > 45) {
        // Restore settings
        performanceConfig.viewer.imageLoaderLimit = Math.min(16, performanceConfig.viewer.imageLoaderLimit + 1);
        performanceConfig.viewer.animationTime = Math.max(0.3, performanceConfig.viewer.animationTime - 0.05);
    }

    // CRITICAL: Never change these
    performanceConfig.viewer.imageSmoothingEnabled = false;
    performanceConfig.viewer.minPixelRatio = isHighDPI ? window.devicePixelRatio : 1.0;
    performanceConfig.viewer.smoothTileEdgesMinZoom = Infinity;
    performanceConfig.viewer.subPixelRendering = false;
}