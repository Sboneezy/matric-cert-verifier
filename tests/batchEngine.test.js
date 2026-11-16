"use strict";

const BatchEngine = require("../lib/batching/BatchEngine");
const { getProvider } = require("../lib/providers/ProviderRegistry");

describe("BatchEngine", () => {

    test("splits candidates into batches sized to the provider limit", () => {
        const provider = getProvider("umalusi");
        const candidates = Array.from({ length: 27 }, (_, i) => ({
            id: i + 1,
            surname: `Candidate ${i + 1}`,
        }));

        const batches = BatchEngine.createBatches(candidates, provider);

        // 27 candidates at batchSize 10 → 3 batches (10, 10, 7)
        expect(batches).toHaveLength(3);
        expect(batches[0].candidates).toHaveLength(10);
        expect(batches[1].candidates).toHaveLength(10);
        expect(batches[2].candidates).toHaveLength(7);
    });

    test("assigns sequential batch numbers", () => {
        const provider = getProvider("umalusi");
        const candidates = Array.from({ length: 15 }, (_, i) => ({ id: i + 1 }));

        const batches = BatchEngine.createBatches(candidates, provider);

        expect(batches[0].batchNumber).toBe(1);
        expect(batches[1].batchNumber).toBe(2);
    });

    test("attaches the provider to each batch", () => {
        const provider = getProvider("umalusi");
        const candidates = [{ id: 1, surname: "Test" }];

        const batches = BatchEngine.createBatches(candidates, provider);

        expect(batches[0].provider).toBe(provider);
    });

    test("returns a single batch when candidates fit within the limit", () => {
        const provider = getProvider("umalusi");
        const candidates = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));

        const batches = BatchEngine.createBatches(candidates, provider);

        expect(batches).toHaveLength(1);
        expect(batches[0].candidates).toHaveLength(5);
    });

    test("returns an empty array when no candidates are provided", () => {
        const provider = getProvider("umalusi");
        const batches = BatchEngine.createBatches([], provider);
        expect(batches).toHaveLength(0);
    });
});
