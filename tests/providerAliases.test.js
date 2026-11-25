"use strict";

const path = require("path");
const fs = require("fs");
const DatabaseService = require("../lib/database/DatabaseService");
const BatchEngine = require("../lib/batching/BatchEngine");
const Providers = require("../config/Providers");

describe("provider aliases match real pipeline output", () => {
    let svc, file, repo;

    beforeEach(() => {
        file = path.join(__dirname, `alias-${process.pid}-${Date.now()}.db`);
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

    function batchFor(requestProvider, provider) {
        const c = repo.createCandidate({ surname: "S" });
        repo.createVerificationRequest({ candidateId: c.id, provider: requestProvider });
        return repo.createBatches({
            provider, candidateIds: [c.id], buildBatches: BatchEngine.createBatches
        });
    }

    test("Department of Education requests batch under provider id doe", () => {
        const out = batchFor(Providers.DEPARTMENT_OF_EDUCATION, { id: "doe", batchSize: 5 });
        expect(out).toHaveLength(1);
    });

    test("Umalusi requests do not batch under doe", () => {
        expect(() => batchFor(Providers.UMALUSI, { id: "doe", batchSize: 5 }))
            .toThrow(/different provider/i);
    });
});