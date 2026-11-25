"use strict";

const path = require("path");
const DatabaseService = require("../lib/database/DatabaseService");
const SecurityService = require("../lib/security/SecurityService");

const arg = (n) => {
    const i = process.argv.indexOf("--" + n);
    return i > -1 ? process.argv[i + 1] : null;
};

const id = arg("id");
const name = arg("name");
const email = arg("email");
const dbPath = path.resolve(
    arg("db") || path.join("data", "matric-verifier.db")
);

if (!id || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(id) || !name || !name.trim()) {
    console.error(
        'Usage: node scripts/bootstrap-client.js --id my-org --name "My Org" [--email x@y.z] [--db path]'
    );
    process.exit(1);
}

const db = new DatabaseService(dbPath);

try {
    if (!db.getClient(id)) {
        db.createClient({ id, name: name.trim(), email: email || null });
    }

    const repo = db.forClient(id, { actor: "bootstrap" });

    let key;
    let made;

    // Serialize the active-key check and creation. Concurrent bootstrap
    // attempts cannot both pass the check and create separate active keys.
    const provision = db.db.transaction(() => {
        const activeKeys = repo.listApiKeys()
            .filter((k) => k.active === 1);

        if (activeKeys.length > 0) {
            throw new Error(
                `Client "${id}" already has ${activeKeys.length} active API key(s). ` +
                "Refusing to create another key automatically."
            );
        }

        key = new SecurityService().generateApiKey();
        made = repo.createApiKey(key, "bootstrap key");
    });

    provision.immediate();

    console.log("Client:      ", id);
    console.log("Key id:      ", made.id);
    console.log("API key (shown once, store it now):");
    console.log(key);
} finally {
    db.close();
}