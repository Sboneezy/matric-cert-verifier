describe("Template Aware Extraction Service", () => {
    const TemplateAwareExtractionService = require("../lib/ocr/TemplateAwareExtractionService");
    
    test("matches NSC certificate template", () => {
        const service = new TemplateAwareExtractionService();
        
        const ocrResult = {
            mergedText: "REPLACEMENT NATIONAL SENIOR CERTIFICATE\nIssued to\nSIBONELO SITHEBE\nIdentity number 9302245319083",
            fields: {
                idNumber: {
                    value: "9302245319083",
                    confidence: 0.95,
                    source: "pattern-match"
                }
            }
        };
        
        const result = service.extractWithTemplates(ocrResult);
        
        expect(result.templateMatch).toBeDefined();
        expect(result.templateMatch.id).toBe("nsc-current");
        expect(result.idNumber).toBeDefined();
    });
    
    test("returns null template match for unknown certificate", () => {
        const service = new TemplateAwareExtractionService();
        
        const ocrResult = {
            mergedText: "SOME UNKNOWN DOCUMENT",
            fields: {}
        };
        
        const result = service.extractWithTemplates(ocrResult);
        
        expect(result.templateMatch).toBeNull();
        expect(result.confidence).toBe("low");
    });
});
