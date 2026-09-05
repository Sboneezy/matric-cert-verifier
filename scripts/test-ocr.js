const path = require("path");

const OcrService = require("../lib/ocr/OcrService");

async function main() {

    const suppliedPath = process.argv[2];

    const pdfPath = suppliedPath
        ? path.resolve(suppliedPath)
        : path.join(
            __dirname,
            "..",
            "tests",
            "sample.pdf"
        );

    console.log("OCR test starting...");
    console.log("PDF:", pdfPath);

    try {

        const result = await OcrService.extractFromPdf(pdfPath);

        console.log("\n================================");
        console.log("OCR CONFIDENCE");
        console.log("================================");

        console.log(result.confidence);

        console.log("\n================================");
        console.log("OCR TEXT");
        console.log("================================");

        console.log(result.text);

        console.log("\n================================");
        console.log("GENERATED PAGES");
        console.log("================================");

        console.log(result.pages);

    } catch (error) {

        console.error("\nOCR TEST FAILED");
        console.error(error);

        process.exitCode = 1;
    }
}

main();