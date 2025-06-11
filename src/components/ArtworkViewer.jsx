import { onMount, createSignal, onCleanup, createEffect } from 'solid-js';
import OpenSeadragon from 'openseadragon';
import HotspotRenderer from '../core/HotspotRenderer';
import ViewportManager from '../core/ViewportManager';
import SpatialIndex from '../core/SpatialIndex';

// Import hotspots data - we'll use a dynamic import to handle the path issue
let hotspotData = [];

function ArtworkViewer(props) {
    let viewerRef;
    let canvasRef;
    let viewer = null;
    let renderer = null;
    let viewportManager = null;
    let spatialIndex = null;

    const [isLoading, setIsLoading] = createSignal(true);
    const [hoveredHotspot, setHoveredHotspot] = createSignal(null);
    const [selectedHotspot, setSelectedHotspot] = createSignal(null);

    onMount(async () => {
        // Load hotspots data
        try {
            const response = await fetch('/data/hotspots.json');
            hotspotData = await response.json();
            console.log(`Loaded ${hotspotData.length} hotspots`);

            // Check for extreme coordinates
            let maxX = 0, maxY = 0;
            hotspotData.forEach(hotspot => {
                const coords = hotspot.shape === 'polygon' ? hotspot.coordinates : hotspot.coordinates.flat();
                coords.forEach(point => {
                    if (Array.isArray(point) && point.length >= 2) {
                        maxX = Math.max(maxX, point[0]);
                        maxY = Math.max(maxY, point[1]);
                    }
                });
            });
            console.log(`Max hotspot coordinates: X=${maxX}, Y=${maxY}`);
        } catch (error) {
            console.error('Failed to load hotspots:', error);
            hotspotData = [];
        }

        // Initialize OpenSeadragon viewer
        viewer = OpenSeadragon({
            element: viewerRef,
            tileSources: `/images/tiles/${props.artworkId}/${props.artworkId}_output.dzi`,
            prefixUrl: 'https://cdn.jsdelivr.net/npm/openseadragon@5.0.1/build/openseadragon/images/',

            // Performance optimizations
            immediateRender: true,
            preserveViewport: true,
            visibilityRatio: 0.5,
            constrainDuringPan: true,

            // Navigation controls 
            showNavigationControl: true,
            navigationControlAnchor: OpenSeadragon.ControlAnchor.TOP_RIGHT,
            showZoomControl: true,
            showHomeControl: true,
            showFullPageControl: false,
            showRotationControl: false,

            // Zoom settings 
            minZoomLevel: 0.5,
            maxZoomPixelRatio: 4,
            defaultZoomLevel: 1,
            zoomPerClick: 2.0,
            zoomPerScroll: 1.2,

            // Animation settings 
            animationTime: 0.5,
            springStiffness: 10,
            zoomPerSecond: 2.0,

            // Mobile optimizations 
            gestureSettingsMouse: {
                clickToZoom: true,
                dblClickToZoom: true,
                scrollToZoom: true,
                flickEnabled: true,
                flickMinSpeed: 120,
                flickMomentum: 0.25
            },
            gestureSettingsTouch: {
                pinchToZoom: true,
                clickToZoom: false,
                dblClickToZoom: true,
                flickEnabled: true,
                flickMinSpeed: 120,
                flickMomentum: 0.25
            },
            gestureSettingsPen: {
                clickToZoom: true,
                dblClickToZoom: true,
                flickEnabled: false
            }
        });

        // Optimize for touch devices
        if ('ontouchstart' in window) {
            viewer.addHandler('canvas-press', function (event) {
                // Prevent default touch behavior
                event.originalEvent.preventDefault();
            });
        }

        // Add performance monitoring
        viewer.addHandler('animation-finish', function () {
            const fps = viewer.viewport.getAnimationTime();
            if (fps > 100) {
                console.warn('Slow animation detected:', fps + 'ms');
            }
        });

        // Initialize spatial index right away
        spatialIndex = new SpatialIndex();
        spatialIndex.loadHotspots(hotspotData);

        // Initialize viewport manager
        viewportManager = new ViewportManager(viewer);

        // Wait for viewer to be ready
        viewer.addHandler('open', () => {
            console.log('OpenSeadragon viewer ready');

            // Log image dimensions for debugging
            const tiledImage = viewer.world.getItemAt(0);
            if (tiledImage) {
                const imageSize = tiledImage.getContentSize();
                console.log(`Image dimensions: ${imageSize.x} x ${imageSize.y}`);
            }

            setIsLoading(false);

            // Initialize hotspot system after canvas is rendered
            setTimeout(() => {
                if (canvasRef) {
                    initializeHotspotSystem();
                }
            }, 0);
        });

        // Handle viewport changes
        viewer.addHandler('viewport-change', handleViewportChange);
        viewer.addHandler('canvas-click', handleCanvasClick);

        // Handle resize
        const resizeObserver = new ResizeObserver(() => {
            if (viewer && renderer && canvasRef) {
                resizeCanvas();
                renderer.render();
            }
        });
        resizeObserver.observe(viewerRef);

        // Cleanup
        onCleanup(() => {
            resizeObserver.disconnect();
            if (viewer) {
                viewer.destroy();
            }
            if (renderer) {
                renderer.destroy();
            }
        });
    });

    const initializeHotspotSystem = () => {
        if (!canvasRef) {
            console.error('Canvas not ready for hotspot system');
            return;
        }

        // Initialize canvas renderer
        renderer = new HotspotRenderer(canvasRef, {
            viewer: viewer,
            spatialIndex: spatialIndex,
            viewportManager: viewportManager,
            onHotspotHover: setHoveredHotspot,
            onHotspotClick: handleHotspotClick
        });

        // Set up canvas event handling
        setupCanvasEvents();

        // Initial render
        resizeCanvas();
        renderer.render();

        console.log('Hotspot system initialized');
    };

    const resizeCanvas = () => {
        if (!canvasRef || !viewer) return;

        const container = viewer.container;
        const rect = container.getBoundingClientRect();

        // Handle high DPI displays
        const dpr = window.devicePixelRatio || 1;

        // Set canvas size - use floor to avoid subpixel issues
        const width = Math.floor(rect.width);
        const height = Math.floor(rect.height);

        canvasRef.width = width * dpr;
        canvasRef.height = height * dpr;
        canvasRef.style.width = `${width}px`;
        canvasRef.style.height = `${height}px`;

        // Get fresh context and reset transform
        const ctx = canvasRef.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Set rendering hints
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = 1.0;

        console.log(`Canvas resized: ${width}x${height} (DPR: ${dpr})`);
    };


    const handleViewportChange = () => {
        if (!renderer || !viewportManager) return;

        // Update viewport manager
        viewportManager.update();

        // Cancel any pending render
        if (window.renderTimeout) {
            clearTimeout(window.renderTimeout);
        }

        // Debounce render calls
        window.renderTimeout = setTimeout(() => {
            renderer.render();
        }, 16);
    };

    const setupCanvasEvents = () => {
        if (!canvasRef) return;

        // Convert mouse position to image coordinates
        const getImageCoordinates = (event) => {
            const rect = canvasRef.getBoundingClientRect();
            const viewportPoint = new OpenSeadragon.Point(
                event.clientX - rect.left,
                event.clientY - rect.top
            );

            const imagePoint = viewer.viewport.viewportToImageCoordinates(
                viewer.viewport.pointFromPixel(viewportPoint)
            );

            return imagePoint;
        };

        // Handle mouse movement for hover effects
        canvasRef.addEventListener('mousemove', (event) => {
            if (!spatialIndex) return;

            const imagePoint = getImageCoordinates(event);
            const hotspot = spatialIndex.getHotspotAtPoint(imagePoint.x, imagePoint.y);

            if (hotspot !== hoveredHotspot()) {
                setHoveredHotspot(hotspot);
                if (renderer) {
                    renderer.setHoveredHotspot(hotspot);
                }

                // Update cursor
                canvasRef.style.cursor = hotspot ? 'pointer' : 'default';
            }
        });

        // Handle mouse leave
        canvasRef.addEventListener('mouseleave', () => {
            setHoveredHotspot(null);
            if (renderer) {
                renderer.setHoveredHotspot(null);
            }
            canvasRef.style.cursor = 'default';
        });
    };

    const handleCanvasClick = (event) => {
        if (!event.quick || !spatialIndex) return;

        const imagePoint = viewer.viewport.viewportToImageCoordinates(
            event.position
        );

        const hotspot = spatialIndex.getHotspotAtPoint(imagePoint.x, imagePoint.y);
        if (hotspot) {
            handleHotspotClick(hotspot);
        }
    };

    const handleHotspotClick = (hotspot) => {
        console.log('Hotspot clicked:', hotspot);
        setSelectedHotspot(hotspot);

        // Check if mobile
        const isMobile = window.innerWidth <= 768;

        if (isMobile && hotspot) {
            // Calculate hotspot center
            const bounds = spatialIndex.calculateBoundingBox(hotspot.coordinates);
            const centerX = (bounds.minX + bounds.maxX) / 2;
            const centerY = (bounds.minY + bounds.maxY) / 2;

            // Convert to viewport coordinates
            const imagePoint = new OpenSeadragon.Point(centerX, centerY);
            const viewportPoint = viewer.viewport.imageToViewportCoordinates(imagePoint);

            // Zoom to hotspot
            viewer.viewport.zoomTo(2.5, viewportPoint, true);
            viewer.viewport.panTo(viewportPoint, true);
        }

        // Audio playback will be implemented next
    };

    return (
        <div class="viewer-container">
            <div
                ref={viewerRef}
                class="openseadragon-viewer"
                style={{
                    width: '100%',
                    height: '100vh',
                    background: '#000'
                }}
            />

            {!isLoading() && (
                <canvas
                    ref={canvasRef}
                    class="hotspot-canvas"
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        'pointer-events': 'auto',
                        'z-index': 10
                    }}
                />
            )}

            {isLoading() && (
                <div class="viewer-loading">
                    <p>Loading artwork...</p>
                </div>
            )}

            {/* Debug info - remove in production */}
            {!isLoading() && (
                <div class="debug-info" style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    background: 'rgba(0,0,0,0.7)',
                    color: 'white',
                    padding: '10px',
                    'font-size': '12px',
                    'font-family': 'monospace',
                    'z-index': 20
                }}>
                    <div>Hovered: {hoveredHotspot()?.id || 'none'}</div>
                    <div>Selected: {selectedHotspot()?.id || 'none'}</div>
                    <div>Type: {hoveredHotspot()?.type || 'none'}</div>
                    <div>Total hotspots: {hotspotData.length}</div>
                </div>
            )}

            {/* Hotspot legend */}
            {!isLoading() && (
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