/**
 * Temporary certificate extractor.
 * This simulates the output that will eventually
 * come from Claude.
 */

async function mockExtractor() {
    return {
        surname: "Sithebe",
        full_names: "Sibonelo",
        id_number: "9801011234082",
        qualification_type: "National Senior Certificate",
        qualification_year: 2016,
        certificate_number: "123456789",

        confidence: {
            surname: "high",
            full_names: "high",
            id_number: "high",
            qualification_type: "high",
            qualification_year: "high",
            certificate_number: "medium"
        }
    };
}

module.exports = mockExtractor;