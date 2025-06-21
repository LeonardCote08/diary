import { onMount, createSignal, onCleanup, Show } from 'solid-js';
import OpenSeadragon from 'openseadragon';
import NativeHotspotRenderer from '../core/NativeHotspotRenderer';
import ViewportManager from '../core/ViewportManager';
import SpatialIndex from '../core/SpatialIndex';
import AudioEngine from '../core/AudioEngine';
import PerformanceMonitor from '../core/PerformanceMonitor';
import RenderOptimizer from '../core/RenderOptimizer';
import TileOptimizer from '../core/TileOptimizer';
import MemoryManager from '../core/MemoryManager';
import TileCleanupManager from '../core/TileCleanupManager';
import AudioPlayer from './AudioPlayer';
import performanceConfig, { adjustSettingsForPerformance } from '../config/performanceConfig';


// Quality preservation settings
const QUALITY_CONFIG = {
    minHotspotPixelsDesktop: 600,  // Minimum visible area for desktop
    minHotspotPixelsMobile: 400,   // Minimum visible area for mobile
    maxZoomBeforeBlur: 15,          // Maximum zoom level before quality degrades
    tileSize: 1024                  // Your tile size configuration
};

// Zoom behavior configuration
const ZOOM_CONFIG = {
    enableDesktopZoom: true,  // Disabled per Deji's specs
    minZoomForDetail: 2
};

let hotspotData = [];

const getBrowserOptimalDrawer = () => {
    const ua = navigator.userAgent;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;

    // Check if device is mobile (including Android)
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua) ||
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0);

    // CRITICAL FIX: Force canvas for ALL mobile devices and Safari
    // OpenSeadragon 5.0+ has severe WebGL performance issues on mobile
    if (isMobile || isSafari || isIOS) {
        console.log('Mobile/Safari detected - forcing canvas drawer for performance');
        return 'canvas';
    }

    // Desktop Chrome/Firefox can use WebGL effectively
    const isChrome = /chrome|crios/i.test(ua) && !/edge|edg/i.test(ua);
    const isFirefox = /firefox|fxios/i.test(ua);

    if (isChrome || isFirefox) {
        console.log('Desktop Chrome/Firefox detected - using webgl drawer');
        return 'webgl';
    }

    // Default to canvas for all other cases
    console.log('Default browser detected - using canvas drawer');
    return 'canvas';
};

/**
 * ArtworkViewer - Main viewer component optimized for 60 FPS
 */
function ArtworkViewer(props) {
    let viewerRef;
    let viewer = null;
    let components = {};
    let intervals = {};

    const [isLoading, setIsLoading] = createSignal(true);
    const [hoveredHotspot, setHoveredHotspot] = createSignal(null);
    const [selectedHotspot, setSelectedHotspot] = createSignal(null);
    const [viewerReady, setViewerReady] = createSignal(false);
    const [previewLoaded, setPreviewLoaded] = createSignal(false);
    const [showExpandButton, setShowExpandButton] = createSignal(false);
    const [isZoomingToHotspot, setIsZoomingToHotspot] = createSignal(false);
    const [currentPlayingHotspot, setCurrentPlayingHotspot] = createSignal(null);

    const [debugMode, setDebugMode] = createSignal(
        localStorage.getItem('debugMode') === 'enabled'
    );

    // Check if device is mobile
    const isMobile = () => {
        // More accurate mobile detection
        const userAgent = navigator.userAgent.toLowerCase();
        const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;

        // Check user agent first
        if (mobileRegex.test(userAgent)) {
            return true;
        }

        // Then check screen size AND touch capability
        const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const isSmallScreen = window.innerWidth <= 768;

        // Only consider it mobile if BOTH conditions are true
        return hasTouch && isSmallScreen;
    };

    // Store initial viewport for "Expand to Full View"
    let homeViewport = null;

    const cleanup = () => {
        if (intervals.handleKeyPress) {
            window.removeEventListener('keydown', intervals.handleKeyPress);
        }

        Object.values(intervals).forEach(interval => {
            if (typeof interval === 'number') clearInterval(interval);
        });

        if (components.resizeObserver && viewerRef) {
            components.resizeObserver.disconnect();
        }

        Object.values(components).forEach(component => {
            if (component && typeof component.destroy === 'function') {
                component.destroy();
            }
        });

        if (viewer) viewer.destroy();

        ['performanceMonitor', 'viewer', 'tileOptimizer', 'debugTileCache'].forEach(prop => {
            if (window[prop] === components[prop] || window[prop] === viewer) {
                delete window[prop];
            }
        });
    };

    onMount(async () => {
        // Load hotspots
        try {
            const response = await fetch('/data/hotspots.json');
            hotspotData = await response.json();
            console.log(`Loaded ${hotspotData.length} hotspots`);
        } catch (error) {
            console.error('Failed to load hotspots:', error);
            hotspotData = [];
        }

        // Preload preview
        const previewImg = new Image();
        previewImg.onload = () => setPreviewLoaded(true);
        previewImg.src = `/images/tiles/${props.artworkId}_1024/preview.jpg`;

        // Initialize viewer with optimized configuration
        const config = performanceConfig.viewer;
        const dziUrl = `/images/tiles/${props.artworkId}_1024/${props.artworkId}.dzi`;

        // Mobile-specific config override
        const isMobileDevice = isMobile();
        const drawerType = getBrowserOptimalDrawer();

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

        viewer = OpenSeadragon({
            element: viewerRef,
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
            zoomPerClick: 1.0,
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
        });

        // Initialize components
        components = {
            spatialIndex: new SpatialIndex(),
            viewportManager: new ViewportManager(viewer),
            audioEngine: new AudioEngine(),
            performanceMonitor: new PerformanceMonitor(viewer),
            renderOptimizer: new RenderOptimizer(viewer),
            tileOptimizer: new TileOptimizer(viewer),
            memoryManager: new MemoryManager(viewer),
            tileCleanupManager: new TileCleanupManager(viewer)
        };

        window.audioEngine = components.audioEngine;

        window.tileCleanupManager = components.tileCleanupManager;

        // Setup AudioEngine callbacks
        components.audioEngine.onPlaybackStart = (hotspotId) => {
            console.log(`Started playing audio for hotspot ${hotspotId}`);
            // TODO: Show audio player UI
        };

        components.audioEngine.onProgress = (progress) => {
            // Update progress bar in player UI
            // console.log(`Progress: ${progress.percent.toFixed(1)}%`);
        };

        components.audioEngine.onPlaybackEnd = (hotspotId) => {
            console.log(`Finished playing audio for hotspot ${hotspotId}`);
            // TODO: Auto-advance to next hotspot if enabled
        };

        components.audioEngine.onError = (hotspotId, error) => {
            console.error(`Audio error for hotspot ${hotspotId}:`, error);
        };

        components.audioEngine.onCrossfadeStart = (fromId, toId) => {
            console.log(`Crossfading from ${fromId} to ${toId}`);
        };

        components.audioEngine.onCrossfadeEnd = (hotspotId) => {
            console.log(`Crossfade complete to ${hotspotId}`);
        };

        components.spatialIndex.loadHotspots(hotspotData);

        // Global access for debugging
        window.viewer = viewer;
        window.performanceMonitor = components.performanceMonitor;
        window.tileOptimizer = components.tileOptimizer;
        window.tileCleanupManager = components.tileCleanupManager;
        window.debugTileCache = async () => {
            if (!viewer?.world || viewer.world.getItemCount() === 0) {
                console.log('Viewer not ready');
                return;
            }

            const tiledImage = viewer.world.getItemAt(0);
            if (tiledImage?._tileCache) {
                const cache = tiledImage._tileCache;
                const cacheInfo = {
                    type: cache.constructor.name,
                    tilesLoaded: cache._tilesLoaded?.length || 0,
                    imagesLoaded: cache._imagesLoadedCount || 0
                };
                console.log('Tile Cache Info:', cacheInfo);
                console.log(`Estimated cache memory: ${(cacheInfo.tilesLoaded * 256 * 256 * 4 / 1048576).toFixed(2)} MB`);

                // Also show cleanup manager metrics
                const cleanupMetrics = components.tileCleanupManager.getMetrics();
                console.log('Cleanup Manager:', cleanupMetrics);

                // Show tile optimizer stats including worker info
                const optimizerStats = await components.tileOptimizer.getStats();
                console.log('Tile Optimizer Stats:', optimizerStats);
            }
        };

        // Start all performance systems
        components.performanceMonitor.start();
        components.memoryManager.start();
        components.tileOptimizer.start();
        components.tileCleanupManager.start();


        if (debugMode()) {
            components.performanceMonitor.enableDebugOverlay();
        }

        // Setup event handlers
        setupViewerEventHandlers();
        setupKeyboardHandler();
        setupResizeObserver();

        onCleanup(cleanup);
    });

    const setupViewerEventHandlers = () => {
        viewer.addHandler('open', () => {
            console.log('Viewer ready - initializing systems');
            console.log('Using drawer:', viewer.drawer.getType ? viewer.drawer.getType() : 'canvas');
            setViewerReady(true);
            setIsLoading(false);

            const tiledImage = viewer.world.getItemAt(0);
            const bounds = tiledImage.getBounds();
            viewer.viewport.fitBounds(bounds, true);
            viewer.viewport.applyConstraints(true);

            // Store home viewport for "Expand to Full View"
            homeViewport = viewer.viewport.getHomeBounds();

            setTimeout(() => initializeHotspotSystem(), 100);
        });

        // Prevent tile cleanup during critical operations
        viewer.addHandler('zoom', () => {
            if (components.tileCleanupManager) {
                components.tileCleanupManager.setPressure('normal');
            }
        });

        viewer.addHandler('pan', () => {
            if (components.tileCleanupManager) {
                components.tileCleanupManager.setPressure('normal');
            }
        });

        viewer.addHandler('tile-loaded', (event) => {
            if (event.tile?.element && components.renderOptimizer?.getRenderMode() === 'static') {
                optimizeTileElement(event.tile.element);
            }

            if (event.tile && components.tileOptimizer) {
                const loadTime = event.tile.loadTime || event.tiledImage?.lastResetTime || 100;
                components.tileOptimizer.trackLoadTime(loadTime);

                const tileKey = `${event.tile.level || 0}_${event.tile.x || 0}_${event.tile.y || 0}`;
                components.tileOptimizer.loadingTiles.delete(tileKey);
            }
        });

        viewer.addHandler('animation', () => {
            if (components.performanceMonitor) {
                const metrics = components.performanceMonitor.getMetrics();
                if (metrics.averageFPS < performanceConfig.debug.warnThreshold.fps) {
                    const performanceMode = adjustSettingsForPerformance(metrics.averageFPS, metrics.memoryUsage);

                    // Adjust tile cleanup pressure based on performance mode
                    if (components.tileCleanupManager) {
                        const pressureMap = {
                            'emergency': 'critical',
                            'critical': 'critical',
                            'reduced': 'high',
                            'memory-limited': 'high',
                            'normal': 'normal'
                        };
                        components.tileCleanupManager.setPressure(pressureMap[performanceMode] || 'normal');
                    }
                }
            }
        });

        // Handle zoom animation completion
        viewer.addHandler('animation-finish', () => {

            if (isZoomingToHotspot()) {
                setIsZoomingToHotspot(false);
                // Force update hotspot positions after zoom
                if (components.renderer) {
                    components.renderer.updateVisibility();
                }
            }
        });

        
        // Optimize tile loading during zoom animations
        viewer.addHandler('animation-start', (event) => {
            // Pause tile cleanup during zoom animation
            if (isZoomingToHotspot() && components.tileCleanupManager) {
                components.tileCleanupManager.pauseCleanup(3000); // Pause for 3 seconds
            }
        });

        // Clear tile queue during animation for smoother performance
        viewer.addHandler('zoom', (event) => {
            if (isZoomingToHotspot() && viewer.imageLoader) {
                // Clear pending tile loads to reduce jank
                viewer.imageLoader.clear();
            }
        });

        const updateVisibleContent = () => {
            if (intervals.updateTimer) clearTimeout(intervals.updateTimer);
            intervals.updateTimer = setTimeout(() => {
                const { viewportManager, spatialIndex, audioEngine } = components;
                if (!viewportManager || !spatialIndex || !audioEngine) return;

                const viewport = viewportManager.getCurrentViewport();
                const visibleHotspots = spatialIndex.queryViewport(viewport.bounds, viewport.zoom);
                audioEngine.preloadHotspots(visibleHotspots);
            }, performanceConfig.viewport.updateDebounce);
        };

        viewer.addHandler('viewport-change', updateVisibleContent);
    };

    const optimizeTileElement = (element) => {
        if (!components.renderOptimizer.isCurrentlyAnimating() && performanceConfig.renderOptimization.forceIntegerPositions) {
            const transform = element.style.transform;
            if (transform?.includes('translate')) {
                element.style.transform = transform.replace(
                    /translate\(([^,]+),([^)]+)\)/,
                    (match, x, y) => `translate(${Math.round(parseFloat(x))}px, ${Math.round(parseFloat(y))}px)`
                );
            }
        }

        element.style.imageRendering = 'pixelated';
        element.style.transform += ' translateZ(0)';
        element.style.willChange = 'transform';
        element.style.backfaceVisibility = 'hidden';
    };

    const setupKeyboardHandler = () => {
        const keyActions = {
            '+': () => viewer.viewport.zoomBy(performanceConfig.viewer.zoomPerScroll),
            '=': () => viewer.viewport.zoomBy(performanceConfig.viewer.zoomPerScroll),
            '-': () => viewer.viewport.zoomBy(1 / performanceConfig.viewer.zoomPerScroll),
            '_': () => viewer.viewport.zoomBy(1 / performanceConfig.viewer.zoomPerScroll),
            '0': () => viewer.viewport.goHome(),
            'ArrowLeft': () => viewer.viewport.panBy(new OpenSeadragon.Point(-0.1, 0)),
            'ArrowRight': () => viewer.viewport.panBy(new OpenSeadragon.Point(0.1, 0)),
            'ArrowUp': () => viewer.viewport.panBy(new OpenSeadragon.Point(0, -0.1)),
            'ArrowDown': () => viewer.viewport.panBy(new OpenSeadragon.Point(0, 0.1)),
            'f': () => viewer.viewport.fitBounds(viewer.world.getHomeBounds()),
            'F': () => viewer.viewport.fitBounds(viewer.world.getHomeBounds()),
            'r': () => viewer.forceRedraw(),
            'd': () => viewer.viewport.panBy(new OpenSeadragon.Point(0.1, 0)),
            'c': () => {
                const newDebugState = !debugMode();
                setDebugMode(newDebugState);
                localStorage.setItem('debugMode', newDebugState ? 'enabled' : 'disabled');

                if (newDebugState) {
                    components.performanceMonitor?.enableDebugOverlay();
                    console.log('Debug mode: ENABLED (press C to disable)');
                } else {
                    components.performanceMonitor?.disableDebugOverlay();
                    console.log('Debug mode: DISABLED');
                }

                // Update renderer debug mode in BOTH cases
                if (components.renderer) {
                    components.renderer.setDebugMode(newDebugState);
                }
            },
            'w': async () => {
                // Show Web Worker status
                if (components.tileOptimizer) {
                    const stats = await components.tileOptimizer.getStats();
                    console.log('Web Worker Status:', {
                        enabled: stats.workerEnabled,
                        metrics: stats.workerMetrics,
                        details: stats.workerStats
                    });
                }
            }
        };

        intervals.handleKeyPress = (event) => {
            if (!viewer) return;
            const action = keyActions[event.key];
            if (action) {
                event.preventDefault();
                action();
                viewer.viewport.applyConstraints();
            }
        };

        window.addEventListener('keydown', intervals.handleKeyPress);
    };

    const setupResizeObserver = () => {
        components.resizeObserver = new ResizeObserver((entries) => {
            if (!viewer?.viewport || !viewer.isOpen()) return;

            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    requestAnimationFrame(() => {
                        try {
                            // Check if viewer is still valid before resize
                            if (viewer && viewer.viewport && viewer.isOpen()) {
                                viewer.viewport.resize();
                                viewer.viewport.applyConstraints();
                                viewer.forceRedraw();
                            }
                        } catch (error) {
                            // Silently handle resize errors - they're usually transient
                            if (error.message && !error.message.includes('undefined')) {
                                console.warn('Resize error:', error);
                            }
                        }
                    });
                }
            }
        });
        components.resizeObserver.observe(viewerRef);
    };

    const initializeHotspotSystem = () => {
        if (!viewer) return;

        // Use Canvas renderer for mobile, SVG for desktop
        if (isMobile()) {
            // Import dynamically to avoid loading on desktop
            import('../core/CanvasHotspotRenderer.js').then(({ default: CanvasHotspotRenderer }) => {
                components.renderer = new CanvasHotspotRenderer({
                    viewer: viewer,
                    spatialIndex: components.spatialIndex,
                    onHotspotHover: setHoveredHotspot,
                    onHotspotClick: handleHotspotClick,
                    visibilityCheckInterval: performanceConfig.hotspots.visibilityCheckInterval,
                    debugMode: debugMode()
                });
                console.log('Using CanvasHotspotRenderer for mobile');
            });
        } else {
            // Desktop keeps the existing SVG renderer
            components.renderer = new NativeHotspotRenderer({
                viewer: viewer,
                spatialIndex: components.spatialIndex,
                onHotspotHover: setHoveredHotspot,
                onHotspotClick: handleHotspotClick,
                visibilityCheckInterval: performanceConfig.hotspots.visibilityCheckInterval,
                batchSize: performanceConfig.hotspots.batchSize,
                renderDebounceTime: performanceConfig.hotspots.renderDebounceTime,
                maxVisibleHotspots: performanceConfig.hotspots.maxVisibleHotspots,
                minZoomForHotspots: performanceConfig.hotspots.minZoomForHotspots,
                debugMode: debugMode()
            });
        }
    };
    /**
     * Calculate optimal bounds for hotspot zoom with adaptive padding
     */
    const calculateHotspotBounds = (hotspot) => {
        // For CanvasHotspotRenderer, we don't have overlays, so calculate bounds directly
        let bounds;
        if (hotspot.coordinates) {
            // Fallback: calculate from coordinates
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

            const processCoords = (coords) => {
                if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
                    coords.forEach(([x, y]) => {
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                    });
                } else {
                    coords.forEach(polygon => {
                        polygon.forEach(([x, y]) => {
                            minX = Math.min(minX, x);
                            minY = Math.min(minY, y);
                            maxX = Math.max(maxX, x);
                            maxY = Math.max(maxY, y);
                        });
                    });
                }
            };

            processCoords(hotspot.coordinates);
            bounds = { minX, minY, maxX, maxY };
        } else {
            return null;
        }

        // Get image size for calculations
        const tiledImage = viewer.world.getItemAt(0);
        const imageSize = tiledImage.getContentSize();

        // Calculate hotspot size in pixels
        const hotspotWidthPixels = bounds.maxX - bounds.minX;
        const hotspotHeightPixels = bounds.maxY - bounds.minY;
        const hotspotSizePixels = Math.max(hotspotWidthPixels, hotspotHeightPixels);

        // Convert to viewport coordinates
        const topLeft = viewer.viewport.imageToViewportCoordinates(
            new OpenSeadragon.Point(bounds.minX, bounds.minY)
        );
        const bottomRight = viewer.viewport.imageToViewportCoordinates(
            new OpenSeadragon.Point(bounds.maxX, bounds.maxY)
        );

        const width = bottomRight.x - topLeft.x;
        const height = bottomRight.y - topLeft.y;

        // ADAPTIVE PADDING CALCULATION
        const minVisibleAreaPixels = isMobile() ? 400 : 600;
        const maxPaddingFactor = isMobile() ? 0.5 : 0.3;

        let paddingX, paddingY;

        if (hotspotSizePixels < minVisibleAreaPixels) {
            // For small hotspots, ensure minimum visible area
            const targetSizeViewport = viewer.viewport.imageToViewportCoordinates(
                new OpenSeadragon.Point(minVisibleAreaPixels, 0)
            ).x;

            paddingX = Math.max(0, (targetSizeViewport - width) / 2);
            paddingY = Math.max(0, (targetSizeViewport - height) / 2);
        } else {
            // For larger hotspots, use proportional padding
            paddingX = width * maxPaddingFactor;
            paddingY = height * maxPaddingFactor;
        }

        // Calculate zoom bounds
        const zoomBounds = new OpenSeadragon.Rect(
            topLeft.x - paddingX,
            topLeft.y - paddingY,
            width + (paddingX * 2),
            height + (paddingY * 2)
        );

        // NEW QUALITY-BASED ZOOM CALCULATION
        const viewportSize = viewer.viewport.getContainerSize();

        // Calculate desired visible area in pixels (hotspot + padding)
        const desiredVisiblePixels = Math.max(
            hotspotSizePixels * (1 + maxPaddingFactor * 2),
            minVisibleAreaPixels
        );

        // Calculate zoom that would show this many pixels in the viewport
        const pixelsPerViewportUnit = imageSize.x; // Since viewport width = 1.0 for full image
        const desiredViewportUnits = desiredVisiblePixels / pixelsPerViewportUnit;
        const viewportAspectRatio = viewportSize.x / viewportSize.y;

        // Calculate max zoom that maintains quality
        let maxQualityZoom;
        if (viewportAspectRatio > 1) {
            // Landscape viewport
            maxQualityZoom = 1.0 / desiredViewportUnits;
        } else {
            // Portrait viewport
            maxQualityZoom = viewportAspectRatio / desiredViewportUnits;
        }

        // Apply reasonable limits
        maxQualityZoom = Math.min(maxQualityZoom, 10); // Never zoom more than 10x
        maxQualityZoom = Math.max(maxQualityZoom, 0.5); // Never zoom out beyond 0.5x

        zoomBounds.maxZoom = maxQualityZoom;
        zoomBounds.hotspotSizePixels = hotspotSizePixels;
        zoomBounds.desiredVisiblePixels = desiredVisiblePixels;

        return zoomBounds;
    };

    
    
    const zoomToHotspot = async (hotspot) => {
        if (!viewer || isZoomingToHotspot()) {
            return;
        }

        const bounds = calculateHotspotBounds(hotspot);
        if (!bounds) {
            return;
        }

        setIsZoomingToHotspot(true);

        // Calculate viewport aspect ratio
        const viewportAspect = viewer.viewport.getAspectRatio();

        // Calculate current viewport for distance calculation
        const currentBounds = viewer.viewport.getBounds();
        const currentCenter = currentBounds.getCenter();

        // Calculate hotspot center
        let hotspotCenterImage;
        const overlay = components.renderer?.overlays?.get?.(hotspot.id);

        if (overlay && overlay.bounds) {
            hotspotCenterImage = new OpenSeadragon.Point(
                (overlay.bounds.minX + overlay.bounds.maxX) / 2,
                (overlay.bounds.minY + overlay.bounds.maxY) / 2
            );
        } else if (hotspot.coordinates) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const processCoords = (coords) => {
                if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
                    coords.forEach(([x, y]) => {
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                    });
                } else {
                    coords.forEach(polygon => {
                        polygon.forEach(([x, y]) => {
                            minX = Math.min(minX, x);
                            minY = Math.min(minY, y);
                            maxX = Math.max(maxX, x);
                            maxY = Math.max(maxY, y);
                        });
                    });
                }
            };
            processCoords(hotspot.coordinates);
            hotspotCenterImage = new OpenSeadragon.Point(
                (minX + maxX) / 2,
                (minY + maxY) / 2
            );
        }

        const centerViewport = viewer.viewport.imageToViewportCoordinates(hotspotCenterImage);

        // Calculate distance for dynamic timing
        const distance = Math.sqrt(
            Math.pow(centerViewport.x - currentCenter.x, 2) +
            Math.pow(centerViewport.y - currentCenter.y, 2)
        );

        // Store original settings
        const originalSettings = {
            animationTime: viewer.animationTime,
            springStiffness: viewer.springStiffness
        };

        // Set smooth but not too slow animation
        // Range from 1.2s to 2.5s (not too long)
        const animTime = Math.min(2.5, Math.max(1.2, distance * 1.5 + 0.5));

        // Use moderate stiffness for smooth but responsive animation
        // Range from 3.5 to 5.5 (not too low)
        const stiffness = Math.max(3.5, 5.5 - distance * 1.0);

        // Apply settings to viewer and all springs
        viewer.animationTime = animTime;
        viewer.springStiffness = stiffness;

        // Apply to individual springs
        viewer.viewport.centerSpringX.animationTime = animTime;
        viewer.viewport.centerSpringY.animationTime = animTime;
        viewer.viewport.zoomSpring.animationTime = animTime;

        viewer.viewport.centerSpringX.springStiffness = stiffness;
        viewer.viewport.centerSpringY.springStiffness = stiffness;
        viewer.viewport.zoomSpring.springStiffness = stiffness * 0.85; // Slightly softer zoom

        // Calculate final bounds with padding
        const paddingFactor = isMobile() ? 0.75 : 0.85;
        const adjustedBounds = new OpenSeadragon.Rect(
            bounds.x + bounds.width * (1 - paddingFactor) / 2,
            bounds.y + bounds.height * (1 - paddingFactor) / 2,
            bounds.width * paddingFactor,
            bounds.height * paddingFactor
        );

        // Execute zoom with animation
        viewer.viewport.fitBounds(adjustedBounds, false); 

        // Restore original settings after animation
        setTimeout(() => {
            viewer.animationTime = originalSettings.animationTime;
            viewer.springStiffness = originalSettings.springStiffness;

            // Reset all springs to original values
            viewer.viewport.centerSpringX.animationTime = originalSettings.animationTime;
            viewer.viewport.centerSpringY.animationTime = originalSettings.animationTime;
            viewer.viewport.zoomSpring.animationTime = originalSettings.animationTime;

            viewer.viewport.centerSpringX.springStiffness = originalSettings.springStiffness;
            viewer.viewport.centerSpringY.springStiffness = originalSettings.springStiffness;
            viewer.viewport.zoomSpring.springStiffness = originalSettings.springStiffness;
        }, animTime * 1000 + 200);

        // Update hotspot overlays after animation
        setTimeout(() => {
            if (components.renderer) {
                components.renderer.updateVisibility();
                viewer.forceRedraw();
            }
        }, animTime * 1000 + 100);

        // Show expand button on mobile
        if (isMobile()) {
            setShowExpandButton(true);
        }
    };

    /**
 * Handle hotspot click with zoom behavior
 */
    const handleHotspotClick = async (hotspot) => {
        console.log('Hotspot clicked:', hotspot.id, 'isMobile:', isMobile());
        setSelectedHotspot(hotspot);
        setCurrentPlayingHotspot(hotspot);

        // Zoom behavior
        if (isMobile()) {
            console.log('Zooming to hotspot on mobile...');
            // Mobile: Always zoom to hotspot
            await zoomToHotspot(hotspot);
        } else if (ZOOM_CONFIG.enableDesktopZoom) {
            // Desktop: Optional zoom (currently disabled per Deji's specs)
            const currentZoom = viewer.viewport.getZoom();
            if (currentZoom < ZOOM_CONFIG.minZoomForDetail) {
                await zoomToHotspot(hotspot);
            }
        }
        // Play audio - adjust delay to match new animation timing
        const audioDelay = isMobile() ? 1200 : 0; // Changed from 800 to 1200

        setTimeout(() => {
            if (components.audioEngine && hotspot.audioUrl) {
                components.audioEngine.play(hotspot.id);
            }
        }, audioDelay);
    };

    /**
     * Expand to full view (mobile only)
     */
    const expandToFullView = () => {
        if (!viewer || !homeViewport) return;

        setShowExpandButton(false);

        // Smooth animation to home
        const originalAnimationTime = viewer.animationTime;
        viewer.animationTime = 0.8;

        viewer.viewport.fitBounds(homeViewport, false);

        setTimeout(() => {
            viewer.animationTime = originalAnimationTime;
        }, 100);
    };

    const handleZoomIn = () => {
        viewer.viewport.zoomBy(performanceConfig.viewer.zoomPerClick);
        viewer.viewport.applyConstraints();
    };

    const handleZoomOut = () => {
        viewer.viewport.zoomBy(1 / performanceConfig.viewer.zoomPerClick);
        viewer.viewport.applyConstraints();
    };

    const handleHome = () => {
        viewer.viewport.goHome();
        setShowExpandButton(false);
    };

    return (
        <>
            <div class="viewer-container">
                <Show when={previewLoaded() && !viewerReady()}>
                    <img
                        src={`/images/tiles/${props.artworkId}_1024/preview.jpg`}
                        class="preview-image"
                        alt="Loading preview"
                    />
                </Show>

                <div ref={viewerRef} class="openseadragon-viewer" />

                <Show when={isLoading()}>
                    <div class="viewer-loading">
                        <p>Loading high-resolution artwork...</p>
                    </div>
                </Show>

                <Show when={viewerReady() && debugMode()}>
                    <div class="debug-info">
                        <div>Hovered: {hoveredHotspot()?.id || 'none'}</div>
                        <div>Selected: {selectedHotspot()?.id || 'none'}</div>
                        <div>Type: {hoveredHotspot()?.type || 'none'}</div>
                        <div>Total hotspots: {hotspotData.length}</div>
                        <div>Drawer: {viewer?.drawer?.getType ? viewer.drawer.getType() : 'canvas'}</div>
                    </div>
                </Show>

                <Show when={viewerReady() && debugMode() && window.innerWidth > 768}>
                    <div class="shortcuts-info">
                        <details>
                            <summary>Keyboard Shortcuts</summary>
                            <div class="shortcuts-list">
                                <div><kbd>+</kbd> Zoom in</div>
                                <div><kbd>-</kbd> Zoom out</div>
                                <div><kbd>0</kbd> Reset view</div>
                                <div><kbd>F</kbd> Fit to screen</div>
                                <div><kbd>↑↓←→</kbd> Pan</div>
                                <div><kbd>D</kbd> Toggle debug</div>
                                <div><kbd>C</kbd> Force cleanup</div>
                                <div><kbd>W</kbd> Worker status</div>
                            </div>
                        </details>
                    </div>
                </Show>

                <Show when={debugMode()}>
                    <div style={{
                        position: 'absolute',
                        top: '10px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(255, 0, 0, 0.8)',
                        color: 'white',
                        padding: '4px 12px',
                        'border-radius': '4px',
                        'font-size': '12px',
                        'font-weight': 'bold',
                        'z-index': 100,
                        'pointer-events': 'none'
                    }}>
                        DEBUG MODE
                    </div>
                </Show>

                {/* Debug Mode Toggle Button - REMOVE FOR PRODUCTION */}
                <div style={{
                    position: 'fixed',
                    bottom: isMobile() ? '10px' : '20px',
                    left: isMobile() ? '10px' : '20px',
                    'z-index': 100
                }}>
                    <button
                        onClick={() => {
                            const newDebugState = !debugMode();
                            setDebugMode(newDebugState);
                            localStorage.setItem('debugMode', newDebugState ? 'enabled' : 'disabled');

                            if (newDebugState) {
                                components.performanceMonitor?.enableDebugOverlay();
                                console.log('Debug mode: ENABLED');
                            } else {
                                components.performanceMonitor?.disableDebugOverlay();
                                console.log('Debug mode: DISABLED');
                            }

                            if (components.renderer) {
                                components.renderer.setDebugMode(newDebugState);
                            }
                        }}
                        style={{
                            background: debugMode() ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.8)',
                            color: 'white',
                            border: '2px solid ' + (debugMode() ? '#ff0000' : '#666'),
                            padding: isMobile() ? '6px 10px' : '10px 20px',
                            'border-radius': '8px',
                            'font-size': isMobile() ? '12px' : '14px',
                            'font-weight': 'bold',
                            cursor: 'pointer',
                            'backdrop-filter': 'blur(10px)',
                            transition: 'all 0.3s ease',
                            'box-shadow': '0 4px 12px rgba(0, 0, 0, 0.3)'
                        }}
                    >
                        {isMobile() ? (debugMode() ? 'DBG: ON' : 'DBG: OFF') : `Debug Mode: ${debugMode() ? 'ON' : 'OFF'}`}
                        <Show when={!isMobile()}>
                            <div style={{
                                'font-size': '11px',
                                'font-weight': 'normal',
                                'margin-top': '4px',
                                opacity: '0.8'
                            }}>
                                Press C or click here
                            </div>
                        </Show>
                    </button>
                </div>

                <Show when={viewerReady() && window.innerWidth <= 768}>
                    <div class="mobile-controls">
                        <button class="zoom-btn zoom-in" onClick={handleZoomIn}>+</button>
                        <button class="zoom-btn zoom-out" onClick={handleZoomOut}>−</button>
                        <button class="zoom-btn zoom-home" onClick={handleHome}>⌂</button>
                    </div>
                </Show>

                {/* Expand to Full View button for mobile */}
                <Show when={viewerReady() && showExpandButton() && isMobile()}>
                    <div class="expand-button-container">
                        <button class="expand-button" onClick={expandToFullView}>
                            <span style="font-size: 16px; line-height: 1;">⤢</span> Full View
                        </button>
                    </div>
                </Show>

                <Show when={viewerReady() && debugMode()}>
                    <div class="hotspot-legend">
                        <h3>Hotspot Types</h3>
                        {[
                            { type: 'audio-only', label: 'Audio Only' },
                            { type: 'audio-link', label: 'Audio + Link' },
                            { type: 'audio-image', label: 'Audio + Image' },
                            { type: 'audio-image-link', label: 'Audio + Image + Link' },
                            { type: 'audio-sound', label: 'Audio + Sound' }
                        ].map(({ type, label }) => (
                            <div class="legend-item">
                                <div class={`legend-color ${type}`}></div>
                                <span>{label}</span>
                            </div>
                        ))}
                    </div>
                </Show>
            </div>

            {/* Audio Player - Outside viewer container to avoid overflow hidden */}
            <Show when={viewerReady() && components.audioEngine}>
                <AudioPlayer
                    audioEngine={components.audioEngine}
                    currentHotspot={currentPlayingHotspot}
                />
            </Show>
        </>
    );
}

export default ArtworkViewer;