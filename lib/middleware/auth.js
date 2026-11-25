"use strict";

const { AppError } = require("./errorHandler");
const logger = require("../config/logger");

function getValidTenantKey(db, token) {
    const keyRecord = db.getApiKey(token);

    if (!keyRecord) {
        return null;
    }

    if (
        typeof keyRecord.client_id !== "string" ||
        !keyRecord.client_id.trim() ||
        !db.getClient(keyRecord.client_id)
    ) {
        return null;
    }

    return keyRecord;
}

/**
 * API key authentication middleware.
 *
 * Expects: Authorization: Bearer <api-key>
 * Only API keys belonging to an existing client establish tenant identity.
 */
function requireApiKey(db) {
    return async function apiKeyMiddleware(req, res, next) {
        const authHeader = req.headers["authorization"] || "";
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice(7).trim()
            : null;

        if (!token) {
            return next(new AppError(
                "Missing API key. Use: Authorization: Bearer <api-key>",
                401,
                "MISSING_API_KEY"
            ));
        }

        try {
            const keyRecord = getValidTenantKey(db, token);

            if (!keyRecord) {
                logger.warn(
                    { ip: req.ip, path: req.path },
                    "Invalid API key or unassigned tenant attempt"
                );

                return next(new AppError(
                    "Invalid or revoked API key.",
                    401,
                    "INVALID_API_KEY"
                ));
            }

            req.apiKey = keyRecord;
            req.clientId = keyRecord.client_id;

            db.touchApiKeyLastUsed(token);

            return next();
        } catch (err) {
            return next(err);
        }
    };
}

/**
 * Optional authentication.
 * Invalid or unassigned keys do not establish tenant identity.
 */
function optionalApiKey(db) {
    return async function optionalApiKeyMiddleware(req, res, next) {
        const authHeader = req.headers["authorization"] || "";
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice(7).trim()
            : null;

        if (token) {
            try {
                const keyRecord = getValidTenantKey(db, token);

                if (keyRecord) {
                    req.apiKey = keyRecord;
                    req.clientId = keyRecord.client_id;
                    db.touchApiKeyLastUsed(token);
                }
            } catch (_) {
                // Preserve optional authentication behavior.
            }
        }

        return next();
    };
}

module.exports = { requireApiKey, optionalApiKey };
