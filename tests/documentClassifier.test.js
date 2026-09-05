describe("DocumentClassifier", () => {
    const DocumentClassifier = require("../lib/ocr/DocumentClassifier");
    
    test("classifies PDF documents", () => {
        const result = DocumentClassifier.classify("test.pdf");
        
        expect(result.type).toBe("pdf");
        expect(result.requiresOcr).toBe(true);
        expect(result.strategy).toBe("pdf-ocr");
    });
    
    test("classifies image documents", () => {
        const result = DocumentClassifier.classify("test.jpg");
        
        expect(result.type).toBe("image");
        expect(result.requiresOcr).toBe(true);
        expect(result.strategy).toBe("image-ocr");
    });
    
    test("classifies text documents", () => {
        const result = DocumentClassifier.classify("test.txt");
        
        expect(result.type).toBe("text");
        expect(result.requiresOcr).toBe(false);
        expect(result.strategy).toBe("text-extraction");
    });
    
    test("classifies unsupported documents", () => {
        const result = DocumentClassifier.classify("test.xyz");
        
        expect(result.type).toBe("unknown");
        expect(result.strategy).toBe("unsupported");
    });
});
