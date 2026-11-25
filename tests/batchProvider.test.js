"use strict";

const path = require("path");
const fs = require("fs");
const DatabaseService = require("../lib/database/DatabaseService");
const BatchEngine = require("../lib/batching/BatchEngine");

describe("batch provider matching", () => {
    let svc, file, repo;
    const provider = { id: "umalusi", batchSize: 5 };

    beforeEach(() => {
        file = path.join(__dirname, `provider-${process.pid}-${Date.now()}.db`);
        svc = new DatabaseService(file);
        svc.createClient({ id: "a", name: "A", email: null });
        repo = svc.forClient("a", { actor: "ka" });
    });

    afterEach(() => {
        svc.close();
        for (const s of ["", "-wal", "-shm"]) {
            if (fs.existsSync(file + s)) fs.unlinkSync(file + s);
        }
    });

    function candidateWith(requestProvider) {
        const c = repo.createCandidate({ surname: "S" });
        repo.createVerificationRequest({ candidateId: c.id, provider: requestProvider });
        return c;
    }

    test("a candidate assigned to a different provider rejects the whole batch", () => {
        const ok = candidateWith("umalusi");
        const other = candidateWith("saqa");
        expect(() => repo.createBatches({
            provider, candidateIds: [ok.id, other.id], buildBatches: BatchEngine.createBatches
        })).toThrow(/different provider/i);
        expect(repo.listBatches()).toHaveLength(0);
        expect(svc.db.prepare("SELECT COUNT(*) AS n FROM batch_items").get().n).toBe(0);
    });

    test("provider comparison ignores case", () => {
        const c = candidateWith("Umalusi");
        const out = repo.createBatches({
            provider, candidateIds: [c.id], buildBatches: BatchEngine.createBatches
        });
        expect(out).toHaveLength(1);
    });
});