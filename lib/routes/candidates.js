"use strict";

const express = require("express");
const { AppError } = require("../middleware/errorHandler");

const router = express.Router();

/**
 * GET /api/v1/candidates
 * List candidates with optional pagination and filter.
 *
 * Query params:
 *   limit        (default 50)
 *   offset       (default 0)
 *   reviewStatus (optional) — "Pending" | "Reviewed"
 */
router.get("/", (req, res, next) => {
    try {
        const db     = req.app.locals.db;
        const limit  = Math.min(parseInt(req.query.limit, 10)  || 50, 200);
        const offset = parseInt(req.query.offset, 10) || 0;
        const { reviewStatus } = req.query;

        const candidates = db.listCandidates({ limit, offset, reviewStatus });

        res.json({
            success: true,
            total: candidates.length,
            limit,
            offset,
            data: candidates,
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/v1/candidates/:id
 */
router.get("/:id", (req, res, next) => {
    try {
        const db        = req.app.locals.db;
        const candidate = db.getCandidate(req.params.id);

        if (!candidate) {
            return next(new AppError(`Candidate not found: ${req.params.id}`, 404));
        }

        res.json({ success: true, data: candidate });
    } catch (err) {
        next(err);
    }
});

/**
 * PATCH /api/v1/candidates/:id
 * Update candidate fields (e.g. after human review correction).
 *
 * Body (JSON): subset of candidate fields to update
 */
router.patch("/:id", (req, res, next) => {
    try {
        const db        = req.app.locals.db;
        const candidate = db.getCandidate(req.params.id);

        if (!candidate) {
            return next(new AppError(`Candidate not found: ${req.params.id}`, 404));
        }

        // Only allow safe updateable fields
        const ALLOWED = [
            "surname", "full_names", "id_number", "date_of_birth",
            "qualification_type", "qualification_year",
            "certificate_number", "examination_number", "review_status",
        ];

        const updates = {};
        for (const key of ALLOWED) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }

        if (Object.keys(updates).length === 0) {
            return next(new AppError("No valid fields provided to update.", 400));
        }

        db.updateCandidate(req.params.id, updates);
        db.logAudit("UPDATE", "candidate", req.params.id, updates, req.clientId, req.ip);

        const updated = db.getCandidate(req.params.id);
        res.json({ success: true, data: updated });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
