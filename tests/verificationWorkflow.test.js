"use strict";

const fs   = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const IntakePipeline       = require("../lib/intake/IntakePipeline");
const VerificationWorkflow = require("../lib/services/VerificationWorkflow");
const { getProvider }      = require("../lib/providers/ProviderRegistry");

// ── helper ────────────────────────────────────────────────────────────

function createSamplePdf(outputPath) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 60 });
        const ws  = fs.createWriteStream(outputPath);
        doc.pipe(ws);
        doc.fontSize(13).font("Helvetica");
        doc.text("SURNAME: NKOSI");
        doc.moveDown(0.3);
        doc.text("FULL NAMES: JOHN PETER");
        doc.moveDown(0.3);
        doc.text("ID NUMBER: 9201015009087");
        doc.moveDown(0.3);
        doc.text("QUALIFICATION: NATIONAL SENIOR CERTIFICATE");
        doc.moveDown(0.3);
        doc.text("YEAR: 2018");
        doc.end();
        ws.on("finish", () => resolve(outputPath));
        ws.on("error", reject);
    });
}

// ── tests ─────────────────────────────────────────────────────────────

describe("VerificationWorkflow", () => {

    const TMP = path.join(__dirname, `tmp-workflow-${Date.now()}.pdf`);

    beforeAll(() => createSamplePdf(TMP));
    afterAll(() => { if (fs.existsSync(TMP)) fs.unlinkSync(TMP); });

    test("processes a certificate and creates a verification job", async () => {
        const pipeline   = new IntakePipeline();
        const provider   = getProvider("umalusi");

        const intakeResult = await pipeline.process(TMP);

        // Intake checks
        expect(intakeResult.candidate.surname).toBe("NKOSI");
        expect(intakeResult.decision.status).toBe("Ready");

        // Create the job
        const job = VerificationWorkflow.createJobFromIntake(intakeResult, provider);

        expect(job.id).toBeDefined();
        expect(job.status).toBe("Pending");
        expect(job.provider.id).toBe("umalusi");
        expect(job.candidate.surname).toBe("NKOSI");
        expect(job.candidate.fullNames).toBe("JOHN PETER");
        expect(job.candidate.idNumber).toBe("9201015009087");
    }, 30000);

    test("throws when no intake result is provided", () => {
        const provider = getProvider("umalusi");
        expect(() => VerificationWorkflow.createJobFromIntake(null, provider)).toThrow();
    });

    test("throws when no provider is provided", async () => {
        const pipeline     = new IntakePipeline();
        const intakeResult = await pipeline.process(TMP);
        expect(() => VerificationWorkflow.createJobFromIntake(intakeResult, null)).toThrow();
    }, 30000);
});
