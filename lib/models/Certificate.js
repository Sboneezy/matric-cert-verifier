class Certificate {
    constructor(data = {}) {
        this.surname = data.surname || "";
        this.fullNames = data.fullNames || "";
        this.idNumber = data.idNumber || "";
        this.dateOfBirth = data.dateOfBirth || "";
        this.certificateNumber = data.certificateNumber || "";
        this.examinationNumber = data.examinationNumber || "";
        this.qualificationType = data.qualificationType || "";
        this.qualificationYear = data.qualificationYear || "";
    }
}

module.exports = Certificate;