"use strict";

const express = require("express");
const { tenantRepo } = require("../middleware/tenant");

const router = express.Router();
router.use(tenantRepo);

/**
 * GET /api/v1/audit
 * The authenticated tenant's audit log.
 *
 * Query params:
 *   entityType  filter by entity type (optional)
 *   limit       (default 100, clamped by the repository)
 *   offset      (default 0)
 */
router.get("/", (req, res, next) => {
    try {
        const entityType = typeof req.query.entityType === "string" && req.query.entityType
            ? req.query.entityType
            : null;

        const entries = req.repo.getAuditLog({
            entityType,
            limit: req.query.limit,
            offset: req.query.offset,
        });

        const data = entries.map((e) => ({
            ...e,
            details: (() => {
                try { return JSON.parse(e.details); }
                catch (_) { return e.details; }
            })(),
        }));

        res.json({ success: true, count: data.length, data });
    } catch (err) {
        next(err);
    }
});

module.exports = router;