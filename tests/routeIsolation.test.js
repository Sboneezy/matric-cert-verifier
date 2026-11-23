"use strict";

const fs = require("fs");
const path = require("path");
const { tenantRepo } = require("../lib/middleware/tenant");

const ROUTES_DIR = path.join(__dirname, "..", "lib", "routes");

// Routes already moved to req.repo. These must never touch the global db.
const MIGRATED = ["stats.js", "audit.js", "verify.js", "reviews.js", "batches.js", "keys.js"];
// Still on the legacy path. Move each to MIGRATED as it is converted.
const PENDING = ["candidates.js"];

const GLOBAL_DB = /locals\.db|\bdb\.(create|get|list|update|save|log|revoke|touch)[A-Za-z]*\(/;

describe("route isolation inventory", () => {
    const files = fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".js"));

    test("every route file is classified, so new routes force a decision", () => {
        const unclassified = files.filter(
            (f) => !MIGRATED.includes(f) && !PENDING.includes(f));
        expect(unclassified).toEqual([]);
    });

    test.each(MIGRATED)("%s uses req.repo and never the global db", (file) => {
        const src = fs.readFileSync(path.join(ROUTES_DIR, file), "utf8");
        expect(src).toMatch(/router\.use\(tenantRepo\)/);
        expect(src).toMatch(/req\.repo\./);
        expect(src).not.toMatch(GLOBAL_DB);
    });

    test.each(PENDING)("%s is still on the legacy path", (file) => {
        // Documents the remaining work. Fails when a file is migrated
        // but not moved to MIGRATED, so the list stays honest.
        const src = fs.readFileSync(path.join(ROUTES_DIR, file), "utf8");
        expect(src).toMatch(GLOBAL_DB);
    });
});

describe("tenantRepo middleware", () => {
    function run(req) {
        let err;
        tenantRepo(req, {}, (e) => { err = e; });
        return err;
    }

    test("rejects requests with no authenticated tenant", () => {
        const err = run({ app: { locals: { db: { forClient: jest.fn() } } } });
        expect(err).toBeDefined();
        expect(err.message).toMatch(/authentication required/i);
    });

    test("rejects a tenant id without an api key record", () => {
        const forClient = jest.fn();
        const err = run({ clientId: "a", app: { locals: { db: { forClient } } } });
        expect(err).toBeDefined();
        expect(forClient).not.toHaveBeenCalled();
    });

    test("binds the repository to the authenticated tenant and never the raw key", () => {
        const forClient = jest.fn(() => ({}));
        const req = {
            clientId: "a", ip: "1.2.3.4",
            apiKey: { key: "k".repeat(40) },
            app: { locals: { db: { forClient } } }
        };
        const err = run(req);
        expect(err).toBeUndefined();
        const [tenant, ctx] = forClient.mock.calls[0];
        expect(tenant).toBe("a");
        expect(ctx.actor).not.toContain("kkkk");
        expect(ctx.ip).toBe("1.2.3.4");
        expect(req.repo).toBeDefined();
    });
});