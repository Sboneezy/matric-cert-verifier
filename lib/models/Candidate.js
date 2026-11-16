class Candidate {
    constructor(data = {}) {
        this.id = data.id || null;

        // Personal Information
        this.surname = data.surname || "";
        this.fullNames = data.fullNames || "";
        this.idNumber = data.idNumber || "";
        this.dateOfBirth = data.dateOfBirth || "";

        // Qualification Information
        this.qualificationType = data.qualificationType || "";
        this.qualificationYear = data.qualificationYear || "";
        this.certificateNumber = data.certificateNumber || "";
        this.examinationNumber = data.examinationNumber || "";

        // Verification Status
        this.reviewStatus = "Pending";
        this.reviewedBy = null;
        this.reviewDate = null;

        // AI Extraction
        this.extractionConfidence = data.extractionConfidence || {};
    }

    markReviewed(user) {
        this.reviewStatus = "Reviewed";
        this.reviewedBy = user;
        this.reviewDate = new Date();
    }

    update(fields = {}) {
        Object.assign(this, fields);
    }

    toJSON() {
        return { ...this };
    }
}

module.exports = Candidate;