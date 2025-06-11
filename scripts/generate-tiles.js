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
        console.log('🔄 Starting tile generation...');
        console.log(`📄 Input: ${inputPath}`);

        // Get metadata
        const metadata = await sharp(inputPath).metadata();
        console.log(`📐 Image size: ${metadata.width}x${metadata.height}`);

        // Generate tiles using Sharp's built-in DZI support
        await sharp(inputPath, { limitInputPixels: false })
            .tile({
                size: 512,
                overlap: 2,
                depth: 'onepixel',
                skipBlanks: -1,
                container: 'fs',
                layout: 'dz'
            })
            .toFile(path.join(outputDir, 'zebra_output.dz'));

        // Rename the generated folder to match our naming convention
        const generatedDir = path.join(outputDir, 'zebra_output_files');
        const targetDir = path.join(outputDir, `${outputName}_output_files`);

        // Check if renaming is needed
        try {
            await fs.access(generatedDir);
            if (generatedDir !== targetDir) {
                // Remove target if it exists
                try {
                    await fs.rm(targetDir, { recursive: true, force: true });
                } catch (e) { }
                // Rename
                await fs.rename(generatedDir, targetDir);
            }
        } catch (e) {
            console.log('Directory already has correct name');
        }

        // Rename the .dzi file
        const generatedDzi = path.join(outputDir, 'zebra_output.dzi');
        const targetDzi = path.join(outputDir, `${outputName}_output.dzi`);

        try {
            await fs.access(generatedDzi);
            if (generatedDzi !== targetDzi) {
                await fs.rename(generatedDzi, targetDzi);
            }
        } catch (e) {
            console.log('DZI file already has correct name');
        }

        console.log(`✅ Tiles generated successfully!`);

        // Verify what was created
        const files = await fs.readdir(outputDir);
        console.log('📁 Files in output directory:', files);

        // Check tile structure
        const tilesDir = path.join(outputDir, `${outputName}_output_files`);
        const levels = await fs.readdir(tilesDir);
        console.log('📊 Zoom levels created:', levels.sort((a, b) => parseInt(a) - parseInt(b)));

        // Generate preview
        console.log('🔄 Generating preview image...');

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

        console.log('✨ Process complete!');
        console.log(`📍 Tiles location: ${tilesDir}`);

    } catch (error) {
        console.error('❌ Error generating tiles:', error);
        console.error('Stack trace:', error.stack);
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