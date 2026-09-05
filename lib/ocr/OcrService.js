const fs = require("fs");
const path = require("path");
const DocumentClassifier = require("./DocumentClassifier");
const OcrPreprocessor = require("./OcrPreprocessor");
const OcrVotingEngine = require("./OcrVotingEngine");
const FieldExtractionEngine = require("./FieldExtractionEngine");

/**
 * OCR Service - Phase 2
 * Main entry point for OCR processing.
 */
class OcrService {
    
    constructor(options = {}) {
        this.votingEngine = new OcrVotingEngine(options);
        this.fieldExtractor = new FieldExtractionEngine();
    }
    
    async terminate() {
        await this.votingEngine.terminate();
    }
    
    async extractFromImage(imagePath, options = {}) {
        if (!imagePath) {
            throw new Error("Image path is required.");
        }
        
        if (!fs.existsSync(imagePath)) {
            throw new Error(`Image not found: ${imagePath}`);
        }
        
        console.log(`OCR processing image: ${imagePath}`);
        
        try {
            if (options.useVoting) {
                const result = await this.votingEngine.recogniseWithVariants(imagePath);
                
                const mergedText = OcrVotingEngine.mergeResults(result.results);
                const fields = this.fieldExtractor.extract(mergedText);
                
                return {
                    ...result,
                    mergedText,
                    fields,
                    strategy: "multi-pass-voting"
                };
            } else {
                const result = await this.votingEngine.recognise(imagePath);
                const fields = this.fieldExtractor.extract(result.text);
                
                return {
                    ...result,
                    fields,
                    strategy: "single-pass"
                };
            }
        } catch (error) {
            console.error("OCR extraction failed:", error);
            throw error;
        }
    }
    
    async extractFromPdf(pdfPath, options = {}) {
        if (!pdfPath) {
            throw new Error("PDF path is required.");
        }
        
        if (!fs.existsSync(pdfPath)) {
            throw new Error(`PDF not found: ${pdfPath}`);
        }
        
        const classification = DocumentClassifier.classify(pdfPath);
        
        if (classification.strategy === "unsupported") {
            throw new Error(`Unsupported document type: ${classification.extension}`);
        }
        
        console.log(`Rendering PDF for OCR: ${pdfPath}`);
        
        const { pdf } = await import("pdf-to-img");
        
        const scale = options.scale || 5;
        const document = await pdf(pdfPath, { scale });
        
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
            
            console.log(`Generated OCR page image: ${outputPath}`);
            
            pages.push({
                page: pageNumber,
                imagePath: outputPath
            });
            
            pageNumber++;
        }
        
        const pageResults = [];
        let combinedText = "";
        
        for (const page of pages) {
            console.log(`Running OCR on page ${page.page}...`);
            
            const result = await this.extractFromImage(
                page.imagePath,
                options
            );
            
            pageResults.push({
                ...page,
                ...result
            });
            
            combinedText += `\n--- PAGE ${page.page} ---\n`;
            combinedText += result.mergedText || result.text || "";
        }
        
        const fields = this.fieldExtractor.extract(combinedText);
        
        return {
            text: combinedText.trim(),
            pages: pageResults,
            fields,
            classification,
            strategy: options.useVoting ? "multi-pass-voting" : "single-pass"
        };
    }
    
    async extractWithVoting(imagePath) {
        return this.extractFromImage(imagePath, {
            useVoting: true
        });
    }
}

module.exports = OcrService;