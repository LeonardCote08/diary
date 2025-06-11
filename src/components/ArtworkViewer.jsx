import { onMount, createSignal, onCleanup } from 'solid-js';
import OpenSeadragon from 'openseadragon';
import HotspotRenderer from '../core/HotspotRenderer';
import ViewportManager from '../core/ViewportManager';
import SpatialIndex from '../core/SpatialIndex';

let hotspotData = [];

function ArtworkViewer(props) {
    let viewerRef;
    let canvasRef;
    let viewer = null;
    let renderer = null;
    let viewportManager = null;
    let spatialIndex = null;
    let renderTimer = null;

    const [isLoading, setIsLoading] = createSignal(true);
    const [hoveredHotspot, setHoveredHotspot] = createSignal(null);
    const [selectedHotspot, setSelectedHotspot] = createSignal(null);
    const [viewerReady, setViewerReady] = createSignal(false);

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

        // Initialize OpenSeadragon viewer
        viewer = OpenSeadragon({
            element: viewerRef,
            tileSources: `/images/tiles/${props.artworkId}/${props.artworkId}_output.dzi`,
            prefixUrl: 'https://cdn.jsdelivr.net/npm/openseadragon@5.0.1/build/openseadragon/images/',

            // Performance settings
            immediateRender: true,
            preserveViewport: true,
            visibilityRatio: 1.0,
            constrainDuringPan: true,
            wrapHorizontal: false,
            wrapVertical: false,

            // Navigation
            showNavigationControl: true,
            navigationControlAnchor: OpenSeadragon.ControlAnchor.TOP_RIGHT,
            showZoomControl: true,
            showHomeControl: true,
            showFullPageControl: false,
            showRotationControl: false,

            // Zoom settings
            minZoomLevel: 0.3,
            maxZoomLevel: 10,
            defaultZoomLevel: 0.8,
            zoomPerClick: 1.5,
            zoomPerScroll: 1.2,

            // Animation - faster for better sync
            animationTime: 0.2,
            springStiffness: 12,
            blendTime: 0,

            // Mouse/Touch settings
            gestureSettingsMouse: {
                scrollToZoom: true,
                clickToZoom: false,
                dblClickToZoom: true,
                flickEnabled: false
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
            timeout: 120000,
            useCanvas: true
        });

        // Initialize spatial index
        spatialIndex = new SpatialIndex();
        spatialIndex.loadHotspots(hotspotData);

        // Initialize viewport manager
        viewportManager = new ViewportManager(viewer);

        // Viewer ready handler
        viewer.addHandler('open', () => {
            console.log('OpenSeadragon viewer ready');
            setViewerReady(true);
            setIsLoading(false);

            // Initialize hotspot system after a small delay
            setTimeout(() => {
                if (canvasRef) {
                    initializeHotspotSystem();
                }
            }, 100);
        });

        // Optimized render trigger - use a single handler
        const scheduleRender = () => {
            if (!renderer || !viewportManager) return;

            // Cancel any pending render
            if (renderTimer) {
                cancelAnimationFrame(renderTimer);
            }

            // Schedule new render
            renderTimer = requestAnimationFrame(() => {
                viewportManager.update();
                renderer.render();
                renderTimer = null;
            });
        };

        // Single update handler for all viewport changes
        viewer.addHandler('update-viewport', scheduleRender);
        viewer.addHandler('animation', scheduleRender);
        viewer.addHandler('animation-finish', scheduleRender);

        // Handle resize
        const resizeObserver = new ResizeObserver(() => {
            if (viewer && renderer && canvasRef) {
                resizeCanvas();
                scheduleRender();
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
            if (renderTimer) {
                cancelAnimationFrame(renderTimer);
            }
            if (viewer) {
                viewer.destroy();
            }
            if (renderer) {
                renderer.destroy();
            }
        });
    });

    const initializeHotspotSystem = () => {
        if (!canvasRef || !viewer) {
            console.error('Canvas or viewer not ready');
            return;
        }

        // Initialize renderer
        renderer = new HotspotRenderer(canvasRef, {
            viewer: viewer,
            spatialIndex: spatialIndex,
            viewportManager: viewportManager,
            onHotspotHover: setHoveredHotspot,
            onHotspotClick: handleHotspotClick
        });

        // Setup events
        setupCanvasEvents();

        // Initial render
        resizeCanvas();
        renderer.render();
    };

    const resizeCanvas = () => {
        if (!canvasRef || !viewer) return;

        const container = viewer.container;
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        const width = Math.floor(rect.width);
        const height = Math.floor(rect.height);

        canvasRef.width = width * dpr;
        canvasRef.height = height * dpr;
        canvasRef.style.width = `${width}px`;
        canvasRef.style.height = `${height}px`;

        const ctx = canvasRef.getContext('2d');
        ctx.scale(dpr, dpr);
    };

    const setupCanvasEvents = () => {
        if (!canvasRef) return;

        let isDragging = false;
        let clickStart = null;

        // Get hotspot at point
        const getHotspotAt = (clientX, clientY) => {
            const rect = canvasRef.getBoundingClientRect();
            const viewportPoint = new OpenSeadragon.Point(
                clientX - rect.left,
                clientY - rect.top
            );
            const imagePoint = viewer.viewport.viewportToImageCoordinates(
                viewer.viewport.pointFromPixel(viewportPoint)
            );
            return spatialIndex.getHotspotAtPoint(imagePoint.x, imagePoint.y);
        };

        // Mouse down
        canvasRef.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;

            clickStart = { x: e.clientX, y: e.clientY, time: Date.now() };
            const hotspot = getHotspotAt(e.clientX, e.clientY);

            if (!hotspot) {
                isDragging = true;
                canvasRef.style.pointerEvents = 'none';
            }
        });

        // Mouse move
        canvasRef.addEventListener('mousemove', (e) => {
            if (!isDragging) {
                const hotspot = getHotspotAt(e.clientX, e.clientY);
                if (hotspot !== hoveredHotspot()) {
                    setHoveredHotspot(hotspot);
                    renderer.setHoveredHotspot(hotspot);
                }
                canvasRef.style.cursor = hotspot ? 'pointer' : 'grab';
            }
        });

        // Mouse up
        canvasRef.addEventListener('mouseup', (e) => {
            if (e.button !== 0) return;

            if (!isDragging && clickStart) {
                const timeDiff = Date.now() - clickStart.time;
                const distance = Math.sqrt(
                    Math.pow(e.clientX - clickStart.x, 2) +
                    Math.pow(e.clientY - clickStart.y, 2)
                );

                if (timeDiff < 500 && distance < 5) {
                    const hotspot = getHotspotAt(e.clientX, e.clientY);
                    if (hotspot) {
                        handleHotspotClick(hotspot);
                    }
                }
            }

            isDragging = false;
            clickStart = null;
            canvasRef.style.pointerEvents = 'auto';
        });

        // Global mouse up
        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                canvasRef.style.pointerEvents = 'auto';
            }
        });

        // Mouse leave
        canvasRef.addEventListener('mouseleave', () => {
            setHoveredHotspot(null);
            renderer.setHoveredHotspot(null);
            canvasRef.style.cursor = 'default';
        });

        // Wheel
        canvasRef.addEventListener('wheel', (e) => {
            e.preventDefault();
            canvasRef.style.pointerEvents = 'none';
            setTimeout(() => {
                canvasRef.style.pointerEvents = 'auto';
            }, 50);
        }, { passive: false });

        // Double click
        canvasRef.addEventListener('dblclick', (e) => {
            const hotspot = getHotspotAt(e.clientX, e.clientY);
            if (!hotspot) {
                canvasRef.style.pointerEvents = 'none';
                setTimeout(() => {
                    canvasRef.style.pointerEvents = 'auto';
                }, 100);
            }
        });

        // Touch events
        let touchStart = null;

        canvasRef.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                touchStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };

                const hotspot = getHotspotAt(touch.clientX, touch.clientY);
                if (!hotspot) {
                    canvasRef.style.pointerEvents = 'none';
                }
            } else {
                canvasRef.style.pointerEvents = 'none';
            }
        }, { passive: true });

        canvasRef.addEventListener('touchend', (e) => {
            if (touchStart && e.changedTouches.length === 1) {
                const touch = e.changedTouches[0];
                const timeDiff = Date.now() - touchStart.time;
                const distance = Math.sqrt(
                    Math.pow(touch.clientX - touchStart.x, 2) +
                    Math.pow(touch.clientY - touchStart.y, 2)
                );

                if (timeDiff < 500 && distance < 10) {
                    const hotspot = getHotspotAt(touch.clientX, touch.clientY);
                    if (hotspot) {
                        handleHotspotClick(hotspot);
                    }
                }
            }

            touchStart = null;
            canvasRef.style.pointerEvents = 'auto';
        });
    };

    const handleHotspotClick = (hotspot) => {
        console.log('Hotspot clicked:', hotspot);
        setSelectedHotspot(hotspot);
    };

    return (
        <div class="viewer-container">
            <div ref={viewerRef} class="openseadragon-viewer" />

            {viewerReady() && (
                <canvas ref={canvasRef} class="hotspot-canvas" />
            )}

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