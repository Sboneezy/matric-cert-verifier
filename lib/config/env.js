"use strict";

require("dotenv").config();

/**
 * Environment configuration with validation.
 * Fails fast on startup if required variables are missing.
 */

const REQUIRED_IN_PRODUCTION = ["ENCRYPTION_KEY", "API_KEY_SECRET"];

function validateEnv() {
    if (process.env.NODE_ENV !== "production") return;

    const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(", ")}\n` +
            "Copy .env.example to .env and set all required values."
        );
    }
}

validateEnv();

const env = {
    nodeEnv: process.env.NODE_ENV || "development",
    isProduction: process.env.NODE_ENV === "production",
    isDevelopment: process.env.NODE_ENV !== "production",

    port: parseInt(process.env.PORT, 10) || 3000,

    encryptionKey: process.env.ENCRYPTION_KEY || "dev-encryption-key-do-not-use-in-prod",
    apiKeySecret: process.env.API_KEY_SECRET || "dev-api-key-secret-do-not-use-in-prod",

    dbPath: process.env.DB_PATH || "./data/matric-verifier.db",

    smtp: {
        host: process.env.SMTP_HOST || null,
        port: parseInt(process.env.SMTP_PORT, 10) || 587,
        secure: process.env.SMTP_SECURE === "true",
        user: process.env.SMTP_USER || null,
        pass: process.env.SMTP_PASS || null,
        from: process.env.SMTP_FROM || "verifications@matric-verifier.co.za",
    },

    upload: {
        dir: process.env.UPLOAD_DIR || "./uploads",
        maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10,
        get maxFileSizeBytes() {
            return env.upload.maxFileSizeMb * 1024 * 1024;
        },
    },

    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
        max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    },

    logLevel: process.env.LOG_LEVEL || "info",
};

module.exports = env;
