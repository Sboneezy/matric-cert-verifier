"use strict";

const fs   = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const IntakePipeline = require("../lib/intake/IntakePipeline");

// ── helpers ───────────────────────────────────────────────────────────

function createSamplePdf(outputPath, fields = {}) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 60 });
        const ws  = fs.createWriteStream(outputPath);
        doc.pipe(ws);
        doc.fontSize(13).font("Helvetica");
        doc.text(`SURNAME: ${fields.surname      || "NKOSI"}`);
        doc.moveDown(0.3);
        doc.text(`FULL NAMES: ${fields.fullNames || "JOHN PETER"}`);
        doc.moveDown(0.3);
        doc.text(`ID NUMBER: ${fields.idNumber   || "9201015009087"}`);
        doc.moveDown(0.3);
        doc.text(`QUALIFICATION: ${fields.qualification || "NATIONAL SENIOR CERTIFICATE"}`);
        doc.moveDown(0.3);
        doc.text(`YEAR: ${fields.year            || "2018"}`);
        doc.end();
        ws.on("finish", () => resolve(outputPath));
        ws.on("error", reject);
    });
}

// ── tests ─────────────────────────────────────────────────────────────

describe("IntakePipeline", () => {

    const TMP = path.join(__dirname, `tmp-intake-${Date.now()}.pdf`);

    beforeAll(() => createSamplePdf(TMP));
    afterAll(() => { if (fs.existsSync(TMP)) fs.unlinkSync(TMP); });

    test("returns a candidate and decision object", async () => {
        const pipeline = new IntakePipeline();
        const result   = await pipeline.process(TMP);

        expect(result).toBeDefined();
        expect(result.candidate).toBeDefined();
        expect(result.decision).toBeDefined();
    }, 30000);

    test("extracts candidate fields from the PDF text layer", async () => {
        const pipeline = new IntakePipeline();
        const result   = await pipeline.process(TMP);
        const { candidate } = result;

        expect(candidate.surname).toBe("NKOSI");
        expect(candidate.fullNames).toBe("JOHN PETER");
        expect(candidate.idNumber).toBe("9201015009087");
        expect(candidate.qualificationYear).toBe(2018);
    }, 30000);

    test("routes post-1992 qualification to Umalusi with Ready status", async () => {
        const pipeline = new IntakePipeline();
        const result   = await pipeline.process(TMP);
        const { decision } = result;

        expect(decision.provider).toBe("Umalusi");
        expect(decision.status).toBe("Ready");
        expect(decision.errors).toHaveLength(0);
    }, 30000);

    test("uses text-layer strategy for a digital PDF", async () => {
        const pipeline = new IntakePipeline();
        const result   = await pipeline.process(TMP);

        expect(result.strategy).toBe("text-layer");
    }, 30000);

    test("throws when the file does not exist", async () => {
        const pipeline = new IntakePipeline();
        await expect(pipeline.process("/no/such/file.pdf")).rejects.toThrow();
    }, 10000);
});
