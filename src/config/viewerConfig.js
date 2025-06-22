/**
 * OpenSeadragon viewer configuration builder
 */
export const buildViewerConfig = (config, dziUrl, drawerType, isMobileDevice) => {
    // Override critical settings for mobile
    if (isMobileDevice) {
        config.animationTime = 0.2;
        config.springStiffness = 12.0;
        config.blendTime = 0;
        config.immediateRender = true;
        config.imageLoaderLimit = 2;
        config.maxImageCacheCount = 50;
        config.visibilityRatio = 1.0;
        config.maxTilesPerFrame = 2;
    }

    return {
        tileSources: dziUrl,
        prefixUrl: 'https://cdn.jsdelivr.net/npm/openseadragon@5.0.1/build/openseadragon/images/',

        // Rendering - use browser-specific drawer
        drawer: drawerType,
        imageSmoothingEnabled: config.imageSmoothingEnabled,
        smoothTileEdgesMinZoom: config.smoothTileEdgesMinZoom,
        alwaysBlend: config.alwaysBlend,
        placeholderFillStyle: config.placeholderFillStyle,
        opacity: 1,
        preload: config.preload,
        compositeOperation: config.compositeOperation,
        ...(config.drawer === 'webgl' ? { webglOptions: config.webglOptions } : {}),

        // Tile loading
        immediateRender: config.immediateRender,
        imageLoaderLimit: config.imageLoaderLimit,
        maxImageCacheCount: config.maxImageCacheCount,
        timeout: config.timeout,
        loadTilesWithAjax: config.loadTilesWithAjax,
        ajaxHeaders: config.ajaxHeaders,

        // Visibility
        visibilityRatio: config.visibilityRatio,
        minPixelRatio: config.minPixelRatio,
        defaultZoomLevel: config.defaultZoomLevel,
        minZoomLevel: config.minZoomLevel,
        maxZoomPixelRatio: config.maxZoomPixelRatio,

        // Navigation
        constrainDuringPan: config.constrainDuringPan,
        wrapHorizontal: config.wrapHorizontal,
        wrapVertical: config.wrapVertical,

        // Animation
        animationTime: config.animationTime,
        springStiffness: config.springStiffness,
        blendTime: config.blendTime,

        // NEW: Zoom-specific optimizations
        zoomPerScroll: 1.1,  // Smaller steps for smoother zoom
        zoomPerClick: 1.5,   // Less aggressive click zoom

        // Controls - all disabled for clean interface
        showNavigationControl: false,
        showZoomControl: false,
        showHomeControl: false,
        showFullPageControl: false,
        showRotationControl: false,

        // Input - DISABLED double-click zoom
        gestureSettingsMouse: {
            scrollToZoom: true,
            clickToZoom: false,
            dblClickToZoom: false,  // DISABLED
            flickEnabled: config.flickEnabled
        },
        gestureSettingsTouch: {
            scrollToZoom: false,
            clickToZoom: false,
            dblClickToZoom: false,
            flickEnabled: config.flickEnabled,
            flickMinSpeed: config.flickMinSpeed,
            flickMomentum: config.flickMomentum,
            pinchToZoom: true,
            dragToPan: true
        },

        // Touch handling configuration 
        // REMOVED zoomPerClick from here as it's already defined above
        dblClickDistThreshold: 20,
        clickDistThreshold: 10,
        clickTimeThreshold: 300,

        // Performance
        debugMode: config.debugMode,
        crossOriginPolicy: 'Anonymous',
        ajaxWithCredentials: false,
        preserveViewport: config.preserveViewport,
        preserveImageSizeOnResize: config.preserveImageSizeOnResize,
        maxTilesPerFrame: config.maxTilesPerFrame,
        smoothImageZoom: config.smoothImageZoom
    };
};