const JobService = require("./JobService");

class VerificationWorkflow {

    static createJobFromIntake(intakeResult, provider, batchId = null) {

        if (!intakeResult) {
            throw new Error("Intake result is required.");
        }

        if (!intakeResult.candidate) {
            throw new Error("Intake result does not contain a candidate.");
        }

        if (!provider) {
            throw new Error("Provider is required.");
        }

        const jobService = new JobService();
        
        return jobService.createJob({
            candidate: intakeResult.candidate,
            provider,
            batchId
        });
    }
}

module.exports = VerificationWorkflow;
