"use strict";

const express = require("express");

const router = express.Router();

/**
 * GET /api/v1/audit
 * Retrieve the audit log.
 *
 * Query params:
 *   entityType  — filter by entity type (optional)
 *   limit       (default 100, max 500)
 *   offset      (default 0)
 */
router.get("/", (req, res, next) => {
    try {
        const db         = req.app.locals.db;
        const limit      = Math.min(parseInt(req.query.limit, 10)  || 100, 500);
        const offset     = parseInt(req.query.offset, 10) || 0;
        const entityType = req.query.entityType || null;

        const entries = db.getAuditLog({ entityType, limit, offset });

        // Parse the JSON details field for readability
        const data = entries.map((e) => ({
            ...e,
            details: (() => {
                try { return JSON.parse(e.details); }
                catch (_) { return e.details; }
            })(),
        }));

        res.json({ success: true, total: data.length, limit, offset, data });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
