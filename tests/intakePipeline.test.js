const fs = require("fs");
const path = require("path");
const IntakePipeline = require("../lib/intake/IntakePipeline");

describe("IntakePipeline", () => {
    test("processes a certificate and returns candidate with decision", async () => {
        const pipeline = new IntakePipeline();
        const sample = path.join(__dirname, "sample.pdf");

        if (!fs.existsSync(sample)) {
            console.warn("Sample file not found, skipping test");
            return;
        }

        const result = await pipeline.process(sample);

        expect(result).toBeDefined();
        expect(result.candidate).toBeDefined();
        expect(result.decision).toBeDefined();
        expect(result.candidate.surname).toBe("NKOSI");
        expect(result.candidate.fullNames).toBe("JOHN PETER");
        expect(result.candidate.idNumber).toBe("9201015009087");
        expect(result.candidate.qualificationYear).toBe(2018);
        expect(result.decision.provider).toBe("Umalusi");
        expect(result.decision.status).toBe("Ready");
    });
});
