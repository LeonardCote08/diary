import OpenSeadragon from 'openseadragon';
/**
 * CanvasOverlayManager - High-performance darkening overlay using Canvas
 * Preserves artwork quality while maintaining 60 FPS with 600+ hotspots
 */
class CanvasOverlayManager {
    constructor(viewer) {
        this.viewer = viewer;
        this.canvas = null;
        this.ctx = null;
        this.isInitialized = false;

        // Add mobile detection
        this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
            ('ontouchstart' in window);

        // State
        this.state = {
            selectedHotspot: null,
            opacity: 0,
            targetOpacity: 0,
            isAnimating: false,
            lastRenderTime: 0,
            renderMode: 'static', // static or animated
            darkeningPaused: false
        };

        this.transition = {
            active: false,
            fromHotspot: null,
            toHotspot: null,
            progress: 0,
            duration: 1000,
            startTime: null
        };

        // Add after this.transition = { ... }
        this.focusTracking = {
            referenceZoom: null,
            referenceCenter: null,
            selectionTime: null,
            currentScore: 1,
            targetScore: 1,
            scoreVelocity: 0,
            lastCalculation: 0,
            throttleInterval: 16 // 60 FPS
        };

        // Focus score weights and thresholds
        this.focusConfig = {
            weights: {
                distance: 0.3,      // Reduced from 0.4
                zoom: 0.5,          // Increased from 0.35
                visibility: 0.2     // Reduced from 0.25
            },
            thresholds: {
                zoom: {
                    fadeStart: 0.6,      // Start fading at 60% of original zoom
                    fadeEnd: 0.3,        // Completely gone at 30%
                    reactivate: 0.65
                },
                distance: {
                    maxFromCenter: 0.3   // Reduced for more aggressive fade
                },
                visibility: {
                    maintain: 0.25,
                    fadeOut: 0.20
                }
            },
            fadeDuration: 400, // ms
            hysteresis: {
                active: false,
                lastDirection: null // 'in' or 'out'
            }
        };

        // Interpolation state for smooth transitions
        this.interpolation = {
            current: null,
            target: null,
            velocity: { x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0, scale: 0 },
            spring: 0.15,  // More responsive
            damping: 0.85,  // Less bouncy
            disabled: false,
            // Track zoom for scale interpolation
            currentZoom: 1,
            targetZoom: 1,
            zoomVelocity: 0
        };

        this.interpolationTimeout = null;
        this.renderRequest = null;

        // Animation loop control
        this.animationLoop = {
            isRunning: false,
            frameId: null
        };

        // Animation tracking
        this.state.isViewerAnimating = false;
        this.predictiveRenderLoop = null;

        // Remove interpolation delay during viewport changes
        this.directRenderMode = false;

        // Configuration
        this.config = {
            maxOpacity: 0.7,
            fadeSpeed: 0.05, // Opacity change per frame
            edgeSoftness: 20, // Pixels for soft edge
            updateThrottle: 16, // ~60 FPS
            enableSoftEdges: false
        };

      

        // Timers
        this.animationFrame = null;
        this.lastUpdateTime = 0;
        this.softEdgeTimeout = null;

        // Bind methods
        this.render = this.render.bind(this);
        this.handleViewportUpdate = this.handleViewportUpdate.bind(this);
    }

    initialize() {
        if (this.isInitialized) return;

        // Create canvas element
        this.canvas = document.createElement('canvas');
        this.canvas.style.pointerEvents = 'none';
        this.ctx = this.canvas.getContext('2d', {
            alpha: true
        });

        // Add canvas as OpenSeadragon overlay - this ensures perfect sync
        this.viewer.addOverlay({
            element: this.canvas,
            location: new OpenSeadragon.Rect(0, 0, 1, 1),
            placement: OpenSeadragon.Placement.TOP_LEFT,
            checkResize: false
        });

        // Set up custom redraw handler
        this.setupRedrawHandler();

        // Set up size
        this.updateCanvasSize();

        this.isInitialized = true;
        console.log('CanvasOverlayManager initialized with native overlay');

        // Listen for zoom events for auto-deselect
        this.viewer.addHandler('zoom', () => {
            if (this.state.selectedHotspot) {
                this.checkAutoDeselect();
            }
        });
    }

    setupRedrawHandler() {
        // Hook into OpenSeadragon's update cycle for perfect sync
        let lastRedrawTime = 0;
        const minRedrawInterval = 16; // ~60fps

        this.viewer.addHandler('update-viewport', () => {
            const now = performance.now();
            if (now - lastRedrawTime < minRedrawInterval) return;
            lastRedrawTime = now;

            if (this.state.selectedHotspot || this.state.opacity > 0) {
                this.redrawOverlay();
            }
        });

        // Immediate redraw on animation frames
        this.viewer.addHandler('animation', () => {
            if (this.state.selectedHotspot) {
                this.redrawOverlay();
            }
        });
    }

    redrawOverlay() {
        // Get current viewport state
        const viewport = this.viewer.viewport;
        const containerSize = viewport.getContainerSize();

        // Update canvas size if needed
        if (this.canvas.width !== containerSize.x || this.canvas.height !== containerSize.y) {
            this.canvas.width = containerSize.x;
            this.canvas.height = containerSize.y;
        }

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (!this.state.selectedHotspot || this.state.opacity < 0.001) {
            return;
        }

        // Calculate effective opacity
        const focusScore = this.calculateFocusScore();
        const effectiveOpacity = this.state.opacity * focusScore;

        if (effectiveOpacity < 0.001) return;

        // Save context
        this.ctx.save();

        // Draw darkening overlay
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = `rgba(0, 0, 0, ${effectiveOpacity})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Cut out hotspot area
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.fillStyle = 'rgba(255, 255, 255, 1)';

        // Convert hotspot coordinates to screen space
        this.drawHotspotShapeFromCoords(this.state.selectedHotspot);

        this.ctx.restore();
    }

    drawHotspotShapeFromCoords(hotspot) {
        this.ctx.beginPath();

        if (hotspot.shape === 'polygon' || hotspot.shape === 'multipolygon') {
            const coords = hotspot.shape === 'polygon' ?
                [hotspot.coordinates] : hotspot.coordinates;

            coords.forEach(polygon => {
                polygon.forEach((point, index) => {
                    const screenPoint = this.imageToScreen(point[0], point[1]);

                    if (index === 0) {
                        this.ctx.moveTo(screenPoint.x, screenPoint.y);
                    } else {
                        this.ctx.lineTo(screenPoint.x, screenPoint.y);
                    }
                });
                this.ctx.closePath();
            });
        }

        this.ctx.fill();
    }

    updateCanvasSize() {
        // Native overlay handles positioning, we just need to update dimensions
        const containerSize = this.viewer.viewport.getContainerSize();

        if (this.canvas.width !== containerSize.x || this.canvas.height !== containerSize.y) {
            this.canvas.width = containerSize.x;
            this.canvas.height = containerSize.y;

            // Force redraw after resize
            if (this.state.selectedHotspot) {
                this.redrawOverlay();
            }
        }
    }

    selectHotspot(hotspot) {
        if (this.state.selectedHotspot?.id === hotspot?.id) return;

        this.state.selectedHotspot = hotspot;
        this.state.targetOpacity = hotspot ? this.config.maxOpacity : 0;

        // Disable interpolation completely for immediate response
        this.interpolation.disabled = true;
        this.interpolation.current = null;
        this.interpolation.velocity = { x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0 };

        // Start opacity animation
        this.startAnimation();

        // Start render loop if selecting
        if (hotspot) {
            this.startAnimationLoop();
        }
    }

    trackFocusReference() {
        console.log('trackFocusReference called');
        if (!this.state.selectedHotspot) {
            console.log('trackFocusReference: no selected hotspot');
            return;
        }

        const currentZoom = this.viewer.viewport.getZoom();
        const viewport = this.viewer.viewport;
        const center = viewport.getCenter();

        // Calculate hotspot center in IMAGE coordinates
        let hotspotCenterImage = { x: 0, y: 0 };

        if (this.state.selectedHotspot.shape === 'polygon') {
            // Calculate center of polygon
            let sumX = 0, sumY = 0;
            const coords = this.state.selectedHotspot.coordinates;
            coords.forEach(([x, y]) => {
                sumX += x;
                sumY += y;
            });
            hotspotCenterImage.x = sumX / coords.length;
            hotspotCenterImage.y = sumY / coords.length;
        } else if (this.state.selectedHotspot.shape === 'multipolygon') {
            // For multipolygon, use center of first polygon
            const firstPolygon = this.state.selectedHotspot.coordinates[0];
            let sumX = 0, sumY = 0;
            firstPolygon.forEach(([x, y]) => {
                sumX += x;
                sumY += y;
            });
            hotspotCenterImage.x = sumX / firstPolygon.length;
            hotspotCenterImage.y = sumY / firstPolygon.length;
        }

        // Calculate hotspot coverage using screen bounds
        const bounds = this.getHotspotScreenBounds(this.state.selectedHotspot);
        if (!bounds) return;

        // Get image bounds for coverage calculation
        const tiledImage = this.viewer.world.getItemAt(0);
        const imageSize = tiledImage.getContentSize();

        // Calculate bounds in image coordinates
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        if (this.state.selectedHotspot.shape === 'polygon') {
            this.state.selectedHotspot.coordinates.forEach(([x, y]) => {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            });
        } else if (this.state.selectedHotspot.shape === 'multipolygon') {
            this.state.selectedHotspot.coordinates.forEach(polygon => {
                polygon.forEach(([x, y]) => {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                });
            });
        }

        // Convert to viewport rectangle for coverage calculation
        const hotspotViewportBounds = viewport.imageToViewportRectangle(
            minX, minY, maxX - minX, maxY - minY
        );

        const viewportBounds = viewport.getBounds();
        const screenCoverage =
            (hotspotViewportBounds.width * hotspotViewportBounds.height) /
            (viewportBounds.width * viewportBounds.height);

        this.focusTracking = {
            referenceZoom: currentZoom,
            referenceCenter: { x: center.x, y: center.y },
            hotspotCenter: hotspotCenterImage, // Store in IMAGE coordinates
            referenceCoverage: screenCoverage,
            selectionTime: Date.now()
        };

        console.log('Focus reference tracked:', {
            zoom: currentZoom,
            coverage: (screenCoverage * 100).toFixed(1) + '%',
            hotspotCenter: hotspotCenterImage
        });
    }

    calculateFocusScore() {
        if (!this.state.selectedHotspot || !this.focusTracking.referenceZoom) {
            return 1.0;
        }

        const currentZoom = this.viewer.viewport.getZoom();
        const viewport = this.viewer.viewport;
        const currentCenter = viewport.getCenter();
        const bounds = this.getHotspotScreenBounds(this.state.selectedHotspot);

        if (!bounds) return 0;

        // 1. Zoom score (how much we've zoomed out)
        const zoomRatio = currentZoom / this.focusTracking.referenceZoom;
        const zoomScore = Math.min(1.0, zoomRatio);

        // 2. Distance score (how far we've panned)
        const hotspotCenterViewport = viewport.imageToViewportCoordinates(
            this.focusTracking.hotspotCenter.x,
            this.focusTracking.hotspotCenter.y
        );

        const distance = Math.sqrt(
            Math.pow(currentCenter.x - hotspotCenterViewport.x, 2) +
            Math.pow(currentCenter.y - hotspotCenterViewport.y, 2)
        );

        // Use exponential decay for smoother transition
        const normalizedDistance = distance / 0.15;
        // Exponential curve: faster initial decay, smoother at the end
        const distanceScore = Math.max(0, Math.pow(1.0 - Math.min(normalizedDistance, 1.0), 2));

        // 3. Coverage score (how much of the screen the hotspot takes)
        const hotspotViewportBounds = viewport.imageToViewportRectangle(
            bounds.x, bounds.y, bounds.width, bounds.height
        );
        const viewportBounds = viewport.getBounds();
        const currentCoverage =
            (hotspotViewportBounds.width * hotspotViewportBounds.height) /
            (viewportBounds.width * viewportBounds.height);

        // Use zoom ratio to prevent coverage from increasing during zoom out
        // If we're zooming out, coverage should only decrease
        const coverageRatio = currentCoverage / this.focusTracking.referenceCoverage;
        const adjustedCoverageRatio = zoomRatio < 1 ?
            Math.min(coverageRatio, zoomRatio) : // Cap by zoom ratio when zooming out
            coverageRatio;

        const coverageScore = Math.min(1.0, adjustedCoverageRatio);

        // Combined score with smooth transition
        // Ensure it reaches 0 smoothly
        const combinedScore = Math.pow(
            (zoomScore * 0.3) + (distanceScore * 0.5) + (coverageScore * 0.2),
            1.5  // Power function for smoother fade at the end
        );

        // LOG ONLY ONCE PER SECOND TO AVOID SPAM
        const now = Date.now();
        if (!this._lastScoreLog || now - this._lastScoreLog > 1000) {
            console.log('Focus scores:', {
                zoomScore: zoomScore.toFixed(3),
                distanceScore: distanceScore.toFixed(3),
                coverageScore: coverageScore.toFixed(3),
                combinedScore: combinedScore.toFixed(3),
                distance: distance.toFixed(3),
                normalizedDistance: normalizedDistance.toFixed(3)
            });
            this._lastScoreLog = now;
        }

        return combinedScore;
    }

    checkAutoDeselect() {
        // Only check if we have a selected hotspot
        if (!this.state.selectedHotspot || !this.focusTracking.referenceZoom) {
            if (this.state.selectedHotspot && !this.focusTracking.referenceZoom) {
                console.log('checkAutoDeselect: no reference zoom tracked yet');
            }
            return;
        }

        console.log('checkAutoDeselect: checking thresholds', {
            currentZoom: this.viewer.viewport.getZoom(),
            referenceZoom: this.focusTracking.referenceZoom,
            focusScore: this.calculateFocusScore()
        });

        // Skip check if selection is very recent (grace period)
        const timeSinceSelection = Date.now() - this.focusTracking.selectionTime;
        const gracePeriod = this.isMobile ? 1000 : 1500; // 1-1.5s grace period

        if (timeSinceSelection < gracePeriod) {
            return;
        }

        const currentZoom = this.viewer.viewport.getZoom();

        // Absolute thresholds - REDUCED FOR EARLIER DESELECTION
        const minZoomThreshold = this.isMobile ? 1.5 : 2.0;  
        const zoomReductionThreshold = 0.6; 
        const minCoverageThreshold = 0.15; 

        // Check absolute zoom threshold
        if (currentZoom < minZoomThreshold) {
            console.log('Auto-deselecting: zoom too low', currentZoom);
            this.autoDeselect();
            return;
        }

        // Check relative zoom reduction
        const zoomRatio = currentZoom / this.focusTracking.referenceZoom;
        if (zoomRatio < zoomReductionThreshold) {
            console.log('Auto-deselecting: zoomed out too much', zoomRatio);
            this.autoDeselect();
            return;
        }

        // Check hotspot screen coverage
        const bounds = this.getHotspotScreenBounds(this.state.selectedHotspot);
        if (bounds) {
            const viewport = this.viewer.viewport;
            const hotspotViewportBounds = viewport.imageToViewportRectangle(
                bounds.x, bounds.y, bounds.width, bounds.height
            );
            const viewportBounds = viewport.getBounds();
            const coverage =
                (hotspotViewportBounds.width * hotspotViewportBounds.height) /
                (viewportBounds.width * viewportBounds.height);

            if (coverage < minCoverageThreshold) {
                console.log('Auto-deselecting: hotspot too small on screen', coverage);
                this.autoDeselect();
                return;
            }
        }

        
        // Calculate combined focus score for pan detection
        const focusScore = this.calculateFocusScore();

        if (focusScore < 0.5) { 
            console.log('Auto-deselecting: low focus score', focusScore);
            this.autoDeselect();
        }
    }

    autoDeselect() {
        console.log('Auto-deselecting hotspot');

        // Clear selection through the standard method
        this.clearSelection();

        // Notify parent component to update UI
        if (window.artworkViewerHandleHotspotClick) {
            window.artworkViewerHandleHotspotClick(null);
        }
    }

    calculateZoomScore(currentZoom) {
        const ratio = currentZoom / this.focusTracking.referenceZoom;
        const thresholds = this.focusConfig.thresholds.zoom;

        // DEBUG
        console.log('Zoom calculation:', {
            currentZoom,
            referenceZoom: this.focusTracking.referenceZoom,
            ratio,
            thresholds
        });

        // More aggressive thresholds
        if (ratio >= 0.8) return 1;      // Full opacity above 80%
        if (ratio <= 0.4) return 0;      // No opacity below 40%

        // Linear interpolation
        const t = (ratio - 0.4) / (0.8 - 0.4);
        return t;
    }

    calculateDistanceScore(currentCenter) {
        const refCenter = this.focusTracking.referenceCenter;
        if (!refCenter) return 1;

        // Calculate distance in viewport units
        const dx = Math.abs(currentCenter.x - refCenter.x);
        const dy = Math.abs(currentCenter.y - refCenter.y);
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Very aggressive falloff - disappear at 0.2 distance
        if (distance > 0.2) return 0;
        if (distance < 0.05) return 1;

        // Linear interpolation
        const t = 1 - ((distance - 0.05) / 0.15);
        return t;
    }

    calculateVisibilityScore() {
        if (!this.state.selectedHotspot) return 1;

        const bounds = this.getHotspotScreenBounds(this.state.selectedHotspot);
        if (!bounds) return 0;

        const viewport = this.viewer.container.getBoundingClientRect();

        // Calculate intersection
        const intersectLeft = Math.max(bounds.x, 0);
        const intersectRight = Math.min(bounds.x + bounds.width, viewport.width);
        const intersectTop = Math.max(bounds.y, 0);
        const intersectBottom = Math.min(bounds.y + bounds.height, viewport.height);

        const intersectArea = Math.max(0, intersectRight - intersectLeft) *
            Math.max(0, intersectBottom - intersectTop);
        const hotspotArea = bounds.width * bounds.height;

        const visibilityRatio = hotspotArea > 0 ? intersectArea / hotspotArea : 0;

        // Apply thresholds
        const thresholds = this.focusConfig.thresholds.visibility;
        if (visibilityRatio >= thresholds.maintain) return 1;
        if (visibilityRatio <= thresholds.fadeOut) return 0;

        // Interpolate
        const t = (visibilityRatio - thresholds.fadeOut) / (thresholds.maintain - thresholds.fadeOut);
        return this.smoothstep(t);
    }

    smoothstep(t) {
        // Clamp to [0,1]
        t = Math.max(0, Math.min(1, t));
        // Smoothstep formula: 3t² - 2t³
        return t * t * (3 - 2 * t);
    }

    transitionToHotspot(newHotspot, duration = 1000) {
        // If transitioning to null (deselecting), just clear immediately
        if (!newHotspot) {
            this.selectHotspot(null);
            return;
        }

        // If no current selection, just select directly
        if (!this.state.selectedHotspot) {
            this.selectHotspot(newHotspot);
            return;
        }

        // Calculate distance between hotspots
        const distance = this.calculateHotspotDistance(this.state.selectedHotspot, newHotspot);

        // Use fade transition for close hotspots (less than 20% of viewport)
        if (distance < 0.2) {
            this.performFadeTransition(newHotspot, duration * 0.5);
        } else {
            // For distant hotspots, maintain current behavior
            this.transition.active = true;
            this.transition.fromHotspot = this.state.selectedHotspot;
            this.transition.toHotspot = newHotspot;
            this.transition.progress = 0;
            this.transition.duration = duration;
            this.transition.startTime = performance.now();
            this.state.targetOpacity = this.config.maxOpacity;
            this.startAnimationLoop();
        }
    }

    performFadeTransition(newHotspot, duration) {
        const fadeOutDuration = duration * 0.3;
        const fadeInDuration = duration * 0.7;

        // Start fade out
        this.state.targetOpacity = 0;
        this.startAnimation();

        setTimeout(() => {
            // Switch to new hotspot at minimum opacity
            this.state.selectedHotspot = newHotspot;
            this.state.targetOpacity = this.config.maxOpacity;

            // Reset interpolation for instant position change
            this.interpolation.current = null;
            this.interpolation.velocity = { x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0, scale: 0 };

            // Track new focus reference
            setTimeout(() => {
                this.trackFocusReference();
            }, 50);

            this.startAnimation();
        }, fadeOutDuration);
    }

    calculateHotspotDistance(hotspot1, hotspot2) {
        if (!hotspot1 || !hotspot2) return Infinity;

        // Get center points of both hotspots
        const bounds1 = this.getHotspotScreenBounds(hotspot1);
        const bounds2 = this.getHotspotScreenBounds(hotspot2);

        if (!bounds1 || !bounds2) return Infinity;

        // Calculate viewport-relative distance
        const viewport = this.viewer.viewport.getBounds();
        const dx = (bounds1.centerX - bounds2.centerX) / this.canvas.width;
        const dy = (bounds1.centerY - bounds2.centerY) / this.canvas.height;

        // Normalize by viewport size
        const normalizedDistance = Math.sqrt(dx * dx + dy * dy) / Math.max(viewport.width, viewport.height);

        return normalizedDistance;
    }

    clearSelection() {
        console.log('Clearing selection - auto deselect');

        // Clear the selected hotspot
        this.state.selectedHotspot = null;

        // Set target opacity to 0 to fade out
        this.state.targetOpacity = 0;

        // Reset focus tracking
        this.resetFocusTracking();

        // Start animation to fade out
        this.startAnimation();
    }

    startAnimation() {
        if (this.state.isAnimating) return;

        this.state.isAnimating = true;
        this.state.renderMode = 'animated';
        this.animate();
    }

    animate() {
        // Don't stop animation loop - let it run continuously

        // During transition, maintain opacity but continue rendering
        if (this.transition.active) {
            this.state.opacity = this.state.targetOpacity;
            this.render();
            this.animationFrame = requestAnimationFrame(() => this.animate());
            return;
        }

        // Animate focus score changes - simple linear interpolation
        if (Math.abs(this.focusTracking.targetScore - this.focusTracking.currentScore) > 0.001) {
            const diff = this.focusTracking.targetScore - this.focusTracking.currentScore;
            this.focusTracking.currentScore += diff * 0.2; // Faster transition

            // Force to 0 if very low
            if (this.focusTracking.currentScore < 0.05) {
                this.focusTracking.currentScore = 0;
            }

            this.focusTracking.currentScore = Math.max(0, Math.min(1, this.focusTracking.currentScore));
        }

        // CHECK FOR AUTO-DESELECT
        this.checkAutoDeselect();

        // Update opacity
        const diff = this.state.targetOpacity - this.state.opacity;

        if (Math.abs(diff) < 0.01) {
            this.state.opacity = this.state.targetOpacity;

            // If opacity reached 0 and no selection, stop rendering
            if (this.state.opacity === 0 && !this.state.selectedHotspot) {
                this.state.isAnimating = false;
                // Clear the canvas one last time
                const width = this.canvas.width / window.devicePixelRatio;
                const height = this.canvas.height / window.devicePixelRatio;
                this.ctx.clearRect(0, 0, width, height);
                return; // Stop animation loop
            }
        } else {
            const speed = 0.15;
            this.state.opacity += diff * speed;
        }

        // Always render
        this.render();

        // Continue animation
        this.animationFrame = requestAnimationFrame(() => this.animate());
    }

    render() {
        // Use direct rendering during animations
        if (this.state.isViewerAnimating) {
            this.renderDirect();
            return;
        }

        // Calculate dimensions once
        const width = this.canvas.width / window.devicePixelRatio;
        const height = this.canvas.height / window.devicePixelRatio;

        // Always clear canvas
        this.ctx.clearRect(0, 0, width, height);

        // Skip if no selection
        if (!this.state.selectedHotspot) {
            return;
        }

        // Calculate focus score
        const focusScore = this.calculateFocusScore();

        // Apply focus score directly to opacity
        let effectiveOpacity = this.state.opacity * focusScore;

        // Force complete transparency below threshold
        if (focusScore < 0.1) {
            effectiveOpacity = 0;
        }

        // Skip render if invisible
        if (effectiveOpacity < 0.001) {
            // Clear canvas to ensure no residual darkening
            this.ctx.clearRect(0, 0, width, height);
            return;
        }

        // Handle transition between hotspots
        let targetBounds;
        if (this.transition.active) {
            const elapsed = performance.now() - this.transition.startTime;
            this.transition.progress = Math.min(1, elapsed / this.transition.duration);

            // Use easing for smooth transition
            const eased = this.easeInOutCubic(this.transition.progress);

            if (this.transition.progress >= 1) {
                // Transition complete
                this.transition.active = false;
                this.state.selectedHotspot = this.transition.toHotspot;
                this.state.targetOpacity = this.transition.toHotspot ? this.config.maxOpacity : 0;
                this.state.opacity = this.state.targetOpacity;
                targetBounds = this.getHotspotScreenBounds(this.state.selectedHotspot);
            } else if (eased < 0.5) {
                // First half - maintain visibility on source
                targetBounds = this.getHotspotScreenBounds(this.transition.fromHotspot);
                this.state.opacity = this.config.maxOpacity;
            } else {
                // Second half - switch to target
                targetBounds = this.getHotspotScreenBounds(this.transition.toHotspot);
                this.state.opacity = this.config.maxOpacity;
            }
        } else {
            // Normal rendering
            targetBounds = this.getHotspotScreenBounds(this.state.selectedHotspot);
        }

        if (!targetBounds) return;

        // Use interpolated bounds for smooth transitions
        let bounds;
        if (this.viewer.isAnimating() || Math.abs(this.interpolation.zoomVelocity) > 0.01) {
            // During animations, use direct bounds to prevent lag
            bounds = targetBounds;
        } else {
            // Only interpolate when static
            bounds = this.interpolateBounds(targetBounds);
        }

        // Always use integer coordinates for final rendering
        bounds.x = Math.floor(bounds.x);
        bounds.y = Math.floor(bounds.y);
        bounds.width = Math.ceil(bounds.width);
        bounds.height = Math.ceil(bounds.height);
        bounds.centerX = Math.floor(bounds.centerX);
        bounds.centerY = Math.floor(bounds.centerY);

        // ENSURE MINIMUM SIZE FOR VISIBILITY
        const minSize = 20; // Minimum 20px for visibility
        if (bounds.width < minSize || bounds.height < minSize) {
            const expandFactor = minSize / Math.min(bounds.width, bounds.height);
            const centerX = bounds.x + bounds.width / 2;
            const centerY = bounds.y + bounds.height / 2;

            bounds.width = Math.max(minSize, bounds.width * expandFactor);
            bounds.height = Math.max(minSize, bounds.height * expandFactor);
            bounds.x = centerX - bounds.width / 2;
            bounds.y = centerY - bounds.height / 2;
        }

        // Save context state
        this.ctx.save();

        // Set composite operation for darkening
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = `rgba(0, 0, 0, ${effectiveOpacity})`;

        // Fill entire canvas with dark overlay
        this.ctx.fillRect(0, 0, width, height);

        // Cut out the hotspot area - this makes it visible
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.fillStyle = 'rgba(255, 255, 255, 1)';

        // Use original shape drawing
        this.drawHotspotShape(bounds, this.state.selectedHotspot);

        // Restore context
        this.ctx.restore();
    }

    interpolateBounds(target) {
        // Initialize on first run
        if (!this.interpolation.current) {
            this.interpolation.current = { ...target, scale: 1 };
            this.interpolation.target = { ...target, scale: 1 };
            this.interpolation.currentZoom = this.viewer.viewport.getZoom();
            this.interpolation.targetZoom = this.interpolation.currentZoom;
            return this.interpolation.current;
        }

        // Skip interpolation if disabled or during movement
        if (this.interpolation.disabled) {
            // Direct update for tight tracking
            this.interpolation.current = { ...target };
            this.interpolation.target = { ...target };
            // Reset velocities
            Object.keys(this.interpolation.velocity).forEach(key => {
                this.interpolation.velocity[key] = 0;
            });
            return target;
        }

        // Update target
        this.interpolation.target = { ...target };

        // Get viewer's actual spring values for perfect sync
        const viewportSpring = this.viewer.viewport.centerSpringX;
        const zoomSpring = this.viewer.viewport.zoomSpring;

        // Use viewer's spring values directly
        const springStiffness = viewportSpring.springStiffness / 50;
        const damping = 1 - (1 / (1 + viewportSpring.animationTime * 3));

        // Interpolate position and size
        const props = ['x', 'y', 'width', 'height', 'centerX', 'centerY'];

        props.forEach(prop => {
            const current = this.interpolation.current[prop];
            const target = this.interpolation.target[prop];
            const diff = target - current;

            // Skip if very close
            if (Math.abs(diff) < 0.1) {
                this.interpolation.current[prop] = target;
                this.interpolation.velocity[prop] = 0;
                return;
            }

            // Apply spring physics matching OpenSeadragon
            this.interpolation.velocity[prop] += diff * springStiffness;
            this.interpolation.velocity[prop] *= damping;
            this.interpolation.current[prop] += this.interpolation.velocity[prop];
        });

        return this.interpolation.current;
    }

    pauseDarkening() {
        this.state.darkeningPaused = true;
        // Don't clear canvas - just pause rendering updates
        // This maintains visual continuity
    }

    resumeDarkening() {
        this.state.darkeningPaused = false;

        // Start with opacity at 0 for smooth fade-in
        const targetOpacity = this.state.opacity;
        this.state.opacity = 0;
        this.state.targetOpacity = targetOpacity;

        // Start fade-in animation immediately
        this.startAnimation();
    }

    startAnimationLoop() {
        if (this.animationLoop.isRunning) return;

        this.animationLoop.isRunning = true;

        const animate = (timestamp) => {
            if (!this.animationLoop.isRunning) return;

            // Sync with OpenSeadragon's render cycle
            if (this.state.selectedHotspot && this.viewer.isOpen()) {
                this.render();
            }

            this.animationLoop.frameId = requestAnimationFrame(animate);
        };

        // Start on next frame
        this.animationLoop.frameId = requestAnimationFrame(animate);
    }

    stopAnimationLoop() {
        this.animationLoop.isRunning = false;
        if (this.animationLoop.frameId) {
            cancelAnimationFrame(this.animationLoop.frameId);
            this.animationLoop.frameId = null;
        }
    }

    drawHotspotShape(bounds, hotspot) {
        this.ctx.beginPath();

        if (hotspot.shape === 'polygon' || hotspot.shape === 'multipolygon') {
            // Convert coordinates to screen space
            const coords = hotspot.shape === 'polygon' ?
                [hotspot.coordinates] : hotspot.coordinates;

            coords.forEach(polygon => {
                const screenCoords = this.imageToScreenCoordinates(polygon);
                if (screenCoords.length > 0) {
                    // Use integer coordinates to prevent sub-pixel trembling
                    this.ctx.moveTo(Math.floor(screenCoords[0].x), Math.floor(screenCoords[0].y));
                    for (let i = 1; i < screenCoords.length; i++) {
                        this.ctx.lineTo(Math.floor(screenCoords[i].x), Math.floor(screenCoords[i].y));
                    }
                    this.ctx.closePath();
                }
            });
        } else {
            // Fallback to rectangle with padding
            const padding = 5; // Add some padding
            this.ctx.rect(
                bounds.x - padding,
                bounds.y - padding,
                bounds.width + padding * 2,
                bounds.height + padding * 2
            );
        }

        this.ctx.fill();
    }

    resetFocusTracking() {
        this.focusTracking.referenceZoom = null;
        this.focusTracking.referenceCenter = null;
        this.focusTracking.currentScore = 1;
        this.focusTracking.targetScore = 1;
        this.focusTracking.scoreVelocity = 0;
        this.focusConfig.hysteresis.active = false;
    }

    getHotspotScreenBounds(hotspot) {
        if (!hotspot.coordinates) return null;

        // Get bounds
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        const processPoints = (points) => {
            points.forEach(([x, y]) => {
                const screen = this.imageToScreen(x, y);
                minX = Math.min(minX, screen.x);
                minY = Math.min(minY, screen.y);
                maxX = Math.max(maxX, screen.x);
                maxY = Math.max(maxY, screen.y);
            });
        };

        if (hotspot.shape === 'polygon') {
            processPoints(hotspot.coordinates);
        } else if (hotspot.shape === 'multipolygon') {
            hotspot.coordinates.forEach(polygon => processPoints(polygon));
        }

        const bounds = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2
        };

        // DEBUG: Log problematic bounds
        if (bounds.width < 10 || bounds.height < 10) {
            console.warn('Small hotspot bounds detected:', {
                hotspotId: hotspot.id,
                bounds,
                shape: hotspot.shape
            });
        }

        return bounds;
    }

    imageToScreen(imageX, imageY) {
        // Use the correct OpenSeadragon method
        const viewportPoint = this.viewer.viewport.imageToViewportCoordinates(
            new OpenSeadragon.Point(imageX, imageY)
        );
        const pixelPoint = this.viewer.viewport.pixelFromPoint(viewportPoint);
        return { x: pixelPoint.x, y: pixelPoint.y };
    }

    imageToScreenCoordinates(coordinates) {
        return coordinates.map(([x, y]) => this.imageToScreen(x, y));
    }

    disableInterpolation() {
        console.log('>>> DISABLING interpolation');
        this.interpolation.disabled = true;
    }

    enableInterpolation() {
        console.log('>>> ENABLING interpolation');
        this.interpolation.disabled = false;
    }

    

    handleViewportUpdate() {
        // Direct update without interpolation during viewport updates
        if (this.state.selectedHotspot) {
            // Force immediate render without interpolation
            this.renderDirect();
        }
    }

    handleAnimationStart() {
        this.state.isViewerAnimating = true;
        // Start predictive updates during animation
        if (this.state.selectedHotspot) {
            this.startPredictiveRendering();
        }
    }

    handleAnimationFinish() {
        this.state.isViewerAnimating = false;
        this.stopPredictiveRendering();

        // Check auto-deselect
        if (this.state.selectedHotspot) {
            this.checkAutoDeselect();
        }

        // Final render to ensure perfect position
        if (this.state.selectedHotspot) {
            this.renderDirect();
        }
    }

    startPredictiveRendering() {
        if (this.predictiveRenderLoop) return;

        const render = () => {
            if (this.state.isViewerAnimating && this.state.selectedHotspot) {
                this.renderDirect();
                this.predictiveRenderLoop = requestAnimationFrame(render);
            }
        };
        this.predictiveRenderLoop = requestAnimationFrame(render);
    }

    stopPredictiveRendering() {
        if (this.predictiveRenderLoop) {
            cancelAnimationFrame(this.predictiveRenderLoop);
            this.predictiveRenderLoop = null;
        }
    }

    renderDirect() {
        // Direct render without interpolation for perfect sync
        const width = this.canvas.width / window.devicePixelRatio;
        const height = this.canvas.height / window.devicePixelRatio;

        // Clear canvas
        this.ctx.clearRect(0, 0, width, height);

        if (!this.state.selectedHotspot || this.state.opacity < 0.001) {
            return;
        }

        // Get bounds WITHOUT interpolation
        const bounds = this.getHotspotScreenBounds(this.state.selectedHotspot);
        if (!bounds) return;

        // Apply focus-based opacity
        const focusScore = this.calculateFocusScore();
        const effectiveOpacity = this.state.opacity * focusScore;

        if (effectiveOpacity < 0.001) return;

        // Save context
        this.ctx.save();

        // Draw darkening overlay
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = `rgba(0, 0, 0, ${effectiveOpacity})`;
        this.ctx.fillRect(0, 0, width, height);

        // Cut out hotspot area
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.fillStyle = 'rgba(255, 255, 255, 1)';

        // Draw shape
        this.drawHotspotShape(bounds, this.state.selectedHotspot);

        this.ctx.restore();
    }

    updateOpacity(opacity) {
        this.state.opacity = Math.max(0, Math.min(1, opacity));
        this.render();
    }

    prepareForZoom() {
        // Called by RenderOptimizer during cinematic zoom
        // Can reduce quality for better performance if needed
        this.config.enableSoftEdges = false;
    }

    endZoom() {
        // Restore quality after zoom
        this.config.enableSoftEdges = true;
        this.render();
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    destroy() {
        // Clear any pending timeouts
        if (this.interpolationTimeout) {
            clearTimeout(this.interpolationTimeout);
            this.interpolationTimeout = null;
        }

        // Remove ALL handlers for these events
        this.viewer.removeAllHandlers('zoom');
        this.viewer.removeAllHandlers('animation-finish');

        // Stop animation loop
        this.stopAnimationLoop();

        // Clear any pending timeouts
        if (this.softEdgeTimeout) {
            clearTimeout(this.softEdgeTimeout);
            this.softEdgeTimeout = null;
        }

        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }

        if (this.canvas && this.canvas.parentElement) {
            this.canvas.parentElement.removeChild(this.canvas);
        }

        if (this.viewer) {
            this.viewer.removeHandler('update-viewport', this.handleViewportUpdate);
            this.viewer.removeHandler('animation-start', this.handleAnimationStart);
            this.viewer.removeHandler('animation-finish', this.handleAnimationFinish);
            this.viewer.removeHandler('resize', this.updateCanvasSize);
        }

        // Stop predictive rendering
        this.stopPredictiveRendering();

        this.canvas = null;
        this.ctx = null;
        this.viewer = null;
        this.isInitialized = false;
    }
}

export default CanvasOverlayManager;