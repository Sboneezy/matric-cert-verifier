describe("TemplateEngine", () => {
    const BatchEngine = require("../lib/batching/BatchEngine");
    const TemplateEngine = require("../lib/templates/TemplateEngine");
    const { getProvider } = require("../lib/providers/ProviderRegistry");

    test("builds templates for batches", () => {
        const provider = getProvider("umalusi");
        const candidates = [];

        for (let i = 1; i <= 15; i++) {
            candidates.push({
                surname: "Candidate " + i,
                fullNames: "Person " + i,
                idNumber: "900101000" + i,
                examinationNumber: "EX" + (1000 + i),
                qualificationType: "National Senior Certificate",
                qualificationYear: 2024
            });
        }

        const batches = BatchEngine.createBatches(candidates, provider);
        
        expect(batches).toHaveLength(2);
        expect(batches[0].candidates).toHaveLength(10);
        expect(batches[1].candidates).toHaveLength(5);

        for (const batch of batches) {
            const template = TemplateEngine.build(provider, batch);
            expect(template).toBeDefined();
            expect(template.provider).toBe("umalusi");
            expect(template.rows.length).toBeGreaterThan(0);
        }
    });
});
