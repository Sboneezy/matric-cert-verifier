const fs = require("fs");
const path = require("path");

const DocumentLoader = require("../lib/intake/DocumentLoader");

const loader = new DocumentLoader();

// Create a fake PDF
const samplePath = path.join(__dirname, "sample.pdf");
fs.writeFileSync(samplePath, "Fake PDF Content");

// Load it
const document = loader.load(samplePath);

console.log("Document Loaded");
console.log(document);

// Delete temporary file
fs.unlinkSync(samplePath);