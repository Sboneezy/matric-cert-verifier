describe("Confidence Scoring Service", () => {
    const ConfidenceScoringService = require("../lib/ocr/ConfidenceScoringService");
    
    test("scores fields by confidence", () => {
        const service = new ConfidenceScoringService();
        
        const fields = {
            idNumber: {
                value: "9302245319083",
                confidence: 0.95,
                source: "pattern-match"
            },
            surname: {
                value: "SITHEBE",
                confidence: 0.60,
                source: "context"
            },
            fullNames: {
                value: "SIBONELO",
                confidence: 0.40,
                source: "heuristic"
            }
        };
        
        const scored = service.scoreFields(fields);
        
        expect(scored.idNumber.confidenceLevel).toBe("high");
        expect(scored.idNumber.requiresReview).toBe(false);
        
        expect(scored.surname.confidenceLevel).toBe("medium");
        expect(scored.surname.requiresReview).toBe(true);
        
        expect(scored.fullNames.confidenceLevel).toBe("low");
        expect(scored.fullNames.requiresReview).toBe(true);
    });
    
    test("evaluates extraction for automatic processing", () => {
        const service = new ConfidenceScoringService();
        
        const scoredFields = {
            idNumber: {
                value: "9302245319083",
                confidence: 0.95,
                confidenceLevel: "high",
                requiresReview: false
            },
            surname: {
                value: "SITHEBE",
                confidence: 0.90,
                confidenceLevel: "high",
                requiresReview: false
            }
        };
        
        const evaluation = service.evaluateExtraction(scoredFields);
        
        expect(evaluation.status).toBe("ready");
        expect(evaluation.requiresReview).toBe(false);
    });
    
    test("evaluates extraction requiring review", () => {
        const service = new ConfidenceScoringService();
        
        const scoredFields = {
            idNumber: {
                value: "9302245319083",
                confidence: 0.95,
                confidenceLevel: "high",
                requiresReview: false
            },
            fullNames: {
                value: "SIBONELO",
                confidence: 0.40,
                confidenceLevel: "low",
                requiresReview: true
            }
        };
        
        const evaluation = service.evaluateExtraction(scoredFields);
        
        expect(evaluation.status).toBe("review-required");
        expect(evaluation.requiresReview).toBe(true);
    });
});