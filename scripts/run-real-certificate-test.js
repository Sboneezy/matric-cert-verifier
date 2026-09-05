/**
 * Real Certificate OCR Test Harness
 * 
 * This script is designed to systematically test the OCR pipeline
 * against real-world certificate images. It accepts multiple input
 * files and produces a comparison report.
 * 
 * Usage:
 *   node scripts/run-real-certificate-test.js <path-to-certificate-images>
 * 
 * The script will:
 * 1. Find all images/PDFs in the directory
 * 2. Run OCR on each with multiple strategies
 * 3. Compare extraction quality
 * 4. Generate a report
 */

const fs = require("fs");
const path = require("path");
const DocumentClassifier = require("../lib/ocr/DocumentClassifier");
const OcrService = require("../lib/ocr/OcrService");
const FieldExtractionEngine = require("../lib/ocr/FieldExtractionEngine");

class RealCertificateTestHarness {
    
    constructor() {
        this.ocrService = new OcrService();
        this.fieldExtractor = new FieldExtractionEngine();
        this.results = [];
    }
    
    async findTestFiles(dir) {
        const files = [];
        
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
                files.push(...await this.findTestFiles(fullPath));
            } else {
                const classification = DocumentClassifier.classify(fullPath);
                
                if (classification.type === "pdf" || classification.type === "image") {
                    files.push(fullPath);
                }
            }
        }
        
        return files;
    }
    
    async testFile(filePath) {
        console.log(`\n${"=".repeat(60)}`);
        console.log(`Testing: ${path.basename(filePath)}`);
        console.log(`${"=".repeat(60)}`);
        
        const classification = DocumentClassifier.classify(filePath);
        console.log(`Type: ${classification.type}`);
        console.log(`Strategy: ${classification.strategy}`);
        
        try {
            let result;
            const extension = path.extname(filePath).toLowerCase();
            
            if (extension === ".pdf") {
                result = await this.ocrService.extractFromPdf(filePath, {
                    useVoting: true
                });
            } else {
                result = await this.ocrService.extractFromImage(filePath, {
                    useVoting: true
                });
            }
            
            return {
                file: filePath,
                classification,
                result,
                success: true
            };
        } catch (error) {
            console.error(`Error processing ${filePath}:`, error.message);
            
            return {
                file: filePath,
                classification,
                error: error.message,
                success: false
            };
        }
    }
    
    async run(directory) {
        console.log("Real Certificate OCR Test Harness");
        console.log(`Test directory: ${directory}`);
        
        const files = await this.findTestFiles(directory);
        
        console.log(`\nFound ${files.length} test files`);
        
        for (const file of files) {
            const result = await this.testFile(file);
            this.results.push(result);
        }
        
        console.log(`\n${"=".repeat(60)}`);
        console.log("TEST REPORT");
        console.log(`${"=".repeat(60)}`);
        
        const successful = this.results.filter(r => r.success);
        const failed = this.results.filter(r => !r.success);
        
        console.log(`Total files: ${this.results.length}`);
        console.log(`Successful: ${successful.length}`);
        console.log(`Failed: ${failed.length}`);
        
        if (successful.length > 0) {
            console.log(`\n${"-".repeat(60)}`);
            console.log("SUCCESSFUL EXTRACTIONS");
            console.log(`${"-".repeat(60)}`);
            
            for (const result of successful) {
                console.log(`\nFile: ${path.basename(result.file)}`);
                
                if (result.result.fields) {
                    console.log("Extracted fields:");
                    
                    for (const [field, data] of Object.entries(result.result.fields)) {
                        console.log(`  ${field}: ${data.value} (${(data.confidence * 100).toFixed(1)}%)`);
                    }
                }
                
                if (result.result.ranked) {
                    console.log("\nVariant rankings:");
                    result.result.ranked.slice(0, 3).forEach((r, i) => {
                        console.log(`  ${i + 1}. ${r.variant}: ${r.confidence}%`);
                    });
                }
            }
        }
        
        if (failed.length > 0) {
            console.log(`\n${"-".repeat(60)}`);
            console.log("FAILED EXTRACTIONS");
            console.log(`${"-".repeat(60)}`);
            
            for (const result of failed) {
                console.log(`\nFile: ${path.basename(result.file)}`);
                console.log(`Error: ${result.error}`);
            }
        }
        
        await this.ocrService.terminate();
    }
}

async function main() {
    const targetDir = process.argv[2];
    
    if (!targetDir) {
        console.error("Please provide a directory containing certificate images/PDFs.");
        console.log("");
        console.log("Usage:");
        console.log("  node scripts/run-real-certificate-test.js <path-to-certificates>");
        process.exitCode = 1;
        return;
    }
    
    const dir = path.resolve(targetDir);
    
    if (!fs.existsSync(dir)) {
        console.error(`Directory not found: ${dir}`);
        process.exitCode = 1;
        return;
    }
    
    const harness = new RealCertificateTestHarness();
    
    try {
        await harness.run(dir);
    } catch (error) {
        console.error("Test harness failed:", error);
        process.exitCode = 1;
    }
}

main();
