import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { load } from 'cheerio';
import parsePath from 'parse-svg-path';
import absPath from 'abs-svg-path';
import { program } from 'commander';
import { pathToFileURL } from 'url';

// Setup CLI parameters
program
    .version('1.0.0')
    .description('Convert Affinity Designer SVG exports to JSON hotspot data')
    .option('-i, --input <path>', 'Input SVG file path')
    .option('-o, --output <path>', 'Output JSON file path')
    .option('-p, --page-id <id>', 'Page ID for this artwork (e.g., "2019-07-17")')
    .option('-b, --base-url <url>', 'Base URL for media files', 'https://example.com')
    .option('-w, --watch', 'Watch for file changes')
    .parse(process.argv);

const options = program.opts();

// Ensure file paths are relative to script location, not CWD
const __dirname = dirname(fileURLToPath(import.meta.url));
const inputSvg = options.input || path.join(__dirname, '..', 'input', 'MVP_hotspots.svg');
const outputJson = options.output || path.join(__dirname, '..', 'src', 'data', 'hotspots.json');

// Updated color mapping based on actual SVG colors
const colorTypeMap = {
    // Type 1 - Narration only (Cyan/Turquoise)
    '#00cbf4': { type: 1, name: 'audio_only' }, // Main cyan color in the SVG
    '#00ffff': { type: 1, name: 'audio_only' }, // Pure cyan
    '#00d4ff': { type: 1, name: 'audio_only' }, // Cyan variant
    '#00c8f0': { type: 1, name: 'audio_only' }, // Cyan variant

    // Type 2 - Narration + Link (Green)
    '#49f300': { type: 2, name: 'audio_link' }, // Main green color in the SVG
    '#00ff00': { type: 2, name: 'audio_link' }, // Pure green
    '#4bf000': { type: 2, name: 'audio_link' }, // Green variant
    '#50ff00': { type: 2, name: 'audio_link' }, // Green variant

    // Type 3 - Narration + Rollover image (Magenta/Pink)
    '#ff05f7': { type: 3, name: 'audio_image' }, // Main magenta color in the SVG
    '#ff00ff': { type: 3, name: 'audio_image' }, // Pure magenta
    '#ff00f0': { type: 3, name: 'audio_image' }, // Magenta variant
    '#f700ff': { type: 3, name: 'audio_image' }, // Magenta variant

    // Type 4 - Narration + Rollover + Link (Orange)
    '#ff5d00': { type: 4, name: 'audio_image_link' }, // Orange variant 1
    '#ff6105': { type: 4, name: 'audio_image_link' }, // Orange variant 2
    '#ffa500': { type: 4, name: 'audio_image_link' }, // Standard orange
    '#ff6000': { type: 4, name: 'audio_image_link' }, // Orange variant

    // Type 5 - Narration + sound (Yellow)
    '#ffb000': { type: 5, name: 'audio_sound' }, // Yellow-orange (actually yellow)
    '#ffff00': { type: 5, name: 'audio_sound' }, // Pure yellow
    '#fff700': { type: 5, name: 'audio_sound' }, // Yellow variant
    '#ffee00': { type: 5, name: 'audio_sound' }, // Yellow variant
};

// Helper function to extract month-day from layer name
function extractDateFromLayerName(layerName) {
    // Clean up layer name first
    const cleanName = layerName.replace(/^_+/, '').replace(/-+/g, '-');

    // Handles formats like "09 - 26" or "09-26"
    const monthDayMatch = cleanName.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
    if (monthDayMatch) {
        const month = monthDayMatch[1].padStart(2, '0');
        const day = monthDayMatch[2].padStart(2, '0');
        return `${month}-${day}`;
    }
    return null;
}

// Helper function to convert RGB to hex
function rgbToHex(rgb) {
    const match = rgb.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (!match) return rgb.toLowerCase();
    const r = Number(match[1]);
    const g = Number(match[2]);
    const b = Number(match[3]);
    return '#' + [r, g, b]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('');
}

// Extract fill color from SVG element
function extractFill($elem) {
    let fill = $elem.attr('fill');
    if (!fill) {
        const style = $elem.attr('style') || '';
        const match = style.match(/fill:\s*([^;]+)/i);
        if (match) fill = match[1];
    }
    if (!fill) return null;
    fill = fill.trim();
    if (fill === 'none') return null;
    if (fill.startsWith('rgb')) fill = rgbToHex(fill);
    return fill.toLowerCase();
}

// Extract stroke color from SVG element
function extractStroke($elem) {
    let stroke = $elem.attr('stroke');
    if (!stroke) {
        const style = $elem.attr('style') || '';
        const match = style.match(/stroke:\s*([^;]+)/i);
        if (match) stroke = match[1];
    }
    if (!stroke) return null;
    stroke = stroke.trim();
    if (stroke === 'none') return null;
    if (stroke.startsWith('rgb')) stroke = rgbToHex(stroke);
    return stroke.toLowerCase();
}

// Helper function to check if two points are approximately the same
function isSamePoint(point1, point2, tolerance = 1) {
    return Math.abs(point1[0] - point2[0]) <= tolerance &&
        Math.abs(point1[1] - point2[1]) <= tolerance;
}

// Convert SVG path commands to polygon coordinates
function commandsToPoints(commands) {
    const subpaths = [];
    let points = [];
    let current = [0, 0];
    let startPoint = null;
    let lastPoint = null;

    for (const seg of commands) {
        const [cmd, ...args] = seg;

        switch (cmd) {
            case 'M':
                if (points.length) {
                    const newX = args[0];
                    const newY = args[1];

                    if (lastPoint && isSamePoint(lastPoint, [newX, newY])) {
                        // Continue with current subpath
                    } else {
                        subpaths.push(points);
                        points = [];
                    }
                }

                current = [args[0], args[1]];
                startPoint = [Math.round(current[0]), Math.round(current[1])];

                if (points.length === 0 || !isSamePoint(points[points.length - 1], startPoint)) {
                    points.push([...startPoint]);
                }
                break;

            case 'L': {
                current = [args[0], args[1]];
                const roundedPoint = [Math.round(current[0]), Math.round(current[1])];

                if (points.length === 0 || !isSamePoint(points[points.length - 1], roundedPoint)) {
                    points.push(roundedPoint);
                }
                lastPoint = [...roundedPoint];
                break;
            }

            case 'H': {
                current = [args[0], current[1]];
                const hPoint = [Math.round(current[0]), Math.round(current[1])];

                if (points.length === 0 || !isSamePoint(points[points.length - 1], hPoint)) {
                    points.push(hPoint);
                }
                lastPoint = [...hPoint];
                break;
            }

            case 'V': {
                current = [current[0], args[0]];
                const vPoint = [Math.round(current[0]), Math.round(current[1])];

                if (points.length === 0 || !isSamePoint(points[points.length - 1], vPoint)) {
                    points.push(vPoint);
                }
                lastPoint = [...vPoint];
                break;
            }

            case 'C':
            case 'S':
            case 'Q':
            case 'T':
            case 'A': {
                current = [args[args.length - 2], args[args.length - 1]];
                const curvePoint = [Math.round(current[0]), Math.round(current[1])];

                if (points.length === 0 || !isSamePoint(points[points.length - 1], curvePoint)) {
                    points.push(curvePoint);
                }
                lastPoint = [...curvePoint];
                break;
            }

            case 'Z':
                if (startPoint && points.length > 0 && !isSamePoint(points[points.length - 1], startPoint)) {
                    points.push([...startPoint]);
                }
                lastPoint = startPoint ? [...startPoint] : null;
                break;
        }
    }

    if (points.length) subpaths.push(points);

    // Merge subpaths that are clearly part of the same shape
    const mergedSubpaths = [];
    for (let i = 0; i < subpaths.length; i++) {
        const currentSubpath = subpaths[i];

        if (!currentSubpath.length) continue;

        if (i === subpaths.length - 1) {
            mergedSubpaths.push(currentSubpath);
            continue;
        }

        const nextSubpath = subpaths[i + 1];
        if (!nextSubpath.length) continue;

        const lastPointOfCurrent = currentSubpath[currentSubpath.length - 1];
        const firstPointOfNext = nextSubpath[0];

        if (isSamePoint(lastPointOfCurrent, firstPointOfNext)) {
            const mergedPath = [...currentSubpath];
            mergedPath.push(...nextSubpath.slice(1));
            mergedSubpaths.push(mergedPath);
            i++;
        } else {
            mergedSubpaths.push(currentSubpath);
        }
    }

    return mergedSubpaths;
}

// Main converter function (modular for CMS integration)
export async function convertSvgToHotspots(svgPath, options = {}) {
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    const $ = load(svgContent, { xmlMode: true });

    const counters = {};
    const hotspots = [];
    let pageId = options.pageId;
    let layerInfo = null;

    // Extract layer/group information
    $('g').each((i, el) => {
        const $el = $(el);
        let id = $el.attr('id') || $el.attr('serif:id');
        if (id && !layerInfo) {
            // Clean up the layer name
            id = id.replace(/^_+/, '').replace(/-+/g, ' - ');
            layerInfo = id;
            // Try to extract date from layer name if no page-id provided
            if (!pageId) {
                const extractedDate = extractDateFromLayerName(id);
                if (extractedDate) {
                    pageId = extractedDate;
                }
            }
        }
    });

    // Default page-id if none found
    if (!pageId) {
        pageId = 'untitled';
    }

    // Process each path
    $('path').each((i, el) => {
        const $el = $(el);
        const $parent = $el.parent();

        // Extract fill and stroke colors
        const fill = extractFill($el);
        const stroke = extractStroke($el);
        const color = (fill || stroke || '').toLowerCase();

        if (!color) return;

        // Determine hotspot type
        const typeInfo = colorTypeMap[color];
        if (!typeInfo) {
            console.warn(`Warning: Found unknown color ${color}`);
            return;
        }

        const { type: typeNumber, name: typeName } = typeInfo;

        // Generate ID with global counter
        counters.global = (counters.global || 0) + 1;
        const counter = String(counters.global).padStart(3, '0');
        const id = `hotspot_${typeName}_${counter}`;

        // Parse path data
        const d = $el.attr('d');
        if (!d) return;

        let commands;
        try {
            commands = absPath(parsePath(d));
        } catch (err) {
            console.warn(`Failed to parse path for ${id}:`, err.message);
            return;
        }

        const polygons = commandsToPoints(commands);
        if (!polygons.length) return;

        // Generate title and description
        const hotspotNumber = counter;
        const title = `${typeName.replace(/_/g, ' ')} Hotspot ${hotspotNumber}`;
        const description = layerInfo ?
            `Excerpt from ${layerInfo} — hotspot ${hotspotNumber}` :
            `Hotspot ${hotspotNumber} from the illustrated diary`;

        // Determine shape type
        const shape = polygons.length > 1 ? 'multipolygon' : 'polygon';

        // Build hotspot object matching Deji's exact format from the conversation
        const hotspot = {
            id,
            type: typeName,
            shape,
            coordinates: shape === 'multipolygon' ? polygons : polygons[0],
            page_id: pageId,
            title,
            description
        };

        // Add media URLs based on type
        const baseUrl = options.baseUrl || 'https://example.com';

        // All types have narration
        if ([1, 2, 3, 4, 5].includes(typeNumber)) {
            hotspot.audioUrl = `${baseUrl}/audio/${typeName}_${counter}.mp3`;
        }

        // Type 3 (audio_image) and Type 4 (audio_image_link) have images
        if ([3, 4].includes(typeNumber)) {
            hotspot.imageUrl = `${baseUrl}/images/${typeName}_${counter}.jpg`;
        }

        // Type 2 (audio_link) and Type 4 (audio_image_link) have links
        if ([2, 4].includes(typeNumber)) {
            hotspot.linkUrl = `${baseUrl}/diary/${typeName}_${counter}`;
        }

        // Type 5 (audio_sound) might have a secondary sound effect
        if (typeNumber === 5) {
            hotspot.soundUrl = `${baseUrl}/sounds/${typeName}_${counter}.mp3`;
        }

        hotspots.push(hotspot);
    });

    return hotspots;
}

// CLI execution
async function main() {
    try {
        console.log(`🎨 Affinity Designer to JSON Converter`);
        console.log(`📄 Input: ${inputSvg}`);
        console.log(`📝 Output: ${outputJson}`);

        const hotspots = await convertSvgToHotspots(inputSvg, {
            pageId: options.pageId,
            baseUrl: options.baseUrl
        });

        if (hotspots.length === 0) {
            console.warn("⚠️  No hotspots found in the SVG. Check that paths have fill or stroke colors.");
        } else {
            console.log(`✅ Found ${hotspots.length} hotspots`);

            // Create output directory if it doesn't exist
            const outputDir = path.dirname(outputJson);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // Write JSON file
            fs.writeFileSync(outputJson, JSON.stringify(hotspots, null, 2));
            console.log(`💾 Saved to ${outputJson}`);

            // Show summary by type
            const typeCounts = {};
            hotspots.forEach(h => {
                const typeInfo = Object.values(colorTypeMap).find(t => t.name === h.type);
                const typeNumber = typeInfo ? typeInfo.type : 'unknown';
                typeCounts[typeNumber] = (typeCounts[typeNumber] || 0) + 1;
            });

            console.log('\n📊 Summary:');
            Object.entries(typeCounts).forEach(([type, count]) => {
                const typeName = Object.values(colorTypeMap).find(t => t.type === parseInt(type))?.name || 'unknown';
                console.log(`   Type ${type} (${typeName}): ${count} hotspots`);
            });

            // Show color distribution for debugging
            console.log('\n🎨 Color distribution:');
            const colorCounts = {};
            // Re-parse to count colors
            const $ = load(fs.readFileSync(inputSvg, 'utf8'), { xmlMode: true });
            $('path').each((i, el) => {
                const $el = $(el);
                const fill = extractFill($el);
                const stroke = extractStroke($el);
                const color = (fill || stroke || '').toLowerCase();
                if (color) {
                    colorCounts[color] = (colorCounts[color] || 0) + 1;
                }
            });
            Object.entries(colorCounts).forEach(([color, count]) => {
                const typeInfo = colorTypeMap[color];
                const status = typeInfo ? `✓ Type ${typeInfo.type} (${typeInfo.name})` : '❌ Unknown';
                console.log(`   ${color}: ${count} paths ${status}`);
            });
        }

        // Watch mode
        if (options.watch) {
            console.log('\n👁️  Watching for changes...');
            fs.watchFile(inputSvg, async () => {
                console.log('\n🔄 File changed, reconverting...');
                await main();
            });
        }

    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    }
}

// Run if called directly
const currentFileUrl = import.meta.url;
const executedFile = pathToFileURL(process.argv[1]).href;

if (currentFileUrl === executedFile) {
    main().catch(error => {
        console.error("Error during execution:", error);
        process.exit(1);
    });
}

// Export for module usage
export default convertSvgToHotspots;