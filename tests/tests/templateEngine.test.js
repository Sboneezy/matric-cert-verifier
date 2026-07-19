const BatchEngine = require("../lib/batching/BatchEngine");
const TemplateEngine = require("../lib/templates/TemplateEngine");
const TemplateRenderer = require("../lib/templates/TemplateRenderer");
const TemplateRegistry = require("../lib/templates/TemplateRegistry");

const provider = TemplateRegistry.get("umalusi");

const candidates = [];

for (let i = 1; i <= 15; i++) {
    candidates.push({
        surname: `Candidate ${i}`,
        fullNames: `Person ${i}`,
        idNumber: `900101000${i}`,
        examinationNumber: `EX${1000 + i}`,
        qualificationType: "National Senior Certificate",
        qualificationYear: 2024
    });
}

const batches = BatchEngine.createBatches(candidates, provider);

for (const batch of batches) {

    const template = TemplateEngine.build(provider, batch);

    const output = TemplateRenderer.render(template);

    console.log(output);
}