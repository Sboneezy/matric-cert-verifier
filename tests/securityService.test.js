describe("SecurityService", () => {
    const SecurityService = require("../lib/security/SecurityService");
    
    let service;
    
    beforeEach(() => {
        service = new SecurityService({
            encryptionKey: "test-encryption-key-123"
        });
    });
    
    test("hashes and verifies passwords", async () => {
        const password = "securePassword123";
        
        const hash = await service.hashPassword(password);
        
        expect(hash).not.toBe(password);
        
        const isValid = await service.verifyPassword(password, hash);
        expect(isValid).toBe(true);
        
        const isInvalid = await service.verifyPassword("wrongPassword", hash);
        expect(isInvalid).toBe(false);
    });
    
    test("encrypts and decrypts sensitive data", () => {
        const idNumber = "9302245319083";
        
        const encrypted = service.encryptData(idNumber);
        
        expect(encrypted.encrypted).not.toBe(idNumber);
        expect(encrypted.iv).toBeDefined();
        expect(encrypted.authTag).toBeDefined();
        
        const decrypted = service.decryptData(encrypted);
        
        expect(decrypted).toBe(idNumber);
    });
    
    test("masks ID numbers", () => {
        const idNumber = "9302245319083";
        
        const masked = service.maskIdNumber(idNumber);
        
        expect(masked.startsWith("930")).toBe(true);
        expect(masked.endsWith("083")).toBe(true);
        expect(masked).not.toContain("245319");
        expect(masked.length).toBe(idNumber.length);
    });
    
    test("masks names", () => {
        const name = "SITHEBE";
        
        const masked = service.maskName(name);
        
        expect(masked).toBe("S*****E");
        expect(masked).not.toContain("ITHEB");
    });
    
    test("generates secure tokens", () => {
        const token1 = service.generateToken();
        const token2 = service.generateToken();
        
        expect(token1).not.toBe(token2);
        expect(token1.length).toBe(64);
    });
    
    test("generates API keys with prefix", () => {
        const apiKey = service.generateApiKey();
        
        expect(apiKey.startsWith("mk_")).toBe(true);
        expect(apiKey.length).toBeGreaterThan(32);
    });
    
    test("validates file uploads", () => {
        const validFile = {
            size: 1024 * 1024,
            mimetype: "application/pdf",
            originalname: "certificate.pdf"
        };
        
        const result = service.validateFile(validFile);
        expect(result.valid).toBe(true);
        
        const invalidFile = {
            size: 100 * 1024 * 1024,
            mimetype: "application/exe",
            originalname: "malware.exe"
        };
        
        const invalidResult = service.validateFile(invalidFile);
        expect(invalidResult.valid).toBe(false);
        expect(invalidResult.errors.length).toBeGreaterThan(0);
    });
});