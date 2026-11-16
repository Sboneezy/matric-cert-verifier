"use strict";

const { AppError } = require("./errorHandler");
const DatabaseService = require("../database/DatabaseService");
const env = require("../config/env");
const logger = require("../config/logger");

/**
 * API key authentication middleware.
 *
 * Expects:  Authorization: Bearer <api-key>
 *
 * In development, if no API keys exist in the database yet,
 * the first request is allowed through so the seed key can be created.
 */
function requireApiKey(db) {
    return async function apiKeyMiddleware(req, res, next) {
        const authHeader = req.headers["authorization"] || "";
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice(7).trim()
            : null;

        if (!token) {
            return next(new AppError("Missing API key. Use: Authorization: Bearer <api-key>", 401, "MISSING_API_KEY"));
        }

        try {
            const keyRecord = db.getApiKey(token);

            if (!keyRecord) {
                logger.warn({ ip: req.ip, path: req.path }, "Invalid API key attempt");
                return next(new AppError("Invalid or revoked API key.", 401, "INVALID_API_KEY"));
            }

            // Attach key metadata to the request for use in route handlers
            req.apiKey = keyRecord;
            req.clientId = keyRecord.client_id;

            db.touchApiKeyLastUsed(token);

            next();
        } catch (err) {
            next(err);
        }
    };
}

/**
 * Skip auth for routes that are purely internal / public.
 */
function optionalApiKey(db) {
    return async function optionalApiKeyMiddleware(req, res, next) {
        const authHeader = req.headers["authorization"] || "";
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice(7).trim()
            : null;

        if (token) {
            try {
                const keyRecord = db.getApiKey(token);
                if (keyRecord) {
                    req.apiKey = keyRecord;
                    req.clientId = keyRecord.client_id;
                    db.touchApiKeyLastUsed(token);
                }
            } catch (_) {
                // Ignore errors in optional auth
            }
        }

        next();
    };
}

module.exports = { requireApiKey, optionalApiKey };
