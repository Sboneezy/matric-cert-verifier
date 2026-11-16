"use strict";

const logger = require("../config/logger");
const env = require("../config/env");

/**
 * Central error handling middleware.
 * Must be registered LAST in the Express middleware chain.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
    const statusCode = err.statusCode || err.status || 500;
    const isOperational = err.isOperational === true;

    // Log every error with context
    logger.error(
        {
            err: {
                message: err.message,
                stack: err.stack,
                code: err.code,
            },
            req: {
                method: req.method,
                url: req.url,
                ip: req.ip,
            },
        },
        "Request error"
    );

    // Don't leak stack traces in production
    const body = {
        success: false,
        error: {
            message: isOperational || env.isDevelopment
                ? err.message
                : "An unexpected error occurred.",
            ...(env.isDevelopment && { stack: err.stack }),
            ...(err.code && { code: err.code }),
        },
    };

    res.status(statusCode).json(body);
}

/**
 * 404 handler — must be registered before errorHandler.
 */
function notFoundHandler(req, res, next) {
    const err = new AppError(`Route not found: ${req.method} ${req.url}`, 404);
    next(err);
}

/**
 * Operational error class — use for expected business errors.
 */
class AppError extends Error {
    constructor(message, statusCode = 500, code = null) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        if (code) this.code = code;
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = { errorHandler, notFoundHandler, AppError };
