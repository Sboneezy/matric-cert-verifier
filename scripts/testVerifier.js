const extractor = require("../lib/extractor/mockExtractor");
const expected = require("../sample-data/expectedCertificate.json");
const verifier = require("../lib/verifier/verificationEngine");

(async () => {

    const extracted = await extractor();

    const result = verifier.compare(expected, extracted);

    console.log(result);

})();