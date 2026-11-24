"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const request = require("supertest");
const { fingerprint } = require("../../lib/database/TenantRepository");

describe("HTTP tenant isolation", () => {
    let app, db, testDir, sendSpy, renderSpy, repoA, repoB;
    const keyA = "tenant-a-key-" + "a".repeat(30);
    const keyB = "tenant-b-key-" + "b".repeat(30);
    const originalUploadDir = process.env.UPLOAD_DIR;
    const originalNodeEnv = process.env.NODE_ENV;

    const call = (method, key, url, body) => {
        let r = request(app)[method](url).set("Authorization", `Bearer ${key}`);
        if (body !== undefined) r = r.send(body);
        return r;
    };

    function seed(repo, surname, provider = "umalusi") {
        const c = repo.createCandidate({ surname });
        repo.createVerificationRequest({ candidateId: c.id, provider });
        return c;
    }

    beforeAll(() => {
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), "matric-http-tenants-"));
        const uploadDir = path.join(testDir, "uploads");
        fs.mkdirSync(uploadDir, { recursive: true });
        process.env.NODE_ENV = "test";
        process.env.UPLOAD_DIR = uploadDir;

        jest.isolateModules(() => {
            const DatabaseService = require("../../lib/database/DatabaseService");
            const createApp = require("../../app");
            const Email = require("../../lib/providers/EmailSubmissionService");
            const Renderer = require("../../lib/templates/TemplateRenderer");

            db = new DatabaseService(path.join(testDir, "tenant-http.sqlite"));
            db.createClient({ id: "tenant-a", name: "A", email: null });
            db.createClient({ id: "tenant-b", name: "B", email: null });
            db.createApiKey(keyA, "tenant-a", "A key");
            db.createApiKey(keyB, "tenant-b", "B key");

            sendSpy = jest.spyOn(Email.prototype, "sendVerificationBatch")
                .mockResolvedValue({ messageId: "m-default", sentAt: new Date().toISOString() });
            renderSpy = jest.spyOn(Renderer.prototype, "render")
                .mockResolvedValue({ fileName: "t.xlsx", filePath: "unused", mimeType: "application/octet-stream" });

            app = createApp({ db });
        });

        repoA = db.forClient("tenant-a", { actor: "seed" });
        repoB = db.forClient("tenant-b", { actor: "seed" });
    });

    afterAll(() => {
        if (sendSpy) sendSpy.mockRestore();
        if (renderSpy) renderSpy.mockRestore();
        if (db) db.close();
        if (testDir && fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
        if (originalUploadDir === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = originalUploadDir;
        if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
    });

    beforeEach(() => { sendSpy.mockClear(); });

    test("every v1 route rejects requests without a key", async () => {
        for (const url of ["stats", "candidates", "batches", "reviews", "audit", "keys"]) {
            const res = await request(app).get(`/api/v1/${url}`);
            expect([url, res.status]).toEqual([url, 401]);
        }
    });

    test("the old unauthenticated mounts no longer exist", async () => {
        for (const url of ["/api/stats", "/api/batches", "/api/reviews/pending"]) {
            const res = await request(app).get(url);
            expect([url, res.status]).toEqual([url, 404]);
        }
    });

    test("tenant B cannot read, list or update tenant A's candidate", async () => {
        const c = repoA.createCandidate({ surname: "ALPHA" });
        expect((await call("get", keyB, `/api/v1/candidates/${c.id}`)).status).toBe(404);
        const list = await call("get", keyB, "/api/v1/candidates");
        expect(list.body.data.map((x) => x.id)).not.toContain(c.id);
        expect((await call("patch", keyB, `/api/v1/candidates/${c.id}`, { surname: "HACK" })).status).toBe(404);
        expect(repoA.getCandidate(c.id).surname).toBe("ALPHA");
        expect((await call("get", keyA, `/api/v1/candidates/${c.id}`)).status).toBe(200);
    });

    test("stats are per tenant", async () => {
        const a = await call("get", keyA, "/api/v1/stats");
        const b = await call("get", keyB, "/api/v1/stats");
        expect(a.body.data.candidates).toBe(repoA.getStats().candidates);
        expect(b.body.data.candidates).toBe(repoB.getStats().candidates);
        expect(a.body.data.candidates).not.toBe(b.body.data.candidates);
    });

    test("reviews: foreign extraction rejected, reviewer cannot be spoofed, completes once", async () => {
        const doc = repoA.createDocument({ originalFilename: "a.pdf" });
        const ext = repoA.createExtraction({ documentId: doc.id, extractedFields: {} });
        const payload = { extractionId: ext.id, fieldsToReview: [{ field: "x" }] };

        expect((await call("post", keyB, "/api/v1/reviews", payload)).status).toBe(404);

        const made = await call("post", keyA, "/api/v1/reviews", payload);
        expect(made.status).toBe(201);
        const id = made.body.data.id;

        expect((await call("get", keyB, `/api/v1/reviews/${id}`)).status).toBe(404);
        expect((await call("patch", keyB, `/api/v1/reviews/${id}`, { corrections: { x: 1 } })).status).toBe(404);
        const pendingB = await call("get", keyB, "/api/v1/reviews/pending");
        expect(pendingB.body.data.map((r) => r.id)).not.toContain(id);

        const done = await call("patch", keyA, `/api/v1/reviews/${id}`, { corrections: { x: 1 }, reviewer: "evil" });
        expect(done.status).toBe(200);
        expect(done.body.data.reviewer).toBe(fingerprint(keyA));
        expect(done.body.data.reviewer).not.toBe("evil");

        expect((await call("patch", keyA, `/api/v1/reviews/${id}`, { corrections: { x: 2 } })).status).toBe(409);
    });

    test("keys are always minted for the caller's tenant and never list key material", async () => {
        const res = await call("post", keyA, "/api/v1/keys", { label: "extra", clientId: "tenant-b" });
        expect(res.status).toBe(201);
        expect(res.body.clientId).toBeUndefined();
        const row = db.db.prepare("SELECT client_id FROM api_keys WHERE key = ?").get(res.body.key);
        expect(row.client_id).toBe("tenant-a");

        const list = await call("get", keyA, "/api/v1/keys");
        expect(JSON.stringify(list.body)).not.toContain(res.body.key);
        list.body.data.forEach((k) => expect(k.key).toBeUndefined());
        expect(list.body.data.map((k) => k.id)).toContain(res.body.id);

        const listB = await call("get", keyB, "/api/v1/keys");
        expect(listB.body.data.map((k) => k.id)).not.toContain(res.body.id);
    });

    test("revocation is tenant-bound, and a key cannot revoke itself", async () => {
        const extra = await call("post", keyA, "/api/v1/keys", { label: "tmp" });
        expect(extra.status).toBe(201);

        expect((await call("delete", keyB, `/api/v1/keys/${extra.body.id}`)).status).toBe(404);
        expect((await call("get", extra.body.key, "/api/v1/stats")).status).toBe(200);

        expect((await call("delete", keyA, `/api/v1/keys/${fingerprint(keyA)}`)).status).toBe(409);

        expect((await call("delete", keyA, `/api/v1/keys/${extra.body.id}`)).status).toBe(200);
        expect((await call("get", extra.body.key, "/api/v1/stats")).status).toBe(401);
    });

    test("audit log is tenant-scoped, even with limit=-1, and holds no raw keys", async () => {
        repoA.createCandidate({ surname: "AUDITED" });
        repoB.createCandidate({ surname: "OTHER" });
        for (const query of ["", "?limit=-1"]) {
            const res = await call("get", keyA, `/api/v1/audit${query}`);
            expect(res.status).toBe(200);
            expect(res.body.data.length).toBeGreaterThan(0);
            res.body.data.forEach((row) => expect(row.client_id).toBe("tenant-a"));
            const text = JSON.stringify(res.body);
            expect(text).not.toContain(keyA);
            expect(text).not.toContain(keyB);
        }
    });

    let batchId;

    test("batches: foreign candidates rejected, own batch invisible to other tenants", async () => {
        const a1 = seed(repoA, "BATCH-A1");
        const a2 = seed(repoA, "BATCH-A2");
        const b1 = seed(repoB, "BATCH-B1");

        const foreign = await call("post", keyA, "/api/v1/batches", { providerId: "umalusi", candidateIds: [a1.id, b1.id] });
        expect(foreign.status).toBe(404);

        const ok = await call("post", keyA, "/api/v1/batches", { providerId: "umalusi", candidateIds: [a1.id, a2.id] });
        expect(ok.status).toBe(201);
        batchId = ok.body.data[0].id;

        expect((await call("get", keyB, `/api/v1/batches/${batchId}`)).status).toBe(404);
        expect((await call("get", keyB, `/api/v1/batches/${batchId}/download`)).status).toBe(404);
        expect((await call("post", keyB, `/api/v1/batches/${batchId}/submit`)).status).toBe(404);
        expect(sendSpy).not.toHaveBeenCalled();
        const listB = await call("get", keyB, "/api/v1/batches");
        expect(listB.body.data.map((b) => b.id)).not.toContain(batchId);
    });

    test("batch submit sends exactly the stored members, once", async () => {
        const expected = repoA.getBatchMembers(batchId).map((m) => m.id);
        expect(expected.length).toBeGreaterThan(0);

        sendSpy.mockResolvedValueOnce({ messageId: "m1", sentAt: new Date().toISOString() });
        const res = await call("post", keyA, `/api/v1/batches/${batchId}/submit`);
        expect(res.status).toBe(200);
        expect(res.body.emailMessageId).toBe("m1");

        const sentBatch = sendSpy.mock.calls[0][0];
        expect(sentBatch.candidates.map((c) => c.id)).toEqual(expected);
        const bIds = db.db.prepare("SELECT id FROM candidates WHERE client_id = 'tenant-b'").all().map((r) => r.id);
        sentBatch.candidates.forEach((c) => expect(bIds).not.toContain(c.id));

        expect(["Draft", "Submitting"]).not.toContain(repoA.getBatch(batchId).status);

        const again = await call("post", keyA, `/api/v1/batches/${batchId}/submit`);
        expect(again.status).toBe(409);
        expect(sendSpy).toHaveBeenCalledTimes(1);
    });

    test("a failed send returns the batch to Draft with the reason recorded", async () => {
        const c = seed(repoA, "BATCH-FAIL");
        const created = await call("post", keyA, "/api/v1/batches", { providerId: "umalusi", candidateIds: [c.id] });
        expect(created.status).toBe(201);
        const id = created.body.data[0].id;

        sendSpy.mockRejectedValueOnce(new Error("smtp down"));
        const res = await call("post", keyA, `/api/v1/batches/${id}/submit`);
        expect(res.status).toBe(500);

        const row = repoA.getBatch(id);
        expect(row.status).toBe("Draft");
        expect(row.failure_reason).toContain("smtp down");
    });

    test("a tenant cannot exceed the active key limit", async () => {
        let active = repoA.listApiKeys().filter((k) => k.active === 1).length;
        for (let i = 0; active < 20; i++, active++) {
            repoA.createApiKey("cap-key-" + i + "-" + "z".repeat(30), "cap");
        }
        const res = await call("post", keyA, "/api/v1/keys", { label: "one too many" });
        expect(res.status).toBe(409);
    });
});