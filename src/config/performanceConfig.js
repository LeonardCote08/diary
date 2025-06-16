/**
 * Performance Configuration - Balanced for smooth pan AND fast zoom
 * Key: Different settings for zoom vs pan operations
 */

const performanceConfig = {
    // OpenSeadragon viewer settings - BALANCED OPTIMIZATION
    viewer: {
        // Tile loading - OPTIMIZED
        imageLoaderLimit: 10,         // Balanced concurrent loads
        maxImageCacheCount: 700,      // Good cache size
        minPixelRatio: 0.9,
        smoothTileEdgesMinZoom: 1.0,  // Smooth edges for quality
        alwaysBlend: false,           // Don't force blending

        // Rendering settings - BALANCED
        immediateRender: false,       // Allow progressive for smoothness
        preserveViewport: true,
        preserveImageSizeOnResize: true,
        visibilityRatio: 0.7,         // Balanced culling
        subPixelRendering: true,      // Keep for smooth panning
        imageSmoothingEnabled: true,  // Smooth rendering

        // Preload settings
        preload: true,
        placeholderFillStyle: 'rgba(26, 26, 26, 1)',

        // Animation settings - SMOOTH BUT RESPONSIVE
        animationTime: 0.6,           // Smooth animations
        springStiffness: 7.5,         // Balanced responsiveness
        blendTime: 0.1,               // Minimal blending (key for zoom)
        flickEnabled: true,
        flickMinSpeed: 120,
        flickMomentum: 0.25,

        // Zoom settings
        zoomPerScroll: 1.25,          // Smooth zoom steps
        zoomPerClick: 2.0,
        minZoomLevel: 0.5,
        maxZoomLevel: 40,
        defaultZoomLevel: 1,
        maxZoomPixelRatio: 3,

        // Network optimization
        loadTilesWithAjax: true,
        ajaxHeaders: {
            'Cache-Control': 'public, max-age=31536000',
            'Connection': 'keep-alive'
        },
        timeout: 90000,

        // Tile quality settings
        minZoomImageRatio: 0.8,
        maxTilesPerFrame: 8,          // Balanced
        tileRetryMax: 2,
        tileRetryDelay: 100,

        // Rendering
        compositeOperation: null,
        smoothImageZoom: true,        // Keep smooth for panning

        // Constraints
        constrainDuringPan: true,
        wrapHorizontal: false,
        wrapVertical: false,

        // Navigation
        navigatorAutoResize: true,
        showNavigator: false,

        // Drawer selection
        drawer: 'canvas',
        debugMode: false,

        // WebGL options (if used)
        webglOptions: {
            antialias: true,
            preserveDrawingBuffer: false,
            premultipliedAlpha: true
        }
    },

    // Tile settings
    tiles: {
        tileSize: 1024,
        overlap: 2,
        jpegQuality: 95,
        format: 'jpeg',
        enableWebP: false
    },

    // Hotspot rendering
    hotspots: {
        batchSize: 30,
        visibilityCheckInterval: 120,
        renderDebounceTime: 16,
        fadeInDuration: 100,
        preloadPadding: 0.1,
        maxVisibleHotspots: 150,
        minZoomForHotspots: 1.5
    },

    // Audio settings
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
        cacheTimeout: 16,
        updateDebounce: 16,
        preloadPadding: 0.3
    },

    // Memory management
    memory: {
        maxCachedImages: 450,
        maxCachedAudio: 20,
        gcInterval: 45000,
        lowMemoryThreshold: 150,
        criticalMemoryThreshold: 350
    },

    // Network
    network: {
        maxConcurrentRequests: 6,
        retryAttempts: 3,
        retryDelay: 200,
        timeout: 90000,
        useCDN: true
    },

    // Mobile settings - BALANCED
    mobile: {
        reduceQuality: false,
        maxZoomLevel: 20,
        touchSensitivity: 1.1,
        doubleTapDelay: 300,
        maxImageCacheCount: 250,
        imageLoaderLimit: 5,
        animationTime: 0.5,          // Smooth on mobile too
        springStiffness: 8.0,        // Responsive but not jarring
        immediateRender: false,
        blendTime: 0.15             // Slightly more blend on mobile
    },

    // Render optimization settings
    renderOptimization: {
        enableAdaptiveRendering: true,
        animationEndDelay: 80,
        pixelPerfectDelay: 50,
        zoomThreshold: 0.005,
        smoothTransitionDuration: 150,
        useWebGL: false,
        forceIntegerPositions: true,
        // NEW: Zoom-specific optimizations
        zoomOptimizations: {
            reduceBlendTime: true,    // Reduce blend during zoom
            targetBlendTime: 0,       // Target blend time during zoom
            increaseStiffness: true,  // Increase stiffness during zoom
            targetStiffness: 10.0     // Target stiffness during zoom
        }
    },

    // Debug
    debug: {
        showFPS: true,
        showMetrics: true,
        logPerformance: false,
        warnThreshold: {
            fps: 45,
            renderTime: 100,
            visibleHotspots: 200
        }
    }
};

// Platform detection
const ua = navigator.userAgent;
const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
const isAndroid = /Android/.test(ua);
const isMobile = isIOS || isAndroid;
const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
const isLowEndDevice = navigator.hardwareConcurrency <= 2 || navigator.deviceMemory <= 2;
const isHighDPI = window.devicePixelRatio > 1;

// Platform-specific optimizations
if (isMobile) {
    // Mobile-specific but balanced
    Object.assign(performanceConfig.viewer, {
        imageLoaderLimit: performanceConfig.mobile.imageLoaderLimit,
        maxImageCacheCount: performanceConfig.mobile.maxImageCacheCount,
        animationTime: performanceConfig.mobile.animationTime,
        springStiffness: performanceConfig.mobile.springStiffness,
        immediateRender: performanceConfig.mobile.immediateRender,
        blendTime: performanceConfig.mobile.blendTime,
        smoothImageZoom: false,       // Disable on mobile for performance
        maxTilesPerFrame: 5,
        visibilityRatio: 0.6
    });

    performanceConfig.hotspots.batchSize = 40;
    performanceConfig.hotspots.maxVisibleHotspots = 120;

    // Always use canvas on mobile
    performanceConfig.viewer.drawer = 'canvas';
}

// Low-end device adjustments
if (isLowEndDevice) {
    performanceConfig.viewer.animationTime = 0.8;
    performanceConfig.viewer.springStiffness = 6.5;
    performanceConfig.viewer.maxImageCacheCount = 300;
    performanceConfig.viewer.imageLoaderLimit = 4;
    performanceConfig.viewer.blendTime = 0.2;
    performanceConfig.memory.maxCachedImages = 250;
    performanceConfig.network.maxConcurrentRequests = 4;
    performanceConfig.hotspots.maxVisibleHotspots = 80;
}

// High DPI adjustments
if (isHighDPI && !isMobile) {
    performanceConfig.viewer.minPixelRatio = 1.5;
    performanceConfig.viewer.maxZoomPixelRatio = 2;
}

export default performanceConfig;

// Get optimized settings with device info
export function getOptimizedSettings() {
    return {
        ...performanceConfig,
        deviceProfile: {
            isMobile,
            isIOS,
            isAndroid,
            isSafari,
            isLowEndDevice,
            isHighDPI,
            optimalDrawer: performanceConfig.viewer.drawer,
            cores: navigator.hardwareConcurrency || 2,
            memory: navigator.deviceMemory || 4,
            pixelRatio: window.devicePixelRatio || 1,
            connection: navigator.connection?.effectiveType || 'unknown'
        }
    };
}

// Dynamic performance adjustment
export function adjustSettingsForPerformance(currentFPS, memoryUsage) {
    const config = performanceConfig;

    // Critical performance (< 25 FPS)
    if (currentFPS < 25 && currentFPS > 0) {
        config.viewer.imageLoaderLimit = 3;
        config.viewer.maxTilesPerFrame = 3;
        config.viewer.animationTime = 0.3;
        config.viewer.springStiffness = 9;
        config.viewer.blendTime = 0;
        config.viewer.maxImageCacheCount = 200;
        console.warn('Critical performance: Applied emergency optimizations');
    }
    // Poor performance (< 45 FPS)
    else if (currentFPS < 45 && currentFPS > 0) {
        config.viewer.imageLoaderLimit = Math.max(4, config.viewer.imageLoaderLimit - 1);
        config.viewer.maxTilesPerFrame = Math.max(4, config.viewer.maxTilesPerFrame - 1);
        config.viewer.blendTime = Math.max(0, config.viewer.blendTime - 0.05);
    }
    // Good performance (> 55 FPS) - restore settings
    else if (currentFPS > 55) {
        if (config.viewer.imageLoaderLimit < 10) {
            config.viewer.imageLoaderLimit = Math.min(10, config.viewer.imageLoaderLimit + 1);
        }
        if (config.viewer.maxTilesPerFrame < 8) {
            config.viewer.maxTilesPerFrame = Math.min(8, config.viewer.maxTilesPerFrame + 1);
        }
    }

    // Memory-based adjustments
    if (memoryUsage > config.memory.criticalMemoryThreshold) {
        config.viewer.maxImageCacheCount = Math.max(150, config.viewer.maxImageCacheCount - 100);
        console.warn(`High memory usage: ${memoryUsage}MB - Reducing cache`);
    }
}

// NEW: Zoom-specific optimization function
export function applyZoomOptimizations(viewer, isZooming) {
    const config = performanceConfig.renderOptimization.zoomOptimizations;

    if (isZooming && config.reduceBlendTime) {
        // Temporarily reduce blend time during zoom
        if (viewer.world.getItemCount() > 0) {
            const tiledImage = viewer.world.getItemAt(0);
            if (tiledImage) {
                tiledImage.blendTime = config.targetBlendTime;
            }
        }

        // Temporarily increase spring stiffness
        if (config.increaseStiffness) {
            viewer.viewport.zoomSpring.springStiffness = config.targetStiffness;
            viewer.viewport.centerSpringX.springStiffness = config.targetStiffness;
            viewer.viewport.centerSpringY.springStiffness = config.targetStiffness;
        }
    } else {
        // Restore normal settings
        if (viewer.world.getItemCount() > 0) {
            const tiledImage = viewer.world.getItemAt(0);
            if (tiledImage) {
                tiledImage.blendTime = performanceConfig.viewer.blendTime;
            }
        }

        // Restore normal spring stiffness
        viewer.viewport.zoomSpring.springStiffness = performanceConfig.viewer.springStiffness;
        viewer.viewport.centerSpringX.springStiffness = performanceConfig.viewer.springStiffness;
        viewer.viewport.centerSpringY.springStiffness = performanceConfig.viewer.springStiffness;
    }
}