const VerificationBatch = require("../models/VerificationBatch");

class BatchEngine {

    static createBatches(candidates, provider) {

        const batches = [];

        for (let i = 0; i < candidates.length; i += provider.batchSize) {

            const batch = new VerificationBatch({
                batchNumber: batches.length + 1,
                provider: provider,
                candidates: candidates.slice(i, i + provider.batchSize)
            });

            batches.push(batch);
        }

        return batches;
    }
}

module.exports = BatchEngine;