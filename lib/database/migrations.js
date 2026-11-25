"use strict";

const CURRENT_VERSION = 2;

const OWNED_TABLES = [
    "candidates",
    "documents",
    "extractions",
    "verification_requests",
    "verification_batches",
    "batch_items",
    "human_reviews",
    "audit_log"
];

const RELATIONSHIPS = [
    { child: "extractions", column: "document_id", parent: "documents", required: true },
    { child: "extractions", column: "candidate_id", parent: "candidates", required: false },
    { child: "verification_requests", column: "candidate_id", parent: "candidates", required: true },
    { child: "batch_items", column: "batch_id", parent: "verification_batches", required: true },
    { child: "batch_items", column: "verification_request_id", parent: "verification_requests", required: true },
    { child: "human_reviews", column: "extraction_id", parent: "extractions", required: true }
];

const PARENT_RELATIONSHIPS = RELATIONSHIPS.map(({ child, column, parent }) => ({
    parent,
    child,
    column
}));

const BATCH_POSITION_INDEX = "idx_batch_items_batch_position";

const BATCH_POSITION_TRIGGERS = [
    "trg_batch_items_position_insert",
    "trg_batch_items_position_update"
];

function tableExists(db, table) {
    return Boolean(db.prepare(`
        SELECT 1 FROM sqlite_master
        WHERE type = 'table' AND name = ?
    `).get(table));
}

function getColumns(db, table) {
    return db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
}

function validateBaseSchema(db) {
    const requiredTables = [...OWNED_TABLES, "clients", "api_keys"];

    for (const table of requiredTables) {
        if (!tableExists(db, table)) {
            throw new Error(`Migration cannot proceed: missing table '${table}'`);
        }
    }

    if (!getColumns(db, "clients").includes("id")) {
        throw new Error("Migration cannot proceed: clients.id is missing");
    }

    if (!getColumns(db, "api_keys").includes("client_id")) {
        throw new Error("Migration cannot proceed: api_keys.client_id is missing");
    }

    for (const table of OWNED_TABLES) {
        if (getColumns(db, table).includes("client_id")) {
            throw new Error(
                `Migration cannot proceed: ${table}.client_id already exists but database version is 0`
            );
        }
    }

    for (const { child, column, parent } of RELATIONSHIPS) {
        if (!getColumns(db, child).includes(column)) {
            throw new Error(`Migration cannot proceed: ${child}.${column} is missing`);
        }

        if (!getColumns(db, parent).includes("id")) {
            throw new Error(`Migration cannot proceed: ${parent}.id is missing`);
        }
    }
}

function validateVersion1Schema(db) {
    const expectedIndexes = OWNED_TABLES.map(
        table => `idx_${table}_client_id`
    );

    const expectedTriggers = [];

    for (const table of OWNED_TABLES) {
        expectedTriggers.push(
            `trg_${table}_client_insert`,
            `trg_${table}_client_update`
        );
    }

    expectedTriggers.push(
        "trg_api_keys_client_insert",
        "trg_api_keys_client_update"
    );

    for (const { child, column } of RELATIONSHIPS) {
        expectedTriggers.push(
            `trg_${child}_${column}_tenant_insert`,
            `trg_${child}_${column}_tenant_update`
        );
    }

    for (const { parent, child } of PARENT_RELATIONSHIPS) {
        expectedTriggers.push(
            `trg_${parent}_${child}_tenant_update`
        );
    }

    for (const table of [...OWNED_TABLES, "api_keys"]) {
        expectedTriggers.push(`trg_clients_delete_${table}`);
    }

    for (const table of OWNED_TABLES) {
        if (!getColumns(db, table).includes("client_id")) {
            throw new Error(
                `Database version 1 is inconsistent: ${table}.client_id is missing`
            );
        }
    }

    const objectExists = db.prepare(`
        SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?
    `);

    for (const index of expectedIndexes) {
        if (!objectExists.get("index", index)) {
            throw new Error(
                `Database version 1 is inconsistent: required index '${index}' is missing`
            );
        }
    }

    for (const trigger of expectedTriggers) {
        if (!objectExists.get("trigger", trigger)) {
            throw new Error(
                `Database version 1 is inconsistent: required trigger '${trigger}' is missing`
            );
        }
    }
}

function validateVersion2Schema(db) {
    if (!getColumns(db, "batch_items").includes("position")) {
        throw new Error(
            "Database version 2 is inconsistent: batch_items.position is missing"
        );
    }

    const indexRecord = db.prepare(
        "SELECT tbl_name FROM sqlite_master WHERE type = ? AND name = ?"
    ).get("index", BATCH_POSITION_INDEX);

    if (!indexRecord) {
        throw new Error(
            "Database version 2 is inconsistent: required index '" +
            BATCH_POSITION_INDEX + "' is missing"
        );
    }

    const indexList = db.prepare("PRAGMA index_list(batch_items)").all();
    const positionIndex = indexList.find(
        index => index.name === BATCH_POSITION_INDEX
    );

    if (!positionIndex || indexRecord.tbl_name !== "batch_items") {
        throw new Error(
            "Database version 2 is inconsistent: index '" +
            BATCH_POSITION_INDEX + "' has an invalid definition"
        );
    }

    const indexColumns = db.prepare(
        "PRAGMA index_xinfo(" + BATCH_POSITION_INDEX + ")"
    ).all()
        .filter(column => column.key === 1)
        .sort((a, b) => a.seqno - b.seqno);

    const validIndexDefinition =
        positionIndex.unique === 1 &&
        positionIndex.partial === 0 &&
        indexColumns.length === 2 &&
        indexColumns[0].name === "batch_id" &&
        indexColumns[1].name === "position" &&
        indexColumns.every(
            column => column.desc === 0 && column.coll === "BINARY"
        );

    if (!validIndexDefinition) {
        throw new Error(
            "Database version 2 is inconsistent: index '" +
            BATCH_POSITION_INDEX + "' has an invalid definition"
        );
    }

    const objectExists = db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?"
    );

    for (const trigger of BATCH_POSITION_TRIGGERS) {
        if (!objectExists.get("trigger", trigger)) {
            throw new Error(
                "Database version 2 is inconsistent: required trigger '" +
                trigger + "' is missing"
            );
        }
    }

    const invalidItem = db.prepare(
        "SELECT id FROM batch_items " +
        "WHERE position IS NULL " +
        "OR typeof(position) <> 'integer' " +
        "OR position < 0 LIMIT 1"
    ).get();

    if (invalidItem) {
        throw new Error(
            "Database version 2 is inconsistent: batch item '" +
            invalidItem.id + "' has an invalid position"
        );
    }

    const duplicatePosition = db.prepare(
        "SELECT batch_id, position FROM batch_items " +
        "WHERE batch_id IS NOT NULL " +
        "GROUP BY batch_id, position HAVING COUNT(*) > 1 LIMIT 1"
    ).get();

    if (duplicatePosition) {
        throw new Error(
            "Database version 2 is inconsistent: duplicate batch item positions exist"
        );
    }
}

function migrateVersion1(db) {
    const migration = db.transaction(() => {
        // Existing records remain unassigned.
        for (const table of OWNED_TABLES) {
            db.exec(`
                ALTER TABLE ${table}
                ADD COLUMN client_id TEXT REFERENCES clients(id)
            `);
        }

        for (const table of OWNED_TABLES) {
            db.exec(`
                CREATE INDEX idx_${table}_client_id
                ON ${table}(client_id)
            `);
        }

        for (const table of OWNED_TABLES) {
            db.exec(`
                CREATE TRIGGER trg_${table}_client_insert
                BEFORE INSERT ON ${table}
                WHEN NEW.client_id IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM clients WHERE id = NEW.client_id
                )
                BEGIN
                    SELECT RAISE(ABORT, 'Invalid client_id');
                END
            `);

            db.exec(`
                CREATE TRIGGER trg_${table}_client_update
                BEFORE UPDATE OF client_id ON ${table}
                WHEN NEW.client_id IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM clients WHERE id = NEW.client_id
                )
                BEGIN
                    SELECT RAISE(ABORT, 'Invalid client_id');
                END
            `);
        }

        db.exec(`
            CREATE TRIGGER trg_api_keys_client_insert
            BEFORE INSERT ON api_keys
            WHEN NEW.client_id IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM clients WHERE id = NEW.client_id
            )
            BEGIN
                SELECT RAISE(ABORT, 'Invalid API key client_id');
            END
        `);

        db.exec(`
            CREATE TRIGGER trg_api_keys_client_update
            BEFORE UPDATE OF client_id ON api_keys
            WHEN NEW.client_id IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM clients WHERE id = NEW.client_id
            )
            BEGIN
                SELECT RAISE(ABORT, 'Invalid API key client_id');
            END
        `);

        for (const { child, column, parent, required } of RELATIONSHIPS) {
            const tenantMissingParent = required
                ? `NEW.client_id IS NOT NULL AND NEW.${column} IS NULL`
                : "0";

            const ownershipMismatch = `
                NEW.${column} IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM ${parent}
                    WHERE id = NEW.${column}
                      AND client_id IS NEW.client_id
                )
            `;

            for (const operation of ["INSERT", "UPDATE"]) {
                const triggerName =
                    `trg_${child}_${column}_tenant_${operation.toLowerCase()}`;

                const updateClause = operation === "UPDATE"
                    ? `UPDATE OF client_id, ${column}`
                    : "INSERT";

                db.exec(`
                    CREATE TRIGGER ${triggerName}
                    BEFORE ${updateClause} ON ${child}
                    WHEN (${tenantMissingParent})
                      OR (${ownershipMismatch})
                    BEGIN
                        SELECT RAISE(
                            ABORT,
                            'Parent missing or tenant ownership mismatch'
                        );
                    END
                `);
            }
        }

        for (const { parent, child, column } of PARENT_RELATIONSHIPS) {
            db.exec(`
                CREATE TRIGGER trg_${parent}_${child}_tenant_update
                BEFORE UPDATE OF client_id ON ${parent}
                WHEN EXISTS (
                    SELECT 1 FROM ${child}
                    WHERE ${column} = OLD.id
                      AND client_id IS NOT NEW.client_id
                )
                BEGIN
                    SELECT RAISE(
                        ABORT,
                        'Parent ownership change would break tenant consistency'
                    );
                END
            `);
        }

        for (const table of [...OWNED_TABLES, "api_keys"]) {
            db.exec(`
                CREATE TRIGGER trg_clients_delete_${table}
                BEFORE DELETE ON clients
                WHEN EXISTS (
                    SELECT 1 FROM ${table}
                    WHERE client_id = OLD.id
                )
                BEGIN
                    SELECT RAISE(
                        ABORT,
                        'Client still has associated records'
                    );
                END
            `);
        }

        db.pragma("user_version = 1");
    });

    migration();

    if (db.pragma("user_version", { simple: true }) !== 1) {
        throw new Error("Database migration failed to set version 1");
    }

    validateVersion1Schema(db);
}

function migrateVersion2(db) {
    const migration = db.transaction(() => {
        db.exec(`
            ALTER TABLE batch_items
            ADD COLUMN position INTEGER
        `);

        // Preserve existing membership rows and assign deterministic positions.
        // Historical ordering cannot be recovered if it was never recorded.
        db.exec(`
            WITH ranked_items AS (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY batch_id
                        ORDER BY created_at, rowid
                    ) - 1 AS assigned_position
                FROM batch_items
            )
            UPDATE batch_items
            SET position = (
                SELECT assigned_position
                FROM ranked_items
                WHERE ranked_items.id = batch_items.id
            )
        `);

        db.exec(`
            CREATE UNIQUE INDEX ${BATCH_POSITION_INDEX}
            ON batch_items(batch_id, position)
        `);

        db.exec(`
            CREATE TRIGGER trg_batch_items_position_insert
            BEFORE INSERT ON batch_items
            WHEN NEW.position IS NULL
              OR typeof(NEW.position) <> 'integer'
              OR NEW.position < 0
            BEGIN
                SELECT RAISE(ABORT, 'Invalid batch item position');
            END
        `);

        db.exec(`
            CREATE TRIGGER trg_batch_items_position_update
            BEFORE UPDATE OF position, batch_id ON batch_items
            WHEN NEW.position IS NULL
              OR typeof(NEW.position) <> 'integer'
              OR NEW.position < 0
            BEGIN
                SELECT RAISE(ABORT, 'Invalid batch item position');
            END
        `);

        db.pragma("user_version = 2");
        validateVersion2Schema(db);
    });

    migration();
}

function migrate(db) {
    const version = db.pragma("user_version", { simple: true });

    if (version > CURRENT_VERSION) {
        throw new Error(
            `Database version ${version} is newer than supported version ${CURRENT_VERSION}`
        );
    }

    if (version === 2) {
        validateVersion1Schema(db);
        validateVersion2Schema(db);
        return;
    }

    if (version === 1) {
        validateVersion1Schema(db);
        migrateVersion2(db);
        return;
    }

    validateBaseSchema(db);
    migrateVersion1(db);
    migrateVersion2(db);
}

module.exports = {
    migrate,
    CURRENT_VERSION
};
