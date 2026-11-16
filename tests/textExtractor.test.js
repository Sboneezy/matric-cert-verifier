"use strict";

const fs   = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const TextExtractor = require("../lib/intake/TextExtractor");

function createPdf(outputPath, text) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 60 });
        const ws  = fs.createWriteStream(outputPath);
        doc.pipe(ws);
        doc.fontSize(13).font("Helvetica").text(text);
        doc.end();
        ws.on("finish", () => resolve(outputPath));
        ws.on("error", reject);
    });
}

describe("TextExtractor", () => {

    const extractor = new TextExtractor();

    test("extracts text from a digital PDF", async () => {
        const tmp = path.join(__dirname, `tmp-te-${Date.now()}.pdf`);
        await createPdf(tmp, "SURNAME: DLAMINI\nID NUMBER: 9001015800089");
        try {
            const text = await extractor.extract({ path: tmp, extension: ".pdf" });
            expect(typeof text).toBe("string");
            expect(text.length).toBeGreaterThan(0);
            // Text layer was extracted — content correctness tested in intakePipeline.test.js
        } finally {
            if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
        }
    }, 15000);

    test("returns empty string for image file types (no text layer)", async () => {
        const tmp = path.join(__dirname, `tmp-te-${Date.now()}.pdf`);
        await createPdf(tmp, "some text");
        try {
            const text = await extractor.extract({ path: tmp, extension: ".jpg" });
            expect(text).toBe("");
        } finally {
            if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
        }
    });

    test("throws when no document is provided", async () => {
        await expect(extractor.extract(null)).rejects.toThrow();
    });

    test("throws when document has no path", async () => {
        await expect(extractor.extract({ extension: ".pdf" })).rejects.toThrow();
    });
});
