describe("Candidate", () => {
    const Candidate = require("../lib/models/Candidate");

    test("creates a candidate with provided data", () => {
        const candidate = new Candidate({
            surname: "Sithebe",
            fullNames: "Sibonelo",
            idNumber: "0001015009087",
            qualificationYear: 2024
        });
        
        expect(candidate.surname).toBe("Sithebe");
        expect(candidate.fullNames).toBe("Sibonelo");
        expect(candidate.idNumber).toBe("0001015009087");
        expect(candidate.qualificationYear).toBe(2024);
        expect(candidate.reviewStatus).toBe("Pending");
    });

    test("marks candidate as reviewed", () => {
        const candidate = new Candidate({
            surname: "Sithebe",
            fullNames: "Sibonelo"
        });
        
        candidate.markReviewed("Admin");
        
        expect(candidate.reviewStatus).toBe("Reviewed");
        expect(candidate.reviewedBy).toBe("Admin");
        expect(candidate.reviewDate).toBeDefined();
    });
});
