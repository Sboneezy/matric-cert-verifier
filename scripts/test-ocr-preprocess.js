const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { createWorker } = require("tesseract.js");

async function main() {
    const imagePath = process.argv[2];

    if (!imagePath) {
        throw new Error("Please provide an image path.");
    }

    if (!fs.existsSync(imagePath)) {
        throw new Error(`Image not found: ${imagePath}`);
    }

    const resolvedPath = path.resolve(imagePath);

    const outputPath = path.join(
        path.dirname(resolvedPath),
        `${path.basename(
            resolvedPath,
            path.extname(resolvedPath)
        )}-preprocessed.png`
    );

    console.log("================================");
    console.log("OCR PREPROCESSING TEST");
    console.log("================================");
    console.log(`Input: ${resolvedPath}`);
    console.log(`Output: ${outputPath}`);

    /*
     * Prepare the scanned certificate for OCR.
     *
     * grayscale:
     * Removes colour information that can interfere with OCR.
     *
     * normalize:
     * Improves separation between the background and printed text.
     *
     * sharpen:
     * Makes character edges more distinct.
     */
    await sharp(resolvedPath)
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toFile(outputPath);

    console.log("Preprocessing complete.");

    const worker = await createWorker("eng");

    try {
        console.log("Running Tesseract...");

        const result = await worker.recognize(outputPath);

        console.log("");
        console.log("================================");
        console.log("OCR CONFIDENCE");
        console.log("================================");
        console.log(result.data.confidence);

        console.log("");
        console.log("================================");
        console.log("OCR TEXT");
        console.log("================================");
        console.log(result.data.text || "(no text detected)");

    } finally {
        await worker.terminate();
    }

    console.log("");
    console.log("================================");
    console.log("PREPROCESSED IMAGE");
    console.log("================================");
    console.log(outputPath);
}

main().catch((error) => {
    console.error("");
    console.error("OCR preprocessing test failed.");
    console.error(error);
    process.exitCode = 1;
});