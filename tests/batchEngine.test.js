describe("BatchEngine", () => {
    const BatchEngine = require("../lib/batching/BatchEngine");
    const { getProvider } = require("../lib/providers/ProviderRegistry");

    test("creates batches with correct sizes", () => {
        const provider = getProvider("umalusi");
        const candidates = [];

        for (let i = 1; i <= 27; i++) {
            candidates.push({
                id: i,
                surname: "Candidate " + i
            });
        }

        const batches = BatchEngine.createBatches(candidates, provider);
        
        expect(batches).toHaveLength(3);
        expect(batches[0].candidates).toHaveLength(10);
        expect(batches[1].candidates).toHaveLength(10);
        expect(batches[2].candidates).toHaveLength(7);
    });

    test("creates single batch for less than batch size", () => {
        const provider = getProvider("umalusi");
        const candidates = [
            { id: 1, surname: "Candidate 1" },
            { id: 2, surname: "Candidate 2" }
        ];

        const batches = BatchEngine.createBatches(candidates, provider);
        
        expect(batches).toHaveLength(1);
        expect(batches[0].candidates).toHaveLength(2);
    });
});
