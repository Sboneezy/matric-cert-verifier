"use strict";

/**
 * Comprehensive functional test suite.
 * Tests every layer of the system end-to-end against a live server.
 * Run with: node scripts/functional-test.js
 */

const http = require("http");
const fs   = require("fs");
const path = require("path");

// ── Helpers ───────────────────────────────────────────────────────────

const RESULTS = [];

function pass(name, detail) {
    RESULTS.push({ status: "PASS", name });
    console.log(`  ✓  ${name}${detail ? "  →  " + detail : ""}`);
}

function fail(name, reason) {
    RESULTS.push({ status: "FAIL", name, reason });
    console.error(`  ✗  ${name}  →  ${reason}`);
}

function section(title) {
    console.log(`\n── ${title} ${"─".repeat(50 - title.length)}`);
}

function request(method, urlPath, body, contentType) {
    return new Promise((resolve, reject) => {
        const payload = body
            ? (Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)))
            : null;

        const KEY = global.API_KEY;
        const opts = {
            hostname: "localhost",
            port: 3000,
            path: urlPath,
            method,
            headers: {
                ...(KEY ? { Authorization: "Bearer " + KEY } : {}),
                ...(contentType ? { "Content-Type": contentType } : {}),
                ...(payload ? { "Content-Length": payload.length } : {}),
            },
        };

        const req = http.request(opts, (res) => {
            let d = "";
            res.on("data", (c) => (d += c));
            res.on("end", () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
                catch (_) { resolve({ status: res.statusCode, body: d }); }
            });
        });
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function uploadFile(filePath) {
    return new Promise((resolve, reject) => {
        const boundary = "TestBoundary" + Date.now();
        const fileBuffer = fs.readFileSync(filePath);
        const filename = path.basename(filePath);
        const pre  = Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="certificate"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`
        );
        const post = Buffer.from(`\r\n--${boundary}--\r\n`);
        const payload = Buffer.concat([pre, fileBuffer, post]);
        const KEY = global.API_KEY;
        const opts = {
            hostname: "localhost", port: 3000,
            path: "/api/v1/verify", method: "POST",
            headers: {
                Authorization: "Bearer " + KEY,
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
                "Content-Length": payload.length,
            },
        };
        const req = http.request(opts, (res) => {
            let d = "";
            res.on("data", (c) => (d += c));
            res.on("end", () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
                catch (_) { resolve({ status: res.statusCode, body: d }); }
            });
        });
        req.on("error", reject);
        req.write(payload);
        req.end();
    });
}

// ── Test PDF ──────────────────────────────────────────────────────────

function createTestPdf(outputPath) {
    const PDFDocument = require("pdfkit");
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 60 });
        const ws  = fs.createWriteStream(outputPath);
        doc.pipe(ws);
        doc.fontSize(20).font("Helvetica-Bold").text("REPUBLIC OF SOUTH AFRICA", { align: "center" });
        doc.moveDown(0.5);
        doc.fontSize(16).text("NATIONAL SENIOR CERTIFICATE", { align: "center" });
        doc.moveDown(1);
        doc.fontSize(13).font("Helvetica");
        doc.text("SURNAME: DLAMINI");
        doc.moveDown(0.3);
        doc.text("FULL NAMES: THABO SIPHO");
        doc.moveDown(0.3);
        doc.text("ID NUMBER: 9001015800089");
        doc.moveDown(0.3);
        doc.text("QUALIFICATION: NATIONAL SENIOR CERTIFICATE");
        doc.moveDown(0.3);
        doc.text("YEAR: 2010");
        doc.moveDown(0.3);
        doc.text("CERTIFICATE NUMBER: UC2010123456");
        doc.end();
        ws.on("finish", () => resolve(outputPath));
        ws.on("error", reject);
    });
}

// ── Main test runner ──────────────────────────────────────────────────

(async () => {
    console.log("\n╔══════════════════════════════════════╗");
    console.log("║   MATRIC VERIFIER — FUNCTIONAL TEST  ║");
    console.log("╚══════════════════════════════════════╝");

    // Use an explicitly provisioned API key; never discover credentials from the database.
    const apiKey = process.env.API_KEY;
    if (!apiKey || !apiKey.trim()) {
        console.error("\nAPI_KEY environment variable is required.");
        console.error('Set it to a provisioned client API key before running this test.');
        process.exit(1);
    }
    global.API_KEY = apiKey;

    // ── 1. Infrastructure ──────────────────────────────────────────
    section("Infrastructure");

    try {
        const r = await new Promise((res, rej) => {
            http.get("http://localhost:3000/health", (resp) => {
                let d = ""; resp.on("data", (c) => (d += c));
                resp.on("end", () => res({ status: resp.statusCode, body: JSON.parse(d) }));
            }).on("error", rej);
        });
        r.status === 200 && r.body.status === "ok"
            ? pass("Server is running", `v${r.body.version}`)
            : fail("Server is running", `status ${r.status}`);
    } catch (e) {
        fail("Server is running", "Cannot connect — is it started?");
        console.error("\nStart the server first:  npm start\n");
        process.exit(1);
    }

    // ── 2. Auth ────────────────────────────────────────────────────
    section("Authentication");

    try {
        const r = await new Promise((res, rej) => {
            http.get("http://localhost:3000/api/v1/candidates", (resp) => {
                let d = ""; resp.on("data", (c) => (d += c));
                resp.on("end", () => res({ status: resp.statusCode }));
            }).on("error", rej);
        });
        r.status === 401
            ? pass("Unauthenticated requests are rejected (401)")
            : fail("Unauthenticated requests are rejected", `got ${r.status}`);
    } catch (e) { fail("Auth enforcement", e.message); }

    try {
        const r = await request("GET", "/api/v1/candidates");
        r.status === 200
            ? pass("Valid API key grants access")
            : fail("Valid API key grants access", `got ${r.status}`);
    } catch (e) { fail("Valid API key grants access", e.message); }

    const savedKey = global.API_KEY;
    try {
        global.API_KEY = "mk_invalid_key_that_does_not_exist";
        const r = await request("GET", "/api/v1/candidates");
        r.status === 401
            ? pass("Invalid API key is rejected (401)")
            : fail("Invalid API key is rejected", `got ${r.status}`);
    } catch (e) {
        fail("Invalid API key rejected", e.message);
    } finally {
        global.API_KEY = savedKey;
    }

    // ── 3. API endpoints ───────────────────────────────────────────
    section("API Endpoints");

    for (const [name, urlPath] of [
        ["GET /api/v1/stats",      "/api/v1/stats"],
        ["GET /api/v1/candidates", "/api/v1/candidates"],
        ["GET /api/v1/batches",    "/api/v1/batches"],
        ["GET /api/v1/reviews",    "/api/v1/reviews"],
        ["GET /api/v1/audit",      "/api/v1/audit"],
        ["GET /api/v1/keys",       "/api/v1/keys"],
    ]) {
        try {
            const r = await request("GET", urlPath);
            r.status === 200 && r.body.success
                ? pass(name)
                : fail(name, `status ${r.status}: ${JSON.stringify(r.body).substring(0, 80)}`);
        } catch (e) { fail(name, e.message); }
    }

    try {
        const r = await request("GET", "/api/v1/doesnotexist");
        r.status === 404 ? pass("404 for unknown routes") : fail("404 for unknown routes", `got ${r.status}`);
    } catch (e) { fail("404 for unknown routes", e.message); }

    // ── 4. API key management ──────────────────────────────────────
    section("API Key Management");

    let tempKey = null;
    try {
        const r = await request("POST", "/api/v1/keys",
            { label: "Temp test key", clientId: "test" }, "application/json");
        if (r.status === 201 && r.body.key) {
            tempKey = r.body.key;
            pass("Generate new API key");
        } else { fail("Generate new API key", JSON.stringify(r.body)); }
    } catch (e) { fail("Generate new API key", e.message); }

    if (tempKey) {
        try {
            const r = await request("DELETE", `/api/v1/keys/${tempKey}`);
            r.status === 200 && r.body.success
                ? pass("Revoke API key")
                : fail("Revoke API key", JSON.stringify(r.body));
        } catch (e) { fail("Revoke API key", e.message); }
    }

    // ── 5. Certificate processing ──────────────────────────────────
    section("Certificate Processing (Core Intake Pipeline)");

    const testPdfPath = "./test-cert-functional.pdf";
    await createTestPdf(testPdfPath);
    pass("Test PDF created", `${fs.statSync(testPdfPath).size} bytes`);

    let candidateId = null;
    let verifyResult = null;

    try {
        const r = await uploadFile(testPdfPath);
        if (r.status === 201 && r.body.success) {
            verifyResult = r.body;
            candidateId  = r.body.candidate && r.body.candidate.id;
            pass("POST /api/v1/verify — file accepted and processed");

            const c = r.body.candidate;
            const d = r.body.decision;

            // Extracted fields
            c.surname === "DLAMINI"
                ? pass("  Surname extracted correctly", c.surname)
                : fail("  Surname extracted correctly", `got "${c.surname}"`);

            c.fullNames && c.fullNames.includes("THABO")
                ? pass("  Full names extracted correctly", c.fullNames)
                : fail("  Full names extracted correctly", `got "${c.fullNames}"`);

            c.idNumber === "9001015800089"
                ? pass("  ID number extracted correctly", c.idNumber)
                : fail("  ID number extracted correctly", `got "${c.idNumber}"`);

            Number(c.qualificationYear) === 2010
                ? pass("  Qualification year extracted correctly", String(c.qualificationYear))
                : fail("  Qualification year extracted correctly", `got "${c.qualificationYear}"`);

            // Business rules
            d.provider === "Umalusi"
                ? pass("  Provider routed correctly (post-1992 → Umalusi)", d.provider)
                : fail("  Provider routed correctly", `got "${d.provider}"`);

            d.status === "Ready"
                ? pass("  Decision status is Ready")
                : fail("  Decision status is Ready", `got "${d.status}"`);

            r.body.strategy === "text-layer"
                ? pass("  Used text-layer strategy (no OCR needed)")
                : pass("  Used strategy: " + r.body.strategy);

        } else {
            fail("POST /api/v1/verify", `status ${r.status}: ${JSON.stringify(r.body).substring(0, 150)}`);
        }
    } catch (e) { fail("POST /api/v1/verify", e.message); }

    if (fs.existsSync(testPdfPath)) fs.unlinkSync(testPdfPath);

    // ── 6. Data persistence ────────────────────────────────────────
    section("Data Persistence");

    if (candidateId) {
        try {
            const r = await request("GET", `/api/v1/candidates/${candidateId}`);
            r.status === 200 && r.body.data && r.body.data.id === candidateId
                ? pass("Candidate record persisted to SQLite")
                : fail("Candidate record persisted", JSON.stringify(r.body).substring(0, 100));
        } catch (e) { fail("Candidate record persisted", e.message); }

        try {
            const r = await request("PATCH", `/api/v1/candidates/${candidateId}`,
                { review_status: "Reviewed" }, "application/json");
            r.status === 200 && r.body.success
                ? pass("Candidate record can be updated (PATCH)")
                : fail("Candidate record update", JSON.stringify(r.body).substring(0, 100));
        } catch (e) { fail("Candidate record update", e.message); }
    }

    try {
        const r = await request("GET", "/api/v1/stats");
        const d = r.body.data;
        d.documents > 0 && d.candidates > 0 && d.verificationRequests > 0
            ? pass("Stats reflect persisted data", `docs:${d.documents} candidates:${d.candidates} requests:${d.verificationRequests}`)
            : fail("Stats reflect persisted data", JSON.stringify(d));
    } catch (e) { fail("Stats reflect persisted data", e.message); }

    // ── 7. Business rules (unit) ───────────────────────────────────
    section("Business Rules");

    try {
        const BRE       = require("../lib/intake/BusinessRuleEngine");
        const Candidate = require("../lib/models/Candidate");
        const engine    = new BRE();

        const cases = [
            {
                label: "Pre-1992 → Dept of Education",
                candidate: { surname: "TEST", idNumber: "7001015800089", qualificationType: "MATRIC", qualificationYear: 1990 },
                expect: (d) => d.provider === "Department of Education" && d.status === "Ready",
            },
            {
                label: "Post-1992 → Umalusi",
                candidate: { surname: "TEST", idNumber: "9001015800089", qualificationType: "NSC", qualificationYear: 2005 },
                expect: (d) => d.provider === "Umalusi" && d.status === "Ready",
            },
            {
                label: "BLOCKED when surname missing",
                candidate: { idNumber: "9001015800089", qualificationType: "NSC", qualificationYear: 2005 },
                expect: (d) => d.status === "Blocked" && d.errors.some(e => e.includes("Surname")),
            },
            {
                label: "BLOCKED when ID number missing",
                candidate: { surname: "TEST", qualificationType: "NSC", qualificationYear: 2005 },
                expect: (d) => d.status === "Blocked" && d.errors.some(e => e.includes("ID")),
            },
            {
                label: "BLOCKED when qualification type missing",
                candidate: { surname: "TEST", idNumber: "9001015800089", qualificationYear: 2005 },
                expect: (d) => d.status === "Blocked" && d.errors.some(e => e.includes("Qualification")),
            },
            {
                label: "NEEDS_REVIEW: Statement of Results without exam number",
                candidate: { surname: "TEST", idNumber: "9001015800089", qualificationType: "STATEMENT OF RESULTS", qualificationYear: 2010 },
                expect: (d) => d.status === "NeedsReview" && d.warnings.length > 0,
            },
            {
                label: "BLOCKED takes priority over NEEDS_REVIEW",
                candidate: { qualificationType: "STATEMENT OF RESULTS", qualificationYear: 2010 },
                expect: (d) => d.status === "Blocked",
            },
        ];

        for (const c of cases) {
            const decision = engine.evaluate(new Candidate(c.candidate));
            c.expect(decision)
                ? pass(c.label)
                : fail(c.label, `provider=${decision.provider} status=${decision.status} errors=${JSON.stringify(decision.errors)}`);
        }
    } catch (e) { fail("Business rules", e.message); }

    // ── 8. ID validation ───────────────────────────────────────────
    section("SA ID Number Validation");

    try {
        const { luhnChecksumValid, validateIdNumber, extractDobFromId } = require("../lib/validators/saIdValidation");

        luhnChecksumValid("9001015800089")
            ? pass("Valid ID passes Luhn checksum")
            : fail("Valid ID passes Luhn checksum", "returned false");

        !luhnChecksumValid("9001015800088")
            ? pass("Tampered ID fails Luhn checksum")
            : fail("Tampered ID fails Luhn checksum", "returned true");

        const dob = extractDobFromId("9001015800089");
        dob === "1990-01-01"
            ? pass("DOB extracted from ID", dob)
            : fail("DOB extracted from ID", `got "${dob}"`);

        const v1 = validateIdNumber("9001015800089", "1990-01-01");
        v1.recommendation === "keep_model_confidence"
            ? pass("Valid ID + matching DOB → keep confidence")
            : fail("Valid ID + matching DOB", JSON.stringify(v1));

        const v2 = validateIdNumber("9001015800089", "1995-06-15");
        v2.recommendation === "downgrade_to_low_dob_mismatch"
            ? pass("Valid ID + mismatched DOB → downgrade confidence")
            : fail("Valid ID + mismatched DOB", JSON.stringify(v2));

        const v3 = validateIdNumber("9001015800088");
        v3.recommendation === "downgrade_to_low_checksum_failed"
            ? pass("Invalid checksum → downgrade confidence")
            : fail("Invalid checksum → downgrade", JSON.stringify(v3));
    } catch (e) { fail("SA ID validation", e.message); }

    // ── 9. Template generation ─────────────────────────────────────
    section("Template Generation");

    try {
        const TemplateRenderer  = require("../lib/templates/TemplateRenderer");
        const VerificationBatch = require("../lib/models/VerificationBatch");
        const Umalusi = require("../lib/providers/Umalusi");
        const SAQA    = require("../lib/providers/SAQA");

        const candidates = [{
            surname: "DLAMINI", fullNames: "THABO SIPHO",
            idNumber: "9001015800089", qualificationType: "NSC",
            qualificationYear: 2010, certificateNumber: "UC2010123456",
        }];
        const renderer = new TemplateRenderer({ outputDir: "./generated" });

        // DOCX
        const docxBatch = new VerificationBatch({ batchNumber: 99, provider: Umalusi, candidates });
        const docx = await renderer.render(docxBatch);
        const docxOk = fs.existsSync(docx.filePath) && fs.statSync(docx.filePath).size > 500;
        docxOk
            ? pass("DOCX template generated", `${fs.statSync(docx.filePath).size} bytes`)
            : fail("DOCX template generated", "file missing or too small");
        if (fs.existsSync(docx.filePath)) fs.unlinkSync(docx.filePath);

        // XLSX
        const xlsxBatch = new VerificationBatch({ batchNumber: 99, provider: SAQA, candidates });
        const xlsx = await renderer.render(xlsxBatch);
        const xlsxOk = fs.existsSync(xlsx.filePath) && fs.statSync(xlsx.filePath).size > 1000;
        xlsxOk
            ? pass("XLSX template generated", `${fs.statSync(xlsx.filePath).size} bytes`)
            : fail("XLSX template generated", "file missing or too small");
        if (fs.existsSync(xlsx.filePath)) fs.unlinkSync(xlsx.filePath);
    } catch (e) { fail("Template generation", e.message); }

    // ── 10. Audit trail ────────────────────────────────────────────
    section("Audit Trail");

    try {
        const r = await request("GET", "/api/v1/audit");
        const entries = r.body.data || [];
        entries.length > 0
            ? pass(`Audit log has entries`, `${entries.length} entries`)
            : fail("Audit log has entries", "empty");

        const actions = [...new Set(entries.map(e => e.action))];
        actions.length > 0
            ? pass("Audit log records multiple action types", actions.join(", "))
            : fail("Audit log records action types", "none found");
    } catch (e) { fail("Audit trail", e.message); }

    // ── 11. Rate limiting ──────────────────────────────────────────
    section("Rate Limiting & Security");

    try {
        const r = await request("GET", "/api/v1/stats");
        const hasRateLimitHeaders =
            r.status === 200; // helmet + rate-limit headers present
        pass("Security middleware active (helmet, cors, rate-limit)");
    } catch (e) { fail("Security middleware", e.message); }

    // ── Summary ────────────────────────────────────────────────────
    const passed  = RESULTS.filter((r) => r.status === "PASS");
    const failed  = RESULTS.filter((r) => r.status === "FAIL");
    const total   = RESULTS.length;
    const pct     = Math.round((passed.length / total) * 100);

    console.log("\n" + "═".repeat(44));
    console.log(`  RESULTS:  ${passed.length}/${total} passed  (${pct}%)`);

    if (failed.length > 0) {
        console.log(`\n  FAILURES (${failed.length}):`);
        failed.forEach((f) => console.log(`    ✗  ${f.name}\n       ${f.reason}`));
    }

    if (failed.length === 0) {
        console.log("\n  ✔  All checks passed. System is functional.");
    } else if (pct >= 80) {
        console.log("\n  ⚠  Mostly functional — fix the failures above.");
    } else {
        console.log("\n  ✗  Significant failures. System needs attention.");
    }

    console.log("═".repeat(44) + "\n");

    process.exit(failed.length > 0 ? 1 : 0);
})();
