describe("DocumentLoader", () => {
    const fs = require("fs");
    const path = require("path");
    const DocumentLoader = require("../lib/intake/DocumentLoader");

    test("loads a document with correct metadata", () => {
        const loader = new DocumentLoader();
        const samplePath = path.join(__dirname, "document-loader-sample.pdf");
        
        fs.writeFileSync(samplePath, "Fake PDF Content");

        try {
            const document = loader.load(samplePath);
            
            expect(document.name).toBe("document-loader-sample.pdf");
            expect(document.extension).toBe(".pdf");
            expect(document.size).toBe(16);
        } finally {
            if (fs.existsSync(samplePath)) {
                fs.unlinkSync(samplePath);
            }
        }
    });
});
