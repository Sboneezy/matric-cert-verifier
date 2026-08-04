class TextExtractor {

    extract(document) {

        if (!document) {
            throw new Error("A document is required.");
        }

        // Simulated OCR output
        return `
SURNAME: NKOSI
FULL NAMES: JOHN PETER
ID NUMBER: 9201015009087
QUALIFICATION: NATIONAL SENIOR CERTIFICATE
YEAR: 2018
CERTIFICATE NUMBER: ABC123456
`;
    }

}

module.exports = TextExtractor;