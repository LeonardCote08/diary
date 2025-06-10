import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function generateDZI(inputPath, outputName) {
    const outputDir = path.join('public/images/tiles', outputName);

    // Vérifier que le fichier source existe
    try {
        await fs.access(inputPath);
    } catch {
        console.error(`❌ Input file not found: ${inputPath}`);
        return;
    }

    // Créer le dossier de sortie
    await fs.mkdir(outputDir, { recursive: true });

    try {
        console.log('🔄 Starting tile generation...');
        console.log(`📄 Input: ${inputPath}`);

        // Obtenir les métadonnées
        const metadata = await sharp(inputPath).metadata();
        console.log(`📐 Image size: ${metadata.width}x${metadata.height}`);

        // IMPORTANT: Sharp génère les tiles directement sans fichier .dzi séparé
        const dziPath = path.join(outputDir, `${outputName}_output`);

        await sharp(inputPath)
            .jpeg({ quality: 100, mozjpeg: true })  // Qualité maximale
            .tile({
                size: 256,
                overlap: 1
            })
            .toFile(dziPath + '.dz');  // Extension .dz, pas .dzi

        console.log(`✅ Tiles generated successfully!`);

        // Vérifier ce qui a été créé
        const files = await fs.readdir(outputDir);
        console.log('📁 Files created:', files);

        // Renommer si nécessaire
        if (await fs.access(path.join(outputDir, `${outputName}_output_files`)).catch(() => false)) {
            console.log('✨ Tiles directory already has correct name');
        } else if (await fs.access(path.join(outputDir, `${outputName}_output.dzi`)).catch(() => false)) {
            console.log('✨ DZI file already has correct name');
        }

        console.log('✨ Process complete!');
        console.log(`📍 Check the folder: public/images/tiles/${outputName}/`);

    } catch (error) {
        console.error('❌ Error generating tiles:', error);
    }
}

// Exécuter la conversion
generateDZI('assets/source/ZEBRA_for_MVP.tiff', 'zebra');