
"use strict";

const SecureFileUploadHandler = require("../lib/security/SecureFileUploadHandler");
const path = require("path");
const fs = require("fs");
const os = require("os");

describe("SecureFileUploadHandler", () => {
    let handler;
    let testRoot;
    let testUploadDir;
    let siblingDir;

    beforeEach(() => {
        testRoot = fs.mkdtempSync(
            path.join(os.tmpdir(), "matric-upload-test-")
        );

        testUploadDir = path.join(testRoot, "uploads");
        siblingDir = path.join(testRoot, "uploads-backup");

        handler = new SecureFileUploadHandler({
            uploadDir: testUploadDir
        });

        fs.mkdirSync(siblingDir, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(testRoot, { recursive: true, force: true });
    });

    test("validates file types", () => {
        const invalidFile = {
            size: 1024,
            mimetype: "application/exe",
            originalname: "malware.exe"
        };

        const result = handler.validateFile(invalidFile);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    test("validates file sizes", () => {
        const largeFile = {
            size: 100 * 1024 * 1024,
            mimetype: "application/pdf",
            originalname: "large.pdf"
        };

        const result = handler.validateFile(largeFile);

        expect(result.valid).toBe(false);
    });

    test("generates secure filenames", () => {
        const filename1 = handler.generateSecureFilename(".pdf");
        const filename2 = handler.generateSecureFilename(".pdf");

        expect(filename1).not.toBe(filename2);
        expect(filename1.endsWith(".pdf")).toBe(true);
        expect(filename1).not.toContain("..");
    });

    test("accepts paths inside the upload directory", () => {
        const validPath = path.join(testUploadDir, "certificate.pdf");

        expect(handler._isPathInsideUploadDir(validPath)).toBe(true);
    });

    test("rejects the upload directory itself", () => {
        expect(handler._isPathInsideUploadDir(testUploadDir)).toBe(false);
    });

    test("rejects parent directory traversal", () => {
        const maliciousPath = path.join(testUploadDir, "..", "evil.txt");

        expect(handler._isPathInsideUploadDir(maliciousPath)).toBe(false);
    });

    test("rejects sibling directories sharing the upload directory prefix", () => {
        const maliciousPath = path.join(siblingDir, "evil.txt");

        expect(handler._isPathInsideUploadDir(maliciousPath)).toBe(false);
    });

    test("prevents deletion outside the upload directory", () => {
        const externalFile = path.join(siblingDir, "important.txt");

        fs.writeFileSync(externalFile, "Do not delete");

        expect(() => handler.deleteFile(externalFile))
            .toThrow("Invalid file path");

        expect(fs.existsSync(externalFile)).toBe(true);
    });

    test("prevents file information lookup outside the upload directory", () => {
        const externalFile = path.join(siblingDir, "important.txt");

        fs.writeFileSync(externalFile, "Private data");

        expect(handler.getFileInfo(externalFile)).toBeNull();
    });

    test("uploads a valid file inside the upload directory", async () => {
        const sourceFile = path.join(testRoot, "source.pdf");

        fs.writeFileSync(sourceFile, "Test PDF content");

        const result = await handler.handleUpload({
            path: sourceFile,
            originalname: "certificate.pdf",
            size: Buffer.byteLength("Test PDF content"),
            mimetype: "application/pdf"
        });

        expect(fs.existsSync(result.filePath)).toBe(true);
        expect(path.dirname(result.filePath)).toBe(path.resolve(testUploadDir));
        expect(result.originalFilename).toBe("certificate.pdf");
    });

    test("retrieves information for a valid uploaded file", () => {
        const validFile = path.join(testUploadDir, "certificate.pdf");

        fs.writeFileSync(validFile, "Test PDF content");

        const info = handler.getFileInfo(validFile);

        expect(info).not.toBeNull();
        expect(info.size).toBe(Buffer.byteLength("Test PDF content"));
    });

    test("deletes a valid file inside the upload directory", () => {
        const validFile = path.join(testUploadDir, "certificate.pdf");

        fs.writeFileSync(validFile, "Test PDF content");

        handler.deleteFile(validFile);

        expect(fs.existsSync(validFile)).toBe(false);
    });
});
