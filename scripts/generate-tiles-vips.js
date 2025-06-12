import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to load configuration
let config = {
    vipsPath: null,
    tileSize: 512,
    overlap: 1,
    quality: 85,
    format: 'jpg',
    previewWidth: 2048,
    previewHeight: 2048,
    previewQuality: 90
};

try {
    const customConfig = await import('../vips.config.js');
    config = { ...config, ...customConfig.default };
} catch (e) {
    // Config file is optional
}

/**
 * Generate DZI tiles using LibVIPS for high-quality deep zoom images
 * Optimized for Windows with better memory management
 */

/**
 * Find VIPS executable path
 */
async function findVipsPath() {
    // If configured path is provided, try it first
    if (config.vipsPath) {
        try {
            await fs.access(config.vipsPath);
            return config.vipsPath;
        } catch (e) {
            console.warn(`Configured VIPS path not found: ${config.vipsPath}`);
        }
    }

    // Common installation paths on Windows
    const possiblePaths = [
        'vips', // If in PATH
        'C:\\vips\\bin\\vips.exe',
        'C:\\Program Files\\vips\\bin\\vips.exe',
        'C:\\Program Files (x86)\\vips\\bin\\vips.exe',
        path.join(process.env.LOCALAPPDATA || '', 'vips-dev-8.16', 'bin', 'vips.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'vips-dev-8.15', 'bin', 'vips.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'vips-dev-8.14', 'bin', 'vips.exe'),
    ];

    // First try 'vips' command directly (if in PATH)
    try {
        const result = await new Promise((resolve) => {
            const vips = spawn('vips', ['--version'], { shell: true });
            vips.on('error', () => resolve(false));
            vips.on('close', (code) => resolve(code === 0));
        });
        if (result) return 'vips';
    } catch (e) {
        // Continue to check other paths
    }

    // Check specific paths
    for (const vipsPath of possiblePaths) {
        try {
            await fs.access(vipsPath);
            return vipsPath;
        } catch (e) {
            // Continue checking
        }
    }

    return null;
}

/**
 * Check if VIPS is installed and accessible
 */
async function checkVipsInstallation() {
    const vipsPath = await findVipsPath();

    if (!vipsPath) {
        console.error('❌ VIPS not found. Please install LibVIPS first.');
        console.error('   Download from: https://github.com/libvips/build-win64-mxe/releases');
        console.error('   Or add vips to your PATH');
        return { installed: false, path: null };
    }

    return new Promise((resolve) => {
        const vips = spawn(vipsPath, ['--version'], { shell: true });


        let output = '';
        vips.stdout.on('data', (data) => {
            output += data.toString();
        });

        vips.on('error', () => {
            resolve({ installed: false, path: null });
        });

        vips.on('close', (code) => {
            if (code === 0) {
                console.log('✅ VIPS installation verified');
                console.log(`   Path: ${vipsPath}`);
                console.log(`   ${output.trim()}`);
                resolve({ installed: true, path: vipsPath });
            } else {
                resolve({ installed: false, path: null });
            }
        });
    });
}

/**
 * Generate tiles for a single image using VIPS
 */
async function generateTilesForImage(inputPath, outputName, vipsPath) {
    const outputDir = path.join('public', 'images', 'tiles', outputName);
    const outputBase = path.join(outputDir, outputName);

    // Clean up old files
    try {
        await fs.rm(outputDir, { recursive: true, force: true });
        console.log('🧹 Cleaned up old tiles directory');
    } catch (e) {
        // Directory might not exist
    }

    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });

    // Build VIPS command with quality optimizations
    const args = [
        'dzsave',
        inputPath,
        outputBase,
        '--tile-size', config.tileSize.toString(),
        '--overlap', config.overlap.toString(),
        '--suffix', `.${config.format}[Q=${config.quality},optimize_coding,strip]`,
        '--depth', 'onetile',  // Generate all zoom levels down to single tile
        '--vips-progress'
    ];

    // Add format-specific optimizations
    if (config.format === 'jpg' || config.format === 'jpeg') {
        // For better quality, we can add additional parameters here if needed
    }

    console.log('🔨 Generating tiles with VIPS...');
    console.log(`   Command: ${vipsPath} ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
        const vips = spawn(vipsPath, args, { shell: true });

        let stderr = '';

        vips.stdout.on('data', (data) => {
            // VIPS progress output
            const output = data.toString().trim();
            if (output.includes('%')) {
                process.stdout.write(`\r   Progress: ${output}`);
            }
        });

        vips.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        vips.on('error', (err) => {
            reject(new Error(`Failed to start VIPS: ${err.message}`));
        });

        vips.on('close', (code) => {
            console.log(''); // New line after progress

            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`VIPS exited with code ${code}\n${stderr}`));
            }
        });
    });
}

/**
 * Verify generated tiles
 */
async function verifyTiles(outputName) {
    const outputDir = path.join('public', 'images', 'tiles', outputName);
    const dziPath = path.join(outputDir, `${outputName}.dzi`);
    const filesDir = path.join(outputDir, `${outputName}_files`);

    try {
        // Check DZI file
        const dziExists = await fs.access(dziPath).then(() => true).catch(() => false);
        if (!dziExists) {
            throw new Error('DZI file not generated');
        }

        // Read DZI content
        const dziContent = await fs.readFile(dziPath, 'utf8');
        const widthMatch = dziContent.match(/Width="(\d+)"/);
        const heightMatch = dziContent.match(/Height="(\d+)"/);

        if (widthMatch && heightMatch) {
            console.log(`📐 DZI dimensions: ${widthMatch[1]}x${heightMatch[1]}`);
        }

        // Count tiles
        const levels = await fs.readdir(filesDir);
        let totalTiles = 0;

        for (const level of levels) {
            const levelPath = path.join(filesDir, level);
            const tiles = await fs.readdir(levelPath);
            totalTiles += tiles.length;
        }

        console.log(`📊 Zoom levels: ${levels.length}`);
        console.log(`🖼️  Total tiles: ${totalTiles}`);

        return true;
    } catch (error) {
        console.error('❌ Verification failed:', error.message);
        return false;
    }
}

/**
 * Generate preview image for faster initial loading
 */
async function generatePreview(inputPath, outputName, vipsPath) {
    const outputDir = path.join('public', 'images', 'tiles', outputName);
    const previewPath = path.join(outputDir, 'preview.jpg');

    const args = [
        'thumbnail',
        inputPath,
        `[width=${config.previewWidth},height=${config.previewHeight},size=down]`,
        previewPath,
        '--size', 'down'
    ];

    console.log('🖼️  Generating preview image...');

    return new Promise((resolve, reject) => {
        const vips = spawn(vipsPath, args, { shell: true });

        vips.on('error', (err) => {
            reject(new Error(`Failed to generate preview: ${err.message}`));
        });

        vips.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Preview generated');
                resolve();
            } else {
                // Preview is optional, don't fail the whole process
                console.warn('⚠️  Preview generation failed (non-critical)');
                resolve();
            }
        });
    });
}

/**
 * Main execution
 */
async function main() {
    const startTime = performance.now();

    console.log('======================================');
    console.log(' VIPS-BASED TILE GENERATION');
    console.log('======================================');
    console.log('');

    // Check VIPS installation
    const vipsCheck = await checkVipsInstallation();
    if (!vipsCheck.installed) {
        process.exit(1);
    }
    const vipsPath = vipsCheck.path;

    // Input configuration
    const inputPath = path.join('assets', 'source', 'ZEBRA_for_MVP.tiff');
    const outputName = 'zebra';

    // Verify input file exists
    try {
        await fs.access(inputPath);
        console.log(`📄 Input file: ${inputPath}`);
    } catch {
        console.error(`❌ Input file not found: ${inputPath}`);
        process.exit(1);
    }

    try {
        // Generate tiles
        await generateTilesForImage(inputPath, outputName, vipsPath);
        console.log('✅ Tiles generated successfully');

        // Generate preview
        await generatePreview(inputPath, outputName, vipsPath);

        // Verify output
        const verified = await verifyTiles(outputName);

        if (verified) {
            const duration = ((performance.now() - startTime) / 1000).toFixed(2);
            console.log('');
            console.log('======================================');
            console.log(' ✨ TILE GENERATION COMPLETE! ✨');
            console.log('======================================');
            console.log(`⏱️  Total time: ${duration} seconds`);
            console.log('');
            console.log('Next steps:');
            console.log('1. Clear browser cache (Ctrl+Shift+Delete)');
            console.log('2. Run: npm run dev');
            console.log('3. The artwork should display perfectly!');
        } else {
            throw new Error('Tile verification failed');
        }
    } catch (error) {
        console.error('');
        console.error('❌ Error:', error.message);
        console.error('');
        console.error('Troubleshooting:');
        console.error('1. Ensure VIPS is properly installed');
        console.error('2. Check that the input TIFF is valid');
        console.error('3. Verify you have write permissions');
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export { generateTilesForImage, generatePreview };