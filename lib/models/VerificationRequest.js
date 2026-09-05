class VerificationRequest {
    constructor({
        id,
        provider,
        batch,
        template,
        certificateId = null
    } = {}) {

        this.id = id || 'REQ-' + Date.now() + '-' + Math.random()
            .toString(36)
            .slice(2, 8);

        this.provider = provider || null;
        this.batch = batch || null;
        this.template = template || null;
        this.certificateId = certificateId;

        this.status = "Draft";

        this.createdAt = new Date();
        this.submittedAt = null;
        this.completedAt = null;

        this.providerReference = null;
        this.result = null;
        this.failureReason = null;
    }

    submit() {
        if (this.status !== "Draft") {
            throw new Error("Only draft requests can be submitted.");
        }

        this.status = "Submitted";
        this.submittedAt = new Date();
    }

    complete(result, providerReference = null) {
        if (this.status !== "Submitted") {
            throw new Error("Only submitted requests can be completed.");
        }

        this.status = "Completed";
        this.completedAt = new Date();
        this.providerReference = providerReference;
        this.result = result;
    }

    fail(reason) {
        if (this.status !== "Submitted") {
            throw new Error("Only submitted requests can fail.");
        }

        this.status = "Failed";
        this.completedAt = new Date();
        this.failureReason = reason;
    }

    isFinished() {
        return this.status === "Completed" ||
               this.status === "Failed";
    }
}

module.exports = VerificationRequest;
