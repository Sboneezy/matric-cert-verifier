const VerificationBatch = require("../models/VerificationBatch");
const BatchEngine = require("../batching/BatchEngine");

class BatchService {
    constructor() {
        this.batches = [];
        this.items = new Map();
    }

    createBatch(data) {
        const batch = new VerificationBatch({
            name: data.name || 'Batch',
            provider: data.provider || null,
            candidates: data.candidates || [],
            items: data.items || []
        });
        this.batches.push(batch);
        return batch;
    }

    getBatch(id) {
        return this.batches.find(batch => batch.id === id) || null;
    }

    addItem(batchId, item) {
        const batch = this.getBatch(batchId);
        if (!batch) throw new Error('Batch with id ' + batchId + ' not found');
        
        if (!this.items.has(batchId)) {
            this.items.set(batchId, []);
        }
        this.items.get(batchId).push(item);
        batch.items = this.items.get(batchId);
        return batch;
    }

    submit(batch) {
        batch.submit();
        return batch;
    }

    complete(batch, result) {
        batch.complete(result);
        return batch;
    }

    fail(batch, reason) {
        batch.fail(reason);
        return batch;
    }
}

module.exports = BatchService;
