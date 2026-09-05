const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

/**
 * Database Service
 * Persistent storage for all verification data.
 * Uses SQLite for local development with zero configuration.
 */
class DatabaseService {
    
    constructor(dbPath) {
        this.dbPath = dbPath || path.join(__dirname, "..", "..", "data", "matric-verifier.db");
        
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        this.db = new Database(this.dbPath);
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("foreign_keys = ON");
        
        this.initialiseSchema();
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
                details TEXT,
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
            candidate.extractionConfidence || null
        );
        this.logAudit("CREATE", "candidate", candidate.id, { surname: candidate.surname });
        return candidate;
    }
    
    getCandidate(id) {
        return this.db.prepare("SELECT * FROM candidates WHERE id = ?").get(id);
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
    
    logAudit(action, entityType, entityId, details) {
        const stmt = this.db.prepare(`
            INSERT INTO audit_log (action, entity_type, entity_id, details)
            VALUES (?, ?, ?, ?)
        `);
        stmt.run(action, entityType, entityId, JSON.stringify(details || {}));
    }
    
    getAuditLog(entityType = null, limit = 100) {
        if (entityType) {
            return this.db.prepare(
                "SELECT * FROM audit_log WHERE entity_type = ? ORDER BY created_at DESC LIMIT ?"
            ).all(entityType, limit);
        }
        return this.db.prepare(
            "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?"
        ).all(limit);
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