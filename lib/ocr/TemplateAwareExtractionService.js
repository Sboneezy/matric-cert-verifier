/**
 * Template-Aware Extraction Service
 * 
 * Combines OCR text extraction with certificate template knowledge
 * to improve field extraction accuracy.
 * 
 * The approach:
 * 1. Run OCR (single or multi-pass)
 * 2. Identify which certificate template matches
 * 3. Use template-specific extraction strategies
 * 4. Combine text-based and position-based evidence
 */
const { CertificateTemplateRegistry } = require("./CertificateTemplateSystem");
const FieldExtractionEngine = require("./FieldExtractionEngine");

class TemplateAwareExtractionService {
    
    constructor() {
        this.templateRegistry = new CertificateTemplateRegistry();
        this.fieldExtractor = new FieldExtractionEngine();
    }
    
    /**
     * Extract fields using template knowledge
     */
    extractWithTemplates(ocrResult) {
        const text = ocrResult.mergedText || ocrResult.text || "";
        const fields = ocrResult.fields || {};
        
        // Find matching templates
        const matchingTemplates = this.templateRegistry.findMatchingTemplates(text);
        
        if (matchingTemplates.length === 0) {
            return {
                ...fields,
                templateMatch: null,
                confidence: "low",
                message: "No matching certificate template found"
            };
        }
        
        // Use the first matching template (could be refined later)
        const template = matchingTemplates[0];
        
        // Re-extract fields using template knowledge
        const templateFields = this.extractUsingTemplate(text, template);
        
        // Merge with existing fields (template fields take precedence)
        const mergedFields = this.mergeFields(fields, templateFields);
        
        return {
            ...mergedFields,
            templateMatch: {
                id: template.id,
                name: template.name,
                era: template.era,
                provider: template.provider
            },
            confidence: "medium",
            message: `Matched template: ${template.name}`
        };
    }
    
    /**
     * Extract fields using a specific template's rules
     */
    extractUsingTemplate(text, template) {
        const extracted = {};
        
        for (const [fieldName, fieldDef] of Object.entries(template.fields)) {
            
            if (fieldDef.pattern) {
                // Use pattern matching
                const match = text.match(fieldDef.pattern);
                
                if (match) {
                    extracted[fieldName] = {
                        value: match[0],
                        confidence: 0.85,
                        source: "template-pattern",
                        description: fieldDef.description
                    };
                }
            }
            
            // Additional template-specific logic can be added here
        }
        
        return extracted;
    }
    
    /**
     * Merge fields with precedence to template-extracted fields
     */
    mergeFields(originalFields, templateFields) {
        const merged = { ...originalFields };
        
        for (const [field, data] of Object.entries(templateFields)) {
            // Template fields have higher confidence
            if (!merged[field] || data.confidence > merged[field].confidence) {
                merged[field] = data;
            }
        }
        
        return merged;
    }
    
    /**
     * Validate extracted fields against template rules
     */
    validateFields(fields, template) {
        const validationResults = [];
        
        for (const rule of template.rules) {
            const fieldValue = fields[rule.field]?.value;
            
            if (fieldValue !== undefined && fieldValue !== null) {
                const isValid = rule.validate(fieldValue);
                
                validationResults.push({
                    field: rule.field,
                    value: fieldValue,
                    isValid,
                    description: rule.description
                });
            }
        }
        
        return validationResults;
    }
}

module.exports = TemplateAwareExtractionService;
