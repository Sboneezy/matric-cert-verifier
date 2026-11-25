"use strict";
const Database = require("better-sqlite3");
const crypto = require("crypto");
const fp = (s) => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 16);
const db = new Database("data/matric-verifier.db");
const clients = process.argv.includes("--clients") ? process.argv[process.argv.indexOf("--clients") + 1].split(",") : [];
const ids = process.argv.includes("--ids") ? process.argv[process.argv.indexOf("--ids") + 1].split(",") : [];
let n = 0;
for (const r of db.prepare("SELECT key, client_id FROM api_keys WHERE active = 1").all()) {
    if (clients.includes(r.client_id) || ids.includes(fp(r.key))) {
        db.prepare("UPDATE api_keys SET active = 0 WHERE key = ?").run(r.key);
        n++;
    }
}
console.log("revoked:", n);
db.close();