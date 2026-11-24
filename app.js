
"use strict";

const env = require("./lib/config/env");
const express = require("express");
const path = require("path");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const { requireApiKey } = require("./lib/middleware/auth");
const requestLogger = require("./lib/middleware/requestLogger");

const {
    errorHandler,
    notFoundHandler
} = require("./lib/middleware/errorHandler");

const verifyRouter = require("./lib/routes/verify");
const candidatesRouter = require("./lib/routes/candidates");
const batchesRouter = require("./lib/routes/batches");
const reviewsRouter = require("./lib/routes/reviews");
const auditRouter = require("./lib/routes/audit");
const statsRouter = require("./lib/routes/stats");
const keysRouter = require("./lib/routes/keys");

function createApp({ db } = {}) {
    if (!db) {
        throw new Error("createApp requires a database instance.");
    }

    const app = express();

    app.set("trust proxy", 1);
    app.locals.db = db;

    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:"],
            },
        },
    }));

    app.use(cors({
        origin: env.isDevelopment
            ? "*"
            : (process.env.ALLOWED_ORIGINS || "").split(","),
        methods: ["GET", "POST", "PATCH", "DELETE"],
    }));

    app.use("/api/", rateLimit({
        windowMs: env.rateLimit.windowMs,
        max: env.rateLimit.max,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
            success: false,
            error: {
                message: "Too many requests, please try again later."
            }
        },
    }));

    app.use(express.json({ limit: "1mb" }));
    app.use(express.urlencoded({ extended: true, limit: "1mb" }));
    app.use(requestLogger);

    app.get("/health", (req, res) => {
        res.json({
            status: "ok",
            version: require("./package.json").version,
            timestamp: new Date().toISOString(),
            environment: env.nodeEnv,
        });
    });

    app.get("/", (req, res) => {
        res.json({
            name: "Matric Certificate Verifier",
            version: require("./package.json").version,
            status: "running",
            docs: "/api/v1",
        });
    });

    app.use(express.static(path.join(__dirname, "public")));


    // Authenticated API routes
    const apiAuth = requireApiKey(db);

    app.use("/api/v1/verify", apiAuth, verifyRouter);
    app.use("/api/v1/candidates", apiAuth, candidatesRouter);
    app.use("/api/v1/batches", apiAuth, batchesRouter);
    app.use("/api/v1/reviews", apiAuth, reviewsRouter);
    app.use("/api/v1/audit", apiAuth, auditRouter);
    app.use("/api/v1/stats", apiAuth, statsRouter);
    app.use("/api/v1/keys", apiAuth, keysRouter);

    app.use("/verify", apiAuth, verifyRouter);

    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}

module.exports = createApp;