import OpenSeadragon from 'openseadragon';

/**
 * InteractionManager - Unified handling of user interactions
 * Manages mouse, touch, and keyboard interactions for the viewer
 */
class InteractionManager {
    constructor(options = {}) {
        this.viewer = options.viewer;
        this.canvas = options.canvas;
        this.spatialIndex = options.spatialIndex;
        this.onHotspotHover = options.onHotspotHover || (() => { });
        this.onHotspotClick = options.onHotspotClick || (() => { });

        // Interaction state
        this.isInteracting = false;
        this.isDragging = false;
        this.startPoint = null;
        this.lastPoint = null;
        this.touchStartDistance = null;

        // Gesture detection
        this.clickThreshold = 5; // pixels
        this.touchTapThreshold = 10; // pixels
        this.longPressThreshold = 500; // milliseconds
        this.longPressTimer = null;

        // Event handlers bound to this instance
        this.boundHandlers = {
            mousedown: this.handleMouseDown.bind(this),
            mousemove: this.handleMouseMove.bind(this),
            mouseup: this.handleMouseUp.bind(this),
            mouseleave: this.handleMouseLeave.bind(this),
            wheel: this.handleWheel.bind(this),
            dblclick: this.handleDoubleClick.bind(this),
            touchstart: this.handleTouchStart.bind(this),
            touchmove: this.handleTouchMove.bind(this),
            touchend: this.handleTouchEnd.bind(this),
            touchcancel: this.handleTouchCancel.bind(this),
            contextmenu: this.handleContextMenu.bind(this)
        };

        // Initialize event listeners
        this.attachEventListeners();
    }

    /**
     * Attach all event listeners
     */
    attachEventListeners() {
        if (!this.canvas) return;

        // Mouse events
        this.canvas.addEventListener('mousedown', this.boundHandlers.mousedown);
        this.canvas.addEventListener('mousemove', this.boundHandlers.mousemove);
        this.canvas.addEventListener('mouseup', this.boundHandlers.mouseup);
        this.canvas.addEventListener('mouseleave', this.boundHandlers.mouseleave);
        this.canvas.addEventListener('wheel', this.boundHandlers.wheel, { passive: false });
        this.canvas.addEventListener('dblclick', this.boundHandlers.dblclick);
        this.canvas.addEventListener('contextmenu', this.boundHandlers.contextmenu);

        // Touch events
        this.canvas.addEventListener('touchstart', this.boundHandlers.touchstart, { passive: false });
        this.canvas.addEventListener('touchmove', this.boundHandlers.touchmove, { passive: false });
        this.canvas.addEventListener('touchend', this.boundHandlers.touchend);
        this.canvas.addEventListener('touchcancel', this.boundHandlers.touchcancel);
    }

    /**
     * Convert screen coordinates to image coordinates
     */
    screenToImage(x, y) {
        const rect = this.canvas.getBoundingClientRect();
        const viewportPoint = new OpenSeadragon.Point(
            x - rect.left,
            y - rect.top
        );

        const imagePoint = this.viewer.viewport.viewportToImageCoordinates(
            this.viewer.viewport.pointFromPixel(viewportPoint)
        );

        return imagePoint;
    }

    /**
     * Get hotspot at screen coordinates
     */
    getHotspotAt(x, y) {
        if (!this.spatialIndex) return null;
        const imagePoint = this.screenToImage(x, y);
        return this.spatialIndex.getHotspotAtPoint(imagePoint.x, imagePoint.y);
    }

    /**
     * Pass event through to OpenSeadragon
     */
    passEventToViewer(event, eventType) {
        if (!this.viewer || !this.viewer.canvas) return;

        const viewerElement = this.viewer.canvas;
        const newEvent = new event.constructor(eventType || event.type, {
            bubbles: event.bubbles,
            cancelable: event.cancelable,
            clientX: event.clientX,
            clientY: event.clientY,
            screenX: event.screenX,
            screenY: event.screenY,
            pageX: event.pageX,
            pageY: event.pageY,
            button: event.button,
            buttons: event.buttons,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            deltaZ: event.deltaZ,
            deltaMode: event.deltaMode
        });

        viewerElement.dispatchEvent(newEvent);
    }

    /**
     * Handle mouse down
     */
    handleMouseDown(event) {
        if (event.button !== 0) return; // Only handle left click

        this.isInteracting = true;
        this.startPoint = { x: event.clientX, y: event.clientY };
        this.lastPoint = { ...this.startPoint };

        // Check if clicking on a hotspot
        const hotspot = this.getHotspotAt(event.clientX, event.clientY);

        if (!hotspot) {
            // No hotspot - prepare for drag
            this.isDragging = true;
            this.canvas.style.pointerEvents = 'none';
            this.passEventToViewer(event);
        }

        // Start long press timer
        this.longPressTimer = setTimeout(() => {
            if (this.isInteracting && !this.isDragging) {
                // Long press detected
                this.handleLongPress(event.clientX, event.clientY);
            }
        }, this.longPressThreshold);
    }

    /**
     * Handle mouse move
     */
    handleMouseMove(event) {
        const currentPoint = { x: event.clientX, y: event.clientY };

        if (this.isInteracting) {
            // Check if we've moved enough to be considered a drag
            const distance = Math.sqrt(
                Math.pow(currentPoint.x - this.startPoint.x, 2) +
                Math.pow(currentPoint.y - this.startPoint.y, 2)
            );

            if (distance > this.clickThreshold && !this.isDragging) {
                // Start dragging
                this.isDragging = true;
                this.canvas.style.pointerEvents = 'none';

                // Cancel long press
                if (this.longPressTimer) {
                    clearTimeout(this.longPressTimer);
                    this.longPressTimer = null;
                }
            }

            if (this.isDragging) {
                this.passEventToViewer(event);
            }
        } else {
            // Not interacting - check for hover
            const hotspot = this.getHotspotAt(event.clientX, event.clientY);
            this.onHotspotHover(hotspot);
            this.canvas.style.cursor = hotspot ? 'pointer' : 'grab';
        }

        this.lastPoint = currentPoint;
    }

    /**
     * Handle mouse up
     */
    handleMouseUp(event) {
        if (event.button !== 0) return;

        // Clear long press timer
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }

        const endPoint = { x: event.clientX, y: event.clientY };
        const distance = Math.sqrt(
            Math.pow(endPoint.x - this.startPoint.x, 2) +
            Math.pow(endPoint.y - this.startPoint.y, 2)
        );

        if (this.isDragging) {
            // End drag
            this.passEventToViewer(event);
            this.canvas.style.pointerEvents = 'auto';
        } else if (distance <= this.clickThreshold) {
            // It's a click
            const hotspot = this.getHotspotAt(event.clientX, event.clientY);
            if (hotspot) {
                this.onHotspotClick(hotspot);
            }
        }

        // Reset state
        this.isInteracting = false;
        this.isDragging = false;
        this.startPoint = null;
    }

    /**
     * Handle mouse leave
     */
    handleMouseLeave(event) {
        // Clear any hover state
        this.onHotspotHover(null);
        this.canvas.style.cursor = 'default';

        // Cancel ongoing interactions
        if (this.isDragging) {
            this.passEventToViewer(event);
            this.canvas.style.pointerEvents = 'auto';
        }

        // Clear long press timer
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }

        // Reset state
        this.isInteracting = false;
        this.isDragging = false;
        this.startPoint = null;
    }

    /**
     * Handle mouse wheel
     */
    handleWheel(event) {
        event.preventDefault();
        this.passEventToViewer(event);
    }

    /**
     * Handle double click
     */
    handleDoubleClick(event) {
        const hotspot = this.getHotspotAt(event.clientX, event.clientY);

        if (!hotspot) {
            // Pass through to viewer for zoom
            this.passEventToViewer(event);
        } else {
            // Could implement special double-click behavior for hotspots
            this.onHotspotClick(hotspot);
        }
    }

    /**
     * Handle context menu (right click)
     */
    handleContextMenu(event) {
        event.preventDefault();
        // Could implement custom context menu here
    }

    /**
     * Handle touch start
     */
    handleTouchStart(event) {
        event.preventDefault();

        if (event.touches.length === 1) {
            // Single touch - similar to mouse down
            const touch = event.touches[0];
            this.isInteracting = true;
            this.startPoint = { x: touch.clientX, y: touch.clientY };
            this.lastPoint = { ...this.startPoint };

            // Check for hotspot
            const hotspot = this.getHotspotAt(touch.clientX, touch.clientY);

            if (!hotspot) {
                this.isDragging = true;
                this.canvas.style.pointerEvents = 'none';
            }

            // Start long press timer
            this.longPressTimer = setTimeout(() => {
                if (this.isInteracting && !this.isDragging) {
                    this.handleLongPress(touch.clientX, touch.clientY);
                }
            }, this.longPressThreshold);
        } else if (event.touches.length === 2) {
            // Two finger touch - prepare for pinch zoom
            const touch1 = event.touches[0];
            const touch2 = event.touches[1];

            this.touchStartDistance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) +
                Math.pow(touch2.clientY - touch1.clientY, 2)
            );

            // Pass to viewer for pinch handling
            this.canvas.style.pointerEvents = 'none';
        }

        // Pass event to viewer
        this.passEventToViewer(event);
    }

    /**
     * Handle touch move
     */
    handleTouchMove(event) {
        event.preventDefault();

        if (event.touches.length === 1 && this.isInteracting) {
            const touch = event.touches[0];
            const currentPoint = { x: touch.clientX, y: touch.clientY };

            const distance = Math.sqrt(
                Math.pow(currentPoint.x - this.startPoint.x, 2) +
                Math.pow(currentPoint.y - this.startPoint.y, 2)
            );

            if (distance > this.touchTapThreshold && !this.isDragging) {
                this.isDragging = true;
                this.canvas.style.pointerEvents = 'none';

                // Cancel long press
                if (this.longPressTimer) {
                    clearTimeout(this.longPressTimer);
                    this.longPressTimer = null;
                }
            }
        }

        // Pass event to viewer
        this.passEventToViewer(event);
    }

    /**
     * Handle touch end
     */
    handleTouchEnd(event) {
        // Clear long press timer
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }

        if (event.changedTouches.length === 1 && this.startPoint) {
            const touch = event.changedTouches[0];
            const endPoint = { x: touch.clientX, y: touch.clientY };

            const distance = Math.sqrt(
                Math.pow(endPoint.x - this.startPoint.x, 2) +
                Math.pow(endPoint.y - this.startPoint.y, 2)
            );

            if (!this.isDragging && distance <= this.touchTapThreshold) {
                // It's a tap
                const hotspot = this.getHotspotAt(touch.clientX, touch.clientY);
                if (hotspot) {
                    this.onHotspotClick(hotspot);
                }
            }
        }

        // Re-enable pointer events
        this.canvas.style.pointerEvents = 'auto';

        // Pass event to viewer
        this.passEventToViewer(event);

        // Reset state
        this.isInteracting = false;
        this.isDragging = false;
        this.startPoint = null;
        this.touchStartDistance = null;
    }

    /**
     * Handle touch cancel
     */
    handleTouchCancel(event) {
        // Clear long press timer
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }

        // Re-enable pointer events
        this.canvas.style.pointerEvents = 'auto';

        // Reset state
        this.isInteracting = false;
        this.isDragging = false;
        this.startPoint = null;
        this.touchStartDistance = null;
    }

    /**
     * Handle long press
     */
    handleLongPress(x, y) {
        const hotspot = this.getHotspotAt(x, y);
        if (hotspot) {
            // Could show context menu or additional info
            console.log('Long press on hotspot:', hotspot);
        }
    }

    /**
     * Clean up
     */
    destroy() {
        // Remove all event listeners
        if (this.canvas) {
            Object.keys(this.boundHandlers).forEach(event => {
                this.canvas.removeEventListener(event, this.boundHandlers[event]);
            });
        }

        // Clear timers
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
        }

        // Clear references
        this.viewer = null;
        this.canvas = null;
        this.spatialIndex = null;
    }
}

export default InteractionManager;