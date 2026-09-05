describe("BusinessRuleEngine", () => {
    const BusinessRuleEngine = require("../lib/intake/BusinessRuleEngine");

    test("evaluates candidate and assigns Umalusi provider for post-1992", () => {
        const engine = new BusinessRuleEngine();
        
        const candidate = {
            surname: "NKOSI",
            fullNames: "JOHN PETER",
            idNumber: "9201015009087",
            qualificationType: "NATIONAL SENIOR CERTIFICATE",
            qualificationYear: 2018,
            certificateNumber: "ABC123456",
            examinationNumber: null
        };

        const decision = engine.evaluate(candidate);
        
        expect(decision.provider).toBe("Umalusi");
        expect(decision.status).toBe("Ready");
        expect(decision.errors).toHaveLength(0);
    });

    test("assigns Department of Education for pre-1992 qualifications", () => {
        const engine = new BusinessRuleEngine();
        
        const candidate = {
            surname: "SMITH",
            fullNames: "JANE",
            idNumber: "6501010000000",
            qualificationType: "MATRIC",
            qualificationYear: 1985
        };

        const decision = engine.evaluate(candidate);
        
        expect(decision.provider).toBe("Department of Education");
        expect(decision.explanation).toContain("1992");
    });

    test("blocks when required fields are missing", () => {
        const engine = new BusinessRuleEngine();
        
        const candidate = {
            surname: "",
            idNumber: "",
            qualificationType: ""
        };

        const decision = engine.evaluate(candidate);
        
        expect(decision.status).toBe("Blocked");
        expect(decision.errors.length).toBeGreaterThan(0);
    });
});
