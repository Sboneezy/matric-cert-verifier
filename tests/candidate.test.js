const Candidate = require("../lib/models/Candidate");

const candidate = new Candidate({
    surname: "Sithebe",
    fullNames: "Sibonelo",
    idNumber: "0001015009087",
    qualificationYear: 2024
});

console.log(candidate);

candidate.markReviewed("Admin");

console.log(candidate);