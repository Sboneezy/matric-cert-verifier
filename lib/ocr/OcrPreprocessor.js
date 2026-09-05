const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { createWorker } = require("tesseract.js");

/**
 * OCR Preprocessor
 * Generates multiple image variants optimised for different
 * certificate characteristics.
 */
class OcrPreprocessor {
    
    static async generateVariants(inputPath, outputDir) {
        const parsed = path.parse(inputPath);
        const dir = outputDir || path.join(parsed.dir, `${parsed.name}-variants`);
        
        fs.mkdirSync(dir, { recursive: true });
        
        const variants = [];
        
        const inputBuffer = fs.readFileSync(inputPath);
        
        async function addVariant(name, pipeline) {
            const outputPath = path.join(dir, `${name}.png`);
            
            let img = sharp(inputBuffer);
            img = pipeline(img);
            
            await img.png().toFile(outputPath);
            
            variants.push({
                name,
                path: outputPath
            });
        }
        
        await addVariant("01-grayscale", (img) => img.grayscale());
        await addVariant("02-grayscale-normalize", (img) => 
            img.grayscale().normalize()
        );
        await addVariant("03-grayscale-normalize-sharpen", (img) => 
            img.grayscale().normalize().sharpen()
        );
        await addVariant("04-high-contrast-sharpen", (img) => 
            img.grayscale().linear(1.5, -0.25).sharpen()
        );
        await addVariant("05-threshold", (img) => 
            img.grayscale().normalize().threshold(160)
        );
        await addVariant("06-threshold-strong", (img) => 
            img.grayscale().normalize().threshold(200)
        );
        await addVariant("07-upscaled", (img) => 
            img.resize({ width: 3000, withoutEnlargement: false })
               .grayscale()
               .normalize()
               .sharpen()
        );
        await addVariant("08-upscaled-threshold", (img) => 
            img.resize({ width: 3000, withoutEnlargement: false })
               .grayscale()
               .normalize()
               .threshold(170)
        );
        await addVariant("09-denoise", (img) => 
            img.grayscale()
               .median(3)
               .normalize()
               .sharpen()
        );
        await addVariant("10-adaptive-approx", (img) => 
            img.grayscale()
               .blur(1.5)
               .normalize()
               .threshold(180)
        );
        
        return {
            outputDir: dir,
            variants
        };
    }
    
    static async readImageInfo(inputPath) {
        const metadata = await sharp(inputPath).metadata();
        return {
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
            space: metadata.space,
            channels: metadata.channels,
            hasAlpha: metadata.hasAlpha,
            density: metadata.density
        };
    }
}

module.exports = OcrPreprocessor;