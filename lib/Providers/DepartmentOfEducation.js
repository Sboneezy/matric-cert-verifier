const Provider = require("./Provider");

module.exports = new Provider({
    id: "doe",

    name: "Department of Education",

    batchSize: 10,

    template: "templates/doe.docx",

    email: "verifications@education.gov.za",

    requiredFields: [
        "surname",
        "fullNames",
        "idNumber",
        "qualificationYear"
    ]
});