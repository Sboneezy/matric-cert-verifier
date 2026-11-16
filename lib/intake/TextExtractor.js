"use strict";

const fs = require("fs");
const { PDFParse } = require("pdf-parse");

/**
 * TextExtractor
 * Extracts the embedded text layer from a PDF using pdf-parse v2.
 * Returns empty string when the PDF has no text layer (scanned),
 * so IntakePipeline falls back to OCR.
 */
class TextExtractor {

    async extract(document) {
        if (!document) throw new Error("A document is required.");
        if (!document.path) throw new Error("Document path is required.");

        const extension = (document.extension || "").toLowerCase();

        // Images have no text layer — go straight to OCR
        if ([".jpg", ".jpeg", ".png", ".tiff", ".tif"].includes(extension)) {
            return "";
        }

        // pdf-parse v2: pass the file path via the `url` option (works for local paths too)
        const parser = new PDFParse({ url: document.path, verbosity: 0 });
        const result = await parser.getText();
        return (result && result.text) ? result.text : "";
    }
}

module.exports = TextExtractor;
