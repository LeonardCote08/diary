import { onMount, createSignal, onCleanup } from 'solid-js';
import OpenSeadragon from 'openseadragon';
import NativeHotspotRenderer from '../core/NativeHotspotRenderer';
import ViewportManager from '../core/ViewportManager';
import SpatialIndex from '../core/SpatialIndex';
import AudioEngine from '../core/AudioEngine';
import performanceConfig from '../config/performanceConfig';

let hotspotData = [];

/**
 * ArtworkViewer - Optimized for smooth zooming and clear image quality
 * Following Deji's performance requirements
 */
function ArtworkViewer(props) {
    let viewerRef;
    let viewer = null;
    let renderer = null;
    let viewportManager = null;
    let spatialIndex = null;
    let audioEngine = null;

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

        // Load preview image first for instant display
        const previewImg = new Image();
        previewImg.onload = () => setPreviewLoaded(true);
        previewImg.src = `/images/tiles/${props.artworkId}/preview.jpg`;

        // Initialize OpenSeadragon with centralized performance settings
        const viewerSettings = performanceConfig.viewer;

        viewer = OpenSeadragon({
            element: viewerRef,
            tileSources: {
                Image: {
                    xmlns: "http://schemas.microsoft.com/deepzoom/2008",
                    Url: `/images/tiles/${props.artworkId}/${props.artworkId}_output_files/`,
                    Format: "jpg",
                    Overlap: "2",
                    TileSize: "512",
                    Size: {
                        Width: "11244",
                        Height: "6543"
                    }
                }
            },
            prefixUrl: 'https://cdn.jsdelivr.net/npm/openseadragon@5.0.1/build/openseadragon/images/',

            // Performance settings from config
            immediateRender: viewerSettings.immediateRender,
            preserveViewport: viewerSettings.preserveViewport,
            visibilityRatio: viewerSettings.visibilityRatio,
            constrainDuringPan: true,
            wrapHorizontal: false,
            wrapVertical: false,

            // Preload settings
            imageLoaderLimit: viewerSettings.imageLoaderLimit,
            maxImageCacheCount: viewerSettings.maxImageCacheCount,
            minPixelRatio: viewerSettings.minPixelRatio,
            smoothTileEdgesMinZoom: viewerSettings.smoothTileEdgesMinZoom,
            alwaysBlend: viewerSettings.alwaysBlend,
            placeholderFillStyle: '#000000',

            // Navigation controls
            showNavigationControl: true,
            navigationControlAnchor: OpenSeadragon.ControlAnchor.TOP_RIGHT,
            showZoomControl: true,
            showHomeControl: true,
            showFullPageControl: false,
            showRotationControl: false,

            // Zoom settings
            minZoomLevel: viewerSettings.minZoomLevel,
            maxZoomLevel: viewerSettings.maxZoomLevel,
            defaultZoomLevel: viewerSettings.defaultZoomLevel,
            zoomPerClick: viewerSettings.zoomPerClick,
            zoomPerScroll: viewerSettings.zoomPerScroll,

            // Animation settings
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
                flickEnabled: viewerSettings.flickEnabled
            },
            gestureSettingsTouch: {
                scrollToZoom: false,
                clickToZoom: false,
                dblClickToZoom: true,
                flickEnabled: viewerSettings.flickEnabled,
                pinchToZoom: true
            },

            // Additional performance
            debugMode: performanceConfig.debug.showMetrics,
            timeout: performanceConfig.network.timeout,
            useCanvas: true,
            crossOriginPolicy: 'Anonymous',
            ajaxWithCredentials: false,

            // Subpixel rendering for sharper images
            subPixelRoundingForTransparency: viewerSettings.subPixelRendering ?
                OpenSeadragon.SUBPIXEL_ROUNDING_OCCURRENCES.ALWAYS :
                OpenSeadragon.SUBPIXEL_ROUNDING_OCCURRENCES.NEVER
        });

        // Initialize spatial index
        spatialIndex = new SpatialIndex();
        spatialIndex.loadHotspots(hotspotData);

        // Initialize viewport manager
        viewportManager = new ViewportManager(viewer);

        // Initialize audio engine
        audioEngine = new AudioEngine();

        // Viewer ready handler
        viewer.addHandler('open', () => {
            console.log('OpenSeadragon viewer ready');
            setViewerReady(true);
            setIsLoading(false);

            // Initialize native hotspot renderer after a small delay
            setTimeout(() => {
                initializeHotspotSystem();

                // Preload audio for visible hotspots
                const viewport = viewportManager.getCurrentViewport();
                const visibleHotspots = spatialIndex.queryViewport(viewport.bounds, viewport.zoom);
                audioEngine.preloadHotspots(visibleHotspots);
            }, 100);
        });

        // Optimize tile loading
        viewer.addHandler('tile-loaded', (event) => {
            // Force high quality rendering
            if (event.tile && event.tile.element) {
                event.tile.element.style.imageRendering = 'high-quality';
            }
        });

        // Update visible hotspots and preload audio on viewport change
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
            if (viewer) {
                viewer.viewport.resize();
                viewer.viewport.applyConstraints();
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

        // Initialize native renderer for perfect sync
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
        //if (audioEngine && hotspot.audioUrl) {
        //    audioEngine.play(hotspot.id);
       // }
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
            {viewerReady() && (
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
                    <button
                        class="zoom-btn zoom-in"
                        onClick={() => {
                            viewer.viewport.zoomBy(1.5);
                            viewer.viewport.applyConstraints();
                        }}
                    >
                        +
                    </button>
                    <button
                        class="zoom-btn zoom-out"
                        onClick={() => {
                            viewer.viewport.zoomBy(0.7);
                            viewer.viewport.applyConstraints();
                        }}
                    >
                        −
                    </button>
                    <button
                        class="zoom-btn zoom-home"
                        onClick={() => viewer.viewport.goHome()}
                    >
                        ⌂
                    </button>
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