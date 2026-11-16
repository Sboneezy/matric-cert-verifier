"use strict";

// Load env + validate before anything else
const env    = require("./lib/config/env");
const logger = require("./lib/config/logger");

const express      = require("express");
const path         = require("path");
const helmet       = require("helmet");
const cors         = require("cors");
const rateLimit    = require("express-rate-limit");

const DatabaseService  = require("./lib/database/DatabaseService");
const { requireApiKey } = require("./lib/middleware/auth");
const requestLogger    = require("./lib/middleware/requestLogger");
const { errorHandler, notFoundHandler } = require("./lib/middleware/errorHandler");

// ── Routes ────────────────────────────────────────────────────────────
const verifyRouter     = require("./lib/routes/verify");
const candidatesRouter = require("./lib/routes/candidates");
const batchesRouter    = require("./lib/routes/batches");
const reviewsRouter    = require("./lib/routes/reviews");
const auditRouter      = require("./lib/routes/audit");
const statsRouter      = require("./lib/routes/stats");
const keysRouter       = require("./lib/routes/keys");

// ── Database ──────────────────────────────────────────────────────────
const db = new DatabaseService(env.dbPath);
logger.info({ dbPath: env.dbPath }, "Database initialised");

// ── Express app ───────────────────────────────────────────────────────
const app = express();

// Trust proxy (needed for correct req.ip behind nginx/load balancer)
app.set("trust proxy", 1);

// ── Security headers ──────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc:  ["'self'", "'unsafe-inline'"],  // needed for inline script in index.html
            styleSrc:   ["'self'", "'unsafe-inline'"],
            imgSrc:     ["'self'", "data:"],
        },
    },
}));

app.use(cors({
    origin: env.isDevelopment ? "*" : (process.env.ALLOWED_ORIGINS || "").split(","),
    methods: ["GET", "POST", "PATCH", "DELETE"],
}));

// ── Rate limiting ─────────────────────────────────────────────────────
const limiter = rateLimit({
    windowMs: env.rateLimit.windowMs,
    max:      env.rateLimit.max,
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, error: { message: "Too many requests, please try again later." } },
});

app.use("/api/", limiter);

// ── Body parsers ──────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ── Request logging ───────────────────────────────────────────────────
app.use(requestLogger);

// ── Make DB available to all routes ──────────────────────────────────
app.locals.db = db;

// ── Public routes (no auth required) ─────────────────────────────────
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
        name:    "Matric Certificate Verifier",
        version: require("./package.json").version,
        status:  "running",
        docs:    "/api/v1",
    });
});

// Serve the frontend SPA
app.use(express.static(path.join(__dirname, "public")));

// ── Alias routes for the existing frontend (pre-API-version) ─────────
// These don't require auth so the static HTML page works without a key
app.use("/api/stats",           statsRouter);
app.use("/api/batches",         batchesRouter);
app.use("/api/reviews",         reviewsRouter);

// ── Authenticated API routes ──────────────────────────────────────────
const apiAuth = requireApiKey(db);

app.use("/api/v1/verify",      apiAuth, verifyRouter);
app.use("/api/v1/candidates",  apiAuth, candidatesRouter);
app.use("/api/v1/batches",     apiAuth, batchesRouter);
app.use("/api/v1/reviews",     apiAuth, reviewsRouter);
app.use("/api/v1/audit",       apiAuth, auditRouter);
app.use("/api/v1/stats",       apiAuth, statsRouter);
app.use("/api/v1/keys",        apiAuth, keysRouter);

// Legacy /verify route kept for backward compatibility
app.use("/verify", apiAuth, verifyRouter);

// ── 404 + Error handling ──────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Graceful shutdown ─────────────────────────────────────────────────
let server;

function shutdown(signal) {
    logger.info({ signal }, "Shutdown signal received — closing gracefully");
    server.close(() => {
        logger.info("HTTP server closed");
        db.close();
        logger.info("Database connection closed");
        process.exit(0);
    });

    // Force-kill if still open after 10 s
    setTimeout(() => {
        logger.error("Forced shutdown after timeout");
        process.exit(1);
    }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// Catch unhandled rejections so the process doesn't crash silently
process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception — shutting down");
    process.exit(1);
});

// ── Start server ──────────────────────────────────────────────────────
server = app.listen(env.port, () => {
    logger.info(
        { port: env.port, env: env.nodeEnv },
        `Matric Certificate Verifier running on http://localhost:${env.port}`
    );

    // Seed a bootstrap API key in development if none exist
    if (env.isDevelopment) {
        const existing = db.listApiKeys();
        if (existing.length === 0) {
            const SecurityService = require("./lib/security/SecurityService");
            const sec = new SecurityService();
            const key = sec.generateApiKey();
            db.createApiKey(key, "dev", "Development bootstrap key");
            logger.warn(
                { key },
                "⚠  DEV BOOTSTRAP KEY created — use this for local API calls"
            );
        }
    }
});

module.exports = app;
