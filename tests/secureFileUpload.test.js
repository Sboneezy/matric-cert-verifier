
"use strict";

const SecureFileUploadHandler = require("../lib/security/SecureFileUploadHandler");
const path = require("path");
const fs = require("fs");
const os = require("os");

// Detect whether the current environment supports symbolic links.
const supportsSymlinks = (() => {
    const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "matric-symlink-check-")
    );

    try {
        const target = path.join(tempDir, "target.txt");
        const link = path.join(tempDir, "link.txt");

        fs.writeFileSync(target, "test");
        fs.symlinkSync(target, link);

        return true;
    } catch (error) {
        if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
            return false;
        }

        throw error;
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
})();

const symlinkTest = supportsSymlinks ? test : test.skip;

describe("SecureFileUploadHandler", () => {
    let handler;
    let testRoot;
    let testUploadDir;
    let siblingDir;

    const validPdf = Buffer.from("%PDF-1.7\nTest PDF content");

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

    test("rejects missing MIME types", () => {
        const result = handler.validateFile({
            size: 100,
            originalname: "certificate.pdf"
        });

        expect(result.valid).toBe(false);
    });

    test("rejects missing file extensions", () => {
        const result = handler.validateFile({
            size: 100,
            mimetype: "application/pdf",
            originalname: "certificate"
        });

        expect(result.valid).toBe(false);
    });

    test("rejects mismatched MIME types and extensions", () => {
        const result = handler.validateFile({
            size: 100,
            mimetype: "image/png",
            originalname: "certificate.pdf"
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
            "File extension and MIME type do not match"
        );
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

    symlinkTest("rejects symbolic links inside the upload directory", () => {
        const externalFile = path.join(siblingDir, "external.pdf");
        const linkedFile = path.join(testUploadDir, "linked.pdf");

        fs.writeFileSync(externalFile, validPdf);
        fs.symlinkSync(externalFile, linkedFile);

        expect(handler.getFileInfo(linkedFile)).toBeNull();

        expect(() => handler.deleteFile(linkedFile))
            .toThrow("Invalid or unsafe file path");

        expect(fs.existsSync(externalFile)).toBe(true);
    });

    symlinkTest("rejects dangling symbolic links during deletion", () => {
        const missingTarget = path.join(siblingDir, "missing.pdf");
        const linkedFile = path.join(testUploadDir, "dangling.pdf");

        fs.symlinkSync(missingTarget, linkedFile);

        expect(fs.lstatSync(linkedFile).isSymbolicLink()).toBe(true);

        expect(() => handler.deleteFile(linkedFile))
            .toThrow("Invalid or unsafe file path");

        expect(fs.lstatSync(linkedFile).isSymbolicLink()).toBe(true);
    });

    test("uploads a valid PDF inside the upload directory", async () => {
        const sourceFile = path.join(testRoot, "source.pdf");

        fs.writeFileSync(sourceFile, validPdf);

        const result = await handler.handleUpload({
            path: sourceFile,
            originalname: "certificate.pdf",
            size: validPdf.length,
            mimetype: "application/pdf"
        });

        expect(fs.existsSync(result.filePath)).toBe(true);
        expect(path.dirname(result.filePath)).toBe(path.resolve(testUploadDir));
        expect(result.originalFilename).toBe("certificate.pdf");
    });

    test("rejects files with invalid content signatures", async () => {
        const sourceFile = path.join(testRoot, "fake.pdf");
        const fakeContent = Buffer.from("This is not a PDF");

        fs.writeFileSync(sourceFile, fakeContent);

        await expect(handler.handleUpload({
            path: sourceFile,
            originalname: "fake.pdf",
            size: fakeContent.length,
            mimetype: "application/pdf"
        })).rejects.toThrow(
            "File content does not match its declared type"
        );
    });

    symlinkTest("rejects symbolic-link source files", async () => {
        const externalFile = path.join(siblingDir, "source.pdf");
        const linkedFile = path.join(testRoot, "linked-source.pdf");

        fs.writeFileSync(externalFile, validPdf);
        fs.symlinkSync(externalFile, linkedFile);

        await expect(handler.handleUpload({
            path: linkedFile,
            originalname: "certificate.pdf",
            size: validPdf.length,
            mimetype: "application/pdf"
        })).rejects.toThrow("Invalid or unsafe source file");
    });

    test("retrieves information for a valid uploaded file", () => {
        const validFile = path.join(testUploadDir, "certificate.pdf");

        fs.writeFileSync(validFile, validPdf);

        const info = handler.getFileInfo(validFile);

        expect(info).not.toBeNull();
        expect(info.size).toBe(validPdf.length);
    });

    test("deletes a valid file inside the upload directory", () => {
        const validFile = path.join(testUploadDir, "certificate.pdf");

        fs.writeFileSync(validFile, validPdf);

        handler.deleteFile(validFile);

        expect(fs.existsSync(validFile)).toBe(false);
    });
});
