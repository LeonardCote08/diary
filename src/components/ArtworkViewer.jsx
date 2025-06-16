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

        // Initialize viewer
        const config = performanceConfig.viewer;
        const dziUrl = `/images/tiles/${props.artworkId}_1024/${props.artworkId}.dzi`;

        viewer = OpenSeadragon({
            element: viewerRef,
            tileSources: dziUrl,
            prefixUrl: 'https://cdn.jsdelivr.net/npm/openseadragon@5.0.1/build/openseadragon/images/',

            // Rendering
            drawer: config.drawer,
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

            // Controls
            showNavigationControl: true,
            navigationControlAnchor: OpenSeadragon.ControlAnchor.TOP_RIGHT,
            showZoomControl: true,
            showHomeControl: true,
            showFullPageControl: false,
            showRotationControl: false,

            // Input
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
            tileOptimizer: new TileOptimizer(viewer)
        };

        components.spatialIndex.loadHotspots(hotspotData);

        // Global access for debugging
        window.viewer = viewer;
        window.performanceMonitor = components.performanceMonitor;
        window.tileOptimizer = components.tileOptimizer;
        window.debugTileCache = () => {
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
            }
        };

        components.performanceMonitor.start();
        if (performanceConfig.debug.showFPS || performanceConfig.debug.showMetrics) {
            components.performanceMonitor.enableDebugOverlay();
        }

        // Setup event handlers
        setupViewerEventHandlers();
        setupKeyboardHandler();
        setupResizeObserver();
        startMemoryMonitoring();

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

            components.tileOptimizer.start();
            setTimeout(() => initializeHotspotSystem(), 100);
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
                    adjustSettingsForPerformance(metrics.averageFPS, metrics.memoryUsage);
                }
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
            'd': () => {
                const showFPS = !performanceConfig.debug.showFPS;
                performanceConfig.debug.showFPS = showFPS;
                performanceConfig.debug.showMetrics = showFPS;
                if (showFPS) {
                    components.performanceMonitor.enableDebugOverlay();
                } else {
                    components.performanceMonitor.disableDebugOverlay();
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
        components.resizeObserver.observe(viewerRef);
    };

    const startMemoryMonitoring = () => {
        if (performance.memory) {
            intervals.memory = setInterval(() => {
                const memUsage = performance.memory.usedJSHeapSize / 1048576;
                if (memUsage > performanceConfig.memory.criticalMemoryThreshold) {
                    console.warn(`Critical memory usage: ${memUsage.toFixed(2)} MB`);
                    if (viewer.world?.getItemCount() > 0) {
                        components.tileOptimizer?.clearOldTiles();
                    }
                }
            }, performanceConfig.memory.gcInterval);
        }
    };

    const initializeHotspotSystem = () => {
        if (!viewer) return;

        components.renderer = new NativeHotspotRenderer({
            viewer: viewer,
            spatialIndex: components.spatialIndex,
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

        if (components.audioEngine && hotspot.audioUrl) {
            components.audioEngine.play(hotspot.id);
        }
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
    };

    return (
        <div class="viewer-container">
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

            {viewerReady() && performanceConfig.debug.showMetrics && (
                <div class="debug-info">
                    <div>Hovered: {hoveredHotspot()?.id || 'none'}</div>
                    <div>Selected: {selectedHotspot()?.id || 'none'}</div>
                    <div>Type: {hoveredHotspot()?.type || 'none'}</div>
                    <div>Total hotspots: {hotspotData.length}</div>
                    <div>Drawer: {viewer?.drawer?.getType ? viewer.drawer.getType() : 'canvas'}</div>
                </div>
            )}

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

            {viewerReady() && window.innerWidth <= 768 && (
                <div class="mobile-controls">
                    <button class="zoom-btn zoom-in" onClick={handleZoomIn}>+</button>
                    <button class="zoom-btn zoom-out" onClick={handleZoomOut}>−</button>
                    <button class="zoom-btn zoom-home" onClick={handleHome}>⌂</button>
                </div>
            )}

            {viewerReady() && (
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
            )}
        </div>
    );
}

export default ArtworkViewer;