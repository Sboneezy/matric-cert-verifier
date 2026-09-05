class VerificationBatch {
    constructor({
        id,
        batchNumber,
        provider,
        candidates = [],
        name = null,
        items = []
    } = {}) {

        this.id = id || 'BATCH-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        this.batchNumber = batchNumber || null;
        this.provider = provider || null;
        this.candidates = candidates;
        this.name = name;
        this.items = items;

        this.status = "Draft";

        this.createdAt = new Date();
        this.submittedAt = null;
        this.completedAt = null;

        this.result = null;
        this.failureReason = null;
    }

    submit() {
        if (this.status !== "Draft") {
            throw new Error("Only draft batches can be submitted.");
        }

        this.status = "Submitted";
        this.submittedAt = new Date();
    }

    complete(result) {
        if (this.status !== "Submitted") {
            throw new Error("Only submitted batches can be completed.");
        }

        this.status = "Completed";
        this.completedAt = new Date();
        this.result = result;
    }

    fail(reason) {
        if (this.status !== "Submitted") {
            throw new Error("Only submitted batches can fail.");
        }

        this.status = "Failed";
        this.completedAt = new Date();
        this.failureReason = reason;
    }

    isFinished() {
        return this.status === "Completed";
    }

    hasFailed() {
        return this.status === "Failed";
    }
}

module.exports = VerificationBatch;
