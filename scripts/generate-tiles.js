import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate high-quality DZI tiles for OpenSeadragon
 * Windows-specific fix for tile generation
 */

async function generateDZI(inputPath, outputName) {
    const outputDir = path.join('public', 'images', 'tiles', outputName);

    // Verify input file exists
    try {
        await fs.access(inputPath);
    } catch {
        console.error(`❌ Input file not found: ${inputPath}`);
        console.error(`   Current directory: ${process.cwd()}`);
        return;
    }

    // Clean up old files first
    try {
        await fs.rm(outputDir, { recursive: true, force: true });
        console.log('🧹 Cleaned up old tiles directory');
    } catch (e) {
        // Directory might not exist, that's fine
    }

    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });

    try {
        console.log('🔄 Starting high-quality tile generation...');
        console.log(`📄 Input: ${inputPath}`);

        // Get metadata first
        const metadata = await sharp(inputPath).metadata();
        console.log(`📐 Image size: ${metadata.width}x${metadata.height}`);

        // IMPORTANT: Use absolute paths for Windows
        const absoluteOutputDir = path.resolve(outputDir);
        const outputFile = path.join(absoluteOutputDir, `${outputName}_output`);

        console.log('🔨 Generating tiles...');
        console.log(`   Output path: ${outputFile}`);

        // Create sharp instance with Windows-specific settings
        const image = sharp(inputPath, {
            limitInputPixels: false,
            sequentialRead: false  // Changed for Windows
        });

        // Apply Windows-specific tile generation
        await image
            .tile({
                size: 512,
                overlap: 2,
                container: 'fs',
                layout: 'dz',
                // Force output directory name
                id: outputName + '_output'
            })
            .jpeg({
                quality: 95,
                progressive: false,
                mozjpeg: false  // Disable mozjpeg on Windows
            })
            .toFile(outputFile);

        console.log('✅ Base DZI file created!');

        // Wait longer for Windows file system
        console.log('⏳ Waiting for file system...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // List what was actually created
        try {
            const files = await fs.readdir(absoluteOutputDir);
            console.log('📁 Files created in output directory:');
            for (const file of files) {
                console.log(`   - ${file}`);

                // Check if it's a directory
                const filePath = path.join(absoluteOutputDir, file);
                const stat = await fs.stat(filePath);
                if (stat.isDirectory()) {
                    const subFiles = await fs.readdir(filePath);
                    console.log(`     Contains ${subFiles.length} items`);
                }
            }
        } catch (e) {
            console.error('❌ Error listing files:', e.message);
        }

        // Check if tiles were created with various possible names
        const possibleTileFolders = [
            `${outputName}_output_files`,
            `${outputName}_output`,
            'output_files',
            'files'
        ];

        let tilesFound = false;
        let actualTilesDir = null;

        for (const folderName of possibleTileFolders) {
            const testPath = path.join(absoluteOutputDir, folderName);
            try {
                await fs.access(testPath);
                console.log(`✅ Found tiles directory: ${folderName}`);
                actualTilesDir = testPath;
                tilesFound = true;
                break;
            } catch (e) {
                // Continue checking
            }
        }

        if (!tilesFound) {
            console.error('❌ No tiles directory found!');
            console.error('   Sharp may have failed to generate tiles.');
            console.error('   Try running the alternative tile generator.');
        } else {
            // Count tiles
            try {
                const levels = await fs.readdir(actualTilesDir);
                console.log(`📊 Zoom levels created: ${levels.length}`);

                let totalTiles = 0;
                for (const level of levels) {
                    const levelPath = path.join(actualTilesDir, level);
                    const tiles = await fs.readdir(levelPath);
                    totalTiles += tiles.length;
                }
                console.log(`📦 Total tiles created: ${totalTiles}`);
            } catch (e) {
                console.error('⚠️  Could not count tiles');
            }
        }

        // Generate preview regardless
        console.log('🔄 Generating preview image...');
        const previewPath = path.join(absoluteOutputDir, 'preview.jpg');

        await sharp(inputPath)
            .resize(2048, null, {
                withoutEnlargement: true,
                fit: 'inside',
                kernel: 'lanczos3'
            })
            .jpeg({
                quality: 90,
                progressive: true
            })
            .toFile(previewPath);

        console.log('✅ Preview generated!');

        // Check DZI file
        const dziFiles = [
            `${outputName}_output.dzi`,
            `${outputName}_output.dz`,
            'output.dzi'
        ];

        let dziFound = false;
        for (const dziName of dziFiles) {
            const dziPath = path.join(absoluteOutputDir, dziName);
            try {
                await fs.access(dziPath);
                console.log(`✅ DZI file found: ${dziName}`);
                dziFound = true;

                // Read and display DZI content
                const dziContent = await fs.readFile(dziPath, 'utf8');
                const widthMatch = dziContent.match(/Width="(\d+)"/);
                const heightMatch = dziContent.match(/Height="(\d+)"/);

                if (widthMatch && heightMatch) {
                    console.log(`📊 DZI dimensions: ${widthMatch[1]}x${heightMatch[1]}`);
                }
                break;
            } catch (e) {
                // Continue checking
            }
        }

        if (!dziFound) {
            console.error('❌ No DZI file found!');
        }

        console.log('\n✨ Process complete!');

        if (!tilesFound) {
            console.log('\n⚠️  TILES NOT GENERATED - ALTERNATIVE SOLUTION:');
            console.log('1. Install vips directly: https://github.com/libvips/libvips/releases');
            console.log('2. Or try the Python script alternative (see next artifact)');
        } else {
            console.log('\n💡 Next steps:');
            console.log('1. Clear browser cache (Ctrl+Shift+Delete)');
            console.log('2. Restart dev server: npm run dev');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('\n🔍 Debug info:');
        console.error(`- Working dir: ${process.cwd()}`);
        console.error(`- Input: ${path.resolve(inputPath)}`);
        console.error(`- Output: ${path.resolve(outputDir)}`);

        // Sharp debug info
        try {
            const sharpInfo = sharp.versions;
            console.error(`- Sharp: ${sharpInfo.sharp}`);
            console.error(`- libvips: ${sharpInfo.libvips}`);
        } catch (e) {
            console.error('- Sharp: Error getting version');
        }

        throw error;
    }
}

// Execute
const startTime = performance.now();
const inputPath = path.join('assets', 'source', 'ZEBRA_for_MVP.tiff');

generateDZI(inputPath, 'zebra')
    .then(() => {
        const duration = performance.now() - startTime;
        console.log(`\n⏱️ Total time: ${(duration / 1000).toFixed(2)} seconds`);
    })
    .catch(error => {
        console.error('\n❌ Fatal error:', error.message);
        process.exit(1);
    });