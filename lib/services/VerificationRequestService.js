const VerificationRequest = require("../models/VerificationRequest");

class VerificationRequestService {
    constructor() {
        this.requests = [];
    }

    createRequest(data) {
        const request = new VerificationRequest({
            provider: data.provider,
            certificateId: data.certificateId,
            batch: data.batch,
            template: data.template,
            status: 'Pending'
        });
        request.status = 'Pending';
        this.requests.push(request);
        return request;
    }

    getRequest(id) {
        return this.requests.find(req => req.id === id) || null;
    }

    updateRequestStatus(id, status) {
        const request = this.getRequest(id);
        if (!request) throw new Error('Request with id ' + id + ' not found');
        request.status = status;
        return request;
    }
}

module.exports = VerificationRequestService;
