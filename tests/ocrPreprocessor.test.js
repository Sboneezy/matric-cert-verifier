describe("OcrPreprocessor", () => {
    const OcrPreprocessor = require("../lib/ocr/OcrPreprocessor");
    
    test("module has expected methods", () => {
        expect(typeof OcrPreprocessor.generateVariants).toBe("function");
        expect(typeof OcrPreprocessor.readImageInfo).toBe("function");
    });
});