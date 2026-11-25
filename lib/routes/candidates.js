"use strict";

const express = require("express");
const { AppError } = require("../middleware/errorHandler");
const { tenantRepo } = require("../middleware/tenant");

const router = express.Router();
router.use(tenantRepo);

const ALLOWED = [
    "surname", "full_names", "id_number", "date_of_birth",
    "qualification_type", "qualification_year",
    "certificate_number", "examination_number", "review_status",
];

/**
 * GET /api/v1/candidates
 * Query: limit, offset (clamped by the repository), reviewStatus (optional).
 */
router.get("/", (req, res, next) => {
    try {
        const reviewStatus = typeof req.query.reviewStatus === "string" && req.query.reviewStatus
            ? req.query.reviewStatus
            : null;

        const candidates = req.repo.listCandidates({
            limit: req.query.limit,
            offset: req.query.offset,
            reviewStatus,
        });

        res.json({ success: true, total: candidates.length, data: candidates });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/v1/candidates/:id
 */
router.get("/:id", (req, res, next) => {
    try {
        const candidate = req.repo.getCandidate(req.params.id);
        if (!candidate) return next(new AppError("Candidate not found.", 404));
        res.json({ success: true, data: candidate });
    } catch (err) {
        next(err);
    }
});

/**
 * PATCH /api/v1/candidates/:id
 * Update allowlisted fields on one of the tenant's own candidates.
 */
router.patch("/:id", (req, res, next) => {
    try {
        const body = req.body || {};
        const updates = {};

        for (const key of ALLOWED) {
            if (body[key] === undefined) continue;
            const v = body[key];
            const ok = key === "qualification_year"
                ? Number.isInteger(v) || v === null
                : typeof v === "string" || v === null;
            if (!ok) return next(new AppError(`Invalid value for ${key}.`, 400));
            updates[key] = v;
        }

        if (Object.keys(updates).length === 0) {
            return next(new AppError("No valid fields provided to update.", 400));
        }

        // Tenant-scoped update; a foreign or unknown id returns 404 and changes nothing.
        const updated = req.repo.updateCandidate(req.params.id, updates);
        res.json({ success: true, data: updated });
    } catch (err) {
        next(err);
    }
});

module.exports = router;