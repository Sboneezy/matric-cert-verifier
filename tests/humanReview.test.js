describe("Human Review Service", () => {
    const HumanReviewService = require("../lib/ocr/HumanReviewService");
    
    test("creates and manages review tasks", () => {
        const service = new HumanReviewService();
        
        const reviewRequest = {
            status: "pending-review",
            fieldsToReview: [
                {
                    field: "surname",
                    value: "REPUBLIC OF SOUTH AFRICA",
                    confidence: 0.40,
                    confidenceLevel: "low"
                }
            ],
            evaluation: {
                requiresReview: true,
                status: "review-required"
            }
        };
        
        const review = service.createReview(reviewRequest, {
            document: "Qualifications-1.pdf",
            page: 1
        });
        
        expect(review.status).toBe("pending");
        expect(review.fieldsToReview).toHaveLength(1);
        
        const retrieved = service.getReview(review.id);
        expect(retrieved).toBe(review);
        
        const completed = service.submitCorrections(
            review.id,
            { surname: "SITHEBE" },
            "reviewer@example.com"
        );
        
        expect(completed.status).toBe("completed");
        expect(completed.corrections.surname).toBe("SITHEBE");
        expect(completed.reviewedBy).toBe("reviewer@example.com");
    });
    
    test("applies corrections to fields", () => {
        const service = new HumanReviewService();
        
        const fields = {
            surname: {
                value: "REPUBLIC OF SOUTH AFRICA",
                confidence: 0.40,
                confidenceLevel: "low",
                source: "heuristic"
            }
        };
        
        const corrected = service.applyCorrections(fields, {
            surname: "SITHEBE"
        });
        
        expect(corrected.surname.value).toBe("SITHEBE");
        expect(corrected.surname.confidence).toBe(1.0);
        expect(corrected.surname.source).toBe("human-correction");
    });
    
    test("returns pending reviews", () => {
        const service = new HumanReviewService();
        
        const reviewRequest = {
            status: "pending-review",
            fieldsToReview: [],
            evaluation: { requiresReview: true }
        };
        
        service.createReview(reviewRequest, { document: "test.pdf" });
        service.createReview(reviewRequest, { document: "test2.pdf" });
        
        const pending = service.getPendingReviews();
        expect(pending).toHaveLength(2);
    });
});