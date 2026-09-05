/**
 * Human Review Service
 * 
 * Manages the workflow for reviewing low-confidence extractions.
 * Tracks review status and corrections made by human reviewers.
 */
class HumanReviewService {
    
    constructor() {
        this.reviews = [];
    }
    
    /**
     * Create a review task
     */
    createReview(reviewRequest, documentInfo) {
        const review = {
            id: "REV-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
            status: "pending",
            createdAt: new Date(),
            document: documentInfo,
            fieldsToReview: reviewRequest.fieldsToReview,
            evaluation: reviewRequest.evaluation,
            corrections: {},
            reviewedBy: null,
            reviewedAt: null
        };
        
        this.reviews.push(review);
        return review;
    }
    
    /**
     * Get review by ID
     */
    getReview(id) {
        return this.reviews.find(r => r.id === id) || null;
    }
    
    /**
     * Submit corrections for a review
     */
    submitCorrections(reviewId, corrections, reviewer) {
        const review = this.getReview(reviewId);
        
        if (!review) {
            throw new Error(`Review not found: ${reviewId}`);
        }
        
        if (review.status !== "pending") {
            throw new Error(`Review is not pending: ${reviewId}`);
        }
        
        review.corrections = corrections;
        review.reviewedBy = reviewer;
        review.reviewedAt = new Date();
        review.status = "completed";
        
        return review;
    }
    
    /**
     * Apply corrections to extracted fields
     */
    applyCorrections(fields, corrections) {
        const corrected = { ...fields };
        
        for (const [field, correctedValue] of Object.entries(corrections)) {
            if (corrected[field]) {
                corrected[field] = {
                    ...corrected[field],
                    value: correctedValue,
                    confidence: 1.0,
                    confidenceLevel: "high",
                    source: "human-correction",
                    requiresReview: false
                };
            }
        }
        
        return corrected;
    }
    
    /**
     * Get all pending reviews
     */
    getPendingReviews() {
        return this.reviews.filter(r => r.status === "pending");
    }
    
    /**
     * Get review statistics
     */
    getStatistics() {
        const total = this.reviews.length;
        const pending = this.reviews.filter(r => r.status === "pending").length;
        const completed = this.reviews.filter(r => r.status === "completed").length;
        
        return {
            total,
            pending,
            completed,
            completionRate: total > 0 ? completed / total : 0
        };
    }
}

module.exports = HumanReviewService;