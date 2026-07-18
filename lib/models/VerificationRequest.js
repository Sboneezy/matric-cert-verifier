class VerificationRequest {
    constructor(agency, certificate) {
        this.agency = agency;
        this.certificate = certificate;
        this.requestDate = new Date();
    }
}

module.exports = VerificationRequest;