import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate optimized DZI tiles for smooth zooming
 * Following Deji's performance requirements from spec
 */
async function generateDZI(inputPath, outputName) {
    const outputDir = path.join('public/images/tiles', outputName);

    // Verify input file exists
    try {
        await fs.access(inputPath);
    } catch {
        console.error(`❌ Input file not found: ${inputPath}`);
        return;
    }

    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });

    try {
        console.log('🔄 Starting optimized tile generation...');
        console.log(`📄 Input: ${inputPath}`);

        // Get metadata
        const metadata = await sharp(inputPath).metadata();
        console.log(`📐 Image size: ${metadata.width}x${metadata.height}`);

        // IMPORTANT: Generate DZI with correct format
        const outputFile = path.join(outputDir, `${outputName}_output`);

        await sharp(inputPath)
            .tile({
                size: 512,
                overlap: 2,
                container: 'fs',
                layout: 'dz'
            })
            .jpeg({
                quality: 90,
                progressive: true,
                mozjpeg: false,
                chromaSubsampling: '4:4:4'
            })
            .toFile(outputFile);

        // Rename the generated files to match OpenSeadragon's expectations
        const filesDir = path.join(outputDir, `${outputName}_files`);
        const outputFilesDir = path.join(outputDir, `${outputName}_output_files`);

        // Check if renaming is needed
        if (await fs.access(filesDir).then(() => true).catch(() => false)) {
            await fs.rename(filesDir, outputFilesDir);
            console.log('📁 Renamed tiles directory to match OpenSeadragon format');
        }

        // Create the .dzi file that OpenSeadragon expects
        const dziContent = await fs.readFile(outputFile + '.dzi', 'utf8');
        await fs.writeFile(path.join(outputDir, `${outputName}_output.dzi`), dziContent);

        // Clean up the original .dzi file
        await fs.unlink(outputFile + '.dzi').catch(() => { });

        console.log(`✅ Tiles generated successfully!`);

        // Verify output
        const files = await fs.readdir(outputDir);
        console.log('📁 Files created:', files);

        // Generate multiple resolution versions for smoother transitions
        console.log('🔄 Generating preview levels...');

        // Create low-res preview for instant loading
        const previewPath = path.join(outputDir, 'preview.jpg');
        await sharp(inputPath)
            .resize(1024, null, {
                withoutEnlargement: true,
                fit: 'inside'
            })
            .jpeg({
                quality: 80,
                progressive: true
            })
            .toFile(previewPath);

        console.log('✨ Process complete with optimizations!');
        console.log(`📍 Tiles location: public/images/tiles/${outputName}/`);
        console.log('⚡ Optimizations applied:');
        console.log('   - 512x512 tiles for fewer HTTP requests');
        console.log('   - 2px overlap for seamless edges');
        console.log('   - Progressive JPEG for smooth loading');
        console.log('   - Preview image for instant display');

    } catch (error) {
        console.error('❌ Error generating tiles:', error);
    }
}

// Execute conversion with performance monitoring
const startTime = performance.now();

generateDZI('assets/source/ZEBRA_for_MVP.tiff', 'zebra')
    .then(() => {
        const duration = performance.now() - startTime;
        console.log(`⏱️ Total processing time: ${(duration / 1000).toFixed(2)} seconds`);
    })
    .catch(console.error);