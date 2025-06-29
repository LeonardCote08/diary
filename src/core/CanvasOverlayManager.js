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
                distance: 0.4,
                zoom: 0.35,
                visibility: 0.25
            },
            thresholds: {
                zoom: {
                    fadeStart: 0.8,
                    fadeEnd: 0.5,
                    reactivate: 0.85
                },
                distance: {
                    maxFromCenter: 0.6 // 60% of viewport width/height
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

        // Animation loop control
        this.animationLoop = {
            isRunning: false,
            frameId: null
        };

        // Configuration
        this.config = {
            maxOpacity: 0.7,
            fadeSpeed: 0.05, // Opacity change per frame
            edgeSoftness: 20, // Pixels for soft edge
            updateThrottle: 16, // ~60 FPS
            enableSoftEdges: false
        };

        // Animation
        this.animationFrame = null;
        this.lastUpdateTime = 0;

        // Timers
        this.animationFrame = null;
        this.lastUpdateTime = 0;
        this.softEdgeTimeout = null;

        // Bind methods
        this.render = this.render.bind(this);
        this.handleViewportChange = this.handleViewportChange.bind(this);
    }

    initialize() {
        if (this.isInitialized) return;

        // Create canvas element
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '8'; // Above tiles but below hotspots (which are at z-index 10)
        this.canvas.style.willChange = 'transform';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';

        // Get the OpenSeadragon container directly
        const container = this.viewer.container;
        // Insert canvas as first child to ensure proper layering
        container.insertBefore(this.canvas, container.firstChild);

        // Get context
        this.ctx = this.canvas.getContext('2d', {
            alpha: true,
            desynchronized: true // Better performance
        });

        // Set up size
        this.updateCanvasSize();

        // No need for individual handlers - the animation loop handles everything
        this.viewer.addHandler('viewport-change', this.handleViewportChange);
        this.viewer.addHandler('resize', () => this.updateCanvasSize());

        this.isInitialized = true;
        console.log('CanvasOverlayManager initialized');
    }

    updateCanvasSize() {
        const container = this.viewer.container;
        const rect = container.getBoundingClientRect();

        // Set canvas size to match container exactly
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;

        // Scale canvas back down using CSS
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

        // Remove any positioning - canvas should fill its parent
        this.canvas.style.left = '0';
        this.canvas.style.top = '0';

        // Scale context for retina displays
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        // Force redraw
        this.render();
    }

    selectHotspot(hotspot) {
        if (this.state.selectedHotspot?.id === hotspot?.id) return;

        this.state.selectedHotspot = hotspot;
        this.state.targetOpacity = hotspot ? this.config.maxOpacity : 0;

        // Reset interpolation when selecting new hotspot
        if (!hotspot || (this.interpolation.current &&
            (!this.state.selectedHotspot || this.state.selectedHotspot.id !== hotspot.id))) {
            this.interpolation.current = null;
            this.interpolation.velocity = { x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
        }

        // Sync interpolation with current viewer state
        if (hotspot && this.viewer) {
            const viewerSpring = this.viewer.viewport.zoomSpring.springStiffness;
            const viewerTime = this.viewer.animationTime;

            // Adapt interpolation to match viewer
            this.interpolation.spring = Math.min(0.3, 1 / viewerTime);
            this.interpolation.damping = 0.7 + (viewerSpring * 0.02);
        }

        // Always start opacity animation when there's a change
        this.startAnimation();

        // Also start render loop if selecting a hotspot
        if (hotspot) {
            this.startAnimationLoop();
        }
    }

    trackFocusReference() {
        if (!this.viewer || !this.state.selectedHotspot) return;

        const viewport = this.viewer.viewport;
        this.focusTracking.referenceZoom = viewport.getZoom();
        this.focusTracking.referenceCenter = viewport.getCenter();
        this.focusTracking.selectionTime = Date.now();
        this.focusTracking.currentScore = 1;
        this.focusTracking.targetScore = 1;
    }

    calculateFocusScore() {

        // Skip calculations during cinematic zoom or transitions
        if (this.state.darkeningPaused || this.transition.active) {
            return this.focusTracking.currentScore;
        }

        if (!this.state.selectedHotspot || !this.focusTracking.referenceZoom) return 1;

        const now = Date.now();

        // Throttle calculations
        if (now - this.focusTracking.lastCalculation < this.focusTracking.throttleInterval) {
            return this.focusTracking.currentScore;
        }

        this.focusTracking.lastCalculation = now;

        const viewport = this.viewer.viewport;
        const currentZoom = viewport.getZoom();
        const currentCenter = viewport.getCenter();

        // Calculate individual scores
        const scores = {
            zoom: this.calculateZoomScore(currentZoom),
            distance: this.calculateDistanceScore(currentCenter),
            visibility: this.calculateVisibilityScore()
        };

        // Apply weights
        const weights = this.focusConfig.weights;
        const weightedScore = (
            scores.zoom * weights.zoom +
            scores.distance * weights.distance +
            scores.visibility * weights.visibility
        );

        // Apply hysteresis to prevent flickering
        const hysteresis = this.focusConfig.hysteresis;
        if (hysteresis.active) {
            const threshold = hysteresis.lastDirection === 'out' ? 0.3 : 0.25;
            if ((hysteresis.lastDirection === 'out' && weightedScore > threshold) ||
                (hysteresis.lastDirection === 'in' && weightedScore < threshold)) {
                hysteresis.active = false;
            } else {
                return this.focusTracking.currentScore;
            }
        }

        // Update target score
        this.focusTracking.targetScore = weightedScore;

        // Track direction for hysteresis
        if (weightedScore < 0.5 && this.focusTracking.currentScore >= 0.5) {
            hysteresis.lastDirection = 'out';
            hysteresis.active = true;
        } else if (weightedScore > 0.5 && this.focusTracking.currentScore <= 0.5) {
            hysteresis.lastDirection = 'in';
            hysteresis.active = true;
        }

        return weightedScore;
    }

    calculateZoomScore(currentZoom) {
        const ratio = currentZoom / this.focusTracking.referenceZoom;
        const thresholds = this.focusConfig.thresholds.zoom;

        if (ratio >= thresholds.reactivate) return 1;
        if (ratio <= thresholds.fadeEnd) return 0;

        // Smoothstep interpolation
        const t = (ratio - thresholds.fadeEnd) / (thresholds.fadeStart - thresholds.fadeEnd);
        return this.smoothstep(t);
    }

    calculateDistanceScore(currentCenter) {
        const refCenter = this.focusTracking.referenceCenter;
        if (!refCenter) return 1;

        // Calculate normalized distance
        const bounds = this.viewer.viewport.getBounds();
        const dx = (currentCenter.x - refCenter.x) / bounds.width;
        const dy = (currentCenter.y - refCenter.y) / bounds.height;
        const distanceSquared = dx * dx + dy * dy;

        // Inverse square falloff
        const maxDist = this.focusConfig.thresholds.distance.maxFromCenter;
        const score = 1 / (1 + (distanceSquared / (maxDist * maxDist)) * 10);

        return Math.max(0, Math.min(1, score));
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

        // Start transition
        this.transition.active = true;
        this.transition.fromHotspot = this.state.selectedHotspot;
        this.transition.toHotspot = newHotspot;
        this.transition.progress = 0;
        this.transition.duration = duration;
        this.transition.startTime = performance.now();

        // Maintain darkening during transition
        this.state.targetOpacity = this.config.maxOpacity;

        // Track focus reference for new selection
        if (hotspot) {
            this.trackFocusReference();
        }

        // Keep rendering during transition
        this.startAnimationLoop();
    }

    clearSelection() {
    this.selectHotspot(null);
    this.resetFocusTracking();
}

    startAnimation() {
        if (this.state.isAnimating) return;

        this.state.isAnimating = true;
        this.state.renderMode = 'animated';
        this.animate();
    }

    animate() {

        // During transition, maintain opacity but continue rendering
        if (this.transition.active) {
            this.state.opacity = this.state.targetOpacity;
            this.render();
            this.animationFrame = requestAnimationFrame(() => this.animate());
            return;
        }

        // Animate focus score changes
        if (Math.abs(this.focusTracking.targetScore - this.focusTracking.currentScore) > 0.01) {
            // Spring animation for smooth transitions
            const diff = this.focusTracking.targetScore - this.focusTracking.currentScore;
            this.focusTracking.scoreVelocity += diff * 0.1; // Spring force
            this.focusTracking.scoreVelocity *= 0.85; // Damping
            this.focusTracking.currentScore += this.focusTracking.scoreVelocity;

            // Clamp to valid range
            this.focusTracking.currentScore = Math.max(0, Math.min(1, this.focusTracking.currentScore));
        }

        // Update opacity
        const diff = this.state.targetOpacity - this.state.opacity;

        if (Math.abs(diff) < 0.01) {
            // Animation complete
            this.state.opacity = this.state.targetOpacity;
            this.state.isAnimating = false;
            this.state.renderMode = 'static';

            // Stop animation loop if no selection
            if (!this.state.selectedHotspot) {
                this.stopAnimationLoop();
            }

            this.render();
            return;
        }

        // Smooth animation - faster speed for post-zoom fade-in
        const speed = this.state.darkeningPaused === false && diff > 0 ? 0.3 : 0.15;
        this.state.opacity += diff * speed;

        // Render frame
        this.render();

        // Continue animation
        this.animationFrame = requestAnimationFrame(() => this.animate());
    }

    render() {

        // Calculate dimensions once
        const width = this.canvas.width / window.devicePixelRatio;
        const height = this.canvas.height / window.devicePixelRatio;

        // Skip only if paused AND no selection
        if (this.state.darkeningPaused && !this.state.selectedHotspot) {
            this.ctx.clearRect(0, 0, width, height);
            return;
        }

        // Clear canvas
        this.ctx.clearRect(0, 0, width, height);

        // Skip if no selection or opacity is 0
        if (!this.state.selectedHotspot || this.state.opacity < 0.01) {
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
                // Force opacity to match target immediately
                this.state.opacity = this.state.targetOpacity;
                targetBounds = this.getHotspotScreenBounds(this.state.selectedHotspot);
            } else if (eased < 0.5) {
                // First half - maintain visibility on source
                targetBounds = this.getHotspotScreenBounds(this.transition.fromHotspot);
                // Keep full opacity during first half
                this.state.opacity = this.config.maxOpacity;
            } else {
                // Second half - switch to target
                targetBounds = this.getHotspotScreenBounds(this.transition.toHotspot);
                // Maintain full opacity
                this.state.opacity = this.config.maxOpacity;
            }
        } else {
            // Normal rendering
            targetBounds = this.getHotspotScreenBounds(this.state.selectedHotspot);
        }

        if (!targetBounds) return;

        // Use interpolated bounds for smooth transitions
        const bounds = this.interpolateBounds(targetBounds);

        // Save context state
        this.ctx.save();

        // Set composite operation for darkening
        this.ctx.globalCompositeOperation = 'source-over';
        // Apply focus score to opacity
        const focusScore = this.calculateFocusScore();
        const effectiveOpacity = this.state.opacity * focusScore;
        this.ctx.fillStyle = `rgba(0, 0, 0, ${effectiveOpacity})`;

        // Fill entire canvas with dark overlay
        this.ctx.fillRect(0, 0, width, height);

        // Cut out the hotspot area - this makes it visible
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.fillStyle = 'rgba(0, 0, 0, 1)';

        // Draw hotspot shape (this cuts it out from the dark overlay)
        this.drawHotspotShape(bounds, this.state.selectedHotspot);


        // Restore context
        this.ctx.restore();
    }

    interpolateBounds(target) {
        // Skip interpolation if disabled
        if (this.interpolation.disabled) {
            this.interpolation.current = { ...target };
            this.interpolation.target = { ...target };
            Object.keys(this.interpolation.velocity).forEach(key => {
                this.interpolation.velocity[key] = 0;
            });
            return target;
        }

        // Initialize on first run
        if (!this.interpolation.current) {
            this.interpolation.current = { ...target, scale: 1 };
            this.interpolation.target = { ...target, scale: 1 };
            this.interpolation.currentZoom = this.viewer.viewport.getZoom();
            this.interpolation.targetZoom = this.interpolation.currentZoom;
            return this.interpolation.current;
        }

        // Update target
        this.interpolation.target = { ...target };

        // Interpolate zoom separately for smooth scaling
        const zoomDiff = this.interpolation.targetZoom - this.interpolation.currentZoom;
        this.interpolation.zoomVelocity += zoomDiff * this.interpolation.spring;
        this.interpolation.zoomVelocity *= this.interpolation.damping;
        this.interpolation.currentZoom += this.interpolation.zoomVelocity;

        // Calculate scale factor from zoom change
        const scaleFactor = this.interpolation.currentZoom / this.viewer.viewport.getZoom();

        // Interpolate position and size with zoom-adjusted spring
        const props = ['x', 'y', 'width', 'height', 'centerX', 'centerY'];
        let hasChanged = false;

        props.forEach(prop => {
            const current = this.interpolation.current[prop];
            const target = this.interpolation.target[prop];
            const diff = target - current;

            // Adjust spring based on zoom velocity for tighter tracking
            const adaptiveSpring = this.interpolation.spring *
                (1 + Math.abs(this.interpolation.zoomVelocity) * 2);

            // Skip if very close
            if (Math.abs(diff) < 0.5) {
                if (current !== target) {
                    this.interpolation.current[prop] = target;
                    this.interpolation.velocity[prop] = 0;
                }
                return;
            }

            // Apply adaptive spring force
            this.interpolation.velocity[prop] += diff * adaptiveSpring;
            this.interpolation.velocity[prop] *= this.interpolation.damping;

            // Update position
            this.interpolation.current[prop] += this.interpolation.velocity[prop];
            hasChanged = true;
        });

        // Store scale for rendering adjustments
        this.interpolation.current.scale = scaleFactor;

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

        const animate = () => {
            if (!this.animationLoop.isRunning) return;

            // Always render if we have a selected hotspot
            if (this.state.selectedHotspot) {
                this.render();
            }

            this.animationLoop.frameId = requestAnimationFrame(animate);
        };

        animate();
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
                    this.ctx.moveTo(screenCoords[0].x, screenCoords[0].y);
                    for (let i = 1; i < screenCoords.length; i++) {
                        this.ctx.lineTo(screenCoords[i].x, screenCoords[i].y);
                    }
                    this.ctx.closePath();
                }
            });
        } else {
            // Fallback to rectangle
            this.ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
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

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2
        };
    }

    imageToScreen(imageX, imageY) {
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

    handleViewportChange() {
        // Update zoom tracking for smooth scale interpolation
        const currentZoom = this.viewer.viewport.getZoom();
        this.interpolation.targetZoom = currentZoom;

        // Only render if we have a selection
        if (this.state.selectedHotspot) {
            // Don't disable soft edges - maintain quality
            this.render();
        }
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
            this.viewer.removeHandler('viewport-change', this.handleViewportChange);
            this.viewer.removeHandler('resize', this.updateCanvasSize);
            // Note: animation, zoom, pan handlers removed since we're using animation loop instead
        }

        this.canvas = null;
        this.ctx = null;
        this.viewer = null;
        this.isInitialized = false;
    }
}

export default CanvasOverlayManager;