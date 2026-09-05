describe("FieldExtractionEngine - Name Extraction", () => {
    const FieldExtractionEngine = require("../lib/ocr/FieldExtractionEngine");
    
    test("extracts name after 'Issued to' context", () => {
        const engine = new FieldExtractionEngine();
        const text = [
            "REPUBLIC OF SOUTH AFRICA",
            "Replacement National Senior Certificate",
            "Issued to",
            "SIBONELO SITHEBE",
            "Identity number 9302245319083"
        ].join("\n");
        
        const result = engine.extract(text);
        
        expect(result.surname).toBeDefined();
        expect(result.surname.value).toBe("SITHEBE");
        expect(result.fullNames).toBeDefined();
        expect(result.fullNames.value).toBe("SIBONELO");
    });
    
    test("extracts name before 'Identity number' context", () => {
        const engine = new FieldExtractionEngine();
        const text = [
            "SIBONELO SITHEBE",
            "Identity number 9302245319083"
        ].join("\n");
        
        const result = engine.extract(text);
        
        expect(result.surname).toBeDefined();
        expect(result.surname.value).toBe("SITHEBE");
        expect(result.fullNames).toBeDefined();
        expect(result.fullNames.value).toBe("SIBONELO");
    });
});