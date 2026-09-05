/**
 * Confidence Scoring and Human Review Service
 * 
 * Evaluates the confidence of extracted fields and determines
 * whether automatic processing can proceed or human review is needed.
 * 
 * Confidence levels:
 * - HIGH (>= 80%): Automatic processing
 * - MEDIUM (50-80%): Flagged for review
 * - LOW (< 50%): Requires human review
 */
class ConfidenceScoringService {
    
    constructor(options = {}) {
        this.thresholds = {
            high: options.high || 0.80,
            medium: options.medium || 0.50
        };
    }
    
    /**
     * Score all extracted fields
     */
    scoreFields(fields) {
        const scored = {};
        
        for (const [field, data] of Object.entries(fields)) {
            const confidence = data.confidence || 0;
            
            let level;
            if (confidence >= this.thresholds.high) {
                level = "high";
            } else if (confidence >= this.thresholds.medium) {
                level = "medium";
            } else {
                level = "low";
            }
            
            scored[field] = {
                ...data,
                confidenceLevel: level,
                requiresReview: level !== "high"
            };
        }
        
        return scored;
    }
    
    /**
     * Determine overall confidence and review requirement
     */
    evaluateExtraction(scoredFields) {
        const fieldList = Object.values(scoredFields);
        
        if (fieldList.length === 0) {
            return {
                overallConfidence: 0,
                status: "failed",
                requiresReview: true,
                reason: "No fields extracted"
            };
        }
        
        const avgConfidence = fieldList.reduce(
            (sum, field) => sum + field.confidence, 
            0
        ) / fieldList.length;
        
        const lowConfidenceFields = fieldList.filter(
            f => f.confidenceLevel === "low"
        );
        
        const mediumConfidenceFields = fieldList.filter(
            f => f.confidenceLevel === "medium"
        );
        
        let status;
        let requiresReview;
        
        if (lowConfidenceFields.length > 0) {
            status = "review-required";
            requiresReview = true;
        } else if (mediumConfidenceFields.length > 0) {
            status = "ready-with-review";
            requiresReview = true;
        } else {
            status = "ready";
            requiresReview = false;
        }
        
        return {
            overallConfidence: avgConfidence,
            status,
            requiresReview,
            reviewCount: lowConfidenceFields.length + mediumConfidenceFields.length,
            lowConfidenceFields: lowConfidenceFields.map(f => f.value),
            mediumConfidenceFields: mediumConfidenceFields.map(f => f.value)
        };
    }
    
    /**
     * Generate human review request
     */
    createReviewRequest(scoredFields, evaluation) {
        if (!evaluation.requiresReview) {
            return null;
        }
        
        const reviewItems = [];
        
        for (const [field, data] of Object.entries(scoredFields)) {
            if (data.requiresReview) {
                reviewItems.push({
                    field,
                    value: data.value,
                    confidence: data.confidence,
                    confidenceLevel: data.confidenceLevel,
                    source: data.source,
                    description: data.description
                });
            }
        }
        
        return {
            status: "pending-review",
            createdAt: new Date(),
            fieldsToReview: reviewItems,
            evaluation: evaluation
        };
    }
}

module.exports = ConfidenceScoringService;