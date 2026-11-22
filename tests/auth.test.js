"use strict";

const { requireApiKey, optionalApiKey } = require("../lib/middleware/auth");

describe("API key authentication", () => {
    let db;
    let req;
    let next;

    beforeEach(() => {
        db = {
            getApiKey: jest.fn(),
            getClient: jest.fn(),
            touchApiKeyLastUsed: jest.fn(),
        };

        req = {
            headers: {},
            ip: "127.0.0.1",
            path: "/api/v1/test",
        };

        next = jest.fn();
    });

    test("accepts a valid key belonging to an existing client", async () => {
        const keyRecord = {
            key: "valid-key",
            client_id: "client-a",
        };

        req.headers.authorization = "Bearer valid-key";
        db.getApiKey.mockReturnValue(keyRecord);
        db.getClient.mockReturnValue({ id: "client-a" });

        await requireApiKey(db)(req, {}, next);

        expect(req.apiKey).toBe(keyRecord);
        expect(req.clientId).toBe("client-a");
        expect(db.touchApiKeyLastUsed).toHaveBeenCalledWith("valid-key");
        expect(next).toHaveBeenCalledWith();
    });

    test("rejects a missing API key", async () => {
        await requireApiKey(db)(req, {}, next);

        const error = next.mock.calls[0][0];

        expect(error.statusCode).toBe(401);
        expect(error.code).toBe("MISSING_API_KEY");
        expect(db.getApiKey).not.toHaveBeenCalled();
    });

    test("rejects an invalid or revoked API key", async () => {
        req.headers.authorization = "Bearer invalid-key";
        db.getApiKey.mockReturnValue(null);

        await requireApiKey(db)(req, {}, next);

        const error = next.mock.calls[0][0];

        expect(error.statusCode).toBe(401);
        expect(error.code).toBe("INVALID_API_KEY");
        expect(db.touchApiKeyLastUsed).not.toHaveBeenCalled();
    });

    test.each([null, "", "   "])(
        "rejects an API key with an unassigned client ID: %p",
        async (clientId) => {
            req.headers.authorization = "Bearer legacy-key";
            db.getApiKey.mockReturnValue({
                key: "legacy-key",
                client_id: clientId,
            });

            await requireApiKey(db)(req, {}, next);

            const error = next.mock.calls[0][0];

            expect(error.statusCode).toBe(401);
            expect(error.code).toBe("INVALID_API_KEY");
            expect(db.getClient).not.toHaveBeenCalled();
            expect(db.touchApiKeyLastUsed).not.toHaveBeenCalled();
        }
    );

    test("rejects a key referencing a nonexistent client", async () => {
        req.headers.authorization = "Bearer orphan-key";
        db.getApiKey.mockReturnValue({
            key: "orphan-key",
            client_id: "deleted-client",
        });
        db.getClient.mockReturnValue(undefined);

        await requireApiKey(db)(req, {}, next);

        const error = next.mock.calls[0][0];

        expect(error.statusCode).toBe(401);
        expect(error.code).toBe("INVALID_API_KEY");
        expect(db.getClient).toHaveBeenCalledWith("deleted-client");
        expect(db.touchApiKeyLastUsed).not.toHaveBeenCalled();
    });

    test("optional authentication does not attach an unassigned tenant", async () => {
        req.headers.authorization = "Bearer legacy-key";
        db.getApiKey.mockReturnValue({
            key: "legacy-key",
            client_id: null,
        });

        await optionalApiKey(db)(req, {}, next);

        expect(req.apiKey).toBeUndefined();
        expect(req.clientId).toBeUndefined();
        expect(db.touchApiKeyLastUsed).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith();
    });

    test("optional authentication attaches a valid tenant", async () => {
        const keyRecord = {
            key: "valid-key",
            client_id: "client-a",
        };

        req.headers.authorization = "Bearer valid-key";
        db.getApiKey.mockReturnValue(keyRecord);
        db.getClient.mockReturnValue({ id: "client-a" });

        await optionalApiKey(db)(req, {}, next);

        expect(req.apiKey).toBe(keyRecord);
        expect(req.clientId).toBe("client-a");
        expect(db.touchApiKeyLastUsed).toHaveBeenCalledWith("valid-key");
        expect(next).toHaveBeenCalledWith();
    });
});
