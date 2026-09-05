const DocumentLoader = require('./DocumentLoader');
const TextExtractor = require('./TextExtractor');
const CertificateParser = require('./CertificateParser');
const BusinessRuleEngine = require('./BusinessRuleEngine');

class IntakePipeline {
    constructor() {
        this.documentLoader = new DocumentLoader();
        this.textExtractor = new TextExtractor();
        this.certificateParser = new CertificateParser();
        this.businessRuleEngine = new BusinessRuleEngine();
    }

    async process(document) {
        try {
            // Load the document
            const loadedDocument = await this.documentLoader.load(document);
            
            // Extract text from the document
            const extractedText = await this.textExtractor.extract(loadedDocument);
            
            // Parse the certificate data from the text
            const candidate = await this.certificateParser.parse(extractedText);
            
            // Apply business rules
            const decision = await this.businessRuleEngine.evaluate(candidate);
            
            return {
                candidate,
                decision
            };
        } catch (error) {
            console.error('IntakePipeline error:', error);
            throw error;
        }
    }
}

module.exports = IntakePipeline;
