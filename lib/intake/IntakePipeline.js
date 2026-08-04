const DocumentLoader = require("./DocumentLoader");
const TextExtractor = require("./TextExtractor");
const CertificateParser = require("./CertificateParser");
const BusinessRuleEngine = require("./BusinessRuleEngine");

class IntakePipeline {

    constructor() {
        this.loader = new DocumentLoader();
        this.extractor = new TextExtractor();
        this.parser = new CertificateParser();
        this.ruleEngine = new BusinessRuleEngine();
    }

    process(path) {

        const document = this.loader.load(path);

        const rawText = this.extractor.extract(document);

        const candidate = this.parser.parse(rawText);

        const decision = this.ruleEngine.evaluate(candidate);

        return {
            document,
            rawText,
            candidate,
            decision
        };
    }

}

module.exports = IntakePipeline;