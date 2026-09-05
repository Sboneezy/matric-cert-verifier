const fs = require("fs");
const path = require("path");
const { createWorker } = require("tesseract.js");

class OcrService {

    static async extractFromImage(imagePath) {

        if (!imagePath) {
            throw new Error("Image path is required.");
        }

        if (!fs.existsSync(imagePath)) {
            throw new Error(`Image not found: ${imagePath}`);
        }

        console.log(`OCR processing image: ${imagePath}`);

        const worker = await createWorker("eng");

        try {

            const result = await worker.recognize(imagePath);

            return {
                text: result.data.text || "",
                confidence: result.data.confidence || 0
            };

        } finally {

            await worker.terminate();

        }
    }


    static async extractFromPdf(pdfPath) {

        if (!pdfPath) {
            throw new Error("PDF path is required.");
        }

        if (!fs.existsSync(pdfPath)) {
            throw new Error(`PDF not found: ${pdfPath}`);
        }

        console.log(`Rendering PDF for OCR: ${pdfPath}`);

        const { pdf } = await import("pdf-to-img");

        /*
         * Higher rendering scale is important for scanned certificates.
         * The previous value of 3 produced a visibly misty image.
         */
        const document = await pdf(pdfPath, {
            scale: 5
        });

        const pages = [];

        let pageNumber = 1;

        for await (const image of document) {

            const outputPath = path.join(
                path.dirname(pdfPath),
                `${path.basename(
                    pdfPath,
                    path.extname(pdfPath)
                )}-ocr-page-${pageNumber}.png`
            );

            fs.writeFileSync(outputPath, image);

            console.log(
                `Generated OCR page image: ${outputPath}`
            );

            pages.push({
                page: pageNumber,
                imagePath: outputPath
            });

            pageNumber++;
        }


        let combinedText = "";
        let totalConfidence = 0;


        for (const page of pages) {

            console.log(
                `Running OCR on page ${page.page}...`
            );

            const result =
                await OcrService.extractFromImage(
                    page.imagePath
                );

            combinedText +=
                `\n--- PAGE ${page.page} ---\n`;

            combinedText += result.text;

            totalConfidence += result.confidence;
        }


        const averageConfidence =
            pages.length > 0
                ? totalConfidence / pages.length
                : 0;


        return {
            text: combinedText.trim(),
            confidence: averageConfidence,
            pages
        };
    }
}


module.exports = OcrService;