const Provider = require("./Provider");

module.exports = new Provider({
    id: "saqa",

    name: "SAQA",

    batchSize: 10,

    template: "templates/saqa.docx",

    email: "",

    requiredFields: []
});