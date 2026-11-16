"use strict";

const logger = require("../config/logger");

/**
 * HTTP request logger middleware.
 * Logs method, URL, status code and response time for every request.
 */
function requestLogger(req, res, next) {
    const start = Date.now();

    res.on("finish", () => {
        const duration = Date.now() - start;
        const level = res.statusCode >= 500 ? "error"
            : res.statusCode >= 400 ? "warn"
            : "info";

        logger[level](
            {
                method: req.method,
                url: req.url,
                statusCode: res.statusCode,
                duration: `${duration}ms`,
                ip: req.ip,
                userAgent: req.headers["user-agent"],
            },
            `${req.method} ${req.url} ${res.statusCode} ${duration}ms`
        );
    });

    next();
}

module.exports = requestLogger;
