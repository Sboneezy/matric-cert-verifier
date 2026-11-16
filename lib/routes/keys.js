"use strict";

const express = require("express");
const SecurityService = require("../security/SecurityService");
const { AppError }    = require("../middleware/errorHandler");
const logger          = require("../config/logger");

const router = express.Router();
const security = new SecurityService();

/**
 * GET /api/v1/keys
 * List all API keys (masked).
 */
router.get("/", (req, res, next) => {
    try {
        const db   = req.app.locals.db;
        const keys = db.listApiKeys().map((k) => ({
            ...k,
            // Mask all but the first 8 chars of the key
            key: k.key.substring(0, 8) + "..." + k.key.slice(-4),
        }));

        res.json({ success: true, data: keys });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/v1/keys
 * Generate a new API key.
 *
 * Body (JSON):
 *   label    — human-readable label for the key
 *   clientId — optional client/organization ID
 */
router.post("/", (req, res, next) => {
    try {
        const db    = req.app.locals.db;
        const { label, clientId } = req.body;

        const key = security.generateApiKey();
        db.createApiKey(key, clientId || null, label || null);

        db.logAudit("CREATE", "api_key", key.substring(0, 12) + "...", { label, clientId }, req.clientId, req.ip);
        logger.info({ label, clientId }, "API key generated");

        // Return the full key ONCE — it cannot be retrieved again
        res.status(201).json({
            success: true,
            message: "Store this key securely — it will not be shown again.",
            key,
            label,
            clientId,
        });
    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/v1/keys/:key
 * Revoke an API key.
 */
router.delete("/:key", (req, res, next) => {
    try {
        const db = req.app.locals.db;
        db.revokeApiKey(req.params.key);
        db.logAudit("REVOKE", "api_key", req.params.key, {}, req.clientId, req.ip);
        logger.info({ key: req.params.key }, "API key revoked");
        res.json({ success: true, message: "API key revoked." });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
