"use strict";

const express = require("express");
const { AppError } = require("../middleware/errorHandler");
const { tenantRepo } = require("../middleware/tenant");
const logger = require("../config/logger");

const router = express.Router();
router.use(tenantRepo);

/**
 * GET /api/v1/reviews
 * List the authenticated tenant's reviews.
 * Query: status (optional), limit, offset (clamped by the repository).
 */
router.get("/", (req, res, next) => {
    try {
        const status = typeof req.query.status === "string" && req.query.status
            ? req.query.status
            : null;

        const reviews = req.repo.listReviews({
            status,
            limit: req.query.limit,
            offset: req.query.offset,
        });

        res.json({ success: true, total: reviews.length, data: reviews });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/v1/reviews/pending
 * Pending reviews for the authenticated tenant.
 * Must be declared before "/:id".
 */
router.get("/pending", (req, res, next) => {
    try {
        const reviews = req.repo.listReviews({ status: "pending", limit: 100 });
        res.json({ success: true, total: reviews.length, data: reviews });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/v1/reviews/:id
 */
router.get("/:id", (req, res, next) => {
    try {
        const review = req.repo.getReview(req.params.id);

        if (!review) {
            return next(new AppError("Review not found.", 404));
        }

        res.json({ success: true, data: review });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/v1/reviews
 * Create a review task for one of the tenant's own extractions.
 *
 * Body (JSON):
 *   extractionId   - must belong to the authenticated tenant
 *   fieldsToReview - non-empty array
 *   document       - optional label
 */
router.post("/", (req, res, next) => {
    try {
        const { extractionId, fieldsToReview, document } = req.body || {};

        if (typeof extractionId !== "string" || !extractionId) {
            return next(new AppError("extractionId is required.", 400));
        }
        if (!Array.isArray(fieldsToReview) || fieldsToReview.length === 0) {
            return next(new AppError("fieldsToReview must be a non-empty array.", 400));
        }

        // Ownership of the extraction is verified inside the repository;
        // a foreign or unknown id returns 404 and creates nothing.
        const review = req.repo.createReview({
            extractionId,
            fieldsToReview,
            document: typeof document === "string" ? document : null,
        });

        logger.info({ reviewId: review.id, extractionId }, "Review task created");

        res.status(201).json({ success: true, data: review });
    } catch (err) {
        next(err);
    }
});

/**
 * PATCH /api/v1/reviews/:id
 * Complete a pending review.
 *
 * Body (JSON):
 *   corrections - object mapping field names to corrected values
 *
 * The reviewer is the authenticated API key (non-secret fingerprint);
 * any "reviewer" in the body is ignored so it cannot be spoofed.
 */
router.patch("/:id", (req, res, next) => {
    try {
        const { corrections } = req.body || {};

        if (!corrections || typeof corrections !== "object" || Array.isArray(corrections)) {
            return next(new AppError("corrections must be an object.", 400));
        }

        // Atomic compare-and-set on status = 'pending', scoped to the tenant.
        const updated = req.repo.completeReview(req.params.id, {
            corrections,
            reviewer: req.repo.actor,
        });

        logger.info({ reviewId: req.params.id }, "Review completed");

        res.json({ success: true, data: updated });
    } catch (err) {
        next(err);
    }
});

module.exports = router;