const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { createWorker } = require("tesseract.js");

async function createVariants(inputPath) {
    const parsed = path.parse(inputPath);

    const outputDir = path.join(
        parsed.dir,
        `${parsed.name}-ocr-variants`
    );

    fs.mkdirSync(outputDir, { recursive: true });

    console.log("");
    console.log("Creating OCR image variants...");
    console.log(`Output directory: ${outputDir}`);

    const variants = [];

    // ---------------------------------------------------------
    // Variant 1: Grayscale
    // ---------------------------------------------------------

    const grayscalePath = path.join(
        outputDir,
        "01-grayscale.png"
    );

    await sharp(inputPath)
        .grayscale()
        .png()
        .toFile(grayscalePath);

    variants.push({
        name: "01 Grayscale",
        path: grayscalePath
    });

    // ---------------------------------------------------------
    // Variant 2: Grayscale + Normalize
    // ---------------------------------------------------------

    const normalizedPath = path.join(
        outputDir,
        "02-normalized.png"
    );

    await sharp(inputPath)
        .grayscale()
        .normalize()
        .png()
        .toFile(normalizedPath);

    variants.push({
        name: "02 Grayscale + Normalize",
        path: normalizedPath
    });

    // ---------------------------------------------------------
    // Variant 3: Grayscale + Sharpen
    // ---------------------------------------------------------

    const sharpenedPath = path.join(
        outputDir,
        "03-sharpened.png"
    );

    await sharp(inputPath)
        .grayscale()
        .sharpen()
        .png()
        .toFile(sharpenedPath);

    variants.push({
        name: "03 Grayscale + Sharpen",
        path: sharpenedPath
    });

    // ---------------------------------------------------------
    // Variant 4: Current baseline
    // Grayscale + Normalize + Sharpen
    // ---------------------------------------------------------

    const baselinePath = path.join(
        outputDir,
        "04-baseline.png"
    );

    await sharp(inputPath)
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toFile(baselinePath);

    variants.push({
        name: "04 Grayscale + Normalize + Sharpen",
        path: baselinePath
    });

    // ---------------------------------------------------------
    // Variant 5: High contrast
    // ---------------------------------------------------------

    const contrastPath = path.join(
        outputDir,
        "05-high-contrast.png"
    );

    await sharp(inputPath)
        .grayscale()
        .linear(1.5, -0.25)
        .sharpen()
        .png()
        .toFile(contrastPath);

    variants.push({
        name: "05 High Contrast + Sharpen",
        path: contrastPath
    });

    // ---------------------------------------------------------
    // Variant 6: Threshold
    // ---------------------------------------------------------

    const thresholdPath = path.join(
        outputDir,
        "06-threshold.png"
    );

    await sharp(inputPath)
        .grayscale()
        .normalize()
        .threshold(160)
        .png()
        .toFile(thresholdPath);

    variants.push({
        name: "06 Threshold 160",
        path: thresholdPath
    });

    // ---------------------------------------------------------
    // Variant 7: Strong threshold
    // ---------------------------------------------------------

    const thresholdStrongPath = path.join(
        outputDir,
        "07-threshold-200.png"
    );

    await sharp(inputPath)
        .grayscale()
        .normalize()
        .threshold(200)
        .png()
        .toFile(thresholdStrongPath);

    variants.push({
        name: "07 Threshold 200",
        path: thresholdStrongPath
    });

    // ---------------------------------------------------------
    // Variant 8: Upscale + normalize + sharpen
    // ---------------------------------------------------------

    const upscalePath = path.join(
        outputDir,
        "08-upscaled.png"
    );

    await sharp(inputPath)
        .resize({
            width: 3000,
            withoutEnlargement: false
        })
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toFile(upscalePath);

    variants.push({
        name: "08 Upscale + Normalize + Sharpen",
        path: upscalePath
    });

    // ---------------------------------------------------------
    // Variant 9: Upscale + threshold
    // ---------------------------------------------------------

    const upscaleThresholdPath = path.join(
        outputDir,
        "09-upscaled-threshold.png"
    );

    await sharp(inputPath)
        .resize({
            width: 3000,
            withoutEnlargement: false
        })
        .grayscale()
        .normalize()
        .threshold(170)
        .png()
        .toFile(upscaleThresholdPath);

    variants.push({
        name: "09 Upscale + Threshold",
        path: upscaleThresholdPath
    });

    return {
        outputDir,
        variants
    };
}

async function runOcr(imagePath) {
    const worker = await createWorker("eng");

    try {
        const result = await worker.recognize(imagePath);

        return {
            confidence: result.data.confidence || 0,
            text: result.data.text || ""
        };
    } finally {
        await worker.terminate();
    }
}

function cleanText(text) {
    return text
        .replace(/\r/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

async function main() {
    const suppliedPath = process.argv[2];

    if (!suppliedPath) {
        throw new Error(
            "Please provide the PNG image path."
        );
    }

    const inputPath = path.resolve(suppliedPath);

    if (!fs.existsSync(inputPath)) {
        throw new Error(
            `Image not found: ${inputPath}`
        );
    }

    console.log("");
    console.log("================================");
    console.log("OCR VARIANT TEST");
    console.log("================================");
    console.log(`Input: ${inputPath}`);

    const { outputDir, variants } =
        await createVariants(inputPath);

    console.log("");
    console.log("================================");
    console.log("RUNNING OCR");
    console.log("================================");

    const results = [];

    for (const variant of variants) {

        console.log("");
        console.log(`Processing: ${variant.name}`);

        const result = await runOcr(
            variant.path
        );

        const cleaned = cleanText(
            result.text
        );

        results.push({
            ...variant,
            confidence: result.confidence,
            text: cleaned
        });

        console.log(
            `Confidence: ${result.confidence}`
        );

        console.log(
            `Characters detected: ${cleaned.length}`
        );
    }

    // Sort by confidence so we can immediately see
    // which preprocessing method performed best.

    const ranked = [...results].sort(
        (a, b) => b.confidence - a.confidence
    );

    console.log("");
    console.log("================================");
    console.log("RANKING");
    console.log("================================");

    ranked.forEach((result, index) => {

        console.log(
            `${index + 1}. ${result.name}`
        );

        console.log(
            `   Confidence: ${result.confidence}`
        );

        console.log(
            `   Characters: ${result.text.length}`
        );

        console.log(
            `   File: ${result.path}`
        );
    });

    console.log("");
    console.log("================================");
    console.log("OCR TEXT BY VARIANT");
    console.log("================================");

    for (const result of ranked) {

        console.log("");
        console.log("--------------------------------");
        console.log(result.name);
        console.log(
            `Confidence: ${result.confidence}`
        );
        console.log("--------------------------------");

        console.log(
            result.text || "(no text detected)"
        );
    }

    console.log("");
    console.log("================================");
    console.log("BEST VARIANT");
    console.log("================================");

    const best = ranked[0];

    console.log(`Method: ${best.name}`);
    console.log(
        `Confidence: ${best.confidence}`
    );
    console.log(`Image: ${best.path}`);

    console.log("");
    console.log("================================");
    console.log("FILES");
    console.log("================================");
    console.log(`All variants: ${outputDir}`);
}

main().catch((error) => {
    console.error("");
    console.error(
        "OCR variant test failed."
    );
    console.error(error);

    process.exitCode = 1;
});