const BatchService = require("./BatchService");
const VerificationRequestService = require("./VerificationRequestService");

class BatchVerificationService {
    constructor() {
        this.batchService = new BatchService();
        this.requestService = new VerificationRequestService();
    }

    submitBatch(batch) {
        if (!batch) {
            throw new Error("Batch is required.");
        }

        if (!batch.provider) {
            throw new Error("Batch provider is required.");
        }

        batch.submit();

        const request = this.requestService.createRequest({
            provider: batch.provider,
            batch,
            certificateId: batch.id,
            template: null
        });

        request.status = "Submitted";

        return request;
    }

    completeRequest(request, result, providerReference = null) {
        request.status = "Completed";
        request.result = result;
        request.providerReference = providerReference;

        if (request.batch) {
            request.batch.complete(result);
        }

        return request;
    }

    failRequest(request, reason) {
        request.status = "Failed";
        request.failureReason = reason;

        if (request.batch) {
            request.batch.fail(reason);
        }

        return request;
    }
}

module.exports = BatchVerificationService;
