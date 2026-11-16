"use strict";

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { AppError } = require("../middleware/errorHandler");
const logger = require("../config/logger");

const router = express.Router();

/**
 * GET /api/v1/reviews
 * List review items.
 *
 * Query params:
 *   status  — "pending" | "completed" (optional)
 *   limit   (default 50)
 *   offset  (default 0)
 */
router.get("/", (req, res, next) => {
    try {
        const db     = req.app.locals.db;
        const limit  = Math.min(parseInt(req.query.limit, 10)  || 50, 200);
        const offset = parseInt(req.query.offset, 10) || 0;
        const { status } = req.query;

        const reviews = db.listReviews({ status, limit, offset });

        res.json({ success: true, total: reviews.length, limit, offset, data: reviews });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/v1/reviews/pending
 * Convenience alias for pending reviews (used by the frontend).
 */
router.get("/pending", (req, res, next) => {
    try {
        const db      = req.app.locals.db;
        const reviews = db.listReviews({ status: "pending", limit: 100 });
        res.json(reviews);
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/v1/reviews/:id
 */
router.get("/:id", (req, res, next) => {
    try {
        const db     = req.app.locals.db;
        const review = db.getReview(req.params.id);

        if (!review) {
            return next(new AppError(`Review not found: ${req.params.id}`, 404));
        }

        res.json({ success: true, data: review });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/v1/reviews
 * Create a review task (e.g. triggered when extraction confidence is low).
 *
 * Body (JSON):
 *   extractionId   — links to an extraction record
 *   fieldsToReview — array of { field, value, confidence, confidenceLevel }
 *   document       — optional label
 */
router.post("/", (req, res, next) => {
    try {
        const db = req.app.locals.db;
        const { extractionId, fieldsToReview, document } = req.body;

        if (!extractionId) {
            return next(new AppError("extractionId is required.", 400));
        }
        if (!Array.isArray(fieldsToReview) || fieldsToReview.length === 0) {
            return next(new AppError("fieldsToReview must be a non-empty array.", 400));
        }

        const review = {
            id:           "REV-" + uuidv4(),
            extractionId,
            status:       "pending",
            reviewer:     null,
            corrections:  null,
        };

        db.createReview(review);

        // Store fieldsToReview in the corrections_json field until corrected
        db.updateReview(review.id, {
            corrections: { fieldsToReview, document: document || null },
        });

        db.logAudit("CREATE", "human_review", review.id, { extractionId }, req.clientId, req.ip);

        logger.info({ reviewId: review.id, extractionId }, "Review task created");

        res.status(201).json({ success: true, data: review });
    } catch (err) {
        next(err);
    }
});

/**
 * PATCH /api/v1/reviews/:id
 * Submit corrections for a pending review.
 *
 * Body (JSON):
 *   corrections — object mapping field names to corrected values
 *   reviewer    — reviewer identifier (name or ID)
 */
router.patch("/:id", (req, res, next) => {
    try {
        const db     = req.app.locals.db;
        const review = db.getReview(req.params.id);

        if (!review) {
            return next(new AppError(`Review not found: ${req.params.id}`, 404));
        }
        if (review.status !== "pending") {
            return next(new AppError(`Review is already ${review.status}.`, 409));
        }

        const { corrections, reviewer } = req.body;

        if (!corrections || typeof corrections !== "object") {
            return next(new AppError("corrections must be an object.", 400));
        }

        db.updateReview(req.params.id, {
            status:      "completed",
            reviewer:    reviewer || "unknown",
            reviewed_at: new Date().toISOString(),
            corrections,
        });

        db.logAudit("COMPLETE", "human_review", req.params.id, { reviewer }, req.clientId, req.ip);

        logger.info({ reviewId: req.params.id, reviewer }, "Review completed");

        const updated = db.getReview(req.params.id);
        res.json({ success: true, data: updated });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
