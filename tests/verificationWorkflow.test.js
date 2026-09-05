const path = require("path");
const assert = require("assert");

const IntakePipeline = require("../lib/intake/IntakePipeline");
const VerificationWorkflow = require("../lib/services/VerificationWorkflow");
const { getProvider } = require("../lib/providers/ProviderRegistry");

describe("VerificationWorkflow", () => {

    test(
        "processes a certificate and creates a verification job",
        async () => {

            const pipeline = new IntakePipeline();

            const sample = path.join(
                __dirname,
                "sample.pdf"
            );

            const provider =
                getProvider("umalusi");

            // Process the certificate through intake.
            const intakeResult =
                await pipeline.process(sample);

            // Confirm intake succeeded.
            assert.strictEqual(
                intakeResult.candidate.surname,
                "NKOSI"
            );

            assert.strictEqual(
                intakeResult.decision.status,
                "Ready"
            );

            // Create a verification job.
            const job =
                VerificationWorkflow.createJobFromIntake(
                    intakeResult,
                    provider
                );

            // Confirm the verification job.
            assert.ok(job.id);

            assert.strictEqual(
                job.status,
                "Pending"
            );

            assert.strictEqual(
                job.provider.id,
                "umalusi"
            );

            assert.strictEqual(
                job.candidate.surname,
                "NKOSI"
            );

            assert.strictEqual(
                job.candidate.fullNames,
                "JOHN PETER"
            );

            assert.strictEqual(
                job.candidate.idNumber,
                "9201015009087"
            );
        }
    );

});