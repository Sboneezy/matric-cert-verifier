const fs = require("fs");
const path = require("path");

const DocumentLoader = require("../lib/intake/DocumentLoader");
const TextExtractor = require("../lib/intake/TextExtractor");

const loader = new DocumentLoader();
const extractor = new TextExtractor();

// Create a temporary sample PDF
const samplePath = path.join(__dirname, "sample.pdf");
fs.writeFileSync(samplePath, "Fake PDF");

// Load document
const document = loader.load(samplePath);

console.log("Document Loaded:");
console.log(document);

// Extract text
const text = extractor.extract(document);

console.log("\n========== RAW TEXT ==========");
console.log(text);

// Cleanup
fs.unlinkSync(samplePath);

console.log("\n✅ TextExtractor test passed");