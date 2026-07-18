class BatchEngine {

    static createBatches(candidates, provider) {

        const batches = [];

        for (let i = 0; i < candidates.length; i += provider.batchSize) {

            batches.push({
                batchNumber: batches.length + 1,
                provider: provider.id,
                status: "Draft",
                candidates: candidates.slice(i, i + provider.batchSize)
            });

        }

        return batches;
    }

}

module.exports = BatchEngine;