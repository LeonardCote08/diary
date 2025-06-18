/**
 * Performance Configuration - Optimized for 60 FPS with sharp images
 * HYBRID APPROACH: Large tiles + better quality at low zoom
 */

const performanceConfig = {

    qualityPreservation: {
        minVisibleAreaDesktop: 600,
        minVisibleAreaMobile: 400,
        maxZoomForQuality: 15,
        adaptivePaddingEnabled: true
    },

    // OpenSeadragon viewer settings - OPTIMIZED FOR SHARPNESS + PERFORMANCE
    viewer: {
        // Critical: Tile loading optimization
        imageLoaderLimit: 6,          // Optimal for parallel loading
        maxImageCacheCount: 500,      // Desktop default, adjusted by platform

        // MODIFIED FOR SHARPNESS: Load higher quality tiles earlier
        minPixelRatio: 0.5,           // Allow higher resolution tiles at lower zoom
        minZoomImageRatio: 0.8,       // Load better quality tiles sooner

        smoothTileEdgesMinZoom: Infinity, // Disable for performance
        alwaysBlend: false,           // Critical for zoom performance

        // Rendering settings - MAXIMUM PERFORMANCE
        immediateRender: true,        // Critical for responsive zoom
        preserveViewport: true,
        preserveImageSizeOnResize: true,
        visibilityRatio: 0.5,         // More aggressive culling
        subPixelRendering: false,     // Disable for performance
        imageSmoothingEnabled: true,  // Keep for quality

        // Preload settings
        preload: true,
        placeholderFillStyle: 'rgba(26, 26, 26, 1)',

        // Animation settings - OPTIMIZED FOR RESPONSIVENESS
        animationTime: 0.3,           // Much faster animations
        springStiffness: 10.0,        // Very responsive
        blendTime: 0,                 // Critical: No blending for instant tile switch
        flickEnabled: true,
        flickMinSpeed: 120,
        flickMomentum: 0.25,

        // Zoom settings
        zoomPerScroll: 1.2,           // Slightly smaller steps for control
        zoomPerClick: 2.0,
        minZoomLevel: 0.5,
        maxZoomLevel: 40,
        defaultZoomLevel: 1,

        // MODIFIED FOR QUALITY: Allow more pixel density at all zoom levels
        maxZoomPixelRatio: 4,         // Increased from 2 to allow sharper tiles

        // Network optimization
        loadTilesWithAjax: true,
        ajaxHeaders: {
            'Cache-Control': 'public, max-age=31536000, immutable'
        },
        timeout: 60000,               // Shorter timeout

        // Tile quality settings - MODIFIED FOR HYBRID APPROACH
        minZoomImageRatio: 0.8,       // Load HD tiles at 80% zoom (was 0.9)
        maxTilesPerFrame: 4,          // Limit for consistent frame rate
        tileRetryMax: 1,              // Fewer retries
        tileRetryDelay: 100,

        // Rendering
        compositeOperation: null,
        smoothImageZoom: false,       // Disable for performance

        // Constraints
        constrainDuringPan: true,
        wrapHorizontal: false,
        wrapVertical: false,

        // Navigation
        navigatorAutoResize: true,
        showNavigator: false,

        // Drawer selection (will be overridden by browser detection)
        drawer: 'canvas',
        debugMode: false,

        // WebGL options when used
        webglOptions: {
            antialias: false,         // Disable for performance
            preserveDrawingBuffer: false,
            premultipliedAlpha: true,
            powerPreference: 'high-performance'
        }
    },

    // Tile settings - 1024px for performance
    tiles: {
        tileSize: 1024,
        overlap: 2,
        jpegQuality: 85,              // Slightly lower for faster loading
        format: 'jpeg',
        enableWebP: false
    },

    // Hotspot rendering
    hotspots: {
        batchSize: 50,
        visibilityCheckInterval: 100,
        renderDebounceTime: 16,
        fadeInDuration: 0,            // Instant appearance
        preloadPadding: 0.2,
        maxVisibleHotspots: 100,
        minZoomForHotspots: 1.5
    },

    // Audio settings
    audio: {
        preloadCount: 5,
        crossfadeDuration: 200,
        bufferSize: 5,
        html5PoolSize: 5,
        autoUnlock: true
    },

    // Viewport management
    viewport: {
        cacheEnabled: true,
        cacheTimeout: 16,
        updateDebounce: 8,            // Faster updates
        preloadPadding: 0.2
    },

    // Memory management
    memory: {
        maxCachedImages: 300,
        maxCachedAudio: 10,
        gcInterval: 30000,
        lowMemoryThreshold: 100,
        criticalMemoryThreshold: 200
    },

    // Network
    network: {
        maxConcurrentRequests: 6,
        retryAttempts: 1,
        retryDelay: 100,
        timeout: 60000,
        useCDN: true
    },

    // Mobile settings - AGGRESSIVE OPTIMIZATION
    mobile: {
        reduceQuality: true,
        maxZoomLevel: 20,
        touchSensitivity: 1.0,
        doubleTapDelay: 300,
        maxImageCacheCount: 100,      // Much lower for mobile
        imageLoaderLimit: 2,          // Serial loading on mobile
        animationTime: 0.2,           // Even faster on mobile
        springStiffness: 12.0,        // Very responsive
        immediateRender: true,
        blendTime: 0,                 // No blending on mobile
        maxTilesPerFrame: 2,          // Very limited
        minPixelRatio: 0.8,           // Allow some quality on mobile too
        minZoomImageRatio: 0.9        // But be more conservative
    },

    // Render optimization settings
    renderOptimization: {
        enableAdaptiveRendering: true,
        animationEndDelay: 50,        // Faster transition to static
        pixelPerfectDelay: 30,
        zoomThreshold: 0.01,
        panThreshold: 0.01,
        smoothTransitionDuration: 100,
        useWebGL: false,              // Default to canvas
        forceIntegerPositions: true,
        // Zoom-specific optimizations
        zoomOptimizations: {
            reduceBlendTime: true,
            targetBlendTime: 0,
            increaseStiffness: true,
            targetStiffness: 12.0,
            forceImmediateRender: true,
            disableSmoothing: true,
            reduceTilesPerFrame: true,
            targetTilesPerFrame: 3
        }
    },

    // Debug
    debug: {
        showFPS: false,               // Off by default
        showMetrics: true,
        logPerformance: false,
        warnThreshold: {
            fps: 45,
            renderTime: 33,           // 30 FPS threshold
            visibleHotspots: 150
        }
    }
};

// Platform detection with comprehensive checks
const detectPlatform = () => {
    const ua = navigator.userAgent.toLowerCase();
    const platform = navigator.platform.toLowerCase();

    return {
        // Browser detection
        isSafari: /^((?!chrome|android|crios|fxios).)*safari/i.test(ua),
        isChrome: /chrome|crios/i.test(ua) && !/edge|edg/i.test(ua),
        isFirefox: /firefox|fxios/i.test(ua),
        isEdge: /edge|edg/i.test(ua),

        // OS detection
        isIOS: /ipad|iphone|ipod/.test(ua) || (platform === 'macintel' && navigator.maxTouchPoints > 1),
        isAndroid: /android/.test(ua),
        isMac: /mac/.test(platform),
        isWindows: /win/.test(platform),

        // Device capabilities
        isMobile: /android|iphone|ipad|ipod/i.test(ua) || (platform === 'macintel' && navigator.maxTouchPoints > 1),
        isTablet: /ipad|android(?!.*mobile)/i.test(ua) || (platform === 'macintel' && navigator.maxTouchPoints > 1),
        hasTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,

        // Performance indicators
        isLowEndDevice: navigator.hardwareConcurrency <= 2 || navigator.deviceMemory <= 2,
        isHighEndDevice: navigator.hardwareConcurrency >= 8 && navigator.deviceMemory >= 8,
        deviceMemory: navigator.deviceMemory || 4,
        cpuCores: navigator.hardwareConcurrency || 4,
        connectionType: navigator.connection?.effectiveType || '4g',

        // Display
        pixelRatio: window.devicePixelRatio || 1,
        isHighDPI: window.devicePixelRatio > 1.5
    };
};

// Apply platform-specific optimizations
const applyPlatformOptimizations = () => {
    const platform = detectPlatform();

    // Safari/iOS MUST use canvas - critical for performance
    if (platform.isSafari || platform.isIOS) {
        performanceConfig.viewer.drawer = 'canvas';
        performanceConfig.viewer.maxImageCacheCount = 200; // Safari has memory issues
        console.log('Safari/iOS detected - forcing canvas drawer and limiting cache');
    }

    // Mobile optimizations
    if (platform.isMobile) {
        Object.assign(performanceConfig.viewer, {
            imageLoaderLimit: performanceConfig.mobile.imageLoaderLimit,
            maxImageCacheCount: performanceConfig.mobile.maxImageCacheCount,
            animationTime: performanceConfig.mobile.animationTime,
            springStiffness: performanceConfig.mobile.springStiffness,
            immediateRender: performanceConfig.mobile.immediateRender,
            blendTime: performanceConfig.mobile.blendTime,
            smoothImageZoom: false,
            maxTilesPerFrame: performanceConfig.mobile.maxTilesPerFrame,
            visibilityRatio: 0.4,
            minPixelRatio: performanceConfig.mobile.minPixelRatio,
            minZoomImageRatio: performanceConfig.mobile.minZoomImageRatio
        });

        performanceConfig.hotspots.batchSize = 25;
        performanceConfig.hotspots.maxVisibleHotspots = 50;
        performanceConfig.memory.maxCachedImages = 100;

        console.log('Mobile device detected - applied balanced optimizations for quality');
    }

    // Low-end device adjustments
    if (platform.isLowEndDevice) {
        performanceConfig.viewer.animationTime = 0.2;
        performanceConfig.viewer.springStiffness = 12.0;
        performanceConfig.viewer.maxImageCacheCount = Math.min(150, performanceConfig.viewer.maxImageCacheCount);
        performanceConfig.viewer.imageLoaderLimit = 2;
        performanceConfig.viewer.maxTilesPerFrame = 2;
        performanceConfig.memory.maxCachedImages = 150;
        performanceConfig.network.maxConcurrentRequests = 3;
        performanceConfig.hotspots.maxVisibleHotspots = 50;
        // But keep quality settings for sharpness
        performanceConfig.viewer.minPixelRatio = 0.7;
        console.log('Low-end device detected - reduced resource usage but maintained quality settings');
    }

    // High-end device enhancements
    if (platform.isHighEndDevice && !platform.isMobile) {
        performanceConfig.viewer.maxImageCacheCount = 800;
        performanceConfig.viewer.imageLoaderLimit = 8;
        performanceConfig.viewer.maxTilesPerFrame = 6;
        performanceConfig.memory.maxCachedImages = 500;
        performanceConfig.network.maxConcurrentRequests = 8;
        // Allow even better quality
        performanceConfig.viewer.minPixelRatio = 0.4;
        performanceConfig.viewer.maxZoomPixelRatio = 8;
        console.log('High-end device detected - increased resource limits and quality');
    }

    // High DPI adjustments
    if (platform.isHighDPI && !platform.isMobile) {
        // For high DPI screens, we want to load even sharper tiles
        performanceConfig.viewer.minPixelRatio = Math.min(0.5, performanceConfig.viewer.minPixelRatio);
        performanceConfig.viewer.maxZoomPixelRatio = Math.max(4, platform.pixelRatio * 2);
    }

    // Connection-based adjustments
    if (platform.connectionType === 'slow-2g' || platform.connectionType === '2g') {
        performanceConfig.viewer.imageLoaderLimit = 1;
        performanceConfig.network.maxConcurrentRequests = 2;
        performanceConfig.viewer.timeout = 120000;
        console.log('Slow connection detected - reduced concurrent requests');
    }

    return platform;
};

// Apply optimizations immediately
const platform = applyPlatformOptimizations();

// Export configuration and utilities
export default performanceConfig;

export { platform, detectPlatform };

// Get optimized settings with full device info
export function getOptimizedSettings() {
    return {
        ...performanceConfig,
        deviceProfile: {
            ...platform,
            optimalDrawer: performanceConfig.viewer.drawer,
            configuredFor: platform.isMobile ? 'mobile' : 'desktop',
            performanceMode: platform.isLowEndDevice ? 'economy' : platform.isHighEndDevice ? 'premium' : 'balanced'
        }
    };
}

// Dynamic performance adjustment during runtime
export function adjustSettingsForPerformance(currentFPS, memoryUsage) {
    const config = performanceConfig;

    // Emergency mode (< 20 FPS)
    if (currentFPS < 20 && currentFPS > 0) {
        config.viewer.imageLoaderLimit = 1;
        config.viewer.maxTilesPerFrame = 1;
        config.viewer.animationTime = 0.1;
        config.viewer.springStiffness = 15;
        config.viewer.immediateRender = true;
        config.viewer.blendTime = 0;
        config.viewer.maxImageCacheCount = 50;
        // Keep some quality even in emergency
        config.viewer.minPixelRatio = 0.8;
        console.error('Emergency performance mode activated');
        return 'emergency';
    }

    // Critical performance (< 30 FPS)
    if (currentFPS < 30 && currentFPS > 0) {
        config.viewer.imageLoaderLimit = 2;
        config.viewer.maxTilesPerFrame = 2;
        config.viewer.animationTime = 0.2;
        config.viewer.springStiffness = 12;
        config.viewer.blendTime = 0;
        config.viewer.maxImageCacheCount = 100;
        config.viewer.minPixelRatio = 0.7;
        console.warn('Critical performance mode activated');
        return 'critical';
    }

    // Poor performance (< 45 FPS)
    if (currentFPS < 45 && currentFPS > 0) {
        config.viewer.imageLoaderLimit = Math.max(3, config.viewer.imageLoaderLimit - 1);
        config.viewer.maxTilesPerFrame = Math.max(3, config.viewer.maxTilesPerFrame - 1);
        return 'reduced';
    }

    // Good performance (> 55 FPS) - carefully restore settings
    if (currentFPS > 55) {
        const targetConfig = platform.isHighEndDevice ? 8 : platform.isMobile ? 2 : 6;
        if (config.viewer.imageLoaderLimit < targetConfig) {
            config.viewer.imageLoaderLimit = Math.min(targetConfig, config.viewer.imageLoaderLimit + 1);
        }
        if (config.viewer.maxTilesPerFrame < 4) {
            config.viewer.maxTilesPerFrame = Math.min(4, config.viewer.maxTilesPerFrame + 1);
        }
        // Restore quality settings
        config.viewer.minPixelRatio = platform.isMobile ? 0.8 : 0.5;
        return 'normal';
    }

    // Memory-based adjustments
    if (memoryUsage > config.memory.criticalMemoryThreshold) {
        config.viewer.maxImageCacheCount = Math.max(50, Math.floor(config.viewer.maxImageCacheCount * 0.5));
        console.warn(`High memory usage: ${memoryUsage}MB - Reduced cache to ${config.viewer.maxImageCacheCount}`);
        return 'memory-limited';
    }

    return 'normal';
}