import { onMount, createSignal, onCleanup } from 'solid-js';
import OpenSeadragon from 'openseadragon';
import HotspotRenderer from '../core/HotspotRenderer';
import ViewportManager from '../core/ViewportManager';
import SpatialIndex from '../core/SpatialIndex';
import hotspotData from '../data/hotspots.json';

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

    onMount(() => {
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

            // Zoom settings for artwork
            minZoomLevel: 0.5,
            maxZoomPixelRatio: 4,
            defaultZoomLevel: 1,

            // Animation settings
            animationTime: 0.5,
            springStiffness: 10,

            // Mobile optimizations
            gestureSettingsMouse: {
                clickToZoom: false,
                dblClickToZoom: true,
                flickEnabled: true
            },
            gestureSettingsTouch: {
                pinchToZoom: true,
                flickEnabled: true
            }
        });

        // Wait for viewer to be ready
        viewer.addHandler('open', () => {
            console.log('OpenSeadragon viewer ready');
            initializeHotspotSystem();
            setIsLoading(false);
        });

        // Handle viewport changes
        viewer.addHandler('viewport-change', handleViewportChange);
        viewer.addHandler('canvas-click', handleCanvasClick);

        // Handle resize
        const resizeObserver = new ResizeObserver(() => {
            if (viewer && renderer) {
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
        // Initialize spatial index with hotspot data
        spatialIndex = new SpatialIndex();
        spatialIndex.loadHotspots(hotspotData);

        // Initialize viewport manager
        viewportManager = new ViewportManager(viewer);

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
    };

    const resizeCanvas = () => {
        if (!canvasRef || !viewer) return;

        const container = viewer.container;
        const rect = container.getBoundingClientRect();

        // Handle high DPI displays
        const dpr = window.devicePixelRatio || 1;

        canvasRef.width = rect.width * dpr;
        canvasRef.height = rect.height * dpr;
        canvasRef.style.width = `${rect.width}px`;
        canvasRef.style.height = `${rect.height}px`;

        // Scale canvas context for high DPI
        const ctx = canvasRef.getContext('2d');
        ctx.scale(dpr, dpr);
    };

    const handleViewportChange = () => {
        if (!renderer || !viewportManager) return;

        // Update viewport manager
        viewportManager.update();

        // Re-render hotspots for new viewport
        requestAnimationFrame(() => {
            renderer.render();
        });
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
            const imagePoint = getImageCoordinates(event);
            const hotspot = spatialIndex.getHotspotAtPoint(imagePoint.x, imagePoint.y);

            if (hotspot !== hoveredHotspot()) {
                setHoveredHotspot(hotspot);
                renderer.setHoveredHotspot(hotspot);

                // Update cursor
                canvasRef.style.cursor = hotspot ? 'pointer' : 'default';
            }
        });

        // Handle mouse leave
        canvasRef.addEventListener('mouseleave', () => {
            setHoveredHotspot(null);
            renderer.setHoveredHotspot(null);
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

        // This will trigger audio playback and other interactions
        // We'll implement this in the next phase
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

            {isLoading() && (
                <div class="viewer-loading">
                    <p>Loading artwork...</p>
                </div>
            )}

            {/* Debug info - remove in production */}
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
            </div>
        </div>
    );
}

export default ArtworkViewer;