describe("FieldExtractionEngine", () => {
    const FieldExtractionEngine = require("../lib/ocr/FieldExtractionEngine");
    
    test("extracts ID number from text", () => {
        const engine = new FieldExtractionEngine();
        const text = "ID NUMBER: 9201015009087";
        
        const result = engine.extract(text);
        
        expect(result.idNumber).toBeDefined();
        expect(result.idNumber.value).toBe("9201015009087");
        expect(result.idNumber.confidence).toBeGreaterThan(0.9);
    });
    
    test("extracts qualification year from text", () => {
        const engine = new FieldExtractionEngine();
        const text = "YEAR: 2018";
        
        const result = engine.extract(text);
        
        expect(result.qualificationYear).toBeDefined();
        expect(result.qualificationYear.value).toBe(2018);
    });
    
    test("extracts qualification type from text", () => {
        const engine = new FieldExtractionEngine();
        const text = "NATIONAL SENIOR CERTIFICATE";
        
        const result = engine.extract(text);
        
        expect(result.qualificationType).toBeDefined();
        expect(result.qualificationType.value).toBe("NATIONAL SENIOR CERTIFICATE");
    });
    
    test("extracts surname from label", () => {
        const engine = new FieldExtractionEngine();
        const text = "SURNAME: NKOSI";
        
        const result = engine.extract(text);
        
        expect(result.surname).toBeDefined();
        expect(result.surname.value).toBe("NKOSI");
        expect(result.surname.confidence).toBeGreaterThan(0.8);
    });
    
    test("returns empty object for empty text", () => {
        const engine = new FieldExtractionEngine();
        
        const result = engine.extract("");
        
        expect(Object.keys(result).length).toBe(0);
    });
});
