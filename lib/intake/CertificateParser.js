const Candidate = require("../models/Candidate");

class CertificateParser {

    parse(text) {

        if (!text || typeof text !== "string") {
            throw new Error("Certificate text is required.");
        }

        const extract = (label) => {
            const regex = new RegExp(`${label}:\\s*(.*)`, "i");
            const match = text.match(regex);
            return match ? match[1].trim() : null;
        };

        return new Candidate({
            surname: extract("SURNAME"),
            fullNames: extract("FULL NAMES"),
            idNumber: extract("ID NUMBER"),
            qualificationType: extract("QUALIFICATION"),
            qualificationYear: Number(extract("YEAR")),
            certificateNumber: extract("CERTIFICATE NUMBER"),
            examinationNumber: extract("EXAMINATION NUMBER")
        });
    }
}

module.exports = CertificateParser;
