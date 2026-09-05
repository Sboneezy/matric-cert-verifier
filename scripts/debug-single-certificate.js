/**
 * Single Certificate OCR Debug Test
 * 
 * Runs OCR on a single certificate image/PDF with detailed output
 * showing each preprocessing variant's results side by side.
 */

const fs = require("fs");
const path = require("path");
const OcrPreprocessor = require("../lib/ocr/OcrPreprocessor");
const OcrVotingEngine = require("../lib/ocr/OcrVotingEngine");
const FieldExtractionEngine = require("../lib/ocr/FieldExtractionEngine");

async function main() {
    const inputPath = process.argv[2];
    
    if (!inputPath) {
        console.error("Please provide a certificate image/PDF path.");
        process.exitCode = 1;
        return;
    }
    
    const resolvedPath = path.resolve(inputPath);
    
    if (!fs.existsSync(resolvedPath)) {
        console.error(`File not found: ${resolvedPath}`);
        process.exitCode = 1;
        return;
    }
    
    console.log("Single Certificate OCR Debug Test");
    console.log(`File: ${resolvedPath}`);
    
    const votingEngine = new OcrVotingEngine();
    const fieldExtractor = new FieldExtractionEngine();
    
    try {
        const result = await votingEngine.recogniseWithVariants(resolvedPath);
        
        console.log(`\n${"=".repeat(60)}`);
        console.log("OCR RESULTS BY VARIANT");
        console.log(`${"=".repeat(60)}`);
        
        for (const r of result.ranked) {
            console.log(`\n${r.variant}: ${r.confidence}%`);
            console.log(`${"-".repeat(40)}`);
            console.log(r.text || "(no text)");
        }
        
        const mergedText = OcrVotingEngine.mergeResults(result.results);
        
        console.log(`\n${"=".repeat(60)}`);
        console.log("MERGED TEXT");
        console.log(`${"=".repeat(60)}`);
        console.log(mergedText || "(no text)");
        
        console.log(`\n${"=".repeat(60)}`);
        console.log("EXTRACTED FIELDS");
        console.log(`${"=".repeat(60)}`);
        
        const fields = fieldExtractor.extract(mergedText);
        
        if (Object.keys(fields).length === 0) {
            console.log("No fields extracted.");
        } else {
            for (const [field, data] of Object.entries(fields)) {
                console.log(`${field}: ${data.value}`);
                console.log(`  Confidence: ${(data.confidence * 100).toFixed(1)}%`);
                console.log(`  Source: ${data.source}`);
                console.log(`  Description: ${data.description}`);
            }
        }
        
    } finally {
        await votingEngine.terminate();
    }
}

main().catch(error => {
    console.error("Debug test failed:", error);
    process.exitCode = 1;
});
