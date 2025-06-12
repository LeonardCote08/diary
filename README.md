# Scripts Documentation

## Tile Generation Scripts

### generate-hybrid-tiles-fixed.ps1 (RECOMMENDED)
Fixed hybrid tile generation that creates JPEG tiles for overview and PNG tiles for detail levels.

**Usage:**
```bash
npm run tiles
# or
powershell -ExecutionPolicy Bypass -File scripts/generate-hybrid-tiles-fixed.ps1
```

**Features:**
- JPEG 95% quality for zoom levels 0-70% (fast loading, sharp overview)
- PNG lossless for zoom levels 70%-100% (pixel-perfect text)
- Automatic level detection and proper tile generation
- Optimal balance: ~40-50MB total size
- Best of both worlds: performance AND quality

### generate-hq-jpeg-tiles.ps1
High-quality JPEG-only tiles for good quality with smaller files.

**Usage:**
```bash
npm run tiles:jpeg
```

**Features:**
- 512x512 pixel tiles
- JPEG 95% quality with no chroma subsampling
- Good for general viewing but text may blur at extreme zoom
- Smaller files (~30-40MB)

### generate-png-tiles.ps1
Pure PNG tiles for maximum quality (larger files).

**Usage:**
```bash
npm run tiles:png
```

**Features:**
- Lossless PNG compression
- Perfect for every zoom level
- Large file sizes (~90-100MB)
- Best quality but slower loading

### test-png-quality.ps1
Comparison tool to test different formats.

**Usage:**
```bash
npm run tiles:test
```

### batch-process-artworks.ps1
Process multiple TIFF files at once.

**Usage:**
```bash
npm run tiles:batch
```

## Utility Scripts

### svg-converter.js
Converts Affinity Designer SVG exports to JSON hotspot data.

**Usage:**
```bash
npm run convert:svg -- -i input.svg -o output.json
```

### cleanup-project.ps1
Remove unnecessary files and folders.

**Usage:**
```bash
npm run cleanup
```

### verify-tiles.ps1
Verify that tiles were generated correctly.

**Usage:**
```bash
npm run tiles:verify
```

**Shows:**
- Total tiles per level
- File format distribution (JPEG vs PNG)
- Total file size
- Hybrid configuration status

## Recommended Workflow

1. **For best results**, use the hybrid tile generation:
   ```bash
   npm run tiles
   ```
   This gives you:
   - Sharp overview with JPEG
   - Pixel-perfect text with PNG at high zoom
   - Optimal file size (~40-50MB)

2. **Clear browser cache** after generating new tiles:
   - Chrome/Edge: Ctrl+F5
   - Or: F12 → Network → Disable cache

3. **Test at all zoom levels**:
   - Fully zoomed out: Should be sharp (JPEG)
   - Medium zoom: Should be clear (JPEG)
   - Deep zoom on text: Should be pixel-perfect (PNG)

## Troubleshooting

If images are blurry:
1. Check that hybrid-info.json was generated in the tiles folder
2. Verify both .jpg and .png files exist in the tiles folders
3. Check browser console for "Using hybrid tile source" message
4. Try clearing browser cache completely

## VIPS Installation

LibVIPS is required. Download from:
https://github.com/libvips/build-win64-mxe/releases

Default path: `C:\Users\[Username]\AppData\Local\vips-dev-8.16\`