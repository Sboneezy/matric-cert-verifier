const fs = require("fs");
const { PDFParse } = require("pdf-parse");

class TextExtractor {
    async extract(document) {
        if (!document) {
            throw new Error("A document is required.");
        }
        if (!document.path) {
            throw new Error("Document path is required.");
        }

        const buffer = fs.readFileSync(document.path);
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        return result.text;
    }
}

module.exports = TextExtractor;