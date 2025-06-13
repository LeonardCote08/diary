import { onMount, createSignal, onCleanup } from 'solid-js';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorImageLayer from 'ol/layer/VectorImage.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Polygon from 'ol/geom/Polygon.js';
import MultiPolygon from 'ol/geom/MultiPolygon.js';
import { Fill, Stroke, Style } from 'ol/style.js';
import { getCenter } from 'ol/extent.js';
import { defaults as defaultInteractions, DragPan, MouseWheelZoom, PinchZoom } from 'ol/interaction.js';
import { defaults as defaultControls } from 'ol/control.js';
import Kinetic from 'ol/Kinetic.js';

import DZITileSource from '../core/DZITileSource';
import SpatialIndex from '../core/SpatialIndex';
import AudioEngine from '../core/AudioEngine';
import PerformanceMonitor from '../core/PerformanceMonitorOL';
import performanceConfig from '../config/performanceConfig';

let hotspotData = [];

/**
 * ArtworkViewer - Optimized for OpenLayers with perfect text clarity
 */
function ArtworkViewer(props) {
    let mapRef;
    let map = null;
    let spatialIndex = null;
    let audioEngine = null;
    let performanceMonitor = null;
    let hotspotLayer = null;
    let updateTimer = null;
    let resizeObserver = null;
    let debounceTimer = null;

    const [isLoading, setIsLoading] = createSignal(true);
    const [hoveredHotspot, setHoveredHotspot] = createSignal(null);
    const [selectedHotspot, setSelectedHotspot] = createSignal(null);
    const [viewerReady, setViewerReady] = createSignal(false);
    const [previewLoaded, setPreviewLoaded] = createSignal(false);

    // Pre-create styles for each hotspot type for better performance
    const stylesByType = new Map([
        ['audio_only', new Style({
            fill: new Fill({ color: [0, 203, 244, 0.3 * 255] }),
            stroke: new Stroke({ color: '#00cbf4', width: 1 })
        })],
        ['audio_only_hover', new Style({
            fill: new Fill({ color: [0, 203, 244, 0.5 * 255] }),
            stroke: new Stroke({ color: '#00cbf4', width: 2 })
        })],
        ['audio_only_selected', new Style({
            fill: new Fill({ color: [0, 203, 244, 0.7 * 255] }),
            stroke: new Stroke({ color: '#00cbf4', width: 3 })
        })],
        ['audio_link', new Style({
            fill: new Fill({ color: [73, 243, 0, 0.3 * 255] }),
            stroke: new Stroke({ color: '#49f300', width: 1 })
        })],
        ['audio_link_hover', new Style({
            fill: new Fill({ color: [73, 243, 0, 0.5 * 255] }),
            stroke: new Stroke({ color: '#49f300', width: 2 })
        })],
        ['audio_link_selected', new Style({
            fill: new Fill({ color: [73, 243, 0, 0.7 * 255] }),
            stroke: new Stroke({ color: '#49f300', width: 3 })
        })],
        ['audio_image', new Style({
            fill: new Fill({ color: [255, 5, 247, 0.3 * 255] }),
            stroke: new Stroke({ color: '#ff05f7', width: 1 })
        })],
        ['audio_image_hover', new Style({
            fill: new Fill({ color: [255, 5, 247, 0.5 * 255] }),
            stroke: new Stroke({ color: '#ff05f7', width: 2 })
        })],
        ['audio_image_selected', new Style({
            fill: new Fill({ color: [255, 5, 247, 0.7 * 255] }),
            stroke: new Stroke({ color: '#ff05f7', width: 3 })
        })],
        ['audio_image_link', new Style({
            fill: new Fill({ color: [255, 93, 0, 0.3 * 255] }),
            stroke: new Stroke({ color: '#ff5d00', width: 1 })
        })],
        ['audio_image_link_hover', new Style({
            fill: new Fill({ color: [255, 93, 0, 0.5 * 255] }),
            stroke: new Stroke({ color: '#ff5d00', width: 2 })
        })],
        ['audio_image_link_selected', new Style({
            fill: new Fill({ color: [255, 93, 0, 0.7 * 255] }),
            stroke: new Stroke({ color: '#ff5d00', width: 3 })
        })],
        ['audio_sound', new Style({
            fill: new Fill({ color: [255, 176, 0, 0.3 * 255] }),
            stroke: new Stroke({ color: '#ffb000', width: 1 })
        })],
        ['audio_sound_hover', new Style({
            fill: new Fill({ color: [255, 176, 0, 0.5 * 255] }),
            stroke: new Stroke({ color: '#ffb000', width: 2 })
        })],
        ['audio_sound_selected', new Style({
            fill: new Fill({ color: [255, 176, 0, 0.7 * 255] }),
            stroke: new Stroke({ color: '#ffb000', width: 3 })
        })],
        ['default', new Style({
            fill: new Fill({ color: [255, 255, 255, 0.3 * 255] }),
            stroke: new Stroke({ color: '#ffffff', width: 1 })
        })]
    ]);

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

        // Load DZI metadata
        const dziUrl = `/images/tiles/${props.artworkId}/${props.artworkId}.dzi`;
        const dziResponse = await fetch(dziUrl);
        const dziText = await dziResponse.text();

        // Parse DZI XML
        const parser = new DOMParser();
        const dziDoc = parser.parseFromString(dziText, 'text/xml');
        const imageElement = dziDoc.querySelector('Image');
        const sizeElement = imageElement.querySelector('Size');

        const imageWidth = parseInt(sizeElement.getAttribute('Width'));
        const imageHeight = parseInt(sizeElement.getAttribute('Height'));
        const tileSize = parseInt(imageElement.getAttribute('TileSize') || '512');
        const overlap = parseInt(imageElement.getAttribute('Overlap') || '8');

        // Get format from DZI, but default to PNG
        let dziFormat = imageElement.getAttribute('Format');
        console.log('Format from DZI file:', dziFormat);

        // Force PNG format since your tiles are PNG
        const format = 'png';

        if (dziFormat && dziFormat !== format) {
            console.warn(`DZI says format is '${dziFormat}' but using '${format}' for tiles`);
        }

        console.log('DZI metadata:', {
            width: imageWidth,
            height: imageHeight,
            tileSize: tileSize,
            overlap: overlap,
            format: format,
            dziUrl: dziUrl
        });

        // Initialize components
        spatialIndex = new SpatialIndex();
        spatialIndex.loadHotspots(hotspotData);
        audioEngine = new AudioEngine();

        // Create DZI tile source
        const tileSource = new DZITileSource({
            url: `/images/tiles/${props.artworkId}/${props.artworkId}_files`,
            width: imageWidth,
            height: imageHeight,
            tileSize: tileSize,
            overlap: overlap,
            format: format
        });

        // Get image extent
        const extent = tileSource.getImageExtent();
        // Test if level 0 exists
        const testUrl = `/images/tiles/${props.artworkId}/${props.artworkId}_files/0/0_0.png`;
        fetch(testUrl)
            .then(response => {
                if (response.ok) {
                    console.log('✓ Level 0 tile exists at:', testUrl);
                } else {
                    console.error('✗ Level 0 tile NOT FOUND at:', testUrl);
                }
            })
            .catch(error => {
                console.error('Error checking tile:', error);
            });

        // Create tile layer
        const tileLayer = new TileLayer({
            source: tileSource,
            preload: 2,
            useInterimTilesOnError: false,
            zIndex: 0
        });

        // Add error handling for tile loading
        tileSource.on('tileloaderror', (event) => {
            const tile = event.tile;
            if (tile && tile.src_) {
                console.error('Tile load error:', tile.src_);
            }
        });

        tileSource.on('tileloadstart', (event) => {
            const tile = event.tile;
            if (tile && tile.src_ && !this._firstTileLogged) {
                console.log('First tile requested:', tile.src_);
                this._firstTileLogged = true;
            }
        });

        // Create vector source for hotspots
        const vectorSource = new VectorSource({
            features: createHotspotFeatures(hotspotData),
            useSpatialIndex: true,
            wrapX: false
        });

        // Create hotspot layer - Use VectorImageLayer for better performance
        hotspotLayer = new VectorImageLayer({
            source: vectorSource,
            style: getHotspotStyle,
            zIndex: 10,
            declutter: false,
            renderMode: 'image',
            updateWhileAnimating: false,
            updateWhileInteracting: false
        });

        // Create interactions with optimized settings
        const interactions = defaultInteractions({
            dragPan: false,
            mouseWheelZoom: false,
            pinchZoom: false
        }).extend([
            new DragPan({
                kinetic: new Kinetic(-0.005, 0.05, 100)
            }),
            new MouseWheelZoom({
                maxDelta: 1,
                duration: 250,
                timeout: 80,
                useAnchor: true,
                constrainResolution: true
            }),
            new PinchZoom({
                duration: 250
            })
        ]);

        // Create map
        map = new Map({
            target: mapRef,
            layers: [tileLayer, hotspotLayer],
            interactions: interactions,
            controls: defaultControls({
                zoom: true,
                rotate: false,
                attribution: false
            }),
            pixelRatio: window.devicePixelRatio || 1,
            view: new View({
                center: getCenter(extent),
                extent: extent,
                projection: undefined, // Pixel projection
                resolutions: tileSource.getTileGrid().getResolutions(),
                constrainResolution: true,
                constrainOnlyCenter: false,
                showFullExtent: true,
                enableRotation: false,
                smoothExtentConstraint: false,
                smoothResolutionConstraint: false
            }),
            // Critical performance settings
            loadTilesWhileAnimating: true,
            loadTilesWhileInteracting: true,
            moveTolerance: 1
        });

        // Initialize performance monitor
        performanceMonitor = new PerformanceMonitor(map);
        performanceMonitor.start();

        // Force map size update
        map.updateSize();

        // Set initial view to fit image
        const view = map.getView();
        view.fit(extent, { padding: [20, 20, 20, 20] });

        // Setup event handlers
        setupMapEventHandlers();

        // Map is ready
        setViewerReady(true);
        setIsLoading(false);
        forcePixelPerfect();
    });

    // Force pixel-perfect rendering
    const forcePixelPerfect = () => {
        if (!mapRef) return;

        const canvases = mapRef.querySelectorAll('canvas');
        canvases.forEach(canvas => {
            if (canvas) {
                try {
                    const context = canvas.getContext('2d');
                    if (context) {
                        context.imageSmoothingEnabled = false;
                        if ('msImageSmoothingEnabled' in context) {
                            context.msImageSmoothingEnabled = false;
                        }
                        if ('webkitImageSmoothingEnabled' in context) {
                            context.webkitImageSmoothingEnabled = false;
                        }
                        if ('mozImageSmoothingEnabled' in context) {
                            context.mozImageSmoothingEnabled = false;
                        }
                    }
                } catch (e) {
                    // Canvas might not be ready yet
                }
                // Apply CSS as well
                canvas.style.imageRendering = 'pixelated';
                canvas.style.imageRendering = 'crisp-edges';
                canvas.style.imageRendering = '-moz-crisp-edges';
                canvas.style.imageRendering = '-webkit-crisp-edges';
            }
        });
    };

    const setupMapEventHandlers = () => {
        if (!map) return;

        // Ensure pixel-perfect on every render
        map.on('postrender', (event) => {
            forcePixelPerfect();

            // Also handle the event context if available
            if (event.context) {
                try {
                    event.context.imageSmoothingEnabled = false;
                    if ('msImageSmoothingEnabled' in event.context) {
                        event.context.msImageSmoothingEnabled = false;
                    }
                    if ('webkitImageSmoothingEnabled' in event.context) {
                        event.context.webkitImageSmoothingEnabled = false;
                    }
                    if ('mozImageSmoothingEnabled' in event.context) {
                        event.context.mozImageSmoothingEnabled = false;
                    }
                } catch (e) {
                    // Context might not support these properties
                }
            }
        });

        // Handle hotspot interactions with debouncing
        map.on('pointermove', (event) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const pixel = map.getEventPixel(event.originalEvent);
                const features = map.getFeaturesAtPixel(pixel, {
                    layerFilter: (layer) => layer === hotspotLayer,
                    hitTolerance: 5
                });

                if (features && features.length > 0) {
                    const feature = features[0];
                    const hotspot = feature.get('hotspot');
                    setHoveredHotspot(hotspot);
                    mapRef.style.cursor = 'pointer';
                    // Trigger style update
                    hotspotLayer.changed();
                } else {
                    if (hoveredHotspot()) {
                        setHoveredHotspot(null);
                        mapRef.style.cursor = 'grab';
                        // Trigger style update
                        hotspotLayer.changed();
                    }
                }
            }, 50); // 50ms debounce
        });

        map.on('click', (event) => {
            const pixel = map.getEventPixel(event.originalEvent);
            const features = map.getFeaturesAtPixel(pixel, {
                layerFilter: (layer) => layer === hotspotLayer,
                hitTolerance: 5
            });

            if (features && features.length > 0) {
                const feature = features[0];
                const hotspot = feature.get('hotspot');
                handleHotspotClick(hotspot);
            }
        });

        // Update visible hotspots on view change
        map.on('moveend', updateVisibleHotspots);

        // Handle resize
        resizeObserver = new ResizeObserver(() => {
            if (map) {
                map.updateSize();
                forcePixelPerfect();
            }
        });
        resizeObserver.observe(mapRef);
    };

    // Update visible hotspots
    const updateVisibleHotspots = () => {
        if (updateTimer) clearTimeout(updateTimer);
        updateTimer = setTimeout(() => {
            if (!map || !spatialIndex || !audioEngine) return;

            const view = map.getView();
            const extent = view.calculateExtent(map.getSize());
            const resolution = view.getResolution();
            const zoom = view.getZoom();

            // Query visible hotspots
            const bounds = {
                minX: extent[0],
                minY: extent[1],
                maxX: extent[2],
                maxY: extent[3]
            };

            const visibleHotspots = spatialIndex.queryViewport(bounds, zoom);
            audioEngine.preloadHotspots(visibleHotspots);
        }, 150);
    };

    /**
     * Create features from hotspot data
     */
    function createHotspotFeatures(hotspots) {
        return hotspots.map(hotspot => {
            let geometry;

            if (hotspot.shape === 'polygon') {
                // Use coordinates as-is (both DZI and our data use top-left origin)
                geometry = new Polygon([hotspot.coordinates]);
            } else if (hotspot.shape === 'multipolygon') {
                geometry = new MultiPolygon([hotspot.coordinates]);
            }

            const feature = new Feature({
                geometry: geometry,
                hotspot: hotspot,
                type: hotspot.type
            });

            feature.setId(hotspot.id);
            return feature;
        });
    }

    /**
     * Get style for hotspot feature - Optimized with pre-created styles
     */
    function getHotspotStyle(feature) {
        const hotspot = feature.get('hotspot');
        if (!hotspot) return stylesByType.get('default');

        const isHovered = hoveredHotspot()?.id === hotspot.id;
        const isSelected = selectedHotspot()?.id === hotspot.id;

        // Build key for pre-created style
        let styleKey = hotspot.type;
        if (isSelected) {
            styleKey += '_selected';
        } else if (isHovered) {
            styleKey += '_hover';
        }

        return stylesByType.get(styleKey) || stylesByType.get('default');
    }

    /**
     * Handle hotspot click
     */
    function handleHotspotClick(hotspot) {
        console.log('Hotspot clicked:', hotspot);
        setSelectedHotspot(hotspot);

        // Update styles
        if (hotspotLayer) {
            hotspotLayer.changed();
        }

        if (audioEngine && hotspot.audioUrl) {
            audioEngine.play(hotspot.id);
        }
    }

    // Mobile controls
    const handleZoomIn = () => {
        if (map) {
            const view = map.getView();
            view.adjustZoom(1);
        }
    };

    const handleZoomOut = () => {
        if (map) {
            const view = map.getView();
            view.adjustZoom(-1);
        }
    };

    const handleHome = () => {
        if (map) {
            const view = map.getView();
            const tileSource = map.getLayers().item(0).getSource();
            const extent = tileSource.getImageExtent();
            view.fit(extent, { padding: [20, 20, 20, 20] });
        }
    };

    // Keyboard navigation
    const handleKeyPress = (event) => {
        if (!map) return;
        const view = map.getView();
        const tileSource = map.getLayers().item(0).getSource();
        const extent = tileSource.getImageExtent();

        const handlers = {
            '+': () => view.adjustZoom(1),
            '=': () => view.adjustZoom(1),
            '-': () => view.adjustZoom(-1),
            '_': () => view.adjustZoom(-1),
            '0': () => view.fit(extent, { padding: [20, 20, 20, 20] }),
            'f': () => view.fit(extent, { padding: [20, 20, 20, 20] }),
            'F': () => view.fit(extent, { padding: [20, 20, 20, 20] }),
            'r': () => { forcePixelPerfect(); map.render(); }
        };

        const handler = handlers[event.key];
        if (handler) {
            event.preventDefault();
            handler();
        }
    };

    // Setup global keyboard handler
    onMount(() => {
        window.addEventListener('keydown', handleKeyPress);
    });

    // Cleanup
    onCleanup(() => {
        window.removeEventListener('keydown', handleKeyPress);
        if (resizeObserver) resizeObserver.disconnect();
        if (updateTimer) clearTimeout(updateTimer);
        if (debounceTimer) clearTimeout(debounceTimer);
        if (performanceMonitor) performanceMonitor.stop();
        if (map) {
            map.setTarget(null);
            map.dispose();
        }
        if (audioEngine) audioEngine.destroy();
    });

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

            <div ref={mapRef} class="openlayers-viewer" />

            {isLoading() && (
                <div class="viewer-loading">
                    <p>Loading high-resolution artwork...</p>
                </div>
            )}

            {/* Debug info */}
            {performanceConfig.debug.showMetrics && viewerReady() && (
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
                            <div><kbd>R</kbd> Refresh rendering</div>
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