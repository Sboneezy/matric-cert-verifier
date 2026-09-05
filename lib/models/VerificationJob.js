class VerificationJob {
    constructor({
        id,
        candidate,
        provider,
        batchId = null,
        type = 'verification'
    } = {}) {

        this.id = id || 'JOB-' + Date.now();

        this.candidate = candidate;
        this.provider = provider;
        this.batchId = batchId;
        this.type = type;

        this.status = "Pending";

        this.createdAt = new Date();

        this.startedAt = null;
        this.completedAt = null;

        this.result = null;

        this.failureReason = null;

        this.retryCount = 0;
    }

    start() {
        if (this.status !== "Pending") {
            throw new Error("Only pending jobs can be started.");
        }

        this.status = "Running";
        this.startedAt = new Date();
    }

    complete(result) {
        if (this.status !== "Running") {
            throw new Error("Only running jobs can be completed.");
        }

        this.status = "Completed";
        this.completedAt = new Date();
        this.result = result;
    }

    fail(reason) {
        if (this.status !== "Running") {
            throw new Error("Only running jobs can fail.");
        }

        this.status = "Failed";
        this.completedAt = new Date();
        this.failureReason = reason;
    }

    retry() {
        if (this.status !== "Failed") {
            throw new Error("Only failed jobs can be retried.");
        }

        this.retryCount++;
        this.status = "Pending";

        this.startedAt = null;
        this.completedAt = null;
        this.failureReason = null;
    }

    cancel() {
        if (this.status === "Completed") {
            throw new Error("Completed jobs cannot be cancelled.");
        }

        this.status = "Cancelled";
    }

    isFinished() {
        return this.status === "Completed";
    }

    hasFailed() {
        return this.status === "Failed";
    }
}

module.exports = VerificationJob;
