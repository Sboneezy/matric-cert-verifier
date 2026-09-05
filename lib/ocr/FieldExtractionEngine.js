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
        let surname = null;
        let fullNames = null;
        
        // Strategy 1: Label-based
        const surnameLabel = /\bSURNAME\b[:\s]*([A-Z\s]+)/i;
        const fullNamesLabel = /\bFULL\s*NAMES?\b[:\s]*([A-Z\s]+)/i;
        
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
        
        // Strategy 2: "Issued to" context clue
        if (!surname || !fullNames) {
            const issuedToMatch = this.extractNameAfterIssuedTo(text, lines);
            
            if (issuedToMatch) {
                if (!surname && issuedToMatch.surname) {
                    surname = issuedToMatch.surname;
                }
                if (!fullNames && issuedToMatch.fullNames) {
                    fullNames = issuedToMatch.fullNames;
                }
            }
        }
        
        // Strategy 3: "Identity number" context clue
        if (!surname || !fullNames) {
            const identityMatch = this.extractNameBeforeIdentityNumber(text, lines);
            
            if (identityMatch) {
                if (!surname && identityMatch.surname) {
                    surname = identityMatch.surname;
                }
                if (!fullNames && identityMatch.fullNames) {
                    fullNames = identityMatch.fullNames;
                }
            }
        }
        
        // Strategy 4: Positional heuristic (uppercase lines)
        if (!surname || !fullNames) {
            const upperLines = lines.filter(line => 
                /^[A-Z\s]+$/.test(line.trim()) &&
                line.trim().length > 3 &&
                !line.includes("REPUBLIC") &&
                !line.includes("SOUTH") &&
                !line.includes("AFRICA") &&
                !line.includes("CERTIFICATE") &&
                !line.includes("UMALUSI")
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
    
    extractNameAfterIssuedTo(text, lines) {
        // Look for "Issued to" followed by a name
        const issuedToIndex = lines.findIndex(line => 
            /issued\s*to/i.test(line)
        );
        
        if (issuedToIndex === -1) return null;
        
        // Check the next few lines for a name
        for (let i = issuedToIndex + 1; i < Math.min(issuedToIndex + 5, lines.length); i++) {
            const line = lines[i].trim();
            
            // Skip decorative lines
            if (line.length < 3) continue;
            if (/^[|~\-_=]+$/.test(line)) continue;
            if (/REPUBLIC|SOUTH|AFRICA|CERTIFICATE|UMALUSI/.test(line)) continue;
            
            // Look for a name pattern: 2+ uppercase words or mixed case
            const nameMatch = line.match(/^([A-Z][A-Z\s]+)$/);
            
            if (nameMatch) {
                const nameParts = nameMatch[1].trim().split(/\s+/);
                
                if (nameParts.length === 2) {
                    // Two words: likely FirstName Surname
                    return {
                        surname: {
                            value: nameParts[1],
                            confidence: 0.6,
                            source: "issued-to-context",
                            description: "Surname after 'Issued to'"
                        },
                        fullNames: {
                            value: nameParts[0],
                            confidence: 0.5,
                            source: "issued-to-context",
                            description: "First name after 'Issued to'"
                        }
                    };
                }
            }
        }
        
        return null;
    }
    
    extractNameBeforeIdentityNumber(text, lines) {
        // Look for "Identity number" - name is usually on the line above
        const identityIndex = lines.findIndex(line => 
            /identity\s*number/i.test(line)
        );
        
        if (identityIndex === -1) return null;
        
        // Check the previous few lines for a name
        for (let i = identityIndex - 1; i >= Math.max(identityIndex - 5, 0); i--) {
            const line = lines[i].trim();
            
            if (line.length < 3) continue;
            if (/^[|~\-_=]+$/.test(line)) continue;
            if (/REPUBLIC|SOUTH|AFRICA|CERTIFICATE|UMALUSI|Issued/.test(line)) continue;
            
            const nameMatch = line.match(/^([A-Z][A-Z\s]+)$/);
            
            if (nameMatch) {
                const nameParts = nameMatch[1].trim().split(/\s+/);
                
                if (nameParts.length === 2) {
                    return {
                        surname: {
                            value: nameParts[1],
                            confidence: 0.55,
                            source: "identity-number-context",
                            description: "Surname before Identity number"
                        },
                        fullNames: {
                            value: nameParts[0],
                            confidence: 0.55,
                            source: "identity-number-context",
                            description: "First name before Identity number"
                        }
                    };
                }
            }
        }
        
        return null;
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