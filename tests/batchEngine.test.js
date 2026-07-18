const BatchEngine = require("../lib/batching/BatchEngine");
const { getProvider } = require("../lib/providers/ProviderRegistry");

const provider = getProvider("umalusi");

const candidates = [];

for (let i = 1; i <= 27; i++) {
    candidates.push({
        id: i,
        surname: `Candidate ${i}`
    });
}

const batches = BatchEngine.createBatches(candidates, provider);

console.log(JSON.stringify(batches, null, 2));