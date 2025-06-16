/**
 * Performance Configuration - Optimized for 60 FPS based on research
 * Implements WebGL, aggressive caching, and platform-specific optimizations
 */

const performanceConfig = {
    // OpenSeadragon viewer settings - OPTIMIZED FOR 60 FPS
    viewer: {
        // Tile loading - BALANCED
        imageLoaderLimit: 8,          // More concurrent loads for smoother experience
        maxImageCacheCount: 600,      // Larger cache for fewer reloads
        minPixelRatio: 0.9,
        smoothTileEdgesMinZoom: 0.5,  // Always smooth edges for better blending
        alwaysBlend: true,            // Always blend for smooth transitions

        // Rendering settings - BALANCED FOR QUALITY AND PERFORMANCE
        immediateRender: false,       // Allow progressive loading
        preserveViewport: true,
        preserveImageSizeOnResize: true,
        visibilityRatio: 0.8,         // Less aggressive culling for smoother experience
        subPixelRendering: true,      // Better quality
        imageSmoothingEnabled: true,  // Start with smoothing for better transitions

        // Preload settings
        preload: true,
        placeholderFillStyle: 'rgba(26, 26, 26, 1)', // Match CSS background

        // Animation settings - SMOOTH EXPERIENCE
        animationTime: 0.8,           // Faster but smooth
        springStiffness: 6.5,         // Balanced responsiveness
        blendTime: 0.25,              // Longer blend to hide tile loading
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

        // Network optimization
        loadTilesWithAjax: true,
        ajaxHeaders: {
            'Cache-Control': 'public, max-age=31536000'
        },

        // Tile quality settings
        minZoomImageRatio: 0.8,
        maxTilesPerFrame: 8,          // More tiles per frame for smoother loading
        tileRetryMax: 3,              // Reduced retries
        tileRetryDelay: 100,          // Faster retry

        // Rendering
        compositeOperation: null,
        smoothImageZoom: false,       // Disabled for performance

        // Constraints
        constrainDuringPan: true,
        wrapHorizontal: false,
        wrapVertical: false,

        // Navigation
        navigatorAutoResize: true,
        showNavigator: false,

        // Drawer selection
        drawer: 'auto',               // Will be determined dynamically
        debugMode: false,

        // WebGL options
        webglOptions: {
            antialias: true,
            preserveDrawingBuffer: false,
            premultipliedAlpha: true
        }
    },

    // Tile settings
    tiles: {
        tileSize: 256,              // Optimal for GPU
        overlap: 2,                 // Small overlap to prevent seams
        jpegQuality: 95,
        format: 'jpeg',             // Consider WebP
        enableWebP: false           // Can test WebP support
    },

    // Hotspot rendering
    hotspots: {
        batchSize: 25,              // Smaller batches for smoother updates
        visibilityCheckInterval: 150,
        renderDebounceTime: 16,     // 60 FPS timing
        fadeInDuration: 100,        // Faster fade
        preloadPadding: 0.1,        // Less aggressive preload
        maxVisibleHotspots: 150,    // Reduced for performance
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
        cacheTimeout: 16,           // 60 FPS frame time
        updateDebounce: 16,
        preloadPadding: 0.3
    },

    // Memory management - CRITICAL
    memory: {
        maxCachedImages: 400,       // Match viewer cache
        maxCachedAudio: 20,
        gcInterval: 30000,          // More frequent GC
        lowMemoryThreshold: 150,    // MB
        criticalMemoryThreshold: 300 // MB
    },

    // Network
    network: {
        maxConcurrentRequests: 6,
        retryAttempts: 3,
        retryDelay: 200,
        timeout: 120000,
        useCDN: true
    },

    // Mobile settings - BALANCED
    mobile: {
        reduceQuality: false,
        maxZoomLevel: 20,           // Reduced from 30
        touchSensitivity: 1.1,
        doubleTapDelay: 300,
        maxImageCacheCount: 200,    // Reasonable cache
        imageLoaderLimit: 4,        // Balanced loading
        animationTime: 0.6,         // Smoother animations
        springStiffness: 7.0,       // Slightly tighter for mobile
        immediateRender: false,     // Progressive loading
        blendTime: 0.2             // Slightly longer blend on mobile
    },

    // Render optimization settings
    renderOptimization: {
        enableAdaptiveRendering: true,
        animationEndDelay: 100,     // Faster switch to pixel-perfect
        pixelPerfectDelay: 30,      // Quicker application
        zoomThreshold: 0.005,       // More sensitive
        smoothTransitionDuration: 150,
        useWebGL: 'auto',           // Auto-detect best renderer
        forceIntegerPositions: true // Prevent subpixel artifacts
    },

    // Debug
    debug: {
        showFPS: true,
        showMetrics: true,
        logPerformance: false,
        warnThreshold: {
            fps: 45,                // Higher warning threshold
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

// WebGL support detection
function supportsWebGL() {
    try {
        const canvas = document.createElement('canvas');
        return !!(window.WebGLRenderingContext &&
            (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (e) {
        return false;
    }
}

// Determine optimal drawer with better logic
function getOptimalDrawer() {
    // iOS Safari performs better with canvas
    if (isIOS || isSafari) {
        return 'canvas';
    }

    // Only use WebGL if supported and not on low-end device
    if (supportsWebGL() && !isLowEndDevice) {
        // But prefer canvas for now due to blending issues
        return 'canvas'; // Changed from 'webgl' for better visual quality
    }

    return 'canvas';
}

// Apply platform-specific optimizations
if (isMobile) {
    // Mobile-specific settings
    Object.assign(performanceConfig.viewer, {
        imageLoaderLimit: performanceConfig.mobile.imageLoaderLimit,
        maxImageCacheCount: performanceConfig.mobile.maxImageCacheCount,
        animationTime: performanceConfig.mobile.animationTime,
        springStiffness: performanceConfig.mobile.springStiffness,
        immediateRender: performanceConfig.mobile.immediateRender,
        blendTime: performanceConfig.mobile.blendTime,
        smoothImageZoom: true,
        maxTilesPerFrame: 4
    });

    // Reduce hotspot batch size
    performanceConfig.hotspots.batchSize = 20;
    performanceConfig.hotspots.maxVisibleHotspots = 120;

    // iOS-specific
    if (isIOS) {
        performanceConfig.viewer.drawer = 'canvas';
    } else if (isAndroid) {
        performanceConfig.viewer.drawer = 'webgl';
    }
} else {
    // Desktop optimizations
    performanceConfig.viewer.drawer = getOptimalDrawer();

    // Always use canvas for now - better visual quality
    performanceConfig.viewer.drawer = 'canvas';
}

// Low-end device adjustments
if (isLowEndDevice) {
    performanceConfig.viewer.animationTime = 1.5;
    performanceConfig.viewer.springStiffness = 6;
    performanceConfig.viewer.maxImageCacheCount = 200;
    performanceConfig.viewer.imageLoaderLimit = 4;
    performanceConfig.memory.maxCachedImages = 200;
    performanceConfig.network.maxConcurrentRequests = 4;
    performanceConfig.hotspots.maxVisibleHotspots = 80;
}

// High DPI adjustments
if (isHighDPI && !isMobile) {
    performanceConfig.viewer.minPixelRatio = 1.5;
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
            supportsWebGL: supportsWebGL(),
            optimalDrawer: performanceConfig.viewer.drawer,
            cores: navigator.hardwareConcurrency || 2,
            memory: navigator.deviceMemory || 4,
            pixelRatio: window.devicePixelRatio || 1,
            connection: navigator.connection?.effectiveType || 'unknown'
        }
    };
}

// Dynamic performance adjustment based on FPS
export function adjustSettingsForPerformance(currentFPS, memoryUsage) {
    const config = performanceConfig;

    // Critical performance (< 20 FPS)
    if (currentFPS < 20 && currentFPS > 0) {
        config.viewer.imageLoaderLimit = 2;
        config.viewer.maxTilesPerFrame = 2;
        config.viewer.animationTime = 0.5;
        config.viewer.maxImageCacheCount = 100;
        console.warn('Critical performance: Applied emergency optimizations');
    }
    // Poor performance (< 45 FPS)
    else if (currentFPS < 45 && currentFPS > 0) {
        config.viewer.imageLoaderLimit = Math.max(3, config.viewer.imageLoaderLimit - 1);
        config.viewer.maxTilesPerFrame = Math.max(3, config.viewer.maxTilesPerFrame - 1);
        config.viewer.animationTime = Math.max(0.8, config.viewer.animationTime - 0.1);
    }
    // Good performance (> 55 FPS) - restore settings
    else if (currentFPS > 55) {
        if (config.viewer.imageLoaderLimit < 6) {
            config.viewer.imageLoaderLimit = Math.min(6, config.viewer.imageLoaderLimit + 1);
        }
        if (config.viewer.maxTilesPerFrame < 4) {
            config.viewer.maxTilesPerFrame = Math.min(4, config.viewer.maxTilesPerFrame + 1);
        }
    }

    // Memory-based adjustments
    if (memoryUsage > config.memory.criticalMemoryThreshold) {
        config.viewer.maxImageCacheCount = Math.max(100, config.viewer.maxImageCacheCount - 100);
        console.warn(`High memory usage: ${memoryUsage}MB - Reducing cache`);
    }
}