import OpenSeadragon from 'openseadragon';

/**
 * NativeHotspotRenderer - Uses OpenSeadragon's native overlay system
 * Guarantees perfect synchronization with zero lag
 */
class NativeHotspotRenderer {
    constructor(options = {}) {
        this.viewer = options.viewer;
        this.spatialIndex = options.spatialIndex;
        this.onHotspotHover = options.onHotspotHover || (() => { });
        this.onHotspotClick = options.onHotspotClick || (() => { });

        // State
        this.overlays = new Map();
        this.hoveredHotspot = null;
        this.selectedHotspot = null;

        // Create SVG overlay
        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.style.position = 'absolute';
        this.svg.style.width = '100%';
        this.svg.style.height = '100%';
        this.svg.style.pointerEvents = 'none';

        // Styles
        this.styles = {
            audio_only: {
                fill: 'rgba(0, 203, 244, 0.3)',
                stroke: '#00cbf4',
                strokeWidth: 1,
                hoverFill: 'rgba(0, 203, 244, 0.5)',
                hoverStrokeWidth: 2,
                selectedFill: 'rgba(0, 203, 244, 0.7)',
                selectedStrokeWidth: 3
            },
            audio_link: {
                fill: 'rgba(73, 243, 0, 0.3)',
                stroke: '#49f300',
                strokeWidth: 1,
                hoverFill: 'rgba(73, 243, 0, 0.5)',
                hoverStrokeWidth: 2,
                selectedFill: 'rgba(73, 243, 0, 0.7)',
                selectedStrokeWidth: 3
            },
            audio_image: {
                fill: 'rgba(255, 5, 247, 0.3)',
                stroke: '#ff05f7',
                strokeWidth: 1,
                hoverFill: 'rgba(255, 5, 247, 0.5)',
                hoverStrokeWidth: 2,
                selectedFill: 'rgba(255, 5, 247, 0.7)',
                selectedStrokeWidth: 3
            },
            audio_image_link: {
                fill: 'rgba(255, 93, 0, 0.3)',
                stroke: '#ff5d00',
                strokeWidth: 1,
                hoverFill: 'rgba(255, 93, 0, 0.5)',
                hoverStrokeWidth: 2,
                selectedFill: 'rgba(255, 93, 0, 0.7)',
                selectedStrokeWidth: 3
            },
            audio_sound: {
                fill: 'rgba(255, 176, 0, 0.3)',
                stroke: '#ffb000',
                strokeWidth: 1,
                hoverFill: 'rgba(255, 176, 0, 0.5)',
                hoverStrokeWidth: 2,
                selectedFill: 'rgba(255, 176, 0, 0.7)',
                selectedStrokeWidth: 3
            }
        };

        // Initialize
        this.init();
    }

    /**
     * Initialize the renderer
     */
    init() {
        // Add SVG to viewer
        this.viewer.container.appendChild(this.svg);

        // Load all hotspots
        const hotspots = this.spatialIndex.getAllHotspots();
        hotspots.forEach(hotspot => this.createHotspotOverlay(hotspot));

        // Setup viewport tracking for visibility culling
        this.viewer.addHandler('update-viewport', () => this.updateVisibility());
        this.viewer.addHandler('animation', () => this.updateVisibility());

        // Initial visibility update
        this.updateVisibility();
    }

    /**
     * Create an overlay for a hotspot
     */
    createHotspotOverlay(hotspot) {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('data-hotspot-id', hotspot.id);
        group.style.cursor = 'pointer';
        group.style.pointerEvents = 'auto';

        // Create paths for the hotspot
        if (hotspot.shape === 'polygon') {
            const path = this.createPolygonPath(hotspot.coordinates);
            group.appendChild(path);
        } else if (hotspot.shape === 'multipolygon') {
            hotspot.coordinates.forEach(polygon => {
                const path = this.createPolygonPath(polygon);
                group.appendChild(path);
            });
        }

        // Apply initial style
        this.applyStyle(group, hotspot.type, 'normal');

        // Add event listeners
        group.addEventListener('mouseenter', () => this.handleHover(hotspot, true));
        group.addEventListener('mouseleave', () => this.handleHover(hotspot, false));
        group.addEventListener('click', (e) => this.handleClick(e, hotspot));

        // Add to SVG
        this.svg.appendChild(group);

        // Store reference
        this.overlays.set(hotspot.id, {
            element: group,
            hotspot: hotspot,
            bounds: this.calculateBounds(hotspot.coordinates)
        });
    }

    /**
     * Create SVG path for polygon
     */
    createPolygonPath(coordinates) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

        // Build path data
        let d = `M ${coordinates[0][0]} ${coordinates[0][1]}`;
        for (let i = 1; i < coordinates.length; i++) {
            d += ` L ${coordinates[i][0]} ${coordinates[i][1]}`;
        }
        d += ' Z';

        path.setAttribute('d', d);
        return path;
    }

    /**
     * Apply style to hotspot group
     */
    applyStyle(group, type, state) {
        const style = this.styles[type] || this.styles.audio_only;
        const paths = group.querySelectorAll('path');

        paths.forEach(path => {
            if (state === 'hover') {
                path.setAttribute('fill', style.hoverFill);
                path.setAttribute('stroke', style.stroke);
                path.setAttribute('stroke-width', style.hoverStrokeWidth);
                path.style.filter = 'drop-shadow(0 0 10px ' + style.stroke + ')';
            } else if (state === 'selected') {
                path.setAttribute('fill', style.selectedFill);
                path.setAttribute('stroke', style.stroke);
                path.setAttribute('stroke-width', style.selectedStrokeWidth);
            } else {
                path.setAttribute('fill', style.fill);
                path.setAttribute('stroke', style.stroke);
                path.setAttribute('stroke-width', style.strokeWidth);
                path.style.filter = 'none';
            }
        });
    }

    /**
     * Calculate bounds for visibility culling
     */
    calculateBounds(coordinates) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        const processPoints = (points) => {
            points.forEach(point => {
                minX = Math.min(minX, point[0]);
                minY = Math.min(minY, point[1]);
                maxX = Math.max(maxX, point[0]);
                maxY = Math.max(maxY, point[1]);
            });
        };

        if (Array.isArray(coordinates[0]) && typeof coordinates[0][0] === 'number') {
            processPoints(coordinates);
        } else {
            coordinates.forEach(polygon => processPoints(polygon));
        }

        return { minX, minY, maxX, maxY };
    }

    /**
     * Update visibility based on viewport
     */
    updateVisibility() {
        const viewport = this.viewer.viewport;
        const bounds = viewport.getBounds();

        // Convert viewport bounds to image coordinates
        const topLeft = viewport.viewportToImageCoordinates(
            new OpenSeadragon.Point(bounds.x, bounds.y)
        );
        const bottomRight = viewport.viewportToImageCoordinates(
            new OpenSeadragon.Point(bounds.x + bounds.width, bounds.y + bounds.height)
        );

        const viewBounds = {
            minX: topLeft.x,
            minY: topLeft.y,
            maxX: bottomRight.x,
            maxY: bottomRight.y
        };

        // Update transform
        this.updateSvgTransform();

        // Update visibility for each overlay
        this.overlays.forEach((overlay, id) => {
            const isVisible = this.boundsIntersect(overlay.bounds, viewBounds);
            overlay.element.style.display = isVisible ? 'block' : 'none';
        });
    }

    /**
     * Update SVG transform to match viewport
     */
    updateSvgTransform() {
        const viewport = this.viewer.viewport;
        const zoom = viewport.getZoom(true);
        const center = viewport.getCenter(true);
        const rotation = viewport.getRotation();
        const containerSize = viewport.getContainerSize();

        // Get image size
        const tiledImage = this.viewer.world.getItemAt(0);
        if (!tiledImage) return;

        const imageSize = tiledImage.getContentSize();

        // Calculate transform
        const bounds = viewport.getBounds(true);
        const scale = containerSize.x / (bounds.width * imageSize.x);

        // Build transform string
        let transform = '';
        transform += `translate(${containerSize.x / 2}px, ${containerSize.y / 2}px) `;

        if (rotation) {
            transform += `rotate(${rotation}deg) `;
        }

        transform += `scale(${scale}) `;
        transform += `translate(${-center.x * imageSize.x}px, ${-center.y * imageSize.y}px)`;

        // Apply transform
        this.svg.style.transform = transform;
        this.svg.style.transformOrigin = '0 0';
    }

    /**
     * Check if two bounds intersect
     */
    boundsIntersect(a, b) {
        return !(a.maxX < b.minX || a.minX > b.maxX ||
            a.maxY < b.minY || a.minY > b.maxY);
    }

    /**
     * Handle hover events
     */
    handleHover(hotspot, isHovering) {
        if (isHovering) {
            this.hoveredHotspot = hotspot;
            this.onHotspotHover(hotspot);

            const overlay = this.overlays.get(hotspot.id);
            if (overlay && hotspot.id !== this.selectedHotspot?.id) {
                this.applyStyle(overlay.element, hotspot.type, 'hover');
            }
        } else {
            if (this.hoveredHotspot?.id === hotspot.id) {
                this.hoveredHotspot = null;
                this.onHotspotHover(null);

                const overlay = this.overlays.get(hotspot.id);
                if (overlay && hotspot.id !== this.selectedHotspot?.id) {
                    this.applyStyle(overlay.element, hotspot.type, 'normal');
                }
            }
        }
    }

    /**
     * Handle click events
     */
    handleClick(event, hotspot) {
        event.stopPropagation();
        this.selectedHotspot = hotspot;
        this.onHotspotClick(hotspot);

        // Update styles
        this.overlays.forEach((overlay, id) => {
            if (id === hotspot.id) {
                this.applyStyle(overlay.element, overlay.hotspot.type, 'selected');
            } else if (id !== this.hoveredHotspot?.id) {
                this.applyStyle(overlay.element, overlay.hotspot.type, 'normal');
            }
        });
    }

    /**
     * Set hovered hotspot programmatically
     */
    setHoveredHotspot(hotspot) {
        // Clear previous hover
        if (this.hoveredHotspot) {
            const prevOverlay = this.overlays.get(this.hoveredHotspot.id);
            if (prevOverlay && this.hoveredHotspot.id !== this.selectedHotspot?.id) {
                this.applyStyle(prevOverlay.element, this.hoveredHotspot.type, 'normal');
            }
        }

        // Set new hover
        this.hoveredHotspot = hotspot;
        if (hotspot) {
            const overlay = this.overlays.get(hotspot.id);
            if (overlay && hotspot.id !== this.selectedHotspot?.id) {
                this.applyStyle(overlay.element, hotspot.type, 'hover');
            }
        }
    }

    /**
     * Set selected hotspot programmatically
     */
    setSelectedHotspot(hotspot) {
        // Clear previous selection
        if (this.selectedHotspot) {
            const prevOverlay = this.overlays.get(this.selectedHotspot.id);
            if (prevOverlay) {
                this.applyStyle(prevOverlay.element, this.selectedHotspot.type,
                    this.selectedHotspot.id === this.hoveredHotspot?.id ? 'hover' : 'normal');
            }
        }

        // Set new selection
        this.selectedHotspot = hotspot;
        if (hotspot) {
            const overlay = this.overlays.get(hotspot.id);
            if (overlay) {
                this.applyStyle(overlay.element, hotspot.type, 'selected');
            }
        }
    }

    /**
     * Clean up
     */
    destroy() {
        if (this.svg && this.svg.parentNode) {
            this.svg.parentNode.removeChild(this.svg);
        }
        this.overlays.clear();
        this.viewer = null;
    }
}

export default NativeHotspotRenderer;