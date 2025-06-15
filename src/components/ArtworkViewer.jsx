import { onMount, createSignal, onCleanup } from 'solid-js';
import OpenSeadragon from 'openseadragon';
import NativeHotspotRenderer from '../core/NativeHotspotRenderer';
import ViewportManager from '../core/ViewportManager';
import SpatialIndex from '../core/SpatialIndex';
import AudioEngine from '../core/AudioEngine';
import PerformanceMonitor from '../core/PerformanceMonitor';
import RenderOptimizer from '../core/RenderOptimizer';
import performanceConfig from '../config/performanceConfig';

let hotspotData = [];

/**
 * ArtworkViewer - Optimized for smooth zoom and perfect text clarity
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
    let resizeObserver = null;
    let updateTimer = null;

    const [isLoading, setIsLoading] = createSignal(true);
    const [hoveredHotspot, setHoveredHotspot] = createSignal(null);
    const [selectedHotspot, setSelectedHotspot] = createSignal(null);
    const [viewerReady, setViewerReady] = createSignal(false);
    const [previewLoaded, setPreviewLoaded] = createSignal(false);

    // Keyboard handler function
    let handleKeyPress = null;

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

        // Initialize OpenSeadragon with optimized settings
        const dziUrl = `/images/tiles/${props.artworkId}/${props.artworkId}.dzi`;

        viewer = OpenSeadragon({
            element: viewerRef,
            tileSources: dziUrl,
            prefixUrl: 'https://cdn.jsdelivr.net/npm/openseadragon@5.0.1/build/openseadragon/images/',

            // Start with smoothing enabled for initial load
            imageSmoothingEnabled: true,
            smoothTileEdgesMinZoom: 1.5,
            alwaysBlend: true,
            placeholderFillStyle: '#000000',
            opacity: 1,
            preload: true,
            compositeOperation: null,

            // Tile loading optimization
            immediateRender: false,
            imageLoaderLimit: 10,
            maxImageCacheCount: 1500,
            timeout: 120000,

            // Specify drawer instead of useCanvas (deprecated)
            drawer: 'canvas',

            // Visibility and coverage
            visibilityRatio: 0.9,
            minPixelRatio: 0.9,
            defaultZoomLevel: 1,
            minZoomLevel: 0.5,
            maxZoomPixelRatio: 4,

            // Navigation
            constrainDuringPan: true,
            wrapHorizontal: false,
            wrapVertical: false,

            // Smoother animation settings
            animationTime: 0.5,
            springStiffness: 7,
            blendTime: 0.1,

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
                flickEnabled: true
            },
            gestureSettingsTouch: {
                scrollToZoom: false,
                clickToZoom: false,
                dblClickToZoom: true,
                flickEnabled: true,
                pinchToZoom: true
            },

            // Performance
            debugMode: false,
            crossOriginPolicy: 'Anonymous',
            ajaxWithCredentials: false
        });

        // Initialize components
        spatialIndex = new SpatialIndex();
        spatialIndex.loadHotspots(hotspotData);
        viewportManager = new ViewportManager(viewer);
        audioEngine = new AudioEngine();
        performanceMonitor = new PerformanceMonitor(viewer);
        renderOptimizer = new RenderOptimizer(viewer);

        // Make viewer and performanceMonitor globally accessible for debugging
        window.viewer = viewer;
        window.performanceMonitor = performanceMonitor;

        // Add debug helper functions
        window.debugTileCache = () => {
            if (!viewer || !viewer.world || viewer.world.getItemCount() === 0) {
                console.log('Viewer not ready');
                return;
            }

            const tiledImage = viewer.world.getItemAt(0);
            if (tiledImage && tiledImage._tileCache) {
                console.log('Tile Cache Structure:', tiledImage._tileCache);
                console.log('Cache type:', tiledImage._tileCache.constructor.name);

                // Try different methods to count
                if (tiledImage._tileCache._tiles) {
                    console.log('Tiles in _tiles:', Object.keys(tiledImage._tileCache._tiles).length);
                }
                if (tiledImage._tileCache.length !== undefined) {
                    console.log('Cache length:', tiledImage._tileCache.length);
                }

                // Show first few entries
                let count = 0;
                for (let key in tiledImage._tileCache) {
                    if (count++ < 5) {
                        console.log(`Cache[${key}]:`, tiledImage._tileCache[key]);
                    }
                }
            } else {
                console.log('No tile cache found');
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
            setViewerReady(true);
            setIsLoading(false);

            // Fit to screen
            const tiledImage = viewer.world.getItemAt(0);
            const bounds = tiledImage.getBounds();
            viewer.viewport.fitBounds(bounds, true);
            viewer.viewport.applyConstraints(true);

            // Initialize hotspots after a short delay
            setTimeout(() => {
                initializeHotspotSystem();
                const viewport = viewportManager.getCurrentViewport();
                const visibleHotspots = spatialIndex.queryViewport(viewport.bounds, viewport.zoom);
                audioEngine.preloadHotspots(visibleHotspots);
            }, 100);
        });

        // Optimize tile rendering only when loaded
        viewer.addHandler('tile-loaded', (event) => {
            if (event.tile && event.tile.element && renderOptimizer.getRenderMode() === 'static') {
                const element = event.tile.element;

                // Apply optimization based on current render mode
                if (!renderOptimizer.isCurrentlyAnimating()) {
                    element.style.imageRendering = 'pixelated';
                    element.style.transform = 'translateZ(0)';
                    element.style.willChange = 'transform';
                    element.style.backfaceVisibility = 'hidden';
                }
            }
        });

        // Update visible content with debouncing
        const updateVisibleContent = () => {
            if (updateTimer) clearTimeout(updateTimer);
            updateTimer = setTimeout(() => {
                if (!viewportManager || !spatialIndex || !audioEngine) return;
                const viewport = viewportManager.getCurrentViewport();
                const visibleHotspots = spatialIndex.queryViewport(viewport.bounds, viewport.zoom);
                audioEngine.preloadHotspots(visibleHotspots);
            }, 150);
        };

        viewer.addHandler('viewport-change', updateVisibleContent);

        // Resize handling
        resizeObserver = new ResizeObserver((entries) => {
            if (!viewer || !viewer.viewport || !viewer.isOpen()) return;

            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    try {
                        viewer.viewport.resize();
                        viewer.viewport.applyConstraints();
                        viewer.forceRedraw();
                    } catch (error) {
                        console.warn('Resize error:', error);
                    }
                }
            }
        });
        resizeObserver.observe(viewerRef);

        // Keyboard navigation
        handleKeyPress = (event) => {
            if (!viewer) return;

            const handlers = {
                '+': () => viewer.viewport.zoomBy(1.3),
                '=': () => viewer.viewport.zoomBy(1.3),
                '-': () => viewer.viewport.zoomBy(0.77),
                '_': () => viewer.viewport.zoomBy(0.77),
                '0': () => viewer.viewport.goHome(),
                'ArrowLeft': () => viewer.viewport.panBy(new OpenSeadragon.Point(-0.1, 0)),
                'ArrowRight': () => viewer.viewport.panBy(new OpenSeadragon.Point(0.1, 0)),
                'ArrowUp': () => viewer.viewport.panBy(new OpenSeadragon.Point(0, -0.1)),
                'ArrowDown': () => viewer.viewport.panBy(new OpenSeadragon.Point(0, 0.1)),
                'f': () => viewer.viewport.fitBounds(viewer.world.getHomeBounds()),
                'F': () => viewer.viewport.fitBounds(viewer.world.getHomeBounds()),
                'r': () => viewer.forceRedraw()
            };

            const handler = handlers[event.key];
            if (handler) {
                event.preventDefault();
                handler();
                viewer.viewport.applyConstraints();
            }
        };

        window.addEventListener('keydown', handleKeyPress);

        // Cleanup
        onCleanup(() => {
            if (handleKeyPress) {
                window.removeEventListener('keydown', handleKeyPress);
            }
            if (resizeObserver && viewerRef) {
                resizeObserver.disconnect();
            }
            if (updateTimer) clearTimeout(updateTimer);
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
            if (window.debugTileCache) {
                delete window.debugTileCache;
            }
        });
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
        viewer.viewport.zoomBy(1.5);
        viewer.viewport.applyConstraints();
    };

    const handleZoomOut = () => {
        viewer.viewport.zoomBy(0.67);
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