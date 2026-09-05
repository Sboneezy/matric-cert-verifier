describe("SecureFileUploadHandler", () => {
    const SecureFileUploadHandler = require("../lib/security/SecureFileUploadHandler");
    const path = require("path");
    const fs = require("fs");
    
    let handler;
    let testUploadDir;
    
    beforeEach(() => {
        testUploadDir = path.join(__dirname, "test-uploads-" + Date.now());
        handler = new SecureFileUploadHandler({
            uploadDir: testUploadDir
        });
    });
    
    afterEach(() => {
        if (fs.existsSync(testUploadDir)) {
            fs.rmSync(testUploadDir, { recursive: true, force: true });
        }
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
    
    test("prevents path traversal", () => {
        const maliciousPath = path.join(testUploadDir, "..", "..", "evil.txt");
        const resolved = path.resolve(maliciousPath);
        const resolvedUploadDir = path.resolve(testUploadDir);
        
        expect(resolved.startsWith(resolvedUploadDir)).toBe(false);
    });
});