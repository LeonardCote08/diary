# Performance Optimization Guide

## Overview

This guide explains the performance optimizations implemented to achieve smooth zooming and clear image quality in the Interactive Art Diary, following Deji's scalability requirements.

## Key Optimizations Implemented

### 1. **Tile Generation Improvements**

The tile generation process has been optimized for better quality and loading performance:

```bash
# Regenerate tiles with new settings
npm run generate-tiles
```

**What changed:**
- Increased tile size from 256x256 to 512x512 pixels (fewer HTTP requests)
- Added 2px overlap instead of 1px (seamless edges)
- Disabled mozjpeg compression (prevents over-compression artifacts)
- Added progressive JPEG encoding (smoother loading)
- Added preview image generation (instant initial display)

### 2. **OpenSeadragon Configuration**

Viewer settings have been fine-tuned for smooth performance:

```javascript
// Key settings for smooth zooming
animationTime: 0.5,        // Longer animations (was 0.2)
springStiffness: 7.5,      // Softer spring (was 12)
blendTime: 0.3,           // Enable blending (was 0)
smoothTileEdgesMinZoom: 1.5, // Smooth tile edges
alwaysBlend: true,        // Always blend tiles
minPixelRatio: 0.5,       // Start with lower quality
```

### 3. **Native SVG Hotspot Rendering**

Switched from Canvas to native SVG overlays:
- Perfect synchronization with image zoom/pan
- Better performance with GPU acceleration
- Smooth opacity transitions
- Batch loading for 600+ hotspots

### 4. **Intelligent Viewport Management**

Added smart caching to reduce calculations:
- 50ms cache for viewport state
- Preload 20% extra area around viewport
- Performance metrics tracking
- Automatic quality adjustment based on device

### 5. **Memory Management**

Implemented proper resource limits:
- Maximum 500 cached tiles
- Automatic garbage collection
- Progressive loading based on viewport
- Audio preloading for visible hotspots

## Troubleshooting Performance Issues

### Issue: Zoom/Pan Not Smooth

1. **Check browser hardware acceleration:**
   - Chrome: `chrome://gpu` - ensure "Hardware Acceleration" is enabled
   - Firefox: `about:support` - check "GPU Accelerated Windows"

2. **Monitor performance metrics:**
   ```javascript
   // Enable debug mode in performanceConfig.js
   debug: {
       showFPS: true,
       showMetrics: true,
       logPerformance: true
   }
   ```

3. **Reduce quality temporarily:**
   - The system automatically adjusts quality if FPS < 30
   - Manual override: reduce `maxImageCacheCount` in config

### Issue: Blurry Images

1. **Regenerate tiles with new settings:**
   ```bash
   # Delete old tiles
   rm -rf public/images/tiles/zebra
   
   # Generate new tiles
   npm run generate-tiles
   ```

2. **Check image rendering CSS:**
   - The CSS now forces high-quality rendering
   - Browser zoom should be at 100%

3. **Verify tile quality:**
   - Check generated tiles in `public/images/tiles/zebra/`
   - Ensure tiles are sharp at native resolution

### Issue: Slow Initial Load

1. **Enable preview image:**
   - Preview loads instantly while tiles download
   - Generated automatically with tile generation

2. **Check CDN configuration:**
   - Ensure tiles are served with proper cache headers
   - Use browser DevTools Network tab to verify

3. **Optimize network settings:**
   ```javascript
   // Adjust in performanceConfig.js
   network: {
       maxConcurrentRequests: 8,  // Increase for faster networks
       timeout: 30000            // Increase for slow connections
   }
   ```

## Performance Best Practices

### 1. **Testing Different Devices**

Always test on:
- Desktop (Chrome, Firefox, Safari)
- Mobile devices (iOS Safari, Chrome Android)
- Low-end devices (use Chrome DevTools throttling)

### 2. **Monitoring Performance**

Use built-in metrics:
```javascript
// Access viewport metrics
const metrics = viewportManager.getMetrics();
console.log(metrics);
```

### 3. **Optimizing for Production**

Before deployment:
1. Regenerate all tiles with production settings
2. Enable CDN caching for all static assets
3. Minify and compress JavaScript/CSS
4. Set appropriate cache headers

### 4. **Scaling Considerations**

For multiple artworks:
- Generate tiles for each artwork separately
- Implement lazy loading for gallery view
- Use preview images in gallery
- Preload only the selected artwork

## Configuration Reference

All performance settings are centralized in `src/config/performanceConfig.js`:

```javascript
// Adjust based on your needs
const performanceConfig = {
    viewer: { ... },      // OpenSeadragon settings
    tiles: { ... },       // Tile generation settings
    hotspots: { ... },    // Hotspot rendering
    audio: { ... },       // Audio engine
    viewport: { ... },    // Viewport caching
    memory: { ... },      // Memory limits
    network: { ... },     // Network optimization
    mobile: { ... },      // Mobile-specific
    debug: { ... }        // Debug options
};
```

## Next Steps

1. **Test the optimizations:**
   - Clear browser cache
   - Regenerate tiles with new settings
   - Test zoom/pan performance
   - Verify image clarity at all zoom levels

2. **Fine-tune for your content:**
   - Adjust settings in `performanceConfig.js`
   - Monitor FPS and adjust accordingly
   - Test with actual audio files

3. **Prepare for production:**
   - Set up CDN (Cloudflare + Backblaze)
   - Configure proper cache headers
   - Implement error tracking
   - Add analytics for user behavior

## Support

If performance issues persist:
1. Check browser console for errors
2. Review network requests in DevTools
3. Monitor GPU/CPU usage
4. Test with different tile sizes (256, 512, 1024)
5. Adjust animation timing in config

Remember: The goal is 60 FPS smooth zooming with crisp images at all zoom levels, supporting Deji's vision for an immersive art diary experience.