import { onMount, createSignal, onCleanup } from 'solid-js';
import OpenSeadragon from 'openseadragon';
import NativeHotspotRenderer from '../core/NativeHotspotRenderer';
import ViewportManager from '../core/ViewportManager';
import SpatialIndex from '../core/SpatialIndex';
import AudioEngine from '../core/AudioEngine';
import PerformanceMonitor from '../core/PerformanceMonitor';
import RenderOptimizer from '../core/RenderOptimizer';
import TileOptimizer from '../core/TileOptimizer';
import performanceConfig, { adjustSettingsForPerformance } from '../config/performanceConfig';

let hotspotData = [];

/**
 * ArtworkViewer - Optimized for 60 FPS with WebGL support
 */
function ArtworkViewer(props) {
    let viewerRef;
    let viewer = null;
    let renderer = null;
    let viewportManager = null;
    let spatialIndex = null;
    let audioEngine = null;
    let performanceMonitor = null;
    let renderOptimizer = null;
    let tileOptimizer = null;
    let resizeObserver = null;
    let updateTimer = null;

    const [isLoading, setIsLoading] = createSignal(true);
    const [hoveredHotspot, setHoveredHotspot] = createSignal(null);
    const [selectedHotspot, setSelectedHotspot] = createSignal(null);
    const [viewerReady, setViewerReady] = createSignal(false);
    const [previewLoaded, setPreviewLoaded] = createSignal(false);

    // Keyboard handler function
    let handleKeyPress = null;

    // Create cleanup function
    const cleanup = () => {
        if (handleKeyPress) {
            window.removeEventListener('keydown', handleKeyPress);
        }
        if (resizeObserver && viewerRef) {
            resizeObserver.disconnect();
        }
        if (updateTimer) clearTimeout(updateTimer);
        if (tileOptimizer) {
            tileOptimizer.stop();
        }
        if (performanceMonitor) {
            performanceMonitor.stop();
            performanceMonitor.disableDebugOverlay();
        }
        if (renderOptimizer) {
            renderOptimizer.destroy();
        }
        if (viewer) viewer.destroy();
        if (renderer) renderer.destroy();
        if (audioEngine) audioEngine.destroy();

        // Clean up global references
        if (window.performanceMonitor === performanceMonitor) {
            delete window.performanceMonitor;
        }
        if (window.viewer === viewer) {
            delete window.viewer;
        }
        if (window.tileOptimizer === tileOptimizer) {
            delete window.tileOptimizer;
        }
        if (window.debugTileCache) {
            delete window.debugTileCache;
        }
    };

    onMount(async () => {
        // Load hotspots data
        try {
            const response = await fetch('/data/hotspots.json');
            hotspotData = await response.json();
            console.log(`Loaded ${hotspotData.length} hotspots`);
        } catch (error) {
            console.error('Failed to load hotspots:', error);
            hotspotData = [];
        }

        // Load preview image
        const previewImg = new Image();
        previewImg.onload = () => setPreviewLoaded(true);
        previewImg.src = `/images/tiles/${props.artworkId}/preview.jpg`;

        // Get optimized configuration
        const config = performanceConfig.viewer;
        const deviceProfile = performanceConfig.deviceProfile;

        // Initialize OpenSeadragon with 60 FPS optimizations
        const dziUrl = `/images/tiles/${props.artworkId}/${props.artworkId}.dzi`;

        viewer = OpenSeadragon({
            element: viewerRef,
            tileSources: dziUrl,
            prefixUrl: 'https://cdn.jsdelivr.net/npm/openseadragon@5.0.1/build/openseadragon/images/',

            // Rendering - Use optimal drawer
            drawer: config.drawer,
            imageSmoothingEnabled: config.imageSmoothingEnabled,
            smoothTileEdgesMinZoom: config.smoothTileEdgesMinZoom,
            alwaysBlend: config.alwaysBlend,
            placeholderFillStyle: config.placeholderFillStyle,
            opacity: 1,
            preload: config.preload,
            compositeOperation: config.compositeOperation,

            // WebGL options if using WebGL
            ...(config.drawer === 'webgl' ? {
                webglOptions: config.webglOptions
            } : {}),

            // Tile loading optimization
            immediateRender: config.immediateRender,
            imageLoaderLimit: config.imageLoaderLimit,
            maxImageCacheCount: config.maxImageCacheCount,
            timeout: config.timeout,

            // Network optimization
            loadTilesWithAjax: config.loadTilesWithAjax,
            ajaxHeaders: config.ajaxHeaders,

            // Visibility and coverage
            visibilityRatio: config.visibilityRatio,
            minPixelRatio: config.minPixelRatio,
            defaultZoomLevel: config.defaultZoomLevel,
            minZoomLevel: config.minZoomLevel,
            maxZoomPixelRatio: config.maxZoomPixelRatio,

            // Navigation
            constrainDuringPan: config.constrainDuringPan,
            wrapHorizontal: config.wrapHorizontal,
            wrapVertical: config.wrapVertical,

            // Animation settings for 60 FPS
            animationTime: config.animationTime,
            springStiffness: config.springStiffness,
            blendTime: config.blendTime,

            // Controls
            showNavigationControl: true,
            navigationControlAnchor: OpenSeadragon.ControlAnchor.TOP_RIGHT,
            showZoomControl: true,
            showHomeControl: true,
            showFullPageControl: false,
            showRotationControl: false,

            // Input handling
            gestureSettingsMouse: {
                scrollToZoom: true,
                clickToZoom: false,
                dblClickToZoom: true,
                flickEnabled: config.flickEnabled
            },
            gestureSettingsTouch: {
                scrollToZoom: false,
                clickToZoom: false,
                dblClickToZoom: true,
                flickEnabled: config.flickEnabled,
                flickMinSpeed: config.flickMinSpeed,
                flickMomentum: config.flickMomentum,
                pinchToZoom: true
            },

            // Performance
            debugMode: config.debugMode,
            crossOriginPolicy: 'Anonymous',
            ajaxWithCredentials: false,

            // Additional performance settings
            preserveViewport: config.preserveViewport,
            preserveImageSizeOnResize: config.preserveImageSizeOnResize,
            maxTilesPerFrame: config.maxTilesPerFrame,
            smoothImageZoom: config.smoothImageZoom
        });

        // Initialize components
        spatialIndex = new SpatialIndex();
        spatialIndex.loadHotspots(hotspotData);
        viewportManager = new ViewportManager(viewer);
        audioEngine = new AudioEngine();
        performanceMonitor = new PerformanceMonitor(viewer);
        renderOptimizer = new RenderOptimizer(viewer);
        tileOptimizer = new TileOptimizer(viewer);

        // Make viewer and performanceMonitor globally accessible for debugging
        window.viewer = viewer;
        window.performanceMonitor = performanceMonitor;
        window.tileOptimizer = tileOptimizer;

        // Add debug helper functions
        window.debugTileCache = () => {
            if (!viewer || !viewer.world || viewer.world.getItemCount() === 0) {
                console.log('Viewer not ready');
                return;
            }

            const tiledImage = viewer.world.getItemAt(0);
            if (tiledImage && tiledImage._tileCache) {
                const cache = tiledImage._tileCache;
                const cacheInfo = {
                    type: cache.constructor.name,
                    tilesLoaded: cache._tilesLoaded ? cache._tilesLoaded.length : 0,
                    imagesLoaded: cache._imagesLoadedCount || 0
                };
                console.log('Tile Cache Info:', cacheInfo);

                // Memory usage estimate
                const estimatedMemory = (cacheInfo.tilesLoaded * 256 * 256 * 4) / 1048576; // MB
                console.log(`Estimated cache memory: ${estimatedMemory.toFixed(2)} MB`);
            }
        };

        performanceMonitor.start();

        // Enable debug overlay if configured
        if (performanceConfig.debug.showFPS || performanceConfig.debug.showMetrics) {
            performanceMonitor.enableDebugOverlay();
        }

        // Viewer ready handler
        viewer.addHandler('open', () => {
            console.log('Viewer ready - initializing systems');
            console.log('Using drawer:', viewer.drawer.getType ? viewer.drawer.getType() : 'canvas');
            setViewerReady(true);
            setIsLoading(false);

            // Fit to screen
            const tiledImage = viewer.world.getItemAt(0);
            const bounds = tiledImage.getBounds();
            viewer.viewport.fitBounds(bounds, true);
            viewer.viewport.applyConstraints(true);

            // Initialize tile optimizer
            tileOptimizer.start();

            // Initialize hotspots after a short delay
            setTimeout(() => {
                initializeHotspotSystem();
                if (viewportManager && spatialIndex && audioEngine) {
                    const viewport = viewportManager.getCurrentViewport();
                    const visibleHotspots = spatialIndex.queryViewport(viewport.bounds, viewport.zoom);
                    audioEngine.preloadHotspots(visibleHotspots);
                }
            }, 100);
        });

        // Optimize tile rendering based on render mode
        viewer.addHandler('tile-loaded', (event) => {
            if (event.tile && event.tile.element && renderOptimizer && renderOptimizer.getRenderMode() === 'static') {
                const element = event.tile.element;

                // Apply optimization based on current render mode
                if (!renderOptimizer.isCurrentlyAnimating()) {
                    // Force integer positioning
                    if (performanceConfig.renderOptimization.forceIntegerPositions) {
                        const transform = element.style.transform;
                        if (transform && transform.includes('translate')) {
                            element.style.transform = transform.replace(
                                /translate\(([^,]+),([^)]+)\)/,
                                (match, x, y) => {
                                    const intX = Math.round(parseFloat(x));
                                    const intY = Math.round(parseFloat(y));
                                    return `translate(${intX}px, ${intY}px)`;
                                }
                            );
                        }
                    }

                    element.style.imageRendering = 'pixelated';
                    element.style.transform += ' translateZ(0)';
                    element.style.willChange = 'transform';
                    element.style.backfaceVisibility = 'hidden';
                }
            }

            // Track tile load times for optimization
            if (event.tile && tileOptimizer) {
                const loadTime = event.tile.loadTime || event.tiledImage?.lastResetTime || 100;
                tileOptimizer.trackLoadTime(loadTime);

                // Remove from loading set
                const level = event.tile.level || 0;
                const x = event.tile.x || 0;
                const y = event.tile.y || 0;
                const tileKey = `${level}_${x}_${y}`;
                tileOptimizer.loadingTiles.delete(tileKey);
            }
        });

        // Monitor performance and adjust settings
        viewer.addHandler('animation', () => {
            if (performanceMonitor) {
                const metrics = performanceMonitor.getMetrics();
                if (metrics.averageFPS < performanceConfig.debug.warnThreshold.fps) {
                    // Dynamic quality adjustment
                    adjustSettingsForPerformance(
                        metrics.averageFPS,
                        metrics.memoryUsage
                    );
                }
            }
        });

        // Update visible content with optimized debouncing
        const updateVisibleContent = () => {
            if (updateTimer) clearTimeout(updateTimer);
            updateTimer = setTimeout(() => {
                if (!viewportManager || !spatialIndex || !audioEngine) return;
                const viewport = viewportManager.getCurrentViewport();
                const visibleHotspots = spatialIndex.queryViewport(viewport.bounds, viewport.zoom);
                audioEngine.preloadHotspots(visibleHotspots);
            }, performanceConfig.viewport.updateDebounce);
        };

        viewer.addHandler('viewport-change', updateVisibleContent);

        // Optimized resize handling
        resizeObserver = new ResizeObserver((entries) => {
            if (!viewer || !viewer.viewport || !viewer.isOpen()) return;

            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    requestAnimationFrame(() => {
                        try {
                            viewer.viewport.resize();
                            viewer.viewport.applyConstraints();
                            viewer.forceRedraw();
                        } catch (error) {
                            console.warn('Resize error:', error);
                        }
                    });
                }
            }
        });
        resizeObserver.observe(viewerRef);

        // Keyboard navigation
        handleKeyPress = (event) => {
            if (!viewer) return;

            const handlers = {
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
                'd': () => {
                    // Toggle debug mode
                    const showFPS = !performanceConfig.debug.showFPS;
                    performanceConfig.debug.showFPS = showFPS;
                    performanceConfig.debug.showMetrics = showFPS;
                    if (showFPS) {
                        performanceMonitor.enableDebugOverlay();
                    } else {
                        performanceMonitor.disableDebugOverlay();
                    }
                }
            };

            const handler = handlers[event.key];
            if (handler) {
                event.preventDefault();
                handler();
                viewer.viewport.applyConstraints();
            }
        };

        window.addEventListener('keydown', handleKeyPress);

        // Memory monitoring
        if (performance.memory) {
            setInterval(() => {
                const memUsage = performance.memory.usedJSHeapSize / 1048576;
                if (memUsage > performanceConfig.memory.criticalMemoryThreshold) {
                    console.warn(`Critical memory usage: ${memUsage.toFixed(2)} MB`);
                    // Force garbage collection if available
                    if (viewer.world && viewer.world.getItemCount() > 0) {
                        const tiledImage = viewer.world.getItemAt(0);
                        if (tiledImage && tiledImage._tileCache) {
                            // Clear old tiles
                            tileOptimizer.clearOldTiles();
                        }
                    }
                }
            }, performanceConfig.memory.gcInterval);
        }

        // Setup cleanup
        onCleanup(cleanup);
    });

    const initializeHotspotSystem = () => {
        if (!viewer) return;

        renderer = new NativeHotspotRenderer({
            viewer: viewer,
            spatialIndex: spatialIndex,
            onHotspotHover: setHoveredHotspot,
            onHotspotClick: handleHotspotClick,
            visibilityCheckInterval: performanceConfig.hotspots.visibilityCheckInterval,
            batchSize: performanceConfig.hotspots.batchSize,
            renderDebounceTime: performanceConfig.hotspots.renderDebounceTime,
            maxVisibleHotspots: performanceConfig.hotspots.maxVisibleHotspots,
            minZoomForHotspots: performanceConfig.hotspots.minZoomForHotspots
        });
    };

    const handleHotspotClick = (hotspot) => {
        console.log('Hotspot clicked:', hotspot);
        setSelectedHotspot(hotspot);

        if (audioEngine && hotspot.audioUrl) {
            audioEngine.play(hotspot.id);
        }
    };

    // Mobile controls
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
    };

    return (
        <div class="viewer-container">
            {/* Preview for instant display */}
            {previewLoaded() && !viewerReady() && (
                <img
                    src={`/images/tiles/${props.artworkId}/preview.jpg`}
                    class="preview-image"
                    alt="Loading preview"
                />
            )}

            <div ref={viewerRef} class="openseadragon-viewer" />

            {isLoading() && (
                <div class="viewer-loading">
                    <p>Loading high-resolution artwork...</p>
                </div>
            )}

            {/* Debug info */}
            {viewerReady() && performanceConfig.debug.showMetrics && (
                <div class="debug-info">
                    <div>Hovered: {hoveredHotspot()?.id || 'none'}</div>
                    <div>Selected: {selectedHotspot()?.id || 'none'}</div>
                    <div>Type: {hoveredHotspot()?.type || 'none'}</div>
                    <div>Total hotspots: {hotspotData.length}</div>
                    <div>Drawer: {viewer?.drawer?.getType ? viewer.drawer.getType() : 'canvas'}</div>
                </div>
            )}

            {/* Keyboard shortcuts */}
            {viewerReady() && window.innerWidth > 768 && (
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
                        </div>
                    </details>
                </div>
            )}

            {/* Mobile controls */}
            {viewerReady() && window.innerWidth <= 768 && (
                <div class="mobile-controls">
                    <button class="zoom-btn zoom-in" onClick={handleZoomIn}>+</button>
                    <button class="zoom-btn zoom-out" onClick={handleZoomOut}>−</button>
                    <button class="zoom-btn zoom-home" onClick={handleHome}>⌂</button>
                </div>
            )}

            {/* Hotspot legend */}
            {viewerReady() && (
                <div class="hotspot-legend">
                    <h3>Hotspot Types</h3>
                    <div class="legend-item">
                        <div class="legend-color audio-only"></div>
                        <span>Audio Only</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color audio-link"></div>
                        <span>Audio + Link</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color audio-image"></div>
                        <span>Audio + Image</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color audio-image-link"></div>
                        <span>Audio + Image + Link</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color audio-sound"></div>
                        <span>Audio + Sound</span>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ArtworkViewer;