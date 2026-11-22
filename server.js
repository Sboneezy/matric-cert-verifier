"use strict";

const env = require("./lib/config/env");
const logger = require("./lib/config/logger");
const DatabaseService = require("./lib/database/DatabaseService");
const createApp = require("./app");

const db = new DatabaseService(env.dbPath);

logger.info(
    { dbPath: env.dbPath },
    "Database initialised"
);

const app = createApp({ db });

const server = app.listen(env.port, () => {
    logger.info(
        { port: env.port, env: env.nodeEnv },
        `Matric Certificate Verifier running on http://localhost:${env.port}`
    );

    if (env.isDevelopment) {
        if (!db.getClient("dev")) {
            db.createClient({
                id: "dev",
                name: "Development",
                email: null
            });
        }

        if (db.listApiKeys().length === 0) {
            const SecurityService = require("./lib/security/SecurityService");
            const security = new SecurityService();
            const key = security.generateApiKey();

            db.createApiKey(key, "dev", "Development bootstrap key");

            logger.warn(
                { key },
                "DEV BOOTSTRAP KEY created - use this for local API calls"
            );
        }
    }
});

let isShuttingDown = false;

function shutdown(signal) {
    if (isShuttingDown) {
        logger.warn({ signal }, "Shutdown already in progress");
        return;
    }

    isShuttingDown = true;

    logger.info(
        { signal },
        "Shutdown signal received - closing gracefully"
    );

    const forceShutdown = setTimeout(() => {
        logger.error("Forced shutdown after timeout");
        process.exit(1);
    }, 10000);

    forceShutdown.unref();

    server.close((serverError) => {
        clearTimeout(forceShutdown);

        if (serverError) {
            logger.error(
                { err: serverError },
                "Error while closing HTTP server"
            );
        } else {
            logger.info("HTTP server closed");
        }

        try {
            db.close();
            logger.info("Database connection closed");
        } catch (dbError) {
            logger.error(
                { err: dbError },
                "Error while closing database"
            );
            process.exit(1);
        }

        process.exit(serverError ? 1 : 0);
    });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception - shutting down");
    process.exit(1);
});
