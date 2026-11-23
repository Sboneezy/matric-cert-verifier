"use strict";

const express = require("express");
const { tenantRepo } = require("../middleware/tenant");

const router = express.Router();
router.use(tenantRepo);

/**
 * GET /api/v1/stats
 * Dashboard statistics for the authenticated tenant only.
 */
router.get("/", (req, res, next) => {
    try {
        const stats = req.repo.getStats();

        res.json({
            success: true,
            data: {
                documents:            stats.documents,
                candidates:           stats.candidates,
                batches:              stats.batches,
                pendingReviews:       stats.pendingReviews,
                totalExtractions:     stats.extractions,
                verificationRequests: stats.verificationRequests,
            },
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;