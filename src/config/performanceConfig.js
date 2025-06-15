/**
 * Performance Configuration - Optimized for smooth zoom and pixel-perfect clarity
 * Balances animation fluidity with text readability
 */

const performanceConfig = {
    // OpenSeadragon viewer settings
    viewer: {
        // Tile loading
        imageLoaderLimit: 10,
        maxImageCacheCount: 1500,
        minPixelRatio: 0.9,
        smoothTileEdgesMinZoom: 1.5,
        alwaysBlend: true,

        // Rendering settings - start with smoothing for better animations
        immediateRender: false,
        preserveViewport: true,
        visibilityRatio: 0.9,
        subPixelRendering: true,
        imageSmoothingEnabled: true,

        // Preload settings
        preload: true,
        placeholderFillStyle: '#000000',

        // Animation settings - smoother values
        animationTime: 0.5,
        springStiffness: 7,
        blendTime: 0.1,
        flickEnabled: true,
        flickMinSpeed: 120,
        flickMomentum: 0.25,

        // Zoom settings
        zoomPerScroll: 1.3,
        zoomPerClick: 2.0,
        minZoomLevel: 0.5,
        maxZoomLevel: 40,
        defaultZoomLevel: 1,
        maxZoomPixelRatio: 4,

        // Tile quality settings
        minZoomImageRatio: 0.8,
        maxTilesPerFrame: 6,
        tileRetryMax: 5,
        tileRetryDelay: 200,

        // Rendering
        compositeOperation: null,
        smoothImageZoom: true,

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

    // Tile settings
    tiles: {
        tileSize: 256,      // Back to standard size for better performance
        overlap: 2,         // Minimal overlap
        jpegQuality: 95,    // High quality
        pngCompression: 6,  // Balanced
        format: 'jpeg'      // JPEG for smaller files
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
        maxCachedImages: 1200,
        maxCachedAudio: 30,
        gcInterval: 90000,
        lowMemoryThreshold: 200
    },

    // Network
    network: {
        maxConcurrentRequests: 10,
        retryAttempts: 5,
        retryDelay: 300,
        timeout: 120000,
        useCDN: true
    },

    // Mobile settings
    mobile: {
        reduceQuality: false,
        maxZoomLevel: 30,
        touchSensitivity: 1.1,
        doubleTapDelay: 300
    },

    // Render optimization settings
    renderOptimization: {
        enableAdaptiveRendering: true,
        animationEndDelay: 150,
        pixelPerfectDelay: 50,
        zoomThreshold: 0.01,
        smoothTransitionDuration: 200
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

// Apply mobile optimizations
if (isMobile) {
    performanceConfig.viewer.imageLoaderLimit = 8;
    performanceConfig.viewer.maxImageCacheCount = 1000;
    performanceConfig.viewer.animationTime = 0.6;
    performanceConfig.hotspots.batchSize = 30;
}

// Low-end device adjustments
if (isLowEndDevice) {
    performanceConfig.viewer.animationTime = 0.7;
    performanceConfig.viewer.springStiffness = 6;
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

// Dynamic performance adjustment
export function adjustSettingsForPerformance(currentFPS) {
    if (currentFPS < 24 && currentFPS > 0) {
        // Reduce load without affecting quality
        performanceConfig.viewer.imageLoaderLimit = Math.max(4, performanceConfig.viewer.imageLoaderLimit - 2);
        performanceConfig.viewer.maxTilesPerFrame = Math.max(3, performanceConfig.viewer.maxTilesPerFrame - 1);
        console.log('Performance: Reduced loading settings');
    } else if (currentFPS > 45) {
        // Restore settings
        performanceConfig.viewer.imageLoaderLimit = Math.min(10, performanceConfig.viewer.imageLoaderLimit + 1);
        performanceConfig.viewer.maxTilesPerFrame = Math.min(6, performanceConfig.viewer.maxTilesPerFrame + 1);
    }
}