const path = require("path");
const OcrService = require("../lib/ocr/OcrService");

async function main() {
    const suppliedPath = process.argv[2];
    
    if (!suppliedPath) {
        console.error("Please provide an image or PDF path.");
        console.log("");
        console.log("Usage:");
        console.log("  node scripts/test-ocr-pipeline.js <path-to-image-or-pdf>");
        console.log("");
        console.log("Options:");
        console.log("  --voting     Use multi-pass OCR with voting");
        console.log("  --scale=N    Set rendering scale for PDFs (default: 5)");
        process.exitCode = 1;
        return;
    }
    
    const inputPath = path.resolve(suppliedPath);
    const options = {
        useVoting: process.argv.includes("--voting")
    };
    
    const scaleArg = process.argv.find(arg => arg.startsWith("--scale="));
    if (scaleArg) {
        options.scale = parseInt(scaleArg.split("=")[1]);
    }
    
    console.log("================================");
    console.log("OCR PIPELINE TEST");
    console.log("================================");
    console.log(`Input: ${inputPath}`);
    console.log(`Voting: ${options.useVoting ? "Enabled" : "Disabled"}`);
    if (options.scale) {
        console.log(`Scale: ${options.scale}`);
    }
    
    const service = new OcrService();
    
    try {
        const extension = path.extname(inputPath).toLowerCase();
        
        let result;
        
        if (extension === ".pdf") {
            result = await service.extractFromPdf(inputPath, options);
        } else {
            result = await service.extractFromImage(inputPath, options);
        }
        
        console.log("");
        console.log("================================");
        console.log("RESULTS");
        console.log("================================");
        
        console.log(`Strategy: ${result.strategy}`);
        
        if (result.classification) {
            console.log(`Document type: ${result.classification.type}`);
            console.log(`Extension: ${result.classification.extension}`);
        }
        
        console.log("");
        console.log("-------------------------------");
        console.log("EXTRACTED FIELDS");
        console.log("-------------------------------");
        
        if (result.fields && Object.keys(result.fields).length > 0) {
            for (const [field, data] of Object.entries(result.fields)) {
                console.log(`${field}: ${data.value} (${(data.confidence * 100).toFixed(1)}% confidence)`);
                console.log(`  Source: ${data.source}`);
                console.log(`  Method: ${data.description}`);
            }
        } else {
            console.log("No fields extracted.");
        }
        
        console.log("");
        console.log("-------------------------------");
        console.log("OCR TEXT");
        console.log("-------------------------------");
        console.log(result.mergedText || result.text || "(no text detected)");
        
        if (result.ranked && result.ranked.length > 0) {
            console.log("");
            console.log("-------------------------------");
            console.log("VARIANT RANKING");
            console.log("-------------------------------");
            
            result.ranked.forEach((r, i) => {
                console.log(`${i + 1}. ${r.variant}: ${r.confidence}%`);
            });
        }
        
    } catch (error) {
        console.error("");
        console.error("OCR PIPELINE FAILED");
        console.error(error);
        process.exitCode = 1;
    } finally {
        await service.terminate();
    }
}

main();