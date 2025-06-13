import { onMount, createSignal, onCleanup } from 'solid-js';
import OpenSeadragon from 'openseadragon';
import NativeHotspotRenderer from '../core/NativeHotspotRenderer';
import ViewportManager from '../core/ViewportManager';
import SpatialIndex from '../core/SpatialIndex';
import AudioEngine from '../core/AudioEngine';
import PerformanceMonitor from '../core/PerformanceMonitor';
import HybridTileSource from '../core/HybridTileSource';
import performanceConfig from '../config/performanceConfig';

let hotspotData = [];

/**
 * ArtworkViewer - Enhanced for maximum text clarity
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

        // Load preview image
        const previewImg = new Image();
        previewImg.onload = () => setPreviewLoaded(true);
        previewImg.src = `/images/tiles/${props.artworkId}/preview.jpg`;

        // Initialize OpenSeadragon with enhanced settings
        const viewerSettings = performanceConfig.viewer;
        const dziUrl = `/images/tiles/${props.artworkId}/${props.artworkId}.dzi`;

        // Detect tile format
        let tileSource = dziUrl;
        let isHybrid = false;
        let isPngOnly = false;

        try {
            const hybridSource = await HybridTileSource.createFromDZI(dziUrl);
            if (hybridSource) {
                tileSource = hybridSource;
                isHybrid = true;
                console.log('Using hybrid tile source with enhanced text clarity');
            }
        } catch (error) {
            console.log('Using standard tiles');
        }

        // Check if using PNG-only tiles
        try {
            const dziResponse = await fetch(dziUrl);
            const dziText = await dziResponse.text();
            if (dziText.includes('Format="png"')) {
                isPngOnly = true;
                console.log('Using PNG-only tiles for maximum quality');
            }
        } catch (error) {
            console.log('Could not detect tile format');
        }

        viewer = OpenSeadragon({
            element: viewerRef,
            tileSources: tileSource,
            prefixUrl: 'https://cdn.jsdelivr.net/npm/openseadragon@5.0.1/build/openseadragon/images/',

            // Critical quality settings
            immediateRender: viewerSettings.immediateRender,
            preserveViewport: viewerSettings.preserveViewport,
            visibilityRatio: viewerSettings.visibilityRatio,
            constrainDuringPan: viewerSettings.constrainDuringPan,
            wrapHorizontal: viewerSettings.wrapHorizontal,
            wrapVertical: viewerSettings.wrapVertical,

            // Tile loading
            imageLoaderLimit: viewerSettings.imageLoaderLimit,
            maxImageCacheCount: viewerSettings.maxImageCacheCount,
            minPixelRatio: viewerSettings.minPixelRatio,
            smoothTileEdgesMinZoom: viewerSettings.smoothTileEdgesMinZoom,
            alwaysBlend: viewerSettings.alwaysBlend,
            placeholderFillStyle: viewerSettings.placeholderFillStyle,

            // CRITICAL: Disable all smoothing for text clarity
            imageSmoothingEnabled: false,
            smoothImageZoom: false,
            subPixelRendering: false,

            // Quality settings
            minZoomImageRatio: viewerSettings.minZoomImageRatio,
            maxTilesPerFrame: viewerSettings.maxTilesPerFrame,
            tileRetryMax: viewerSettings.tileRetryMax,
            tileRetryDelay: viewerSettings.tileRetryDelay,
            compositeOperation: viewerSettings.compositeOperation,
            preload: viewerSettings.preload,

            // Maximum zoom
            maxZoomPixelRatio: viewerSettings.maxZoomPixelRatio,
            subPixelRoundingForTransparency: OpenSeadragon.SUBPIXEL_ROUNDING_OCCURRENCES.NEVER,

            // Navigation
            showNavigationControl: true,
            navigationControlAnchor: OpenSeadragon.ControlAnchor.TOP_RIGHT,
            showZoomControl: true,
            showHomeControl: true,
            showFullPageControl: false,
            showRotationControl: false,
            showNavigator: viewerSettings.showNavigator,

            // Zoom settings
            minZoomLevel: viewerSettings.minZoomLevel,
            maxZoomLevel: viewerSettings.maxZoomLevel,
            defaultZoomLevel: viewerSettings.defaultZoomLevel,
            zoomPerClick: viewerSettings.zoomPerClick,
            zoomPerScroll: viewerSettings.zoomPerScroll,

            // Animation
            animationTime: viewerSettings.animationTime,
            springStiffness: viewerSettings.springStiffness,
            blendTime: viewerSettings.blendTime,
            flickEnabled: viewerSettings.flickEnabled,
            flickMinSpeed: viewerSettings.flickMinSpeed,
            flickMomentum: viewerSettings.flickMomentum,

            // Input settings
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
            drawer: 'canvas',  // Use canvas drawer instead of deprecated useCanvas
            crossOriginPolicy: 'Anonymous',
            ajaxWithCredentials: false
        });

        // Initialize components
        spatialIndex = new SpatialIndex();
        spatialIndex.loadHotspots(hotspotData);
        viewportManager = new ViewportManager(viewer);
        audioEngine = new AudioEngine();
        performanceMonitor = new PerformanceMonitor(viewer);
        performanceMonitor.start();

        // Configure for tile format
        if (isHybrid) {
            HybridTileSource.configureViewer(viewer, tileSource);
        }

        // Force pixel-perfect rendering
        const forcePixelPerfect = () => {
            const context = viewer.drawer.context;
            if (context) {
                context.imageSmoothingEnabled = false;
                context.msImageSmoothingEnabled = false;
                context.webkitImageSmoothingEnabled = false;
                context.mozImageSmoothingEnabled = false;
            }
        };

        // Viewer ready handler
        viewer.addHandler('open', () => {
            console.log('Viewer ready - configuring for text clarity');
            setViewerReady(true);
            setIsLoading(false);

            // Force pixel-perfect immediately
            forcePixelPerfect();

            // Get the actual tile source info
            const tiledImage = viewer.world.getItemAt(0);
            const source = tiledImage.source;
            console.log(`Tile source levels: 0 to ${source.maxLevel}`);

            // Set initial zoom to show full image with good quality
            const bounds = tiledImage.getBounds();
            viewer.viewport.fitBounds(bounds, true);

            // Ensure we're at a zoom level with enough tiles
            const currentZoom = viewer.viewport.getZoom();
            const minGoodZoom = 0.8; // Adjust based on your tile structure

            if (currentZoom < minGoodZoom) {
                viewer.viewport.zoomTo(minGoodZoom, null, true);
            }

            viewer.viewport.applyConstraints(true);

            // Initialize hotspots
            setTimeout(() => {
                initializeHotspotSystem();
                const viewport = viewportManager.getCurrentViewport();
                const visibleHotspots = spatialIndex.queryViewport(viewport.bounds, viewport.zoom);
                audioEngine.preloadHotspots(visibleHotspots);
            }, 100);
        });

        // Enhanced tile drawing for quality
        viewer.addHandler('tile-drawing', (event) => {
            const context = event.context;
            const tile = event.tile;

            // Get tile URL
            const tileUrl = tile.getUrl ? tile.getUrl() : tile.url || '';

            // Force pixel-perfect for PNG tiles or high zoom
            if (tileUrl.includes('.png') || tile.level >= 3) {
                context.imageSmoothingEnabled = false;
                context.msImageSmoothingEnabled = false;
                context.webkitImageSmoothingEnabled = false;
                context.mozImageSmoothingEnabled = false;
            } else {
                // High-quality smoothing for JPEG overview
                context.imageSmoothingEnabled = true;
                context.imageSmoothingQuality = 'high';
            }
        });

        // Optimize tile rendering
        viewer.addHandler('tile-loaded', (event) => {
            if (event.tile && event.tile.element) {
                const tile = event.tile;
                const element = tile.element;

                // Get URL from tile
                const tileUrl = tile.getUrl ? tile.getUrl() : tile.url || '';

                // Apply rendering based on format
                if (tileUrl.includes('.png')) {
                    element.style.imageRendering = 'pixelated';
                    element.style.imageRendering = '-moz-crisp-edges';
                    element.style.imageRendering = 'crisp-edges';
                } else {
                    element.style.imageRendering = 'auto';
                }

                // Hardware acceleration
                element.style.transform = 'translateZ(0)';
                element.style.willChange = 'transform';
                element.style.backfaceVisibility = 'hidden';
                element.style.perspective = '1000px';
            }
        });

        // Force quality on zoom/pan end
        viewer.addHandler('animation-finish', () => {
            forcePixelPerfect();
            viewer.forceRedraw();
        });

        // Maintain quality on resize
        viewer.addHandler('resize', () => {
            forcePixelPerfect();
            viewer.forceRedraw();
        });

        // Update visible content
        let updateTimer = null;
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
        const resizeObserver = new ResizeObserver(() => {
            if (viewer && viewer.viewport && viewer.isOpen()) {
                try {
                    // Ensure viewer has valid dimensions
                    const container = viewer.container;
                    if (container && container.clientWidth > 0 && container.clientHeight > 0) {
                        viewer.viewport.resize();
                        viewer.viewport.applyConstraints();
                        forcePixelPerfect();
                        viewer.forceRedraw();
                    }
                } catch (error) {
                    console.warn('Resize error:', error);
                }
            }
        });
        resizeObserver.observe(viewerRef);

        // Keyboard navigation
        const handleKeyPress = (event) => {
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
                'q': () => forcePixelPerfect() // Quick quality reset
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
                            <div><kbd>Q</kbd> Reset quality</div>
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