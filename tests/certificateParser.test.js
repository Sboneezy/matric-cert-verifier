describe("CertificateParser", () => {
    const CertificateParser = require("../lib/intake/CertificateParser");

    test("parses certificate fields from raw text", () => {
        const parser = new CertificateParser();
        
        const rawText = [
            "SURNAME: NKOSI",
            "FULL NAMES: JOHN PETER",
            "ID NUMBER: 9201015009087",
            "QUALIFICATION: NATIONAL SENIOR CERTIFICATE",
            "YEAR: 2018",
            "CERTIFICATE NUMBER: ABC123456"
        ].join("\n");

        const candidate = parser.parse(rawText);
        
        expect(candidate.surname).toBe("NKOSI");
        expect(candidate.fullNames).toBe("JOHN PETER");
        expect(candidate.idNumber).toBe("9201015009087");
        expect(candidate.qualificationType).toBe("NATIONAL SENIOR CERTIFICATE");
        expect(candidate.qualificationYear).toBe(2018);
        expect(candidate.certificateNumber).toBe("ABC123456");
    });
});
