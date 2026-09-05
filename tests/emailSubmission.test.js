describe("EmailSubmissionService", () => {
    const EmailSubmissionService = require("../lib/providers/EmailSubmissionService");
    const { getProvider } = require("../lib/providers/ProviderRegistry");
    const path = require("path");
    const fs = require("fs");
    
    test("builds email body for batch", () => {
        const service = new EmailSubmissionService();
        const provider = getProvider("umalusi");
        
        const batch = {
            batchNumber: 1,
            provider,
            candidates: [
                { id: "CAND-001" },
                { id: "CAND-002" }
            ]
        };
        
        const body = service.buildEmailBody(batch);
        
        expect(body).toContain("batch 1");
        expect(body).toContain("2");
        expect(body).toContain("Umalusi");
    });
    
    test("builds single verification email body", () => {
        const service = new EmailSubmissionService();
        const provider = getProvider("umalusi");
        
        const candidate = {
            surname: "SITHEBE",
            fullNames: "SIBONELO",
            idNumber: "9302245319083",
            qualificationType: "NATIONAL SENIOR CERTIFICATE",
            qualificationYear: 2011
        };
        
        const body = service.buildSingleEmailBody(candidate, provider);
        
        expect(body).toContain("SITHEBE");
        expect(body).toContain("SIBONELO");
        expect(body).toContain("9302245319083");
    });
    
    test("sends email with json transport", async () => {
        const service = new EmailSubmissionService();
        const provider = getProvider("umalusi");
        
        // Create a real test file for the attachment
        const testFile = path.join(__dirname, "test-attachment.docx");
        fs.writeFileSync(testFile, "test document content");
        
        try {
            const batch = {
                batchNumber: 1,
                provider,
                candidates: [
                    { surname: "SITHEBE", fullNames: "SIBONELO" }
                ]
            };
            
            const templateFile = {
                fileName: "test.docx",
                filePath: testFile,
                mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            };
            
            const result = await service.sendVerificationBatch(batch, templateFile);
            
            expect(result.messageId).toBeDefined();
            expect(result.provider).toBe("umalusi");
            expect(result.batchNumber).toBe(1);
        } finally {
            if (fs.existsSync(testFile)) {
                fs.unlinkSync(testFile);
            }
        }
    });
});