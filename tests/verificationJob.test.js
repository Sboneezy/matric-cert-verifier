const VerificationJob = require("../lib/models/VerificationJob");

const job = new VerificationJob({
    candidate: "candidate-001",
    provider: "Umalusi"
});

console.log("Created");
console.log(job);

job.start();

console.log("\nStarted");
console.log(job.status);

job.complete({
    verified: true
});

console.log("\nCompleted");
console.log(job.status);

console.log(job.result);

console.log(job.isFinished());