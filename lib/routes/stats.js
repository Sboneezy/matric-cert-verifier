"use strict";

const express = require("express");

const router = express.Router();

/**
 * GET /api/v1/stats  (also served at /api/stats for the frontend)
 * Returns dashboard statistics.
 */
router.get("/", (req, res, next) => {
    try {
        const db    = req.app.locals.db;
        const stats = db.getStats();

        res.json({
            success: true,
            data: {
                documents:            stats.documents,
                candidates:           stats.candidates,
                batches:              stats.verificationRequests, // proxy until batch table count added
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
