/**
 * ImageOverlayManager - Central manager for image overlay system
 * Handles preloading, state management, and coordination with other systems
 */
class ImageOverlayManager {
    constructor() {
        // State management
        this.overlays = new Map(); // hotspotId -> overlay data
        this.activeOverlay = null;
        this.preloadQueue = [];
        this.isPreloading = false;

        // Settings
        this.maxPreloadCount = 3;
        this.preloadedImages = new Map(); // URL -> Image object

        // Event callbacks
        this.onOverlayOpen = null;
        this.onOverlayClose = null;
        this.onImageLoaded = null;
        this.onImageError = null;

        console.log('ImageOverlayManager initialized');
    }

    /**
     * Load overlay data from hotspots
     */
    loadHotspots(hotspots) {
        hotspots.forEach(hotspot => {
            // Only process hotspots with images
            if (hotspot.image_url_1) {
                this.overlays.set(hotspot.id, {
                    hotspotId: hotspot.id,
                    imageUrls: [hotspot.image_url_1], // Array for future multi-image support
                    autoReveal: hotspot.overlay_auto_reveal || false,
                    displayMode: hotspot.overlay_display_mode || 'modal',
                    showButton: hotspot.show_images_button !== false,
                    access: hotspot.overlay_access || 'free',
                    isLoaded: false
                });
            }
        });

        console.log(`Loaded ${this.overlays.size} image overlays`);
    }

    /**
     * Preload images for visible hotspots
     */
    async preloadImages(visibleHotspotIds) {
        const imagesToPreload = [];

        visibleHotspotIds.forEach(id => {
            const overlay = this.overlays.get(id);
            if (overlay && !overlay.isLoaded) {
                overlay.imageUrls.forEach(url => {
                    if (!this.preloadedImages.has(url)) {
                        imagesToPreload.push({ url, hotspotId: id });
                    }
                });
            }
        });

        // Add to queue
        this.preloadQueue.push(...imagesToPreload);

        // Start preloading if not already doing so
        if (!this.isPreloading && this.preloadQueue.length > 0) {
            this.processPreloadQueue();
        }
    }

    /**
     * Process preload queue
     */
    async processPreloadQueue() {
        this.isPreloading = true;

        while (this.preloadQueue.length > 0 && this.preloadedImages.size < this.maxPreloadCount) {
            const { url, hotspotId } = this.preloadQueue.shift();

            try {
                await this.loadImage(url, hotspotId);
            } catch (error) {
                console.error(`Failed to preload image: ${url}`, error);
            }
        }

        this.isPreloading = false;
    }

    /**
     * Load a single image
     */
    loadImage(url, hotspotId) {
        return new Promise((resolve, reject) => {
            const img = new Image();

            img.onload = () => {
                this.preloadedImages.set(url, img);
                const overlay = this.overlays.get(hotspotId);
                if (overlay) {
                    overlay.isLoaded = true;
                }

                if (this.onImageLoaded) {
                    this.onImageLoaded(url, hotspotId);
                }

                console.log(`Image loaded: ${url}`);
                resolve(img);
            };

            img.onerror = (error) => {
                if (this.onImageError) {
                    this.onImageError(url, hotspotId, error);
                }

                console.error(`Failed to load image: ${url}`);
                reject(error);
            };

            // Set crossOrigin for external images
            img.crossOrigin = 'anonymous';
            img.src = url;
        });
    }

    /**
     * Check if overlay should auto-reveal
     */
    shouldAutoReveal(hotspotId) {
        const overlay = this.overlays.get(hotspotId);
        return overlay ? overlay.autoReveal : false;
    }

    /**
     * Check if button should be shown
     */
    shouldShowButton(hotspotId) {
        const overlay = this.overlays.get(hotspotId);
        return overlay ? overlay.showButton : true;
    }

    /**
     * Get overlay data
     */
    getOverlay(hotspotId) {
        return this.overlays.get(hotspotId);
    }

    /**
     * Open overlay
     */
    openOverlay(hotspotId) {
        const overlay = this.overlays.get(hotspotId);
        if (!overlay) {
            console.warn(`No overlay found for hotspot: ${hotspotId}`);
            return null;
        }

        // Close current overlay if exists
        if (this.activeOverlay) {
            this.closeOverlay();
        }

        this.activeOverlay = hotspotId;

        // Ensure image is loaded
        if (!overlay.isLoaded) {
            // Load immediately if not preloaded
            const url = overlay.imageUrls[0];
            this.loadImage(url, hotspotId).catch(console.error);
        }

        if (this.onOverlayOpen) {
            this.onOverlayOpen(hotspotId, overlay);
        }

        return overlay;
    }

    /**
     * Close overlay
     */
    closeOverlay() {
        if (this.activeOverlay) {
            const hotspotId = this.activeOverlay;
            this.activeOverlay = null;

            if (this.onOverlayClose) {
                this.onOverlayClose(hotspotId);
            }
        }
    }

    /**
     * Get image for URL
     */
    getImage(url) {
        return this.preloadedImages.get(url);
    }

    /**
     * Check access level
     */
    hasAccess(hotspotId, userLevel = 'free') {
        const overlay = this.overlays.get(hotspotId);
        if (!overlay) return false;

        const accessLevels = {
            'free': 0,
            'gated': 1,
            'supporter': 2
        };

        const requiredLevel = accessLevels[overlay.access] || 0;
        const currentLevel = accessLevels[userLevel] || 0;

        return currentLevel >= requiredLevel;
    }

    /**
     * Clean up specific images
     */
    unloadImages(hotspotIds) {
        hotspotIds.forEach(id => {
            const overlay = this.overlays.get(id);
            if (overlay) {
                overlay.imageUrls.forEach(url => {
                    this.preloadedImages.delete(url);
                });
                overlay.isLoaded = false;
            }
        });
    }

    /**
     * Get metrics
     */
    getMetrics() {
        return {
            totalOverlays: this.overlays.size,
            preloadedImages: this.preloadedImages.size,
            queueLength: this.preloadQueue.length,
            activeOverlay: this.activeOverlay
        };
    }

    /**
     * Destroy and clean up
     */
    destroy() {
        this.closeOverlay();
        this.overlays.clear();
        this.preloadedImages.clear();
        this.preloadQueue = [];

        console.log('ImageOverlayManager destroyed');
    }
}

export default ImageOverlayManager;