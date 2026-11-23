"use strict";

const express = require("express");
const SecurityService = require("../security/SecurityService");
const { AppError } = require("../middleware/errorHandler");
const { tenantRepo } = require("../middleware/tenant");
const logger = require("../config/logger");

const router = express.Router();
router.use(tenantRepo);

const security = new SecurityService();
const MAX_ACTIVE_KEYS = 20;
const FINGERPRINT = /^[0-9a-f]{16}$/;

/**
 * GET /api/v1/keys
 * The authenticated tenant's keys. Fingerprints only, never key material.
 */
router.get("/", (req, res, next) => {
    try {
        res.json({ success: true, data: req.repo.listApiKeys() });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/v1/keys
 * Generate a key for the authenticated tenant.
 *
 * Body (JSON):
 *   label - optional human-readable label
 *
 * Any clientId in the body is ignored: a key can only be minted
 * for the tenant that is making the request.
 */
router.post("/", (req, res, next) => {
    try {
        const label = typeof req.body?.label === "string"
            ? req.body.label.trim().slice(0, 100) || null
            : null;

        const active = req.repo.listApiKeys().filter((k) => k.active === 1).length;
        if (active >= MAX_ACTIVE_KEYS) {
            return next(new AppError(
                `Active key limit reached (${MAX_ACTIVE_KEYS}). Revoke a key first.`,
                409
            ));
        }

        const key = security.generateApiKey();
        const created = req.repo.createApiKey(key, label);

        logger.info({ keyId: created.id, label }, "API key generated");

        // The raw key is shown once and cannot be retrieved again.
        res.status(201).json({
            success: true,
            message: "Store this key securely. It will not be shown again.",
            key,
            id: created.id,
            label: created.label,
        });
    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/v1/keys/:id
 * Revoke one of the tenant's keys by fingerprint.
 */
router.delete("/:id", (req, res, next) => {
    try {
        const id = req.params.id;

        if (!FINGERPRINT.test(id)) {
            return next(new AppError("API key not found.", 404));
        }
        if (id === req.repo.actor) {
            return next(new AppError(
                "A key cannot revoke itself. Use another key.",
                409
            ));
        }

        req.repo.revokeApiKey(id);

        logger.info({ keyId: id }, "API key revoked");
        res.json({ success: true, message: "API key revoked." });
    } catch (err) {
        next(err);
    }
});

module.exports = router;