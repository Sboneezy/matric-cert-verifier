const VerificationBatch = require("../models/VerificationBatch");

class BatchEngine {

    static createBatches(candidates, provider) {

        const size = provider && provider.batchSize;
        if (!Number.isInteger(size) || size < 1 || size > 10000) {
            throw new Error(`Invalid batchSize for provider: ${size}`);
        }

        const batches = [];

        for (let i = 0; i < candidates.length; i += size) {

            const batch = new VerificationBatch({
                batchNumber: batches.length + 1,
                provider: provider,
                candidates: candidates.slice(i, i + size)
            });

            batches.push(batch);
        }

        return batches;
    }
}

module.exports = BatchEngine;