"use strict";

const { fingerprint } = require("../database/TenantRepository");
const { AppError } = require("./errorHandler");

/**
 * Builds req.repo, a repository bound to the authenticated tenant.
 * Fails closed: without a validated API key there is no repository.
 */
function tenantRepo(req, res, next) {
    try {
        if (!req.clientId || !req.apiKey) {
            return next(new AppError("Authentication required.", 401, "MISSING_API_KEY"));
        }
        req.repo = req.app.locals.db.forClient(req.clientId, {
            actor: fingerprint(req.apiKey.key),
            ip: req.ip
        });
        return next();
    } catch (err) {
        return next(err);
    }
}

module.exports = { tenantRepo };