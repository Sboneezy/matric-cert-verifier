class Candidate {
    constructor(data = {}) {
        this.id = data.id || null;

        this.surname = data.surname || "";
        this.fullNames = data.fullNames || "";

        this.idNumber = data.idNumber || "";
        this.dateOfBirth = data.dateOfBirth || "";

        this.qualificationType = data.qualificationType || "";
        this.qualificationYear = data.qualificationYear || "";

        this.certificateNumber = data.certificateNumber || "";
        this.examinationNumber = data.examinationNumber || "";

        this.reviewStatus = "Pending";
        this.reviewedBy = null;
        this.reviewDate = null;

        this.extractionConfidence = data.extractionConfidence || {};
    }

    markReviewed(user) {
        this.reviewStatus = "Reviewed";
        this.reviewedBy = user;
        this.reviewDate = new Date();
    }

    toJSON() {
        return {
            ...this
        };
    }
}

module.exports = Candidate;