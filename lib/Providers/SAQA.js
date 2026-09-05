const Provider = require("./Provider");

module.exports = new Provider({
    id: "saqa",

    name: "SAQA",

    batchSize: 10,

    template: "templates/saqa.xlsx",

    email: "verifications@saqa.org.za",

    requiredFields: [
        "surname",
        "fullNames",
        "idNumber",
        "qualificationType",
        "qualificationYear"
    ]
});