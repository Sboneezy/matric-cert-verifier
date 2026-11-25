"use strict";

const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const apply = process.argv.includes("--apply");
const i = process.argv.indexOf("--db");
const dbPath = path.resolve(i > -1 ? process.argv[i + 1] : path.join("data", "matric-verifier.db"));

const FP = /^[0-9a-f]{16}$/;
const fp = (s) => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 16);

function plan(db) {
    const keys = db.prepare("SELECT key FROM api_keys").all()
        .map((r) => r.key).filter((k) => typeof k === "string" && k.length >= 24);
    const rows = db.prepare("SELECT id, entity_type, entity_id, details FROM audit_log").all();
    const changes = [];
    for (const row of rows) {
        let entityId = row.entity_id;
        let details = row.details;

        if (typeof entityId === "string") {
            if (keys.includes(entityId)) {
                entityId = fp(entityId);
            } else if (row.entity_type === "api_key" && !FP.test(entityId)) {
                if (entityId.endsWith("...")) entityId = "redacted-prefix";
                else if (entityId.length >= 24) entityId = fp(entityId);
            }
        }
        if (typeof details === "string") {
            for (const k of keys) {
                if (details.includes(k)) details = details.split(k).join(fp(k));
            }
        }
        if (entityId !== row.entity_id || details !== row.details) {
            changes.push({ id: row.id, entityId, details });
        }
    }
    return { changes, total: rows.length, keyCount: keys.length };
}

(async () => {
    if (!fs.existsSync(dbPath)) { console.error("Database not found:", dbPath); process.exit(1); }
    const db = new Database(dbPath);
    try {
        const p = plan(db);
        console.log("Database:      ", dbPath);
        console.log("Keys known:    ", p.keyCount);
        console.log("Audit rows:    ", p.total);
        console.log("Rows to redact:", p.changes.length);

        if (!apply) {
            console.log("\nDRY RUN: nothing was changed. Re-run with --apply to redact.");
            return;
        }
        if (p.changes.length === 0) { console.log("\nNothing to redact."); return; }

        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const backup = dbPath + ".pre-redact-" + stamp + ".bak";
        await db.backup(backup);
        console.log("Backup written:", backup);

        const upd = db.prepare("UPDATE audit_log SET entity_id = ?, details = ? WHERE id = ?");
        db.transaction(() => { for (const c of p.changes) upd.run(c.entityId, c.details, c.id); })();

        const after = plan(db);
        console.log("Rows still exposing a key (expect 0):", after.changes.length);
        if (after.changes.length !== 0) process.exitCode = 2;
    } finally {
        db.close();
    }
})();