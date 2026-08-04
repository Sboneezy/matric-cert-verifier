const Client = require("../lib/models/Client");
const Candidate = require("../lib/models/Candidate");
const JobService = require("../lib/services/JobService");

const { getProvider } = require("../lib/providers/ProviderRegistry");

const client = new Client({
    companyName: "Awari Enterprise",
    contactPerson: "Sibonelo Sithebe"
});

const provider = getProvider("umalusi");

const job = JobService.create(client, provider);

JobService.addCandidate(job, new Candidate({
    surname: "Sithebe",
    fullNames: "Sibonelo"
}));

JobService.reviewCandidate(job, 0, {
    surname: "Sithebe"
});

console.log(JSON.stringify(job, null, 2));