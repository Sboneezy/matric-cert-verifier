"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const PDFDocument = require("pdfkit");
const request = require("supertest");

describe("Matric Verifier HTTP Integration", () => {
    let app;
    let db;
    let testDir;
    let pdfPath;
    let apiKey;

    const originalUploadDir = process.env.UPLOAD_DIR;
    const originalNodeEnv = process.env.NODE_ENV;

    beforeAll(async () => {
        testDir = fs.mkdtempSync(
            path.join(os.tmpdir(), "matric-verifier-integration-")
        );

        const uploadDir = path.join(testDir, "uploads");
        fs.mkdirSync(uploadDir, { recursive: true });

        pdfPath = path.join(testDir, "test-certificate.pdf");

        // Create a test PDF
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

        // Set environment before loading the app/routes
        process.env.NODE_ENV = "test";
        process.env.UPLOAD_DIR = uploadDir;

        // Load app and DB inside an isolated module context
        jest.isolateModules(() => {
            const DatabaseService = require("../../lib/database/DatabaseService");
            const createApp = require("../../app");

            db = new DatabaseService(
                path.join(testDir, "integration-test.sqlite")
            );

            apiKey = "test-integration-api-key";
            db.createApiKey(apiKey, "integration-test", "Jest integration key");

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

    test("accepts an authenticated certificate upload and persists records", async () => {
        const response = await request(app)
            .post("/api/v1/verify")
            .set("Authorization", `Bearer ${apiKey}`)
            .field("useOcrVoting", "false")
            .attach("certificate", pdfPath);

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.requestId).toBeDefined();
        expect(response.body.documentId).toBeDefined();
        expect(response.body.candidate).toBeDefined();
        expect(response.body.decision).toBeDefined();

        // Verify persistence in the isolated SQLite database
        const candidateCount = db.db
            .prepare("SELECT COUNT(*) AS count FROM candidates")
            .get().count;

        const documentCount = db.db
            .prepare("SELECT COUNT(*) AS count FROM documents")
            .get().count;

        const verificationCount = db.db
            .prepare("SELECT COUNT(*) AS count FROM verification_requests")
            .get().count;

        const verifyAuditCount = db.db
            .prepare("SELECT COUNT(*) AS count FROM audit_log WHERE action = 'VERIFY'")
            .get().count;

        expect(candidateCount).toBe(1);
        expect(documentCount).toBe(1);
        expect(verificationCount).toBe(1);
        expect(verifyAuditCount).toBe(1);

        // Verify the verification request links to the candidate
        const storedRequest = db.getVerificationRequest(
            response.body.requestId
        );

        expect(storedRequest).toBeDefined();
        expect(storedRequest.candidate_id).toBe(response.body.candidate.id);
    });
});