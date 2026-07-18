const Provider = require("./Provider");

module.exports = new Provider({
    id: "umalusi",

    name: "Umalusi",

    batchSize: 10,

    template: "templates/umalusi.docx",

    email: "verification@umalusi.org.za",

    requiredFields: [
        "surname",
        "fullNames",
        "idNumber",
        "qualificationType",
        "qualificationYear"
    ]
});