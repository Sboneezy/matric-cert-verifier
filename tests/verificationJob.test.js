describe("VerificationJob", () => {
    const VerificationJob = require("../lib/models/VerificationJob");

    test("creates a job with pending status", () => {
        const job = new VerificationJob({
            candidate: "candidate-001",
            provider: "Umalusi"
        });
        
        expect(job.status).toBe("Pending");
        expect(job.candidate).toBe("candidate-001");
        expect(job.provider).toBe("Umalusi");
    });

    test("starts, completes, and checks job lifecycle", () => {
        const job = new VerificationJob({
            candidate: "candidate-001",
            provider: "Umalusi"
        });
        
        job.start();
        expect(job.status).toBe("Running");
        
        job.complete({ verified: true });
        expect(job.status).toBe("Completed");
        expect(job.result).toEqual({ verified: true });
        expect(job.isFinished()).toBe(true);
    });

    test("fails a running job", () => {
        const job = new VerificationJob({
            candidate: "candidate-001",
            provider: "Umalusi"
        });
        
        job.start();
        job.fail("Provider error");
        
        expect(job.status).toBe("Failed");
        expect(job.failureReason).toBe("Provider error");
        expect(job.hasFailed()).toBe(true);
    });
});
