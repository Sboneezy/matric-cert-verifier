const assert = require("assert");

const CertificateParser = require("../lib/intake/CertificateParser");

const parser = new CertificateParser();

const rawText = `
SURNAME: NKOSI
FULL NAMES: JOHN PETER
ID NUMBER: 9201015009087
QUALIFICATION: NATIONAL SENIOR CERTIFICATE
YEAR: 2018
CERTIFICATE NUMBER: ABC123456
`;

const candidate = parser.parse(rawText);

assert.strictEqual(candidate.surname, "NKOSI");
assert.strictEqual(candidate.fullNames, "JOHN PETER");
assert.strictEqual(candidate.idNumber, "9201015009087");
assert.strictEqual(candidate.qualificationType, "NATIONAL SENIOR CERTIFICATE");
assert.strictEqual(candidate.qualificationYear, 2018);
assert.strictEqual(candidate.certificateNumber, "ABC123456");

console.log("✅ CertificateParser passed");
console.log(candidate);