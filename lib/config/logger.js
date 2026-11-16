"use strict";

const env = require("./env");

/**
 * Structured logger.
 *
 * Uses pino if available (recommended for production),
 * otherwise falls back to a lightweight JSON logger built on console.
 */

let logger;

try {
    const pino = require("pino");
    logger = pino({
        level: env.logLevel,
        ...(env.isDevelopment && {
            transport: {
                target: "pino-pretty",
                options: {
                    colorize: true,
                    translateTime: "SYS:HH:MM:ss",
                    ignore: "pid,hostname",
                },
            },
        }),
    });
} catch (_) {
    // Fallback JSON logger — identical API surface to pino
    const levels = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
    const currentLevel = levels[env.logLevel] || 30;

    const log = (level, levelNum, obj, msg) => {
        if (levelNum < currentLevel) return;
        const timestamp = new Date().toISOString();
        if (typeof obj === "string") {
            // log(level, message) — no extra object
            if (env.isDevelopment) {
                console[level === "error" || level === "fatal" ? "error" : level === "warn" ? "warn" : "log"](
                    `[${timestamp}] ${level.toUpperCase()} ${obj}`
                );
            } else {
                process.stdout.write(JSON.stringify({ level: levelNum, time: Date.now(), msg: obj }) + "\n");
            }
        } else {
            if (env.isDevelopment) {
                const extra = obj && Object.keys(obj).length ? ` ${JSON.stringify(obj)}` : "";
                console[level === "error" || level === "fatal" ? "error" : level === "warn" ? "warn" : "log"](
                    `[${timestamp}] ${level.toUpperCase()} ${msg || ""}${extra}`
                );
            } else {
                process.stdout.write(JSON.stringify({ level: levelNum, time: Date.now(), msg, ...obj }) + "\n");
            }
        }
    };

    logger = {
        trace: (obj, msg) => log("trace", 10, obj, msg),
        debug: (obj, msg) => log("debug", 20, obj, msg),
        info:  (obj, msg) => log("info",  30, obj, msg),
        warn:  (obj, msg) => log("warn",  40, obj, msg),
        error: (obj, msg) => log("error", 50, obj, msg),
        fatal: (obj, msg) => log("fatal", 60, obj, msg),
        child: () => logger,
    };
}

module.exports = logger;
