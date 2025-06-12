import { onMount, createSignal, onCleanup } from 'solid-js';
import OpenSeadragon from 'openseadragon';
import NativeHotspotRenderer from '../core/NativeHotspotRenderer';
import ViewportManager from '../core/ViewportManager';
import SpatialIndex from '../core/SpatialIndex';
import AudioEngine from '../core/AudioEngine';
import PerformanceMonitor from '../core/PerformanceMonitor';
import performanceConfig from '../config/performanceConfig';

let hotspotData = [];

/**
 * ArtworkViewer - Main viewer component with fixed tile quality
 */
function ArtworkViewer(props) {
    let viewerRef;
    let viewer = null;
    let renderer = null;
    let viewportManager = null;
    let spatialIndex = null;
    let audioEngine = null;
    let performanceMonitor = null;

    const [isLoading, setIsLoading] = createSignal(true);
    const [hoveredHotspot, setHoveredHotspot] = createSignal(null);
    const [selectedHotspot, setSelectedHotspot] = createSignal(null);
    const [viewerReady, setViewerReady] = createSignal(false);
    const [previewLoaded, setPreviewLoaded] = createSignal(false);

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

        // Load preview image first
        const previewImg = new Image();
        previewImg.onload = () => setPreviewLoaded(true);
        previewImg.src = `/images/tiles/${props.artworkId}/preview.jpg`;

        // Initialize OpenSeadragon with fixed quality settings
        const viewerSettings = performanceConfig.viewer;

        viewer = OpenSeadragon({
            element: viewerRef,
            tileSources: `/images/tiles/${props.artworkId}/${props.artworkId}.dzi`,
            prefixUrl: 'https://cdn.jsdelivr.net/npm/openseadragon@5.0.1/build/openseadragon/images/',

            // Core performance settings - OPTIMIZED
            immediateRender: viewerSettings.immediateRender,
            preserveViewport: viewerSettings.preserveViewport,
            visibilityRatio: viewerSettings.visibilityRatio,
            constrainDuringPan: viewerSettings.constrainDuringPan,
            wrapHorizontal: viewerSettings.wrapHorizontal,
            wrapVertical: viewerSettings.wrapVertical,

            // Tile loading - MAXIMUM QUALITY
            imageLoaderLimit: viewerSettings.imageLoaderLimit,
            maxImageCacheCount: viewerSettings.maxImageCacheCount,
            minPixelRatio: viewerSettings.minPixelRatio,
            smoothTileEdgesMinZoom: viewerSettings.smoothTileEdgesMinZoom,
            alwaysBlend: viewerSettings.alwaysBlend,
            placeholderFillStyle: viewerSettings.placeholderFillStyle,

            // Quality optimizations
            minZoomImageRatio: viewerSettings.minZoomImageRatio,
            maxTilesPerFrame: viewerSettings.maxTilesPerFrame,
            tileRetryMax: viewerSettings.tileRetryMax,
            tileRetryDelay: viewerSettings.tileRetryDelay,
            compositeOperation: viewerSettings.compositeOperation,
            preload: viewerSettings.preload,
            imageSmoothingEnabled: viewerSettings.imageSmoothingEnabled,

            // Navigation controls
            showNavigationControl: true,
            navigationControlAnchor: OpenSeadragon.ControlAnchor.TOP_RIGHT,
            showZoomControl: true,
            showHomeControl: true,
            showFullPageControl: false,
            showRotationControl: false,
            showNavigator: viewerSettings.showNavigator,

            // Zoom settings - ALLOW DEEPER ZOOM
            minZoomLevel: viewerSettings.minZoomLevel,
            maxZoomLevel: viewerSettings.maxZoomLevel,
            defaultZoomLevel: viewerSettings.defaultZoomLevel,
            zoomPerClick: viewerSettings.zoomPerClick,
            zoomPerScroll: viewerSettings.zoomPerScroll,

            // Smooth animations
            animationTime: viewerSettings.animationTime,
            springStiffness: viewerSettings.springStiffness,
            blendTime: viewerSettings.blendTime,
            flickEnabled: viewerSettings.flickEnabled,
            flickMinSpeed: viewerSettings.flickMinSpeed,
            flickMomentum: viewerSettings.flickMomentum,

            // Mouse/Touch settings
            gestureSettingsMouse: {
                scrollToZoom: true,
                clickToZoom: false,
                dblClickToZoom: true,
                flickEnabled: viewerSettings.flickEnabled,
                pinchRotate: false
            },
            gestureSettingsTouch: {
                scrollToZoom: false,
                clickToZoom: false,
                dblClickToZoom: true,
                flickEnabled: viewerSettings.flickEnabled,
                pinchToZoom: true,
                pinchRotate: false
            },

            // Performance
            debugMode: performanceConfig.debug.showMetrics,
            timeout: performanceConfig.network.timeout,
            useCanvas: true,
            drawer: 'canvas',
            crossOriginPolicy: 'Anonymous',
            ajaxWithCredentials: false,

            // Subpixel rendering for quality
            subPixelRoundingForTransparency: OpenSeadragon.SUBPIXEL_ROUNDING_OCCURRENCES.ALWAYS
        });

        // Initialize spatial index
        spatialIndex = new SpatialIndex();
        spatialIndex.loadHotspots(hotspotData);

        // Initialize viewport manager
        viewportManager = new ViewportManager(viewer);

        // Initialize audio engine
        audioEngine = new AudioEngine();

        // Initialize performance monitor
        performanceMonitor = new PerformanceMonitor(viewer);
        performanceMonitor.start();

        // Enable debug overlay if in debug mode
        if (performanceConfig.debug.showMetrics) {
            performanceMonitor.enableDebugOverlay();
        }

        // Viewer ready handler
        viewer.addHandler('open', () => {
            console.log('OpenSeadragon viewer ready');
            setViewerReady(true);
            setIsLoading(false);

            // Force high quality on initial load
            viewer.viewport.applyConstraints(true);

            // Initialize hotspot system after viewer is stable
            setTimeout(() => {
                initializeHotspotSystem();

                // Preload audio for visible hotspots
                const viewport = viewportManager.getCurrentViewport();
                const visibleHotspots = spatialIndex.queryViewport(viewport.bounds, viewport.zoom);
                audioEngine.preloadHotspots(visibleHotspots);
            }, 100);
        });

        // Optimize tile rendering for quality
        viewer.addHandler('tile-drawing', (event) => {
            const context = event.context;
            // Force high-quality rendering
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
        });

        viewer.addHandler('tile-loaded', (event) => {
            if (event.tile && event.tile.element) {
                // Remove any blur filters
                event.tile.element.style.imageRendering = 'auto';
                event.tile.element.style.filter = 'none';
                event.tile.element.style.transform = 'translateZ(0)';
                // Force GPU acceleration
                event.tile.element.style.willChange = 'transform';
            }
        });

        // Force redraw on animation finish to ensure quality
        viewer.addHandler('animation-finish', () => {
            viewer.forceRedraw();
        });

        // Update visible content on viewport change
        let updateTimer = null;
        const updateVisibleContent = () => {
            if (updateTimer) clearTimeout(updateTimer);
            updateTimer = setTimeout(() => {
                if (!viewportManager || !spatialIndex || !audioEngine) return;

                const viewport = viewportManager.getCurrentViewport();
                const visibleHotspots = spatialIndex.queryViewport(viewport.bounds, viewport.zoom);
                audioEngine.preloadHotspots(visibleHotspots);
            }, 200);
        };

        viewer.addHandler('viewport-change', updateVisibleContent);

        // Handle resize
        const resizeObserver = new ResizeObserver(() => {
            if (viewer && viewer.viewport) {
                viewer.viewport.resize();
                viewer.viewport.applyConstraints();
                viewer.forceRedraw();
            }
        });
        resizeObserver.observe(viewerRef);

        // Keyboard navigation
        const handleKeyPress = (event) => {
            if (!viewer) return;

            const handlers = {
                '+': () => viewer.viewport.zoomBy(1.2),
                '=': () => viewer.viewport.zoomBy(1.2),
                '-': () => viewer.viewport.zoomBy(0.8),
                '_': () => viewer.viewport.zoomBy(0.8),
                '0': () => viewer.viewport.goHome(),
                'ArrowLeft': () => viewer.viewport.panBy(new OpenSeadragon.Point(-0.05, 0)),
                'ArrowRight': () => viewer.viewport.panBy(new OpenSeadragon.Point(0.05, 0)),
                'ArrowUp': () => viewer.viewport.panBy(new OpenSeadragon.Point(0, -0.05)),
                'ArrowDown': () => viewer.viewport.panBy(new OpenSeadragon.Point(0, 0.05)),
                'f': () => viewer.viewport.fitBounds(viewer.world.getHomeBounds()),
                'F': () => viewer.viewport.fitBounds(viewer.world.getHomeBounds())
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
            window.removeEventListener('keydown', handleKeyPress);
            resizeObserver.disconnect();
            if (updateTimer) clearTimeout(updateTimer);
            if (performanceMonitor) {
                performanceMonitor.stop();
                performanceMonitor.disableDebugOverlay();
            }
            if (viewer) viewer.destroy();
            if (renderer) renderer.destroy();
            if (audioEngine) audioEngine.destroy();
        });
    });

    const initializeHotspotSystem = () => {
        if (!viewer) {
            console.error('Viewer not ready');
            return;
        }

        // Initialize native renderer
        renderer = new NativeHotspotRenderer({
            viewer: viewer,
            spatialIndex: spatialIndex,
            onHotspotHover: setHoveredHotspot,
            onHotspotClick: handleHotspotClick
        });
    };

    const handleHotspotClick = (hotspot) => {
        console.log('Hotspot clicked:', hotspot);
        setSelectedHotspot(hotspot);

        // Play audio if available
        if (audioEngine && hotspot.audioUrl) {
            audioEngine.play(hotspot.id);
        }
    };

    // Mobile button handlers
    const handleZoomIn = () => {
        viewer.viewport.zoomBy(1.5);
        viewer.viewport.applyConstraints();
    };

    const handleZoomOut = () => {
        viewer.viewport.zoomBy(0.7);
        viewer.viewport.applyConstraints();
    };

    const handleHome = () => {
        viewer.viewport.goHome();
    };

    return (
        <div class="viewer-container">
            {/* Preview image for instant display */}
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
                    <p>Loading artwork...</p>
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

            {/* Keyboard shortcuts - desktop only */}
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