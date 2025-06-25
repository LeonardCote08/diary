// Quality preservation settings
export const QUALITY_CONFIG = {
    minHotspotPixelsDesktop: 600,  // Minimum visible area for desktop
    minHotspotPixelsMobile: 400,   // Minimum visible area for mobile
    maxZoomBeforeBlur: 15,          // Maximum zoom level before quality degrades
    tileSize: 1024                  // Your tile size configuration
};

// ZOOM_CONFIG - Configuration for zoom behavior
// Note: Auto-zoom on hotspot click is now always enabled for both desktop and mobile
export const ZOOM_CONFIG = {
    enableDesktopZoom: true,  // Enable for testing
    minZoomForDetail: 3.0
};