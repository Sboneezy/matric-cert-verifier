const assert = require("assert");

const BusinessRuleEngine = require("../lib/intake/BusinessRuleEngine");

const engine = new BusinessRuleEngine();

const candidate = {
    surname: "NKOSI",
    fullNames: "JOHN PETER",
    idNumber: "9201015009087",
    qualificationType: "NATIONAL SENIOR CERTIFICATE",
    qualificationYear: 2018,
    certificateNumber: "ABC123456",
    examinationNumber: null
};

const decision = engine.evaluate(candidate);

assert.strictEqual(decision.provider, "Umalusi");
assert.strictEqual(decision.status, "Ready");
assert.strictEqual(decision.errors.length, 0);

console.log("✅ BusinessRuleEngine passed");
console.log(decision);