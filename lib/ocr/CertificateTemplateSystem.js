/**
 * Certificate Template System
 * 
 * Defines known certificate layouts for different eras and types.
 * Each template describes where fields are expected to appear,
 * allowing position-based extraction as a complement to OCR text.
 * 
 * Certificate eras in South Africa:
 * - Pre-1992: Department of Education (various formats)
 * - 1992-2007: Senior Certificate (pre-NSC)
 * - 2008+: National Senior Certificate (NSC)
 * - Replacement certificates (issued later)
 * - Statement of Results
 */

class CertificateTemplate {
    constructor(config) {
        this.id = config.id;
        this.name = config.name;
        this.era = config.era;           // e.g. "pre-1992", "1992-2007", "2008+"
        this.provider = config.provider; // "umalusi", "doe"
        this.version = config.version;
        
        // Field definitions with expected positions (as ratios 0-1)
        this.fields = config.fields || {};
        
        // Text patterns that identify this template
        this.identifiers = config.identifiers || [];
        
        // Business rules specific to this template
        this.rules = config.rules || [];
    }
    
    /**
     * Calculate expected pixel position from ratio
     */
    getExpectedPosition(fieldName, imageWidth, imageHeight) {
        const field = this.fields[fieldName];
        if (!field || !field.position) return null;
        
        return {
            x: field.position.x * imageWidth,
            y: field.position.y * imageHeight,
            width: field.position.width * imageWidth,
            height: field.position.height * imageHeight
        };
    }
    
    /**
     * Check if OCR text matches this template's identifiers
     */
    matchesText(text) {
        const upperText = text.toUpperCase();
        
        for (const identifier of this.identifiers) {
            if (upperText.includes(identifier.toUpperCase())) {
                return true;
            }
        }
        
        return false;
    }
}

/**
 * Registry of known certificate templates
 */
class CertificateTemplateRegistry {
    constructor() {
        this.templates = [];
        this.registerDefaultTemplates();
    }
    
    registerDefaultTemplates() {
        // ------------------------------------------------------------
        // Current NSC (2008+)
        // ------------------------------------------------------------
        this.register(new CertificateTemplate({
            id: "nsc-current",
            name: "National Senior Certificate (Current)",
            era: "2008+",
            provider: "umalusi",
            version: "1.0",
            identifiers: [
                "NATIONAL SENIOR CERTIFICATE",
                "REPLACEMENT NATIONAL SENIOR CERTIFICATE"
            ],
            fields: {
                surname: {
                    position: { x: 0.3, y: 0.35, width: 0.4, height: 0.05 },
                    pattern: null,
                    description: "Surname typically appears after 'Issued to'"
                },
                fullNames: {
                    position: { x: 0.3, y: 0.35, width: 0.4, height: 0.05 },
                    pattern: null,
                    description: "Names appear with surname"
                },
                idNumber: {
                    position: { x: 0.25, y: 0.42, width: 0.3, height: 0.05 },
                    pattern: /\b\d{13}\b/,
                    description: "13-digit ID number near 'Identity number'"
                },
                qualificationType: {
                    position: { x: 0.2, y: 0.15, width: 0.6, height: 0.08 },
                    pattern: null,
                    description: "Certificate title at top"
                }
            },
            rules: [
                {
                    field: "qualificationYear",
                    validate: (value) => value >= 2008,
                    description: "NSC introduced in 2008"
                }
            ]
        }));
        
        // ------------------------------------------------------------
        // Senior Certificate (1992-2007)
        // ------------------------------------------------------------
        this.register(new CertificateTemplate({
            id: "senior-certificate-1992-2007",
            name: "Senior Certificate (1992-2007)",
            era: "1992-2007",
            provider: "umalusi",
            version: "1.0",
            identifiers: [
                "SENIOR CERTIFICATE"
            ],
            fields: {
                surname: {
                    position: { x: 0.3, y: 0.35, width: 0.4, height: 0.05 },
                    pattern: null,
                    description: "Surname in candidate information section"
                },
                idNumber: {
                    position: { x: 0.25, y: 0.42, width: 0.3, height: 0.05 },
                    pattern: /\b\d{13}\b/,
                    description: "13-digit ID number"
                },
                qualificationType: {
                    position: { x: 0.2, y: 0.15, width: 0.6, height: 0.08 },
                    pattern: null,
                    description: "Certificate title at top"
                }
            },
            rules: [
                {
                    field: "qualificationYear",
                    validate: (value) => value >= 1992 && value <= 2007,
                    description: "Senior Certificate era"
                }
            ]
        }));
        
        // ------------------------------------------------------------
        // Pre-1992 (Department of Education)
        // ------------------------------------------------------------
        this.register(new CertificateTemplate({
            id: "pre-1992",
            name: "Pre-1992 Certificate",
            era: "pre-1992",
            provider: "doe",
            version: "1.0",
            identifiers: [
                "DEPARTMENT OF EDUCATION",
                "MATRICULATION",
                "SENIOR CERTIFICATE"
            ],
            fields: {
                surname: {
                    position: { x: 0.25, y: 0.30, width: 0.5, height: 0.06 },
                    pattern: null,
                    description: "Surname may be handwritten or typed"
                },
                idNumber: {
                    position: { x: 0.25, y: 0.40, width: 0.3, height: 0.05 },
                    pattern: /\b\d{13}\b/,
                    description: "ID number (may not always be present)"
                }
            },
            rules: [
                {
                    field: "qualificationYear",
                    validate: (value) => value < 1992,
                    description: "Pre-1992 era"
                }
            ]
        }));
        
        // ------------------------------------------------------------
        // Statement of Results
        // ------------------------------------------------------------
        this.register(new CertificateTemplate({
            id: "statement-of-results",
            name: "Statement of Results",
            era: "any",
            provider: "umalusi",
            version: "1.0",
            identifiers: [
                "STATEMENT OF RESULTS",
                "STATEMENT OF SYMBOLS"
            ],
            fields: {
                surname: {
                    position: { x: 0.25, y: 0.30, width: 0.5, height: 0.06 },
                    pattern: null,
                    description: "Candidate name section"
                },
                idNumber: {
                    position: { x: 0.25, y: 0.40, width: 0.3, height: 0.05 },
                    pattern: /\b\d{13}\b/,
                    description: "13-digit ID number"
                },
                examinationNumber: {
                    position: { x: 0.55, y: 0.40, width: 0.2, height: 0.05 },
                    pattern: /\b\d{10,12}\b/,
                    description: "Examination number"
                }
            }
        }));
    }
    
    register(template) {
        this.templates.push(template);
    }
    
    /**
     * Find templates that match OCR text
     */
    findMatchingTemplates(text) {
        return this.templates.filter(t => t.matchesText(text));
    }
    
    /**
     * Find template by ID
     */
    getTemplate(id) {
        return this.templates.find(t => t.id === id) || null;
    }
    
    /**
     * Get all templates
     */
    getAllTemplates() {
        return [...this.templates];
    }
}

module.exports = {
    CertificateTemplate,
    CertificateTemplateRegistry
};
