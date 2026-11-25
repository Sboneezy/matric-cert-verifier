const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const { migrate } = require("./migrations");
const { TenantRepository, fingerprint } = require("./TenantRepository");

/**
 * Database Service
 * Persistent storage for all verification data.
 * Uses SQLite for local development with zero configuration.
 */
class DatabaseService {
    
    constructor(dbPath, options = {}) {
        this.dbPath = dbPath || path.join(__dirname, "..", "..", "data", "matric-verifier.db");
        
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        this.db = new Database(this.dbPath);
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("foreign_keys = ON");
        
        this.initialiseSchema();
        if (!options.skipMigrations) {
            migrate(this.db);
        }
    }
    
    initialiseSchema() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS clients (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS candidates (
                id TEXT PRIMARY KEY,
                surname TEXT,
                full_names TEXT,
                id_number TEXT,
                date_of_birth TEXT,
                qualification_type TEXT,
                qualification_year INTEGER,
                certificate_number TEXT,
                examination_number TEXT,
                review_status TEXT DEFAULT 'Pending',
                extraction_confidence REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                original_filename TEXT,
                file_path TEXT,
                file_type TEXT,
                file_size INTEGER,
                classification TEXT,
                strategy TEXT,
                ocr_confidence REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS extractions (
                id TEXT PRIMARY KEY,
                document_id TEXT,
                candidate_id TEXT,
                template_id TEXT,
                template_name TEXT,
                confidence_level TEXT,
                requires_review INTEGER DEFAULT 0,
                raw_text TEXT,
                extracted_json TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (document_id) REFERENCES documents(id),
                FOREIGN KEY (candidate_id) REFERENCES candidates(id)
            )
        `);
        
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS verification_requests (
                id TEXT PRIMARY KEY,
                candidate_id TEXT,
                provider TEXT,
                status TEXT DEFAULT 'Draft',
                provider_reference TEXT,
                result TEXT,
                failure_reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                submitted_at DATETIME,
                completed_at DATETIME,
                FOREIGN KEY (candidate_id) REFERENCES candidates(id)
            )
        `);
        
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS verification_batches (
                id TEXT PRIMARY KEY,
                provider TEXT,
                batch_number INTEGER,
                status TEXT DEFAULT 'Draft',
                candidate_count INTEGER DEFAULT 0,
                result TEXT,
                failure_reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                submitted_at DATETIME,
                completed_at DATETIME
            )
        `);
        
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS batch_items (
                id TEXT PRIMARY KEY,
                batch_id TEXT,
                verification_request_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (batch_id) REFERENCES verification_batches(id),
                FOREIGN KEY (verification_request_id) REFERENCES verification_requests(id)
            )
        `);
        
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS human_reviews (
                id TEXT PRIMARY KEY,
                extraction_id TEXT,
                status TEXT DEFAULT 'pending',
                reviewer TEXT,
                corrections_json TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                reviewed_at DATETIME,
                FOREIGN KEY (extraction_id) REFERENCES extractions(id)
            )
        `);
        
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                entity_type TEXT,
                entity_id TEXT,
                user_id TEXT,
                ip TEXT,
                details TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS api_keys (
                key TEXT PRIMARY KEY,
                client_id TEXT,
                label TEXT,
                active INTEGER DEFAULT 1,
                last_used_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }
    
    createClient(client) {
        const stmt = this.db.prepare(`
            INSERT INTO clients (id, name, email)
            VALUES (?, ?, ?)
        `);
        stmt.run(client.id, client.name, client.email);
        this.logAudit("CREATE", "client", client.id, { name: client.name });
        return client;
    }
    
    getClient(id) {
        return this.db.prepare("SELECT * FROM clients WHERE id = ?").get(id);
    }
    
    forClient(clientId, context) {
        return new TenantRepository(this, clientId, context);
    }

    createCandidate(candidate) {
        const stmt = this.db.prepare(`
            INSERT INTO candidates (
                id, surname, full_names, id_number, date_of_birth,
                qualification_type, qualification_year, certificate_number,
                examination_number, review_status, extraction_confidence
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            candidate.id,
            candidate.surname,
            candidate.fullNames,
            candidate.idNumber,
            candidate.dateOfBirth,
            candidate.qualificationType,
            candidate.qualificationYear,
            candidate.certificateNumber,
            candidate.examinationNumber,
            candidate.reviewStatus || "Pending",
            candidate.extractionConfidence
                ? JSON.stringify(candidate.extractionConfidence)
                : null
        );
        this.logAudit("CREATE", "candidate", candidate.id, { surname: candidate.surname });
        return candidate;
    }
    
    getCandidate(id) {
        return this.db.prepare("SELECT * FROM candidates WHERE id = ?").get(id);
    }

    listCandidates({ limit = 50, offset = 0, reviewStatus = null } = {}) {
        if (reviewStatus) {
            return this.db.prepare(
                "SELECT * FROM candidates WHERE review_status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
            ).all(reviewStatus, limit, offset);
        }
        return this.db.prepare(
            "SELECT * FROM candidates ORDER BY created_at DESC LIMIT ? OFFSET ?"
        ).all(limit, offset);
    }
    
    updateCandidate(id, updates) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(updates)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }
        fields.push("updated_at = CURRENT_TIMESTAMP");
        values.push(id);
        const stmt = this.db.prepare(`
            UPDATE candidates SET ${fields.join(", ")} WHERE id = ?
        `);
        stmt.run(...values);
        this.logAudit("UPDATE", "candidate", id, updates);
    }
    
    createDocument(document) {
        const stmt = this.db.prepare(`
            INSERT INTO documents (
                id, original_filename, file_path, file_type,
                file_size, classification, strategy, ocr_confidence
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            document.id,
            document.originalFilename,
            document.filePath,
            document.fileType,
            document.fileSize,
            document.classification,
            document.strategy,
            document.ocrConfidence || null
        );
        this.logAudit("CREATE", "document", document.id, { filename: document.originalFilename });
        return document;
    }
    
    getDocument(id) {
        return this.db.prepare("SELECT * FROM documents WHERE id = ?").get(id);
    }
    
    createExtraction(extraction) {
        const stmt = this.db.prepare(`
            INSERT INTO extractions (
                id, document_id, candidate_id, template_id,
                template_name, confidence_level, requires_review,
                raw_text, extracted_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            extraction.id,
            extraction.documentId,
            extraction.candidateId,
            extraction.templateId,
            extraction.templateName,
            extraction.confidenceLevel,
            extraction.requiresReview ? 1 : 0,
            extraction.rawText,
            JSON.stringify(extraction.extractedFields)
        );
        this.logAudit("CREATE", "extraction", extraction.id, { 
            template: extraction.templateName,
            confidence: extraction.confidenceLevel
        });
        return extraction;
    }
    
    getExtraction(id) {
        const row = this.db.prepare("SELECT * FROM extractions WHERE id = ?").get(id);
        if (row) {
            row.extracted_json = JSON.parse(row.extracted_json);
        }
        return row;
    }
    
    createVerificationRequest(request) {
        const stmt = this.db.prepare(`
            INSERT INTO verification_requests (
                id, candidate_id, provider, status,
                provider_reference, result, failure_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            request.id,
            request.candidateId,
            request.provider,
            request.status || "Draft",
            request.providerReference,
            request.result,
            request.failureReason
        );
        this.logAudit("CREATE", "verification_request", request.id, { provider: request.provider });
        return request;
    }
    
    getVerificationRequest(id) {
        return this.db.prepare("SELECT * FROM verification_requests WHERE id = ?").get(id);
    }

    listVerificationRequests({ limit = 50, offset = 0, status = null } = {}) {
        if (status) {
            return this.db.prepare(
                "SELECT * FROM verification_requests WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
            ).all(status, limit, offset);
        }
        return this.db.prepare(
            "SELECT * FROM verification_requests ORDER BY created_at DESC LIMIT ? OFFSET ?"
        ).all(limit, offset);
    }

    // ----------------------------------------------------------------
    // Verification batches (direct DB storage)
    // ----------------------------------------------------------------

    saveBatch(batch) {
        const existing = this.db.prepare(
            "SELECT id FROM verification_batches WHERE id = ?"
        ).get(batch.id);

        if (existing) {
            this.db.prepare(`
                UPDATE verification_batches
                SET status = ?, submitted_at = ?, completed_at = ?,
                    result = ?, failure_reason = ?
                WHERE id = ?
            `).run(
                batch.status,
                batch.submittedAt || null,
                batch.completedAt || null,
                batch.result ? JSON.stringify(batch.result) : null,
                batch.failureReason || null,
                batch.id
            );
        } else {
            this.db.prepare(`
                INSERT INTO verification_batches
                    (id, provider, batch_number, status, candidate_count)
                VALUES (?, ?, ?, ?, ?)
            `).run(
                batch.id,
                batch.provider ? batch.provider.id : null,
                batch.batchNumber || null,
                batch.status,
                batch.candidates ? batch.candidates.length : 0
            );
            this.logAudit("CREATE", "batch", batch.id, {
                provider: batch.provider ? batch.provider.id : null
            });
        }
        return batch;
    }

    getBatch(id) {
        return this.db.prepare(
            "SELECT * FROM verification_batches WHERE id = ?"
        ).get(id) || null;
    }

    listBatches({ limit = 50, offset = 0, status = null } = {}) {
        if (status) {
            return this.db.prepare(
                "SELECT * FROM verification_batches WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
            ).all(status, limit, offset);
        }
        return this.db.prepare(
            "SELECT * FROM verification_batches ORDER BY created_at DESC LIMIT ? OFFSET ?"
        ).all(limit, offset);
    }
    
    updateVerificationRequest(id, updates) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(updates)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }
        values.push(id);
        const stmt = this.db.prepare(`
            UPDATE verification_requests SET ${fields.join(", ")} WHERE id = ?
        `);
        stmt.run(...values);
        this.logAudit("UPDATE", "verification_request", id, updates);
    }
    
    createReview(review) {
        const stmt = this.db.prepare(`
            INSERT INTO human_reviews (
                id, extraction_id, status, reviewer, corrections_json
            ) VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(
            review.id,
            review.extractionId,
            review.status || "pending",
            review.reviewer,
            review.corrections ? JSON.stringify(review.corrections) : null
        );
        this.logAudit("CREATE", "human_review", review.id, { status: review.status });
        return review;
    }
    
    getReview(id) {
        const row = this.db.prepare("SELECT * FROM human_reviews WHERE id = ?").get(id);
        if (row && row.corrections_json) {
            row.corrections = JSON.parse(row.corrections_json);
        }
        return row;
    }

    listReviews({ status = null, limit = 50, offset = 0 } = {}) {
        let rows;
        if (status) {
            rows = this.db.prepare(
                "SELECT * FROM human_reviews WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
            ).all(status, limit, offset);
        } else {
            rows = this.db.prepare(
                "SELECT * FROM human_reviews ORDER BY created_at DESC LIMIT ? OFFSET ?"
            ).all(limit, offset);
        }
        return rows.map((row) => {
            if (row.corrections_json) row.corrections = JSON.parse(row.corrections_json);
            return row;
        });
    }
    
    updateReview(id, updates) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(updates)) {
            if (key === "corrections") {
                fields.push("corrections_json = ?");
                values.push(JSON.stringify(value));
            } else {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        values.push(id);
        const stmt = this.db.prepare(`
            UPDATE human_reviews SET ${fields.join(", ")} WHERE id = ?
        `);
        stmt.run(...values);
        this.logAudit("UPDATE", "human_review", id, updates);
    }
    
    // ----------------------------------------------------------------
    // API Keys
    // ----------------------------------------------------------------

    createApiKey(key, clientId, label) {
        this.db.prepare(`
            INSERT INTO api_keys (key, client_id, label)
            VALUES (?, ?, ?)
        `).run(key, clientId || null, label || null);
        this.logAudit("CREATE", "api_key", fingerprint(key), { clientId, label });
        return { key, clientId, label, active: 1, createdAt: new Date() };
    }

    getApiKey(key) {
        return this.db.prepare(
            "SELECT * FROM api_keys WHERE key = ? AND active = 1"
        ).get(key) || null;
    }

    revokeApiKey(key) {
        this.db.prepare("UPDATE api_keys SET active = 0 WHERE key = ?").run(key);
        this.logAudit("REVOKE", "api_key", fingerprint(key), {});
    }

    touchApiKeyLastUsed(key) {
        this.db.prepare(
            "UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE key = ?"
        ).run(key);
    }

    listApiKeys(clientId = null) {
        if (clientId) {
            return this.db.prepare(
                "SELECT key, client_id, label, active, last_used_at, created_at FROM api_keys WHERE client_id = ? ORDER BY created_at DESC"
            ).all(clientId);
        }
        return this.db.prepare(
            "SELECT key, client_id, label, active, last_used_at, created_at FROM api_keys ORDER BY created_at DESC"
        ).all();
    }

    // ----------------------------------------------------------------
    // Audit log
    // ----------------------------------------------------------------

    logAudit(action, entityType, entityId, details, userId = null, ip = null) {
        const stmt = this.db.prepare(`
            INSERT INTO audit_log (action, entity_type, entity_id, user_id, ip, details)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            action,
            entityType,
            entityId,
            userId || null,
            ip || null,
            JSON.stringify(details || {})
        );
    }

    getAuditLog({ entityType = null, limit = 100, offset = 0 } = {}) {
        if (entityType) {
            return this.db.prepare(
                "SELECT * FROM audit_log WHERE entity_type = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
            ).all(entityType, limit, offset);
        }
        return this.db.prepare(
            "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?"
        ).all(limit, offset);
    }
    
    close() {
        this.db.close();
    }
    
    getStats() {
        return {
            clients: this.db.prepare("SELECT COUNT(*) as count FROM clients").get().count,
            candidates: this.db.prepare("SELECT COUNT(*) as count FROM candidates").get().count,
            documents: this.db.prepare("SELECT COUNT(*) as count FROM documents").get().count,
            extractions: this.db.prepare("SELECT COUNT(*) as count FROM extractions").get().count,
            verificationRequests: this.db.prepare("SELECT COUNT(*) as count FROM verification_requests").get().count,
            pendingReviews: this.db.prepare("SELECT COUNT(*) as count FROM human_reviews WHERE status = 'pending'").get().count
        };
    }
}

module.exports = DatabaseService;