import { onMount, createSignal, onCleanup, Show } from 'solid-js';
import OpenSeadragon from 'openseadragon';
import NativeHotspotRenderer from '../core/NativeHotspotRenderer';
import ViewportManager from '../core/ViewportManager';
import SpatialIndex from '../core/SpatialIndex';
import AudioEngine from '../core/AudioEngine';
import PerformanceMonitor from '../core/PerformanceMonitor';
import RenderOptimizer from '../core/RenderOptimizer';
import TileOptimizer from '../core/TileOptimizer';
import MemoryManager from '../core/MemoryManager';
import { applyTileCascadeFix } from '../core/TileCascadeFix';
import TileCleanupManager from '../core/TileCleanupManager';
import AudioPlayer from './AudioPlayer';
import performanceConfig, { adjustSettingsForPerformance } from '../config/performanceConfig';

// New imports
import { getBrowserOptimalDrawer, isMobile } from '../utils/browserDetection';
import { calculateHotspotBounds } from '../utils/hotspotCalculations';
import { buildViewerConfig } from '../config/viewerConfig';
import { QUALITY_CONFIG, ZOOM_CONFIG } from '../config/constants';

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
    const [showExpandButton, setShowExpandButton] = createSignal(false);
    const [isZoomingToHotspot, setIsZoomingToHotspot] = createSignal(false);
    const [currentPlayingHotspot, setCurrentPlayingHotspot] = createSignal(null);
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

        if (components.resizeObserver && viewerRef) {
            components.resizeObserver.disconnect();
        }

        Object.values(components).forEach(component => {
            if (component && typeof component.destroy === 'function') {
                component.destroy();
            }
        });

        if (viewer) viewer.destroy();

        ['performanceMonitor', 'viewer', 'tileOptimizer'].forEach(prop => {
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
            tileSourceConfig,  // Pass tileSourceConfig instead of dziUrl
            drawerType,
            isMobileDevice,
            tileSourceConfig
        );

        viewer = OpenSeadragon({
            element: viewerRef,
            ...viewerConfigOptions
        });

        

        // Initialize components
        components = {
            spatialIndex: new SpatialIndex(),
            viewportManager: new ViewportManager(viewer),
            audioEngine: new AudioEngine(),
            performanceMonitor: new PerformanceMonitor(viewer),
            renderOptimizer: new RenderOptimizer(viewer),
            tileOptimizer: new TileOptimizer(viewer),
            memoryManager: new MemoryManager(viewer),
            tileCleanupManager: new TileCleanupManager(viewer)
        };

        // Simplified audio engine setup
        window.audioEngine = components.audioEngine;
        components.audioEngine.onPlaybackEnd = (hotspotId) => {
            console.log(`Finished playing audio for hotspot ${hotspotId}`);
            // TODO: Auto-advance to next hotspot if enabled
        };

        components.spatialIndex.loadHotspots(hotspotData);

        // Global access for debugging
        window.viewer = viewer;
        window.performanceMonitor = components.performanceMonitor;
        window.tileOptimizer = components.tileOptimizer;
        window.tileCleanupManager = components.tileCleanupManager;

        // Start all performance systems
        components.performanceMonitor.start();
        components.memoryManager.start();
        components.tileOptimizer.start();
        components.tileCleanupManager.start();

        if (debugLevel() >= 1) {
            components.performanceMonitor.enableDebugOverlay();
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
                        event.preventDefault();
                        return;
                    }
                }
                // Still skip tiny tiles
                if (zoom < 2.0) {
                    const screenSize = size * zoom;
                    if (screenSize < 24) { // Slightly lower threshold
                        event.preventDefault();
                        return;
                    }
                }
                // Prioritize tiles at current zoom level
                const optimalLevel = Math.floor(Math.log2(zoom));
                if (Math.abs(level - optimalLevel) > 2) {
                    // Skip tiles too far from optimal level during zoom
                    if (viewer.skipTileRatio > 0) {
                        event.preventDefault();
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
            if (components.tileCleanupManager) {
                components.tileCleanupManager.setPressure('normal');
            }

            if (isZoomingToHotspot() && viewer.imageLoader) {
                // Clear pending tile loads to reduce jank
                viewer.imageLoader.clear();
            }
        });

        viewer.addHandler('pan', () => {
            if (components.tileCleanupManager) {
                components.tileCleanupManager.setPressure('normal');
            }
        });

        viewer.addHandler('tile-loaded', (event) => {
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
                    const performanceMode = adjustSettingsForPerformance(metrics.averageFPS, metrics.memoryUsage);

                    // Adjust tile cleanup pressure based on performance mode
                    if (components.tileCleanupManager) {
                        const pressureMap = {
                            'emergency': 'critical',
                            'critical': 'critical',
                            'reduced': 'high',
                            'memory-limited': 'high',
                            'normal': 'normal'
                        };
                        components.tileCleanupManager.setPressure(pressureMap[performanceMode] || 'normal');
                    }
                }
            }
        });

        viewer.addHandler('animation-finish', () => {
            if (isZoomingToHotspot()) {
                setIsZoomingToHotspot(false);

                // Re-enable hotspot updates after cinematic zoom
                if (components.renderer) {
                    components.renderer.resumeUpdates();
                    components.renderer.updateVisibility();
                }

                // End render optimizations
                if (components.renderOptimizer) {
                    components.renderOptimizer.endCinematicZoom();
                }
            }
        });

        // Optimize tile loading during zoom animations
        viewer.addHandler('animation-start', (event) => {
            // Pause tile cleanup during zoom animation
            if (isZoomingToHotspot() && components.tileCleanupManager) {
                components.tileCleanupManager.pauseCleanup(3000); // Pause for 3 seconds
            }
        });

        const updateVisibleContent = () => {
            if (intervals.updateTimer) clearTimeout(intervals.updateTimer);
            intervals.updateTimer = setTimeout(() => {
                // Schedule non-critical updates for idle time
                scheduleIdleTask(() => {
                    const { viewportManager, spatialIndex, audioEngine } = components;
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
                if (components.performanceMonitor) {
                    if (newLevel >= 1) {
                        // Level 1 and 2: Show performance monitor
                        components.performanceMonitor.enableDebugOverlay();
                    } else {
                        // Level 0: Hide everything
                        components.performanceMonitor.disableDebugOverlay();
                    }
                }

                if (components.renderer) {
                    // Only show renderer debug mode at level 2
                    components.renderer.setDebugMode(newLevel === 2);
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
        components.resizeObserver = new ResizeObserver((entries) => {
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
        components.resizeObserver.observe(viewerRef);
    };



    const initializeHotspotSystem = () => {
        if (!viewer) return;

        // Use Canvas renderer for mobile, SVG for desktop
        if (isMobile()) {
            // Import dynamically to avoid loading on desktop
            import('../core/CanvasHotspotRenderer.js').then(({ default: CanvasHotspotRenderer }) => {
                components.renderer = new CanvasHotspotRenderer({
                    viewer: viewer,
                    spatialIndex: components.spatialIndex,
                    onHotspotHover: setHoveredHotspot,
                    onHotspotClick: handleHotspotClick,
                    visibilityCheckInterval: performanceConfig.hotspots.visibilityCheckInterval,
                    debugMode: debugLevel() === 2
                });
                console.log('Using CanvasHotspotRenderer for mobile');
            });
        } else {
            // Desktop keeps the existing SVG renderer
            components.renderer = new NativeHotspotRenderer({
                viewer: viewer,
                spatialIndex: components.spatialIndex,
                onHotspotHover: setHoveredHotspot,
                onHotspotClick: handleHotspotClick,
                visibilityCheckInterval: performanceConfig.hotspots.visibilityCheckInterval,
                batchSize: performanceConfig.hotspots.batchSize,
                renderDebounceTime: performanceConfig.hotspots.renderDebounceTime,
                maxVisibleHotspots: performanceConfig.hotspots.maxVisibleHotspots,
                minZoomForHotspots: performanceConfig.hotspots.minZoomForHotspots,
                debugMode: debugLevel() === 2
            });
        }
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

        setIsZoomingToHotspot(true);

        // Calculate viewport aspect ratio
        const viewportAspect = viewer.viewport.getAspectRatio();

        // Calculate current viewport for distance calculation
        const currentBounds = viewer.viewport.getBounds();
        const currentCenter = currentBounds.getCenter();

        // Calculate hotspot center
        let hotspotCenterImage;
        const overlay = components.renderer?.overlays?.get?.(hotspot.id);

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

        // Optimized for 60 FPS: 0.5s to 0.8s max
        const animTime = Math.min(0.8, Math.max(0.5, distance * 0.3 + 0.4));

        // Higher stiffness for responsive zoom: 10.0 to 15.0
        const stiffness = Math.max(10.0, 15.0 - distance * 2.0);

        // NOW we can use animTime - Pause tile cleanup during cinematic zoom for better performance
        if (components.tileCleanupManager) {
            components.tileCleanupManager.pauseCleanup(animTime * 1000 + 500);
        }

        // Clear tile queue to prioritize zoom animation
        if (viewer.imageLoader) {
            viewer.imageLoader.clear();
        }

        // Notify RenderOptimizer about cinematic zoom
        if (components.renderOptimizer) {
            components.renderOptimizer.startCinematicZoom();
        }

        // Pause hotspot updates during zoom for better performance
        if (components.renderer) {
            components.renderer.pauseUpdates();
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
        const paddingFactor = isMobile() ? 0.75 : 0.85;
        const adjustedBounds = new OpenSeadragon.Rect(
            bounds.x + bounds.width * (1 - paddingFactor) / 2,
            bounds.y + bounds.height * (1 - paddingFactor) / 2,
            bounds.width * paddingFactor,
            bounds.height * paddingFactor
        );

        // Execute zoom with animation
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
            if (components.renderOptimizer) {
                components.renderOptimizer.endCinematicZoom();
            }

        }, animTime * 1000 + 200);

        // Update hotspot overlays after animation
        setTimeout(() => {
            if (components.renderer) {
                components.renderer.updateVisibility();
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
        setSelectedHotspot(hotspot);
        setCurrentPlayingHotspot(hotspot);

        // Zoom behavior
        if (isMobile()) {
            console.log('Zooming to hotspot on mobile...');
            // Mobile: Always zoom to hotspot
            await zoomToHotspot(hotspot);
        } else if (ZOOM_CONFIG.enableDesktopZoom) {
            // Desktop: Optional zoom
            const currentZoom = viewer.viewport.getZoom();
            if (currentZoom < ZOOM_CONFIG.minZoomForDetail) {
                await zoomToHotspot(hotspot);
            }
        }

        // Play audio - adjust delay to match new animation timing
        const audioDelay = isMobile() ? 1200 : 0;

        setTimeout(() => {
            if (components.audioEngine && hotspot.audioUrl) {
                components.audioEngine.play(hotspot.id);
            }
        }, audioDelay);
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
        setShowExpandButton(false);
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

                <Show when={viewerReady() && window.innerWidth <= 768}>
                    <div class="mobile-controls">
                        <button class="zoom-btn zoom-in" onClick={handleZoomIn}>+</button>
                        <button class="zoom-btn zoom-out" onClick={handleZoomOut}>−</button>
                        <button class="zoom-btn zoom-home" onClick={handleHome}>⌂</button>
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
            </div>

            {/* Audio Player - Outside viewer container to avoid overflow hidden */}
            <Show when={viewerReady() && components.audioEngine}>
                <AudioPlayer
                    audioEngine={components.audioEngine}
                    currentHotspot={currentPlayingHotspot}
                />
            </Show>
        </>
    );
}

export default ArtworkViewer;