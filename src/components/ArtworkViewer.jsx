// 1. External libraries
import { onMount, createSignal, onCleanup, Show } from 'solid-js';
import OpenSeadragon from 'openseadragon';

// 2. Core modules
import AudioEngine from '../core/AudioEngine';
import ImageOverlayManager from '../core/ImageOverlayManager';
import MemoryManager from '../core/MemoryManager';
import NativeHotspotRenderer from '../core/NativeHotspotRenderer';
import PerformanceMonitor from '../core/PerformanceMonitor';
import RenderOptimizer from '../core/RenderOptimizer';
import SpatialIndex from '../core/SpatialIndex';
import TileCleanupManager from '../core/TileCleanupManager';
import TileOptimizer from '../core/TileOptimizer';
import { applyTileCascadeFix } from '../core/TileCascadeFix';
import ViewportManager from '../core/ViewportManager';

// 3. Components
import AudioPlayer from './AudioPlayer';
import MediaButton from './MediaButton/MediaButton';
import ImageOverlay from './ImageOverlay/ImageOverlay';

// 4. Config
import performanceConfig, { adjustSettingsForPerformance } from '../config/performanceConfig';
import { QUALITY_CONFIG, ZOOM_CONFIG } from '../config/constants';
import { buildViewerConfig } from '../config/viewerConfig';

// 5. Utils
import { getBrowserOptimalDrawer, isMobile } from '../utils/browserDetection';
import { calculateHotspotBounds } from '../utils/hotspotCalculations';

// 6. Module-level variables
let hotspotData = [];

/**
 * ArtworkViewer - Main viewer component optimized for 60 FPS
 */
function ArtworkViewer(props) {
    let viewerRef;
    let viewer = null;
    let intervals = {};

    const [isLoading, setIsLoading] = createSignal(true);
    const [hoveredHotspot, setHoveredHotspot] = createSignal(null);
    const [selectedHotspot, setSelectedHotspot] = createSignal(null);
    const [viewerReady, setViewerReady] = createSignal(false);
    const [previewLoaded, setPreviewLoaded] = createSignal(false);
    const [showExpandButton, setShowExpandButton] = createSignal(false);
    const [isZoomingToHotspot, setIsZoomingToHotspot] = createSignal(false);
    const [currentPlayingHotspot, setCurrentPlayingHotspot] = createSignal(null);
    const [showMediaButton, setShowMediaButton] = createSignal(false);
    const [mediaButtonPosition, setMediaButtonPosition] = createSignal({ x: 0, y: 0 });
    const [currentMediaHotspot, setCurrentMediaHotspot] = createSignal(null);
    const [components, setComponents] = createSignal({});
    const [debugLevel, setDebugLevel] = createSignal(
        parseInt(localStorage.getItem('debugLevel') || '0')
    );

    // Store initial viewport for "Expand to Full View"
    let homeViewport = null;

    const cleanup = () => {
        if (intervals.handleKeyPress) {
            window.removeEventListener('keydown', intervals.handleKeyPress);
        }

        Object.values(intervals).forEach(interval => {
            if (typeof interval === 'number') clearInterval(interval);
        });

        if (components().resizeObserver && viewerRef) {
            components().resizeObserver.disconnect();
        }

        Object.values(components()).forEach(component => {
            if (component && typeof component.destroy === 'function') {
                component.destroy();
            }
        });

        if (viewer) viewer.destroy();

        ['performanceMonitor', 'viewer', 'tileOptimizer'].forEach(prop => {
            if (window[prop] === components()[prop] || window[prop] === viewer) {
                delete window[prop];
            }
        });
    };

    onMount(async () => {
        // Load hotspots
        try {
            const response = await fetch(`/data/hotspots.json?t=${Date.now()}`);
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

        // Initialize viewer with optimized configuration
        const config = performanceConfig.viewer;
        const dziUrl = `/images/tiles/${props.artworkId}_1024/${props.artworkId}.dzi`;

        // Add minLevel configuration to prevent tile cascade  
        const tileSourceConfig = {
            Image: {
                xmlns: "http://schemas.microsoft.com/deepzoom/2008",
                Url: `/images/tiles/${props.artworkId}_1024/${props.artworkId}_files/`,
                Format: "jpg",
                Overlap: "2",
                TileSize: "1024",
                Size: {
                    Width: "11244",
                    Height: "6543"
                }
            },
            minLevel: 8,
            maxLevel: 14
        };

        const isMobileDevice = isMobile();
        const drawerType = getBrowserOptimalDrawer();

        // Build viewer configuration
        const viewerConfigOptions = buildViewerConfig(
            config,
            tileSourceConfig,
            drawerType,
            isMobileDevice,
            tileSourceConfig
        );

        viewer = OpenSeadragon({
            element: viewerRef,
            ...viewerConfigOptions
        });

        // Initialize components
        const componentsObj = {
            spatialIndex: new SpatialIndex(),
            viewportManager: new ViewportManager(viewer),
            audioEngine: new AudioEngine(),
            performanceMonitor: new PerformanceMonitor(viewer),
            renderOptimizer: new RenderOptimizer(viewer),
            tileOptimizer: new TileOptimizer(viewer),
            memoryManager: new MemoryManager(viewer),
            tileCleanupManager: new TileCleanupManager(viewer),
            imageOverlayManager: new ImageOverlayManager()
        };

        // Set the signal
        setComponents(componentsObj);

        // Simplified audio engine setup
        window.audioEngine = componentsObj.audioEngine; 
        componentsObj.audioEngine.onPlaybackEnd = (hotspotId) => {  
            console.log(`Finished playing audio for hotspot ${hotspotId}`);
            // TODO: Auto-advance to next hotspot if enabled
        };

        componentsObj.spatialIndex.loadHotspots(hotspotData); 
        componentsObj.imageOverlayManager.loadHotspots(hotspotData); 

        // Global access for debugging
        window.viewer = viewer;
        window.performanceMonitor = componentsObj.performanceMonitor;  
        window.tileOptimizer = componentsObj.tileOptimizer;  
        window.tileCleanupManager = componentsObj.tileCleanupManager; 

        // Start all performance systems
        componentsObj.performanceMonitor.start();  
        componentsObj.memoryManager.start();  
        componentsObj.tileOptimizer.start();  
        componentsObj.tileCleanupManager.start();  

        if (debugLevel() >= 1) {
            componentsObj.performanceMonitor.enableDebugOverlay(); 
        }

        // Setup event handlers
        setupViewerEventHandlers();
        setupAdaptiveSprings();
        setupKeyboardHandler();
        setupResizeObserver();

        onCleanup(cleanup);
    });


    const optimizeZoomPerformance = () => {
        let zoomStartTime = null;
        let lastZoomLevel = null;
        let zoomPhase = 'idle'; // idle, accelerating, cruising, decelerating
        let consecutiveZoomEvents = 0;
        let phaseTimeout = null;

        viewer.addHandler('zoom', (event) => {
            const currentZoom = viewer.viewport.getZoom();
            consecutiveZoomEvents++;

            // Clear phase timeout
            if (phaseTimeout) clearTimeout(phaseTimeout);

            if (!lastZoomLevel || Math.abs(currentZoom - lastZoomLevel) > 0.01) {
                // Detect zoom direction and magnitude
                const zoomDelta = lastZoomLevel ? currentZoom - lastZoomLevel : 0;
                const zoomSpeed = Math.abs(zoomDelta);

                // Phase management
                if (zoomPhase === 'idle') {
                    // PHASE 1: Acceleration
                    zoomPhase = 'accelerating';
                    zoomStartTime = performance.now();

                    // Smooth start - don't stop everything immediately
                    viewer.viewport.centerSpringX.animationTime = 0.4;
                    viewer.viewport.centerSpringY.animationTime = 0.4;
                    viewer.viewport.zoomSpring.animationTime = 0.4;

                    // Gradually reduce tile loading
                    if (viewer.imageLoader && consecutiveZoomEvents > 3) {
                        viewer.imageLoader.jobLimit = Math.max(1, viewer.imageLoader.jobLimit - 1);
                    }

                } else if (zoomPhase === 'accelerating' && consecutiveZoomEvents > 5) {
                    // PHASE 2: Cruising
                    zoomPhase = 'cruising';

                    // Optimize for continuous zoom
                    viewer.viewport.zoomSpring.animationTime = 0.2;

                    // Reduce tile operations more
                    if (viewer.imageLoader) {
                        viewer.imageLoader.jobLimit = 1;
                        // Only clear if zoom is fast
                        if (zoomSpeed > 0.1) {
                            viewer.imageLoader.clear();
                        }
                    }
                }

                lastZoomLevel = currentZoom;
            }

            // Schedule deceleration phase
            phaseTimeout = setTimeout(() => {
                if (zoomPhase !== 'idle') {
                    // PHASE 3: Deceleration
                    zoomPhase = 'decelerating';

                    // Smooth ending
                    viewer.viewport.centerSpringX.animationTime = 0.3;
                    viewer.viewport.centerSpringY.animationTime = 0.3;
                    viewer.viewport.zoomSpring.animationTime = 0.3;

                    // Start restoring tile loading
                    if (viewer.imageLoader) {
                        viewer.imageLoader.jobLimit = 3;
                    }

                    // Final phase - back to idle
                    setTimeout(() => {
                        zoomPhase = 'idle';
                        consecutiveZoomEvents = 0;

                        // Fully restore
                        if (viewer.imageLoader) {
                            viewer.imageLoader.jobLimit = performanceConfig.viewer.imageLoaderLimit;
                        }
                        viewer.forceRedraw();

                        if (zoomStartTime) {
                            const duration = performance.now() - zoomStartTime;
                            console.log(`Smooth zoom completed in ${duration}ms`);
                            zoomStartTime = null;
                        }
                    }, 200);
                }
            }, 100); // Wait 100ms of no zoom activity before starting deceleration
        });
    };

    const implementProgressiveZoomQuality = () => {
        let qualityLevel = 1.0; // 0.0 to 1.0
        let qualityTimeout = null;

        viewer.addHandler('zoom', (event) => {
            const currentZoom = viewer.viewport.getZoom();
            const zoomSpeed = event.speed || 1.0; // If available

            // Clear previous timeout
            if (qualityTimeout) clearTimeout(qualityTimeout);

            // Progressive quality reduction based on zoom level AND speed
            let targetQuality = 1.0;

            if (currentZoom < 2.0) {
                targetQuality = 0.6; // Lower quality at extreme zoom out
            } else if (currentZoom < 3.5) {
                targetQuality = 0.8; // Medium quality
            } else {
                targetQuality = 1.0; // Full quality when zoomed in
            }

            // Smoothly transition to target quality
            const qualityDelta = targetQuality - qualityLevel;
            qualityLevel += qualityDelta * 0.3; // Smooth transition

            // Apply progressive settings
            if (viewer.drawer) {
                // Image smoothing based on quality
                viewer.drawer.imageSmoothingEnabled = qualityLevel > 0.7;

                // Progressive tile skip
                const skipRatio = Math.floor((1 - qualityLevel) * 3);
                viewer.skipTileRatio = skipRatio; // We'll use this in tile-drawing
            }

            // Restore quality after zoom stops
            qualityTimeout = setTimeout(() => {
                // Smooth restoration
                const restoreInterval = setInterval(() => {
                    qualityLevel += 0.1;
                    if (qualityLevel >= 1.0) {
                        qualityLevel = 1.0;
                        viewer.drawer.imageSmoothingEnabled = true;
                        viewer.skipTileRatio = 0;
                        viewer.forceRedraw();
                        clearInterval(restoreInterval);
                    }
                }, 50);
            }, 200);
        });
    };

    const scheduleIdleTask = (callback) => {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(callback, { timeout: 200 });
        } else {
            setTimeout(callback, 50);
        }
    };

    const setupAdaptiveSprings = () => {
        // Store original spring values
        const originalSprings = {
            centerX: viewer.viewport.centerSpringX.springStiffness,
            centerY: viewer.viewport.centerSpringY.springStiffness,
            zoom: viewer.viewport.zoomSpring.springStiffness
        };

        // Adapt springs based on zoom distance
        viewer.addHandler('zoom-click', (event) => {
            if (event.quick) return; // Skip for double-click

            const currentZoom = viewer.viewport.getZoom();
            const targetZoom = event.zoom;
            const zoomDistance = Math.abs(Math.log2(targetZoom) - Math.log2(currentZoom));

            // Longer animation for bigger jumps
            const duration = Math.min(0.8, 0.3 + zoomDistance * 0.15);
            viewer.viewport.zoomSpring.animationTime = duration;

            // Softer springs for bigger jumps
            const stiffness = Math.max(4, 8 - zoomDistance);
            viewer.viewport.zoomSpring.springStiffness = stiffness;

            // Restore after animation
            setTimeout(() => {
                viewer.viewport.zoomSpring.animationTime = performanceConfig.viewer.animationTime;
                viewer.viewport.zoomSpring.springStiffness = originalSprings.zoom;
            }, duration * 1000 + 100);
        });
    };

    const setupViewerEventHandlers = () => {

        // Override tile drawing for extreme performance at low zoom
        // Only add tile-drawing handler for canvas drawer (not WebGL)
        if (viewer.drawer && viewer.drawer.getType && viewer.drawer.getType() !== 'webgl') {
            let tileCounter = 0;
            viewer.addHandler('tile-drawing', (event) => {
                const zoom = viewer.viewport.getZoom();
                const tile = event.tile;
                const size = event.tile.size;
                const level = event.tile.level;
                // Progressive tile skipping based on quality level
                const skipRatio = viewer.skipTileRatio || 0;
                if (skipRatio > 0) {
                    tileCounter++;
                    // Skip tiles based on pattern, not random
                    if (tileCounter % (skipRatio + 1) !== 0) {
                        event.preventDefaultAction = true;
                        return;
                    }
                }
                // Still skip tiny tiles
                if (zoom < 2.0) {
                    const screenSize = size * zoom;
                    if (screenSize < 24) { // Slightly lower threshold
                        event.preventDefaultAction = true;
                        return;
                    }
                }
                // Prioritize tiles at current zoom level
                const optimalLevel = Math.floor(Math.log2(zoom));
                if (Math.abs(level - optimalLevel) > 2) {
                    // Skip tiles too far from optimal level during zoom
                    if (viewer.skipTileRatio > 0) {
                        event.preventDefaultAction = true;
                    }
                }
            });
        }

        viewer.addHandler('open', () => {
            // Call the new progressive quality function
            implementProgressiveZoomQuality();
            optimizeZoomPerformance();

            // Apply tile cascade fix AFTER viewer is fully initialized
            applyTileCascadeFix(OpenSeadragon);

            // Limit minimum zoom to prevent performance issues
            viewer.viewport.minZoomLevel = 0.8; // Allow more zoom out while maintaining performance
            viewer.viewport.minZoomImageRatio = 0.5;
            console.log('Viewer ready - initializing systems');
            console.log('Using drawer:', viewer.drawer.getType ? viewer.drawer.getType() : 'canvas');
            setViewerReady(true);
            setIsLoading(false);

            const tiledImage = viewer.world.getItemAt(0);
            const bounds = tiledImage.getBounds();

            
            viewer.viewport.fitBounds(bounds, true);
            viewer.viewport.applyConstraints(true);

            // Store home viewport for "Expand to Full View"
            homeViewport = viewer.viewport.getHomeBounds();

            setTimeout(() => initializeHotspotSystem(), 100);
        });

        // Prevent tile cleanup during critical operations
        viewer.addHandler('zoom', () => {
            if (components().tileCleanupManager) {
                components().tileCleanupManager.setPressure('normal');
            }

            if (isZoomingToHotspot() && viewer.imageLoader) {
                // Clear pending tile loads to reduce jank
                viewer.imageLoader.clear();
            }
        });

        viewer.addHandler('pan', () => {
            if (components().tileCleanupManager) {
                components().tileCleanupManager.setPressure('normal');
            }
        });

        viewer.addHandler('tile-loaded', (event) => {
            if (event.tile && components().tileOptimizer) {
                const loadTime = event.tile.loadTime || event.tiledImage?.lastResetTime || 100;
                components().tileOptimizer.trackLoadTime(loadTime);

                const tileKey = `${event.tile.level || 0}_${event.tile.x || 0}_${event.tile.y || 0}`;
                components().tileOptimizer.loadingTiles.delete(tileKey);
            }
        });

        viewer.addHandler('animation', () => {
            if (components().performanceMonitor) {
                const metrics = components().performanceMonitor.getMetrics();
                if (metrics.averageFPS < performanceConfig.debug.warnThreshold.fps) {
                    const performanceMode = adjustSettingsForPerformance(metrics.averageFPS, metrics.memoryUsage);

                    // Adjust tile cleanup pressure based on performance mode
                    if (components().tileCleanupManager) {
                        const pressureMap = {
                            'emergency': 'critical',
                            'critical': 'critical',
                            'reduced': 'high',
                            'memory-limited': 'high',
                            'normal': 'normal'
                        };
                        components().tileCleanupManager.setPressure(pressureMap[performanceMode] || 'normal');
                    }
                }
            }
        });

        viewer.addHandler('animation-finish', () => {
            if (isZoomingToHotspot()) {
                setIsZoomingToHotspot(false);

                // Re-enable hotspot updates after cinematic zoom
                if (components().renderer) {
                    components().renderer.resumeUpdates();
                    components().renderer.updateVisibility();
                }

                // End render optimizations
                if (components().renderOptimizer) {
                    components().renderOptimizer.endCinematicZoom();
                }
            }
        });

        // Optimize tile loading during zoom animations
        viewer.addHandler('animation-start', (event) => {
            // Pause tile cleanup during zoom animation
            if (isZoomingToHotspot() && components().tileCleanupManager) {
                components().tileCleanupManager.pauseCleanup(3000); // Pause for 3 seconds
            }
        });

        const updateVisibleContent = () => {
            if (intervals.updateTimer) clearTimeout(intervals.updateTimer);
            intervals.updateTimer = setTimeout(() => {
                // Schedule non-critical updates for idle time
                scheduleIdleTask(() => {
                    const { viewportManager, spatialIndex, audioEngine } = components();
                    if (!viewportManager || !spatialIndex || !audioEngine) return;

                    const viewport = viewportManager.getCurrentViewport();
                    const visibleHotspots = spatialIndex.queryViewport(viewport.bounds, viewport.zoom);
                    audioEngine.preloadHotspots(visibleHotspots);
                });
            }, performanceConfig.viewport.updateDebounce);
        };

        viewer.addHandler('viewport-change', updateVisibleContent);
    };



    const setupKeyboardHandler = () => {
        const keyActions = {
            '+': () => viewer.viewport.zoomBy(performanceConfig.viewer.zoomPerScroll),
            '=': () => viewer.viewport.zoomBy(performanceConfig.viewer.zoomPerScroll),
            '-': () => viewer.viewport.zoomBy(1 / performanceConfig.viewer.zoomPerScroll),
            '_': () => viewer.viewport.zoomBy(1 / performanceConfig.viewer.zoomPerScroll),
            '0': () => viewer.viewport.goHome(),
            'f': () => viewer.viewport.fitBounds(viewer.world.getHomeBounds()),
            'F': () => viewer.viewport.fitBounds(viewer.world.getHomeBounds()),
            'c': () => {
                // Cycle through debug levels: 0 -> 1 -> 2 -> 0
                const currentLevel = debugLevel();
                const newLevel = (currentLevel + 1) % 3;
                setDebugLevel(newLevel);
                localStorage.setItem('debugLevel', newLevel.toString());

                // Handle different debug levels
                if (components().performanceMonitor) {
                    if (newLevel >= 1) {
                        // Level 1 and 2: Show performance monitor
                        components().performanceMonitor.enableDebugOverlay();
                    } else {
                        // Level 0: Hide everything
                        components().performanceMonitor.disableDebugOverlay();
                    }
                }

                if (components().renderer) {
                    // Only show renderer debug mode at level 2
                    components().renderer.setDebugMode(newLevel === 2);
                }

                console.log(`Debug level: ${newLevel} (0=off, 1=performance only, 2=full debug)`);
            }
        };

        intervals.handleKeyPress = (event) => {
            const action = keyActions[event.key];
            if (action && viewer) {
                event.preventDefault();
                action();
                viewer.viewport.applyConstraints();
            }
        };

        window.addEventListener('keydown', intervals.handleKeyPress);
    };

    const setupResizeObserver = () => {
        const resizeObserver = new ResizeObserver((entries) => {
            if (!viewer?.viewport || !viewer.isOpen()) return;

            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    requestAnimationFrame(() => {
                        try {
                            // Check if viewer is still valid before resize
                            if (viewer && viewer.viewport && viewer.isOpen()) {
                                viewer.viewport.resize();
                                viewer.viewport.applyConstraints();
                                viewer.forceRedraw();
                            }
                        } catch (error) {
                            // Silently handle resize errors - they're usually transient
                            if (error.message && !error.message.includes('undefined')) {
                                console.warn('Resize error:', error);
                            }
                        }
                    });
                }
            }
        });
        resizeObserver.observe(viewerRef);

        // Store in components
        setComponents(prev => ({ ...prev, resizeObserver }));
    };


    const initializeHotspotSystem = () => {
        if (!viewer) return;

        // Always use NativeHotspotRenderer for both desktop and mobile
        const renderer = new NativeHotspotRenderer({
            viewer: viewer,
            spatialIndex: components().spatialIndex,
            onHotspotHover: setHoveredHotspot,
            onHotspotClick: handleHotspotClick,
            visibilityCheckInterval: performanceConfig.hotspots.visibilityCheckInterval,
            batchSize: performanceConfig.hotspots.batchSize,
            renderDebounceTime: performanceConfig.hotspots.renderDebounceTime,
            maxVisibleHotspots: performanceConfig.hotspots.maxVisibleHotspots,
            minZoomForHotspots: performanceConfig.hotspots.minZoomForHotspots,
            debugMode: debugLevel() === 2
        });

        setComponents(prev => ({ ...prev, renderer }));
        console.log('Using NativeHotspotRenderer for all platforms');
    };


    /**
     * Check if a hotspot is already well-framed in the current viewport
     */
    const isHotspotWellFramed = (hotspot, bounds) => {
        if (!viewer || !bounds) return false;

        const currentBounds = viewer.viewport.getBounds();
        const currentZoom = viewer.viewport.getZoom();

        // Convert image bounds to viewport coordinates
        const hotspotViewportBounds = viewer.viewport.imageToViewportRectangle(
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height
        );

        // Check how much of the hotspot is visible
        const intersection = currentBounds.intersection(hotspotViewportBounds);
        if (!intersection) return false;

        // Calculate overlap percentage
        const hotspotArea = hotspotViewportBounds.width * hotspotViewportBounds.height;
        const intersectionArea = intersection.width * intersection.height;
        const overlapRatio = intersectionArea / hotspotArea;

        // Check if center is close
        const hotspotCenter = hotspotViewportBounds.getCenter();
        const viewportCenter = currentBounds.getCenter();

        // Calculate distance manually
        const centerDistance = Math.sqrt(
            Math.pow(hotspotCenter.x - viewportCenter.x, 2) +
            Math.pow(hotspotCenter.y - viewportCenter.y, 2)
        );

        // Consider well-framed if 80% visible AND center is close
        const isWellFramed = overlapRatio > 0.8 && centerDistance < 0.1;

        console.log('Well-framed check:', {
            overlapRatio,
            centerDistance,
            isWellFramed
        });

        return isWellFramed;
    };

    /**
 * Smooth zoom to hotspot with quality limits
 */
    const zoomToHotspot = async (hotspot) => {
        if (!viewer || isZoomingToHotspot()) {
            return;
        }

        const bounds = calculateHotspotBounds(hotspot, viewer, isMobile());
        if (!bounds) {
            return;
        }

        // Check if hotspot is already well-framed
        const alreadyFramed = isHotspotWellFramed(hotspot, bounds);

        setIsZoomingToHotspot(true);

        // Calculate viewport aspect ratio
        const viewportAspect = viewer.viewport.getAspectRatio();

        // Calculate current viewport for distance calculation
        const currentBounds = viewer.viewport.getBounds();
        const currentCenter = currentBounds.getCenter();

        // Calculate hotspot center
        let hotspotCenterImage;
        const overlay = components().renderer?.overlays?.get?.(hotspot.id);

        if (overlay && overlay.bounds) {
            hotspotCenterImage = new OpenSeadragon.Point(
                (overlay.bounds.minX + overlay.bounds.maxX) / 2,
                (overlay.bounds.minY + overlay.bounds.maxY) / 2
            );
        } else if (hotspot.coordinates) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const processCoords = (coords) => {
                if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
                    coords.forEach(([x, y]) => {
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                    });
                } else {
                    coords.forEach(polygon => {
                        polygon.forEach(([x, y]) => {
                            minX = Math.min(minX, x);
                            minY = Math.min(minY, y);
                            maxX = Math.max(maxX, x);
                            maxY = Math.max(maxY, y);
                        });
                    });
                }
            };
            processCoords(hotspot.coordinates);
            hotspotCenterImage = new OpenSeadragon.Point(
                (minX + maxX) / 2,
                (minY + maxY) / 2
            );
        }

        const centerViewport = viewer.viewport.imageToViewportCoordinates(hotspotCenterImage);

        // Calculate distance for dynamic timing
        const distance = Math.sqrt(
            Math.pow(centerViewport.x - currentCenter.x, 2) +
            Math.pow(centerViewport.y - currentCenter.y, 2)
        );

        // Store original settings
        const originalSettings = {
            animationTime: viewer.animationTime,
            springStiffness: viewer.springStiffness
        };

        // Cinematic zoom: 1.2s to 1.5s for better scale perception
        const animTime = Math.min(1.5, Math.max(1.2, distance * 0.4 + 1.0));

        // Softer springs for cinematic feel: 6.0 to 10.0
        const stiffness = Math.max(6.0, 10.0 - distance * 1.5);

        // NOW we can use animTime - Pause tile cleanup during cinematic zoom for better performance
        if (components().tileCleanupManager) {
            components().tileCleanupManager.pauseCleanup(animTime * 1000 + 500);
        }

        // Clear tile queue to prioritize zoom animation
        if (viewer.imageLoader) {
            viewer.imageLoader.clear();
        }

        // Notify RenderOptimizer about cinematic zoom
        if (components().renderOptimizer) {
            components().renderOptimizer.startCinematicZoom();
        }

        // Pause hotspot updates during zoom for better performance
        if (components().renderer) {
            components().renderer.pauseUpdates();
        }

        // Apply settings to viewer and all springs
        viewer.animationTime = animTime;
        viewer.springStiffness = stiffness;

        // Apply to individual springs
        viewer.viewport.centerSpringX.animationTime = animTime;
        viewer.viewport.centerSpringY.animationTime = animTime;
        viewer.viewport.zoomSpring.animationTime = animTime;

        viewer.viewport.centerSpringX.springStiffness = stiffness;
        viewer.viewport.centerSpringY.springStiffness = stiffness;
        viewer.viewport.zoomSpring.springStiffness = stiffness * 0.85; // Slightly softer zoom

        // Calculate final bounds with padding
        const paddingFactor = isMobile() ? 0.7 : 0.85;

        // Calculate center point for better mobile centering
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;

        // Create bounds centered on the hotspot
        let adjustedBounds = new OpenSeadragon.Rect(
            centerX - (bounds.width * paddingFactor) / 2,
            centerY - (bounds.height * paddingFactor) / 2,
            bounds.width * paddingFactor,
            bounds.height * paddingFactor
        );

        // FORCE ANIMATION: Slightly modify the bounds size to trigger animation
        // This keeps perfect centering while ensuring animation
        if (alreadyFramed || true) { // Always force for now
            // Make bounds 1% smaller - this will zoom in slightly more
            const shrinkFactor = 0.99;
            const centerX = adjustedBounds.x + adjustedBounds.width / 2;
            const centerY = adjustedBounds.y + adjustedBounds.height / 2;

            adjustedBounds.width *= shrinkFactor;
            adjustedBounds.height *= shrinkFactor;
            adjustedBounds.x = centerX - adjustedBounds.width / 2;
            adjustedBounds.y = centerY - adjustedBounds.height / 2;
        }
        

        // Mobile centering adjustment - using different approach
        if (isMobile()) {
            // Get container size in pixels
            const containerSize = viewer.viewport.getContainerSize();

            // Calculate offset in viewport coordinates
            // Offset by 10% of viewport height upward for better mobile centering
            const offsetPixels = containerSize.y * 0.1;
            const offsetViewport = viewer.viewport.deltaPointsFromPixels(new OpenSeadragon.Point(0, -offsetPixels));

            // Apply offset to bounds
            adjustedBounds.y += offsetViewport.y;
        }

        // Debug log to understand what's happening
        console.log('Zoom attempt:', {
            currentZoom: viewer.viewport.getZoom(),
            currentCenter: viewer.viewport.getCenter(),
            targetBounds: adjustedBounds,
            alreadyFramed: alreadyFramed
        });

        // Debug: Check if bounds are reasonable
        console.log('Adjusted bounds:', {
            x: adjustedBounds.x,
            y: adjustedBounds.y,
            width: adjustedBounds.width,
            height: adjustedBounds.height,
            viewportBounds: viewer.viewport.getBounds()
        });

        // Safety check: ensure bounds are within reasonable range
        if (adjustedBounds.width > 1 || adjustedBounds.height > 1) {
            console.error('Bounds too large - using fallback');
            // Fallback to safe zoom
            viewer.viewport.zoomTo(3, centerViewport, false);
            return;
        }

        // Use fitBounds for both desktop and mobile
        viewer.viewport.fitBounds(adjustedBounds, false);

        // Restore original settings after animation
        setTimeout(() => {
            viewer.animationTime = originalSettings.animationTime;
            viewer.springStiffness = originalSettings.springStiffness;

            // Reset all springs to original values
            viewer.viewport.centerSpringX.animationTime = originalSettings.animationTime;
            viewer.viewport.centerSpringY.animationTime = originalSettings.animationTime;
            viewer.viewport.zoomSpring.animationTime = originalSettings.animationTime;

            viewer.viewport.centerSpringX.springStiffness = originalSettings.springStiffness;
            viewer.viewport.centerSpringY.springStiffness = originalSettings.springStiffness;
            viewer.viewport.zoomSpring.springStiffness = originalSettings.springStiffness;

            // End cinematic zoom optimizations
            if (components().renderOptimizer) {
                components().renderOptimizer.endCinematicZoom();
            }

        }, animTime * 1000 + 200);

        // Update hotspot overlays after animation
        setTimeout(() => {
            if (components().renderer) {
                components().renderer.updateVisibility();
                viewer.forceRedraw();
            }
        }, animTime * 1000 + 100);

        // Show expand button on mobile
        if (isMobile()) {
            setShowExpandButton(true);
        }
    };

    /**
     * Handle hotspot click with zoom behavior
     */
    const handleHotspotClick = async (hotspot) => {
        console.log('Hotspot clicked:', hotspot.id, 'isMobile:', isMobile());

        // Hide previous media button
        setShowMediaButton(false);
        setSelectedHotspot(hotspot);
        setCurrentPlayingHotspot(hotspot);

        // Check if hotspot has image
        const hasImage = hotspot.image_url_1 || components().imageOverlayManager?.getOverlay(hotspot.id);

        if (hasImage) {
            // Check if should auto-reveal
            if (components().imageOverlayManager.shouldAutoReveal(hotspot.id)) {
                // Auto-open overlay
                handleMediaButtonClick(hotspot.id);
            } else if (components().imageOverlayManager.shouldShowButton(hotspot.id)) {
                // Show button
                setCurrentMediaHotspot(hotspot);
                setShowMediaButton(true);
            }
        }

        // Always zoom to hotspot on both desktop and mobile, regardless of current zoom level
        console.log('Zooming to hotspot:', hotspot.id);
        await zoomToHotspot(hotspot);

        // Play audio (existing code)
        const audioDelay = isMobile() ? 1200 : 0;
        setTimeout(() => {
            if (components().audioEngine && hotspot.audioUrl) {
                components().audioEngine.play(hotspot.id);
            }
        }, audioDelay);
    };

    const handleMediaButtonClick = (hotspotId) => {
        console.log('Media button clicked for:', hotspotId);
        setShowMediaButton(false);

        // Open overlay through manager
        if (components().imageOverlayManager) {
            components().imageOverlayManager.openOverlay(hotspotId);
        }

        // TODO: Show ImageOverlay component (next step)
    };

    /**
     * Expand to full view (mobile only)
     */
    const expandToFullView = () => {
        if (!viewer || !homeViewport) return;

        setShowExpandButton(false);

        // Smooth animation to home
        const originalAnimationTime = viewer.animationTime;
        viewer.animationTime = 0.8;

        viewer.viewport.fitBounds(homeViewport, false);

        setTimeout(() => {
            viewer.animationTime = originalAnimationTime;
        }, 100);
    };

    return (
        <>
            <div class="viewer-container">
                <Show when={previewLoaded() && !viewerReady()}>
                    <img
                        src={`/images/tiles/${props.artworkId}_1024/preview.jpg`}
                        class="preview-image"
                        alt="Loading preview"
                    />
                </Show>

                <div ref={viewerRef} class="openseadragon-viewer" />

                <Show when={isLoading()}>
                    <div class="viewer-loading">
                        <p>Loading high-resolution artwork...</p>
                    </div>
                </Show>

                <Show when={viewerReady() && debugLevel() === 2}>
                    <div class="debug-info">
                        <div>Hovered: {hoveredHotspot()?.id || 'none'}</div>
                        <div>Selected: {selectedHotspot()?.id || 'none'}</div>
                        <div>Type: {hoveredHotspot()?.type || 'none'}</div>
                        <div>Total hotspots: {hotspotData.length}</div>
                        <div>Drawer: {viewer?.drawer?.getType ? viewer.drawer.getType() : 'canvas'}</div>
                    </div>
                </Show>


                {/* Expand to Full View button for mobile */}
                <Show when={viewerReady() && showExpandButton() && isMobile()}>
                    <div class="expand-button-container">
                        <button class="expand-button" onClick={expandToFullView}>
                            <span style="font-size: 16px; line-height: 1;">⤢</span> Full View
                        </button>
                    </div>
                </Show>

                {/* Media Button */}
                <Show when={showMediaButton() && currentMediaHotspot()}>
                    <MediaButton
                        hotspotId={currentMediaHotspot()?.id}
                        onClick={handleMediaButtonClick}
                        position={mediaButtonPosition()}
                        isMobile={isMobile()}
                    />
                </Show>

               

                {/* Image Overlay */}
                <Show when={viewerReady() && components().imageOverlayManager}>
                    <ImageOverlay
                        imageOverlayManager={components().imageOverlayManager}
                        currentHotspot={currentMediaHotspot}
                    />
                </Show>

            </div>

            {/* Audio Player - Outside viewer container to avoid overflow hidden */}
            <Show when={viewerReady() && components().audioEngine}>
                <AudioPlayer
                    audioEngine={components().audioEngine}
                    currentHotspot={currentPlayingHotspot}
                />
            </Show>
        </>
    );
}

export default ArtworkViewer;