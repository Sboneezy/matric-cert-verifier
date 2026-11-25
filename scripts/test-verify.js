"use strict";

const http = require("http");
const fs   = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const KEY = process.env.API_KEY;
if (!KEY) { console.error("API_KEY environment variable is required."); process.exit(1); }
const PDF_PATH = path.join(__dirname, "..", "test-cert-tmp.pdf");

// 1. Create a test PDF
function createPdf() {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 60 });
        const stream = fs.createWriteStream(PDF_PATH);
        doc.pipe(stream);
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
        stream.on("finish", resolve);
        stream.on("error", reject);
    });
}

// 2. Upload the PDF
function upload() {
    return new Promise((resolve, reject) => {
        const boundary   = "TestBoundary" + Date.now();
        const fileBuffer = fs.readFileSync(PDF_PATH);
        const pre  = Buffer.from(
            "--" + boundary + "\r\n" +
            "Content-Disposition: form-data; name=\"certificate\"; filename=\"test.pdf\"\r\n" +
            "Content-Type: application/pdf\r\n\r\n"
        );
        const post    = Buffer.from("\r\n--" + boundary + "--\r\n");
        const payload = Buffer.concat([pre, fileBuffer, post]);

        const opts = {
            hostname: "localhost", port: 3000,
            path: "/api/v1/verify", method: "POST",
            headers: {
                "Authorization": "Bearer " + KEY,
                "Content-Type": "multipart/form-data; boundary=" + boundary,
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

        setTimeout(() => reject(new Error("Upload timed out after 30s")), 30000);
    });
}

(async () => {
    console.log("Creating test PDF...");
    await createPdf();
    console.log("PDF created:", fs.statSync(PDF_PATH).size, "bytes");

    console.log("Uploading to /api/v1/verify ...");
    try {
        const r = await upload();
        console.log("Status:", r.status);
        console.log(JSON.stringify(r.body, null, 2));
    } catch (e) {
        console.error("FAILED:", e.message);
    } finally {
        if (fs.existsSync(PDF_PATH)) fs.unlinkSync(PDF_PATH);
    }
})();
