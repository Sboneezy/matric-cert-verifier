"use strict";

const DatabaseService = require("../lib/database/DatabaseService");
const { migrate, CURRENT_VERSION } = require("../lib/database/migrations");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

describe("Tenant ownership migration", () => {
    let service;
    let testDbPath;

    beforeEach(() => {
        testDbPath = path.join(
            __dirname,
            `migration-test-${process.pid}-${Date.now()}.db`
        );
        service = new DatabaseService(testDbPath, { skipMigrations: true });
    });

    afterEach(() => {
        if (service) {
            service.close();
            service = null;
        }

        for (const suffix of ["", "-wal", "-shm"]) {
            const file = testDbPath + suffix;
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        }
    });

    function raw() {
        return service.db;
    }

    function createClient(id) {
        service.createClient({
            id,
            name: `Client ${id}`,
            email: `${id}@example.com`
        });
    }

    function insertCandidate(id, clientId = null) {
        raw().prepare(`
            INSERT INTO candidates (id, client_id)
            VALUES (?, ?)
        `).run(id, clientId);
    }

    function insertDocument(id, clientId = null) {
        raw().prepare(`
            INSERT INTO documents (id, client_id)
            VALUES (?, ?)
        `).run(id, clientId);
    }

    function migrateNow() {
        migrate(raw());
    }

    test("preserves legacy records as unassigned and preserves orphaned API keys", () => {
        raw().prepare(`
            INSERT INTO candidates (id, surname)
            VALUES (?, ?)
        `).run("legacy-candidate", "Legacy");

        raw().prepare(`
            INSERT INTO documents (id, original_filename)
            VALUES (?, ?)
        `).run("legacy-document", "legacy.pdf");

        raw().prepare(`
            INSERT INTO api_keys (key, client_id, label)
            VALUES (?, ?, ?)
        `).run("legacy-key", "orphan-client", "Legacy key");

        migrateNow();

        const candidate = raw().prepare(`
            SELECT * FROM candidates WHERE id = ?
        `).get("legacy-candidate");

        const document = raw().prepare(`
            SELECT * FROM documents WHERE id = ?
        `).get("legacy-document");

        const apiKey = raw().prepare(`
            SELECT * FROM api_keys WHERE key = ?
        `).get("legacy-key");

        expect(candidate).toBeDefined();
        expect(candidate.client_id).toBeNull();

        expect(document).toBeDefined();
        expect(document.client_id).toBeNull();

        expect(apiKey).toBeDefined();
        expect(apiKey.client_id).toBe("orphan-client");
    });

    test("accepts valid tenant-owned records", () => {
        migrateNow();
        createClient("client-a");

        insertCandidate("candidate-a", "client-a");
        insertDocument("document-a", "client-a");

        const candidate = raw().prepare(`
            SELECT client_id FROM candidates WHERE id = ?
        `).get("candidate-a");

        const document = raw().prepare(`
            SELECT client_id FROM documents WHERE id = ?
        `).get("document-a");

        expect(candidate.client_id).toBe("client-a");
        expect(document.client_id).toBe("client-a");
    });

    test("rejects invalid client IDs for owned records", () => {
        migrateNow();

        expect(() => {
            insertCandidate("invalid-candidate", "missing-client");
        }).toThrow(/Invalid client_id/);
    });

    test("rejects cross-tenant parent-child relationships", () => {
        migrateNow();

        createClient("client-a");
        createClient("client-b");

        insertDocument("document-b", "client-b");

        expect(() => {
            raw().prepare(`
                INSERT INTO extractions (
                    id, document_id, client_id
                ) VALUES (?, ?, ?)
            `).run("extraction-a", "document-b", "client-a");
        }).toThrow(/Parent missing or tenant ownership mismatch/);
    });

    test("rejects tenant-owned records with missing required parents", () => {
        migrateNow();
        createClient("client-a");

        insertCandidate("candidate-a", "client-a");

        expect(() => {
            raw().prepare(`
                INSERT INTO verification_requests (
                    id, candidate_id, client_id
                ) VALUES (?, ?, ?)
            `).run("request-a", null, "client-a");
        }).toThrow(/Parent missing or tenant ownership mismatch/);

        expect(() => {
            raw().prepare(`
                INSERT INTO extractions (
                    id, document_id, client_id
            ) VALUES (?, ?, ?)
            `).run("extraction-no-document", null, "client-a");
        }).toThrow(/Parent missing or tenant ownership mismatch/);
    });

    test("rejects legacy records linking to tenant-owned parents", () => {
        migrateNow();
        createClient("client-a");

        insertDocument("document-a", "client-a");

        expect(() => {
            raw().prepare(`
                INSERT INTO extractions (
                    id, document_id, client_id
                ) VALUES (?, ?, ?)
            `).run("legacy-cross-link", "document-a", null);
        }).toThrow(/Parent missing or tenant ownership mismatch/);
    });

    test("rejects parent ownership changes that would break child consistency", () => {
        migrateNow();

        createClient("client-a");
        createClient("client-b");

        insertDocument("document-a", "client-a");

        raw().prepare(`
            INSERT INTO extractions (
                id, document_id, client_id
            ) VALUES (?, ?, ?)
        `).run("extraction-a", "document-a", "client-a");

        expect(() => {
            raw().prepare(`
                UPDATE documents
                SET client_id = ?
                WHERE id = ?
            `).run("client-b", "document-a");
        }).toThrow(/Parent ownership change would break tenant consistency/);
    });

    test("rejects invalid API key ownership on new inserts and updates", () => {
        migrateNow();
        createClient("client-a");

        expect(() => {
            raw().prepare(`
                INSERT INTO api_keys (key, client_id)
                VALUES (?, ?)
            `).run("invalid-key", "missing-client");
        }).toThrow(/Invalid API key client_id/);

        raw().prepare(`
            INSERT INTO api_keys (key, client_id)
            VALUES (?, ?)
        `).run("valid-key", "client-a");

        expect(() => {
            raw().prepare(`
                UPDATE api_keys
                SET client_id = ?
                WHERE key = ?
            `).run("missing-client", "valid-key");
        }).toThrow(/Invalid API key client_id/);
    });

    test("is safe to run again after successful migration", () => {
        migrateNow();

        expect(() => migrateNow()).not.toThrow();

        expect(raw().pragma("user_version", { simple: true }))
            .toBe(CURRENT_VERSION);
    });

    test("rolls back all schema changes if migration fails", () => {
        // Deliberately cause an index-name conflict after the first
        // ALTER TABLE operations have begun.
        raw().exec(`
            CREATE INDEX idx_candidates_client_id
            ON candidates(id)
        `);

        expect(() => migrateNow()).toThrow();

        // All ALTER TABLE additions should have rolled back.
        for (const table of [
            "candidates",
            "documents",
            "extractions",
            "verification_requests",
            "verification_batches",
            "batch_items",
            "human_reviews",
            "audit_log"
        ]) {
            const columns = raw()
                .prepare(`PRAGMA table_info(${table})`)
                .all()
                .map(column => column.name);

            expect(columns).not.toContain("client_id");
        }

        expect(raw().pragma("user_version", { simple: true })).toBe(0);
    });

    test("rejects updates that introduce cross-tenant parent relationships", () => {
        migrateNow();
        createClient("client-a");
        createClient("client-b");

        insertCandidate("candidate-a", "client-a");
        insertDocument("document-a", "client-a");
        insertDocument("document-b", "client-b");

        raw().prepare(`
            INSERT INTO extractions (
                id, document_id, candidate_id, client_id
            ) VALUES (?, ?, ?, ?)
        `).run("extraction-a", "document-a", "candidate-a", "client-a");

        expect(() => {
            raw().prepare(`
                UPDATE extractions SET document_id = ? WHERE id = ?
            `).run("document-b", "extraction-a");
        }).toThrow(/Parent missing or tenant ownership mismatch/);
    });

    test("rejects removing a required parent from a tenant-owned record", () => {
        migrateNow();
        createClient("client-a");
        insertDocument("document-a", "client-a");

        raw().prepare(`
            INSERT INTO extractions (id, document_id, client_id)
            VALUES (?, ?, ?)
        `).run("extraction-a", "document-a", "client-a");

        expect(() => {
            raw().prepare(`
                UPDATE extractions SET document_id = NULL WHERE id = ?
            `).run("extraction-a");
        }).toThrow(/Parent missing or tenant ownership mismatch/);
    });

    test("prevents deleting a client that owns records", () => {
        migrateNow();
        createClient("client-a");
        insertCandidate("candidate-a", "client-a");

        expect(() => {
            raw().prepare("DELETE FROM clients WHERE id = ?").run("client-a");
        }).toThrow(/Client still has associated records/);
    });

    test("prevents deleting a client that still has API keys", () => {
        migrateNow();
        createClient("client-a");

        raw().prepare(`
            INSERT INTO api_keys (key, client_id) VALUES (?, ?)
        `).run("key-a", "client-a");

        expect(() => {
            raw().prepare("DELETE FROM clients WHERE id = ?").run("client-a");
        }).toThrow(/Client still has associated records/);
    });

    test("rejects a version 1 database with a missing ownership index", () => {
        migrateNow();

        raw().exec("DROP INDEX idx_candidates_client_id");

        expect(() => migrateNow()).toThrow(
            /required index 'idx_candidates_client_id' is missing/
        );
    });

    test("rejects a version 1 database with a missing integrity trigger", () => {
        migrateNow();

        raw().exec("DROP TRIGGER trg_extractions_document_id_tenant_insert");

        expect(() => migrateNow()).toThrow(
            /required trigger 'trg_extractions_document_id_tenant_insert' is missing/
        );
    });
    test("version 2 assigns deterministic positions when upgrading version 1 batch items", () => {
        migrateNow();
        createClient("client-a");

        insertCandidate("candidate-a", "client-a");
        insertCandidate("candidate-b", "client-a");

        raw().prepare(`
            INSERT INTO verification_batches (id, status, client_id)
            VALUES (?, ?, ?)
        `).run("batch-a", "Draft", "client-a");

        raw().prepare(`
            INSERT INTO verification_requests
                (id, candidate_id, provider, status, client_id)
            VALUES (?, ?, ?, ?, ?)
        `).run("request-a", "candidate-a", "provider-a", "Draft", "client-a");

        raw().prepare(`
            INSERT INTO verification_requests
                (id, candidate_id, provider, status, client_id)
            VALUES (?, ?, ?, ?, ?)
        `).run("request-b", "candidate-b", "provider-a", "Draft", "client-a");

        // Simulate a genuine v1 database by removing v2 structures.
        raw().exec(`
            DROP TRIGGER trg_batch_items_position_insert;
            DROP TRIGGER trg_batch_items_position_update;
            DROP INDEX idx_batch_items_batch_position;
            ALTER TABLE batch_items DROP COLUMN position;
            PRAGMA user_version = 1;
        `);

        raw().prepare(`
            INSERT INTO batch_items (id, batch_id, verification_request_id, client_id)
            VALUES (?, ?, ?, ?)
        `).run("item-a", "batch-a", "request-a", "client-a");

        raw().prepare(`
            INSERT INTO batch_items (id, batch_id, verification_request_id, client_id)
            VALUES (?, ?, ?, ?)
        `).run("item-b", "batch-a", "request-b", "client-a");

        migrateNow();

        const items = raw().prepare(`
            SELECT id, position
            FROM batch_items
            WHERE batch_id = ?
            ORDER BY position
        `).all("batch-a");

        expect(items).toEqual([
            { id: "item-a", position: 0 },
            { id: "item-b", position: 1 }
        ]);

        expect(raw().pragma("user_version", { simple: true })).toBe(2);
    });

    test("rejects duplicate batch item positions", () => {
        migrateNow();
        createClient("client-a");

        insertCandidate("candidate-a", "client-a");

        raw().prepare(`
            INSERT INTO verification_batches (id, status, client_id)
            VALUES (?, ?, ?)
        `).run("batch-a", "Draft", "client-a");

        raw().prepare(`
            INSERT INTO verification_requests
                (id, candidate_id, provider, status, client_id)
            VALUES (?, ?, ?, ?, ?)
        `).run("request-a", "candidate-a", "provider-a", "Draft", "client-a");

        raw().prepare(`
            INSERT INTO verification_requests
                (id, candidate_id, provider, status, client_id)
            VALUES (?, ?, ?, ?, ?)
        `).run("request-b", "candidate-a", "provider-a", "Draft", "client-a");

        const insertItem = raw().prepare(`
            INSERT INTO batch_items
                (id, batch_id, verification_request_id, position, client_id)
            VALUES (?, ?, ?, ?, ?)
        `);

        insertItem.run("item-a", "batch-a", "request-a", 0, "client-a");

        expect(() => {
            insertItem.run("item-b", "batch-a", "request-b", 0, "client-a");
        }).toThrow(/UNIQUE constraint failed/);
    });

    test.each([
        ["null", null],
        ["negative", -1],
        ["non-integer", "invalid"]
    ])("rejects %s batch item positions", (_label, position) => {
        migrateNow();
        createClient("client-a");

        insertCandidate("candidate-a", "client-a");

        raw().prepare(`
            INSERT INTO verification_batches (id, status, client_id)
            VALUES (?, ?, ?)
        `).run("batch-a", "Draft", "client-a");

        raw().prepare(`
            INSERT INTO verification_requests
                (id, candidate_id, provider, status, client_id)
            VALUES (?, ?, ?, ?, ?)
        `).run("request-a", "candidate-a", "provider-a", "Draft", "client-a");

        expect(() => {
            raw().prepare(`
                INSERT INTO batch_items
                    (id, batch_id, verification_request_id, position, client_id)
                VALUES (?, ?, ?, ?, ?)
            `).run("item-a", "batch-a", "request-a", position, "client-a");
        }).toThrow(/Invalid batch item position/);
    });

    test("rejects invalid batch item position updates", () => {
        migrateNow();
        createClient("client-a");

        insertCandidate("candidate-a", "client-a");

        raw().prepare(`
            INSERT INTO verification_batches (id, status, client_id)
            VALUES (?, ?, ?)
        `).run("batch-a", "Draft", "client-a");

        raw().prepare(`
            INSERT INTO verification_requests
                (id, candidate_id, provider, status, client_id)
            VALUES (?, ?, ?, ?, ?)
        `).run("request-a", "candidate-a", "provider-a", "Draft", "client-a");

        raw().prepare(`
            INSERT INTO batch_items
                (id, batch_id, verification_request_id, position, client_id)
            VALUES (?, ?, ?, ?, ?)
        `).run("item-a", "batch-a", "request-a", 0, "client-a");

        expect(() => {
            raw().prepare(`
                UPDATE batch_items SET position = -1 WHERE id = ?
            `).run("item-a");
        }).toThrow(/Invalid batch item position/);
    });

    test("rejects version 2 database missing its ordering index", () => {
        migrateNow();

        raw().exec("DROP INDEX idx_batch_items_batch_position");

        expect(() => migrateNow()).toThrow(
            /required index 'idx_batch_items_batch_position' is missing/
        );
    });

    test("rejects a version 2 database with an incorrectly defined ordering index", () => {
        migrateNow();

        raw().exec(
            "DROP INDEX idx_batch_items_batch_position; " +
            "CREATE INDEX idx_batch_items_batch_position ON candidates(id)"
        );

        expect(() => migrateNow()).toThrow(/invalid definition/);
    });
    test("rolls back all version 2 changes if the migration fails", () => {
        migrateNow();

        raw().exec("DROP TRIGGER trg_batch_items_position_insert");
        raw().exec("DROP TRIGGER trg_batch_items_position_update");
        raw().exec("DROP INDEX idx_batch_items_batch_position");
        raw().exec("ALTER TABLE batch_items DROP COLUMN position");
        raw().exec("PRAGMA user_version = 1");

        raw().exec(`
            CREATE TRIGGER trg_batch_items_position_update
            BEFORE UPDATE ON candidates
            BEGIN
                SELECT 1;
            END
        `);

        expect(() => migrateNow()).toThrow();

        const columns = raw().prepare("PRAGMA table_info(batch_items)")
            .all()
            .map(column => column.name);

        expect(columns).not.toContain("position");
        expect(raw().pragma("user_version", { simple: true })).toBe(1);

        const orderingIndex = raw().prepare(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?"
        ).get("idx_batch_items_batch_position");
        expect(orderingIndex).toBeUndefined();

        const triggers = raw().prepare(
            "SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger'"
        ).all();

        expect(triggers.map(trigger => trigger.name))
            .not.toContain("trg_batch_items_position_insert");

        const conflictingTrigger = triggers.find(
            trigger => trigger.name === "trg_batch_items_position_update"
        );
        expect(conflictingTrigger).toBeDefined();
        expect(conflictingTrigger.tbl_name).toBe("candidates");
    });
    test("rejects version 2 database missing its position trigger", () => {
        migrateNow();

        raw().exec("DROP TRIGGER trg_batch_items_position_insert");

        expect(() => migrateNow()).toThrow(
            /required trigger 'trg_batch_items_position_insert' is missing/
        );
    });
});
