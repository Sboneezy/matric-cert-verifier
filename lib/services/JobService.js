const VerificationJob = require("../models/VerificationJob");

class JobService {

    static create(client, provider) {

        return new VerificationJob(client, provider);

    }

    static addCandidate(job, candidate) {

        job.addCandidate(candidate);

        job.log(`Candidate added: ${candidate.surname}`);

    }

    static reviewCandidate(job, index, updates) {

        Object.assign(job.candidates[index], updates);

        job.candidates[index].reviewed = true;

        job.log(
            `Candidate reviewed: ${job.candidates[index].surname}`
        );

    }

}

module.exports = JobService;