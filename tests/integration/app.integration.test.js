
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const PDFDocument = require("pdfkit");
const request = require("supertest");

describe("Matric Verifier HTTP Integration", () => {
    let app;
    let db;
    let IntakePipeline;
    let testDir;
    let uploadDir;
    let pdfPath;
    let apiKey;

    const originalUploadDir = process.env.UPLOAD_DIR;
    const originalNodeEnv = process.env.NODE_ENV;

    beforeAll(async () => {
        testDir = fs.mkdtempSync(
            path.join(os.tmpdir(), "matric-verifier-integration-")
        );

        uploadDir = path.join(testDir, "uploads");
        fs.mkdirSync(uploadDir, { recursive: true });

        pdfPath = path.join(testDir, "test-certificate.pdf");

        // Create a genuine test PDF.
        await new Promise((resolve, reject) => {
            const pdf = new PDFDocument();
            const stream = fs.createWriteStream(pdfPath);

            pdf.pipe(stream);
            pdf.fontSize(12).text("Test Matric Certificate");
            pdf.text("SURNAME: NKOSI");
            pdf.text("FULL NAMES: JOHN PETER");
            pdf.text("ID NUMBER: 9201015009087");
            pdf.text("QUALIFICATION: NATIONAL SENIOR CERTIFICATE");
            pdf.text("YEAR: 2018");
            pdf.text("CERTIFICATE NUMBER: ABC123456");
            pdf.end();

            stream.on("finish", resolve);
            stream.on("error", reject);
        });

        // Set environment before loading the app/routes.
        process.env.NODE_ENV = "test";
        process.env.UPLOAD_DIR = uploadDir;

        // Load app, DB, and pipeline inside an isolated module context.
        jest.isolateModules(() => {
            const DatabaseService = require("../../lib/database/DatabaseService");
            IntakePipeline = require("../../lib/intake/IntakePipeline");
            const createApp = require("../../app");

            db = new DatabaseService(
                path.join(testDir, "integration-test.sqlite")
            );

            apiKey = "test-integration-api-key";

            db.createApiKey(
                apiKey,
                "integration-test",
                "Jest integration key"
            );

            app = createApp({ db });
        });
    });

    afterAll(() => {
        if (db) {
            db.close();
        }

        if (testDir && fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }

        if (originalUploadDir === undefined) {
            delete process.env.UPLOAD_DIR;
        } else {
            process.env.UPLOAD_DIR = originalUploadDir;
        }

        if (originalNodeEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = originalNodeEnv;
        }
    });

    test("rejects a request without an API key", async () => {
        const response = await request(app)
            .post("/api/v1/verify");

        expect(response.status).toBe(401);
    });

    test("rejects an invalid API key", async () => {
        const response = await request(app)
            .post("/api/v1/verify")
            .set("Authorization", "Bearer invalid-key");

        expect(response.status).toBe(401);
    });

    test("cleans up files and rolls back records when database persistence fails", async () => {
        const before = {
            candidates: db.db.prepare(
                "SELECT COUNT(*) AS count FROM candidates"
            ).get().count,

            documents: db.db.prepare(
                "SELECT COUNT(*) AS count FROM documents"
            ).get().count,

            verifications: db.db.prepare(
                "SELECT COUNT(*) AS count FROM verification_requests"
            ).get().count,

            audits: db.db.prepare(
                "SELECT COUNT(*) AS count FROM audit_log"
            ).get().count,
        };

        // Preserve the real implementation so the final audit insert
        // happens before the simulated failure is thrown.
        const originalLogAudit = db.logAudit.bind(db);

        let failureInjected = false;

        const logAuditSpy = jest
            .spyOn(db, "logAudit")
            .mockImplementation((...args) => {
                originalLogAudit(...args);

                // Fail only after the route's final VERIFY audit
                // has actually been inserted.
                if (
                    args[0] === "VERIFY" &&
                    args[1] === "verification_request"
                ) {
                    failureInjected = true;

                    throw new Error(
                        "Simulated database persistence failure"
                    );
                }
            });

        try {
            const response = await request(app)
                .post("/api/v1/verify")
                .set("Authorization", `Bearer ${apiKey}`)
                .field("useOcrVoting", "false")
                .attach("certificate", pdfPath);

            expect(response.status).toBe(500);

            // Confirm that the simulated failure happened at the
            // final VERIFY audit entry, not at an earlier database write.
            expect(failureInjected).toBe(true);

            // Verify all database records were rolled back.
            expect(
                db.db.prepare(
                    "SELECT COUNT(*) AS count FROM candidates"
                ).get().count
            ).toBe(before.candidates);

            expect(
                db.db.prepare(
                    "SELECT COUNT(*) AS count FROM documents"
                ).get().count
            ).toBe(before.documents);

            expect(
                db.db.prepare(
                    "SELECT COUNT(*) AS count FROM verification_requests"
                ).get().count
            ).toBe(before.verifications);

            expect(
                db.db.prepare(
                    "SELECT COUNT(*) AS count FROM audit_log"
                ).get().count
            ).toBe(before.audits);

            // Verify permanent and temporary upload files were cleaned up.
            expect(fs.readdirSync(uploadDir)).toEqual([]);
        } finally {
            logAuditSpy.mockRestore();
        }
    });

    test("cleans up files when the intake pipeline fails", async () => {
        const before = {
            candidates: db.db.prepare(
                "SELECT COUNT(*) AS count FROM candidates"
            ).get().count,

            documents: db.db.prepare(
                "SELECT COUNT(*) AS count FROM documents"
            ).get().count,

            verifications: db.db.prepare(
                "SELECT COUNT(*) AS count FROM verification_requests"
            ).get().count,

            audits: db.db.prepare(
                "SELECT COUNT(*) AS count FROM audit_log"
            ).get().count,
        };

        const processSpy = jest
            .spyOn(IntakePipeline.prototype, "process")
            .mockRejectedValue(
                new Error("Simulated intake pipeline failure")
            );

        try {
            const response = await request(app)
                .post("/api/v1/verify")
                .set("Authorization", `Bearer ${apiKey}`)
                .field("useOcrVoting", "false")
                .attach("certificate", pdfPath);

            expect(response.status).toBe(500);

            // Verify no database records were created.
            expect(
                db.db.prepare(
                    "SELECT COUNT(*) AS count FROM candidates"
                ).get().count
            ).toBe(before.candidates);

            expect(
                db.db.prepare(
                    "SELECT COUNT(*) AS count FROM documents"
                ).get().count
            ).toBe(before.documents);

            expect(
                db.db.prepare(
                    "SELECT COUNT(*) AS count FROM verification_requests"
                ).get().count
            ).toBe(before.verifications);

            expect(
                db.db.prepare(
                    "SELECT COUNT(*) AS count FROM audit_log"
                ).get().count
            ).toBe(before.audits);

            // Both Multer's temporary file and the permanent secure
            // upload must be removed after pipeline failure.
            expect(fs.readdirSync(uploadDir)).toEqual([]);
        } finally {
            processSpy.mockRestore();
        }
    });

    test("accepts an authenticated certificate upload and persists records", async () => {
        const response = await request(app)
            .post("/api/v1/verify")
            .set("Authorization", `Bearer ${apiKey}`)
            .field("useOcrVoting", "false")
            .attach("certificate", pdfPath);

        expect(response.status).toBe(201);

        // Verify the verification request links to the candidate.
        const storedRequest = db.getVerificationRequest(
            response.body.requestId
        );

        expect(storedRequest).toBeDefined();
        expect(storedRequest.candidate_id).toBe(
            response.body.candidate.id
        );

        // Verify the permanent certificate is retained.
        const storedDocument = db.db
            .prepare("SELECT file_path FROM documents WHERE id = ?")
            .get(response.body.documentId);

        expect(storedDocument).toBeDefined();
        expect(fs.existsSync(storedDocument.file_path)).toBe(true);

        // Verify Multer's temporary upload file was removed.
        const remainingFiles = fs.readdirSync(uploadDir);

        expect(remainingFiles).toEqual([
            path.basename(storedDocument.file_path)
        ]);
    });
});
