"use strict";

const path = require("path");
const fs = require("fs");
const DatabaseService = require("../lib/database/DatabaseService");
const BatchEngine = require("../lib/batching/BatchEngine");
const { fingerprint } = require("../lib/database/TenantRepository");

describe("TenantRepository isolation", () => {
    let svc, file, a, b;
    const provider = { id: "umalusi", batchSize: 2 };

    beforeEach(() => {
        file = path.join(__dirname, `tenant-${process.pid}-${Date.now()}.db`);
        svc = new DatabaseService(file);
        svc.createClient({ id: "a", name: "A", email: null });
        svc.createClient({ id: "b", name: "B", email: null });
        a = svc.forClient("a", { actor: "ka", ip: "1.1.1.1" });
        b = svc.forClient("b", { actor: "kb", ip: "2.2.2.2" });
    });

    afterEach(() => {
        svc.close();
        for (const s of ["", "-wal", "-shm"]) {
            if (fs.existsSync(file + s)) fs.unlinkSync(file + s);
        }
    });

    function candidateWithRequest(repo, surname) {
        const cand = repo.createCandidate({ surname });
        repo.createVerificationRequest({ candidateId: cand.id, provider: "umalusi" });
        return cand;
    }

    function extractionFor(repo) {
        const doc = repo.createDocument({ originalFilename: "x.pdf" });
        return repo.createExtraction({ documentId: doc.id, extractedFields: {} });
    }

    test("tenant cannot read, list, update or count another tenant's candidate", () => {
        const c = a.createCandidate({ surname: "A1" });
        expect(b.getCandidate(c.id)).toBeNull();
        expect(b.listCandidates()).toHaveLength(0);
        expect(() => b.updateCandidate(c.id, { surname: "HACK" })).toThrow(/not found/i);
        expect(a.getCandidate(c.id).surname).toBe("A1");
        expect(b.getStats().candidates).toBe(0);
    });

    test("rejects forbidden and injection-style update fields", () => {
        const c = a.createCandidate({ surname: "A1" });
        expect(() => a.updateCandidate(c.id, { id: "z" })).toThrow(/not allowed/i);
        expect(() => a.updateCandidate(c.id, { client_id: "b" })).toThrow(/not allowed/i);
        expect(() => a.updateCandidate(c.id, { "surname = 'x', id": 1 })).toThrow(/not allowed/i);
    });

    test("missing or unknown tenant is rejected", () => {
        expect(() => svc.forClient("", {})).toThrow(/required/i);
        expect(() => svc.forClient(undefined, {})).toThrow(/required/i);
        expect(() => svc.forClient("nope", {})).toThrow(/unknown/i);
    });

    test("pagination limits are clamped", () => {
        for (let i = 0; i < 3; i++) a.createCandidate({ surname: "S" + i });
        expect(a.listCandidates({ limit: -1 }).length).toBe(3);
        expect(a.listCandidates({ limit: "abc", offset: -5 }).length).toBe(3);
    });

    test("cannot create a review against another tenant's extraction", () => {
        const ext = extractionFor(a);
        expect(() => b.createReview({ extractionId: ext.id, fieldsToReview: [{ field: "x" }] }))
            .toThrow(/not found/i);
        expect(b.listReviews()).toHaveLength(0);
    });

    test("review completes once, only for its owner", () => {
        const ext = extractionFor(a);
        const rev = a.createReview({ extractionId: ext.id, fieldsToReview: [{ field: "x" }] });
        expect(() => b.completeReview(rev.id, { corrections: {}, reviewer: "evil" })).toThrow(/not found/i);
        a.completeReview(rev.id, { corrections: { x: 1 }, reviewer: "r1" });
        expect(() => a.completeReview(rev.id, { corrections: {}, reviewer: "r2" })).toThrow(/already/i);
        expect(a.getReview(rev.id).reviewer).toBe("r1");
    });

    test("batch persists exact membership and order, and reloads intact", () => {
        const ids = ["c1", "c2", "c3"].map((s) => candidateWithRequest(a, s).id);
        const created = a.createBatches({
            provider, candidateIds: ids, buildBatches: BatchEngine.createBatches
        });
        expect(created).toHaveLength(2);
        const members = created.flatMap((batch) =>
            a.getBatchMembers(batch.id).map((m) => m.id));
        expect(members).toEqual(ids);
        expect(a.getBatch(created[0].id).status).toBe("Draft");
        expect(b.getBatch(created[0].id)).toBeNull();
        expect(b.getBatchMembers(created[0].id)).toHaveLength(0);
    });

    test("foreign, unknown or duplicate candidate ids reject the whole batch with no partial rows", () => {
        const mine = candidateWithRequest(a, "mine");
        const theirs = candidateWithRequest(b, "theirs");
        const buildBatches = BatchEngine.createBatches;
        expect(() => a.createBatches({ provider, candidateIds: [mine.id, theirs.id], buildBatches }))
            .toThrow(/not found/i);
        expect(() => a.createBatches({ provider, candidateIds: [mine.id, mine.id], buildBatches }))
            .toThrow(/duplicates/i);
        expect(a.listBatches()).toHaveLength(0);
        expect(svc.db.prepare("SELECT COUNT(*) AS n FROM batch_items").get().n).toBe(0);
    });

    test("a request already in a batch cannot be batched again", () => {
        const c = candidateWithRequest(a, "once");
        const buildBatches = BatchEngine.createBatches;
        a.createBatches({ provider, candidateIds: [c.id], buildBatches });
        expect(() => a.createBatches({ provider, candidateIds: [c.id], buildBatches }))
            .toThrow(/no batchable/i);
    });

    test("batch lifecycle transition is compare-and-set and tenant-bound", () => {
        const c = candidateWithRequest(a, "t");
        const [batch] = a.createBatches({
            provider, candidateIds: [c.id], buildBatches: BatchEngine.createBatches
        });
        expect(() => b.transitionBatch(batch.id, "Draft", "Submitting")).toThrow(/not found/i);
        a.transitionBatch(batch.id, "Draft", "Submitting");
        expect(() => a.transitionBatch(batch.id, "Draft", "Submitting")).toThrow(/expected Draft/i);
    });

    test("tenant cannot list or revoke another tenant's API keys, and raw keys are never audited", () => {
        const key = "k".repeat(40);
        const made = a.createApiKey(key, "label");
        expect(made.id).toBe(fingerprint(key));
        expect(b.listApiKeys()).toHaveLength(0);
        expect(() => b.revokeApiKey(made.id)).toThrow(/not found/i);
        expect(svc.getApiKey(key)).not.toBeNull();
        expect(JSON.stringify(a.listApiKeys())).not.toContain(key);
        const audit = svc.db.prepare("SELECT * FROM audit_log").all();
        expect(JSON.stringify(audit)).not.toContain(key);
        a.revokeApiKey(made.id);
        expect(svc.getApiKey(key)).toBeNull();
    });

    test("audit log and stats are tenant-filtered", () => {
        a.createCandidate({ surname: "A" });
        b.createCandidate({ surname: "B" });
        expect(a.getAuditLog().every((r) => r.client_id === "a")).toBe(true);
        expect(b.getAuditLog().every((r) => r.client_id === "b")).toBe(true);
        expect(a.getStats().candidates).toBe(1);
        expect(b.getStats().candidates).toBe(1);
    });

    test("recordVerification is atomic: a failure leaves no rows behind", () => {
        expect(() => a.recordVerification({
            document: { originalFilename: "d.pdf" },
            candidate: { surname: "Z" },
            decision: null
        })).toThrow();
        expect(a.getStats().documents).toBe(0);
        expect(a.getStats().candidates).toBe(0);
    });
});