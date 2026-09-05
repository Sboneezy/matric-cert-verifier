const VerificationJob = require("../models/VerificationJob");

class JobService {
    constructor() {
        this.jobs = [];
    }

    createJob(data) {
        const job = new VerificationJob({
            candidate: data.candidate,
            provider: data.provider,
            batchId: data.batchId || null
        });
        this.jobs.push(job);
        return job;
    }

    getJob(id) {
        return this.jobs.find(job => job.id === id) || null;
    }

    updateJobStatus(id, status) {
        const job = this.getJob(id);
        if (!job) throw new Error(`Job with id ${id} not found`);
        job.status = status;
        return job;
    }
}

module.exports = JobService;

