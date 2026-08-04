const fs = require("fs");
const path = require("path");
const assert = require("assert");

const IntakePipeline = require("../lib/intake/IntakePipeline");

const pipeline = new IntakePipeline();

const sample = path.join(__dirname, "sample.pdf");

fs.writeFileSync(sample, "Fake PDF");

const result = pipeline.process(sample);

assert.strictEqual(result.candidate.surname, "NKOSI");
assert.strictEqual(result.decision.provider, "Umalusi");
assert.strictEqual(result.decision.status, "Ready");

console.log("✅ IntakePipeline passed\n");

console.log(result);

fs.unlinkSync(sample);