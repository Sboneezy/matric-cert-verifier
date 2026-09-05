/**
 * Field Extraction Engine
 * Extracts structured candidate information from OCR text.
 */
class FieldExtractionEngine {
    
    constructor() {
        this.patterns = {
            idNumber: {
                label: "ID Number",
                regex: /\b\d{13}\b/g,
                confidence: 0.95,
                description: "13-digit South African ID number"
            },
            certificateNumber: {
                label: "Certificate Number",
                regex: /\b[A-Z]{2,4}\d{4,10}\b/g,
                confidence: 0.7,
                description: "Certificate number format"
            },
            year: {
                label: "Qualification Year",
                regex: /\b(19[5-9]\d|20[0-2]\d)\b/g,
                confidence: 0.7,
                description: "Year in range 1950-2029"
            },
            qualificationType: {
                label: "Qualification Type",
                patterns: [
                    "NATIONAL SENIOR CERTIFICATE",
                    "SENIOR CERTIFICATE",
                    "MATRIC",
                    "STATEMENT OF RESULTS",
                    "NATIONAL CERTIFICATE"
                ],
                confidence: 0.85,
                description: "Known qualification names"
            }
        };
    }
    
    extract(text, options = {}) {
        if (!text || typeof text !== "string" || text.trim().length === 0) {
            return {};
        }
        
        const extracted = {};
        const lines = text.split("\n").filter(line => line.trim());
        
        const idNumber = this.extractIdNumber(text);
        if (idNumber) {
            extracted.idNumber = idNumber;
        }
        
        const certNumber = this.extractCertificateNumber(text);
        if (certNumber) {
            extracted.certificateNumber = certNumber;
        }
        
        const year = this.extractYear(text);
        if (year) {
            extracted.qualificationYear = year;
        }
        
        const qualification = this.extractQualification(text);
        if (qualification) {
            extracted.qualificationType = qualification;
        }
        
        const names = this.extractNames(text, lines);
        if (names) {
            Object.assign(extracted, names);
        }
        
        return extracted;
    }
    
    extractIdNumber(text) {
        const matches = text.match(this.patterns.idNumber.regex);
        if (!matches) return null;
        
        const validMatches = matches.filter(id => {
            const month = parseInt(id.substring(2, 4));
            const day = parseInt(id.substring(4, 6));
            return month >= 1 && month <= 12 && day >= 1 && day <= 31;
        });
        
        if (validMatches.length === 0) return null;
        
        return {
            value: validMatches[0],
            confidence: this.patterns.idNumber.confidence,
            source: "pattern-match",
            description: this.patterns.idNumber.description
        };
    }
    
    extractCertificateNumber(text) {
        const matches = text.match(this.patterns.certificateNumber.regex);
        if (!matches) return null;
        
        const valid = matches.filter(m => 
            !/^PAGE/i.test(m) &&
            !/^OCR/i.test(m)
        );
        
        if (valid.length === 0) return null;
        
        return {
            value: valid[0],
            confidence: this.patterns.certificateNumber.confidence,
            source: "pattern-match",
            description: this.patterns.certificateNumber.description
        };
    }
    
    extractYear(text) {
        const matches = text.match(this.patterns.year.regex);
        if (!matches) return null;
        
        const years = matches.map(y => parseInt(y));
        const likelyYears = years.filter(y => y >= 1990);
        const chosen = likelyYears.length > 0 ? likelyYears[0] : years[0];
        
        return {
            value: chosen,
            confidence: this.patterns.year.confidence,
            source: "pattern-match",
            description: this.patterns.year.description
        };
    }
    
    extractQualification(text) {
        const upperText = text.toUpperCase();
        
        for (const pattern of this.patterns.qualificationType.patterns) {
            if (upperText.includes(pattern)) {
                return {
                    value: pattern,
                    confidence: this.patterns.qualificationType.confidence,
                    source: "known-pattern",
                    description: this.patterns.qualificationType.description
                };
            }
        }
        
        return null;
    }
    
    extractNames(text, lines) {
        const surnameLabel = /\bSURNAME\b[:\s]*([A-Z\s]+)/i;
        const fullNamesLabel = /\bFULL\s*NAMES?\b[:\s]*([A-Z\s]+)/i;
        
        let surname = null;
        let fullNames = null;
        
        const surnameMatch = text.match(surnameLabel);
        if (surnameMatch) {
            surname = {
                value: surnameMatch[1].trim(),
                confidence: 0.9,
                source: "label-match",
                description: "Surname from label"
            };
        }
        
        const fullNamesMatch = text.match(fullNamesLabel);
        if (fullNamesMatch) {
            fullNames = {
                value: fullNamesMatch[1].trim(),
                confidence: 0.9,
                source: "label-match",
                description: "Full names from label"
            };
        }
        
        if (!surname || !fullNames) {
            const upperLines = lines.filter(line => 
                /^[A-Z\s]+$/.test(line.trim()) &&
                line.trim().length > 3
            );
            
            if (upperLines.length >= 2) {
                if (!surname) {
                    surname = {
                        value: upperLines[0].trim(),
                        confidence: 0.4,
                        source: "positional-heuristic",
                        description: "Uppercase line (potential surname)"
                    };
                }
                
                if (!fullNames) {
                    fullNames = {
                        value: upperLines[1].trim(),
                        confidence: 0.4,
                        source: "positional-heuristic",
                        description: "Uppercase line (potential names)"
                    };
                }
            }
        }
        
        const result = {};
        if (surname) result.surname = surname;
        if (fullNames) result.fullNames = fullNames;
        
        return Object.keys(result).length > 0 ? result : null;
    }
    
    static mergeExtractions(extractions) {
        const merged = {};
        
        for (const extraction of extractions) {
            for (const [field, data] of Object.entries(extraction)) {
                if (!merged[field]) {
                    merged[field] = data;
                } else {
                    if (data.confidence > merged[field].confidence) {
                        merged[field] = data;
                    }
                }
            }
        }
        
        return merged;
    }
}

module.exports = FieldExtractionEngine;