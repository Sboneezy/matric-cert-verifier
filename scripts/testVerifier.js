const extractor = require("../lib/extractor/mockExtractor");
const expected = require("../sample-data/expectedCertificate.json");
const verifier = require("../lib/verifier/verificationEngine");

(async () => {
    console.log("Starting verification...\n");

    const extracted = await extractor();

    console.log("Extracted Certificate:");
    console.log(extracted);

    console.log("\nComparing...\n");

    const result = verifier.compare(expected, extracted);

    console.log("Verification Result:");
    console.log(result);
})();