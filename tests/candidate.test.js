"use strict";

const Candidate = require("../lib/models/Candidate");

describe("Candidate", () => {

    test("creates a candidate with the provided data", () => {
        const candidate = new Candidate({
            surname: "Sithebe",
            fullNames: "Sibonelo",
            idNumber: "0001015009087",
            qualificationType: "National Senior Certificate",
            qualificationYear: 2024,
        });

        expect(candidate.surname).toBe("Sithebe");
        expect(candidate.fullNames).toBe("Sibonelo");
        expect(candidate.idNumber).toBe("0001015009087");
        expect(candidate.qualificationType).toBe("National Senior Certificate");
        expect(candidate.qualificationYear).toBe(2024);
        expect(candidate.reviewStatus).toBe("Pending");
    });

    test("defaults missing fields to empty strings", () => {
        const candidate = new Candidate({});
        expect(candidate.surname).toBe("");
        expect(candidate.fullNames).toBe("");
        expect(candidate.idNumber).toBe("");
    });

    test("markReviewed sets status, reviewer and date", () => {
        const candidate = new Candidate({ surname: "Test" });
        expect(candidate.reviewStatus).toBe("Pending");

        candidate.markReviewed("Admin");

        expect(candidate.reviewStatus).toBe("Reviewed");
        expect(candidate.reviewedBy).toBe("Admin");
        expect(candidate.reviewDate).toBeInstanceOf(Date);
    });

    test("update merges new field values", () => {
        const candidate = new Candidate({ qualificationYear: 2024 });
        candidate.update({ qualificationYear: 2025, surname: "Updated" });

        expect(candidate.qualificationYear).toBe(2025);
        expect(candidate.surname).toBe("Updated");
    });

    test("toJSON returns a plain object", () => {
        const candidate = new Candidate({ surname: "Dlamini", fullNames: "Thabo" });
        const json = candidate.toJSON();

        expect(json).not.toBeInstanceOf(Candidate);
        expect(json.surname).toBe("Dlamini");
        expect(json.fullNames).toBe("Thabo");
    });
});
