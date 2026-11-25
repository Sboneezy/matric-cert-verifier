"use strict";

jest.mock("../lib/config/logger", () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

jest.mock("../lib/config/env", () => ({
    isDevelopment: true,
}));

const logger = require("../lib/config/logger");
const requestLogger = require("../lib/middleware/requestLogger");
const {
    errorHandler,
    notFoundHandler,
} = require("../lib/middleware/errorHandler");

describe("request and error logging", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("request logger records the path without query parameters", () => {
        let finishHandler;
        const req = {
            method: "GET",
            url: "/api/v1/candidates?token=secret-value",
            path: "/api/v1/candidates",
            ip: "127.0.0.1",
            headers: { "user-agent": "Jest" },
        };
        const res = {
            statusCode: 200,
            on: jest.fn((event, callback) => {
                if (event === "finish") finishHandler = callback;
            }),
        };
        const next = jest.fn();

        requestLogger(req, res, next);
        finishHandler();

        expect(next).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledTimes(1);

        const [context, message] = logger.info.mock.calls[0];
        expect(context.url).toBe("/api/v1/candidates");
        expect(message).toContain("/api/v1/candidates");
        expect(message).not.toContain("secret-value");
    });

    test("error handler logs the path without query parameters", () => {
        const req = {
            method: "GET",
            url: "/api/v1/candidates?token=secret-value",
            path: "/api/v1/candidates",
            ip: "127.0.0.1",
        };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };

        errorHandler(new Error("Test failure"), req, res, jest.fn());

        expect(logger.error).toHaveBeenCalledTimes(1);
        const [context] = logger.error.mock.calls[0];
        expect(context.req.url).toBe("/api/v1/candidates");
        expect(JSON.stringify(context)).not.toContain("secret-value");
    });

    test("404 messages contain the path but not the query string", () => {
        const req = {
            method: "GET",
            url: "/missing?token=secret-value",
            path: "/missing",
        };
        const next = jest.fn();

        notFoundHandler(req, {}, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0].message).toBe("Route not found: GET /missing");
        expect(next.mock.calls[0][0].message).not.toContain("secret-value");
    });
});