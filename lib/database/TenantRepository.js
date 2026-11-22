"use strict";

const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { AppError } = require("../middleware/errorHandler");

const MAX_LIMIT = 200;
const MAX_BATCH_CANDIDATES = 1000;

// Column names are only ever taken from these sets, never from request input.
const CANDIDATE_FIELDS = new Set([
    "surname", "full_names", "id_number", "date_of_birth", "qualification_type",
    "qualification_year", "certificate_number", "examination_number", "review_status"
]);
const REQUEST_FIELDS = new Set([
    "status", "provider_reference", "result", "failure_reason", "submitted_at", "completed_at"
]);
const BATCH_FIELDS = new Set(["submitted_at", "completed_at", "failure_reason", "result"]);

const bad = (m) => new AppError(m, 400, "BAD_REQUEST");
const conflict = (m) => new AppError(m, 409, "CONFLICT");
const notFound = (what) => new AppError(`${what} not found.`, 404, "NOT_FOUND");

function fingerprint(secret) {
    return crypto.createHash("sha256").update(String(secret)).digest("hex").slice(0, 16);
}

function page(limit, offset, def = 50) {
    let l = Number.parseInt(limit, 10);
    let o = Number.parseInt(offset, 10);
    if (!Number.isFinite(l) || l < 1) l = def;
    if (l > MAX_LIMIT) l = MAX_LIMIT;
    if (!Number.isFinite(o) || o < 0) o = 0;
    return { limit: l, offset: o };
}

function norm(v) {
    if (v === undefined) return null;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (v !== null && typeof v === "object") return JSON.stringify(v);
    return v;
}

function buildUpdate(updates, allowed) {
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
        throw bad("updates must be an object.");
    }
    const keys = Object.keys(updates);
    if (keys.length === 0) throw bad("No fields to update.");
    const unknown = keys.filter((k) => !allowed.has(k));
    if (unknown.length) throw bad(`Fields not allowed: ${unknown.slice(0, 5).join(", ")}`);
    return { sets: keys.map((k) => `${k} = ?`), values: keys.map((k) => norm(updates[k])) };
}

function parseJson(text) {
    try { return JSON.parse(text); } catch (_) { return null; }
}

class TenantRepository {
    constructor(service, clientId, context = {}) {
        if (typeof clientId !== "string" || !clientId.trim()) {
            throw new AppError("Tenant identity required.", 401, "TENANT_REQUIRED");
        }
        if (!service.getClient(clientId)) {
            throw new AppError("Unknown tenant.", 401, "TENANT_UNKNOWN");
        }
        this.service = service;
        this.db = service.db;
        this.clientId = clientId;
        this.actor = context.actor || null; // non-secret key fingerprint
        this.ip = context.ip || null;
    }

    // ---- internals -------------------------------------------------
    audit(action, entityType, entityId, details = {}) {
        this.db.prepare(`
            INSERT INTO audit_log
                (action, entity_type, entity_id, user_id, ip, details, client_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(action, entityType, String(entityId), this.actor, this.ip,
            JSON.stringify(details), this.clientId);
    }

    // `table` must be an internal literal, never request input.
    _exists(table, id) {
        if (typeof id !== "string" || !id) return false;
        return Boolean(this.db.prepare(
            `SELECT 1 FROM ${table} WHERE id = ? AND client_id = ?`
        ).get(id, this.clientId));
    }

    _tx(fn) { return this.db.transaction(fn)(); }

    // ---- candidates ------------------------------------------------
    createCandidate(c) {
        const id = uuidv4();
        return this._tx(() => {
            this.db.prepare(`
                INSERT INTO candidates (
                    id, client_id, surname, full_names, id_number, date_of_birth,
                    qualification_type, qualification_year, certificate_number,
                    examination_number, review_status, extraction_confidence
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                id, this.clientId,
                c.surname ?? null, c.fullNames ?? null, c.idNumber ?? null,
                c.dateOfBirth ?? null, c.qualificationType ?? null,
                c.qualificationYear ?? null, c.certificateNumber ?? null,
                c.examinationNumber ?? null, c.reviewStatus || "Pending",
                typeof c.extractionConfidence === "number" ? c.extractionConfidence : null
            );
            this.audit("CREATE", "candidate", id);
            return this.getCandidate(id);
        });
    }

    getCandidate(id) {
        if (typeof id !== "string") return null;
        return this.db.prepare(
            "SELECT * FROM candidates WHERE id = ? AND client_id = ?"
        ).get(id, this.clientId) || null;
    }

    listCandidates({ limit, offset, reviewStatus = null } = {}) {
        const p = page(limit, offset);
        if (reviewStatus) {
            return this.db.prepare(`SELECT * FROM candidates
                WHERE client_id = ? AND review_status = ?
                ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`
            ).all(this.clientId, String(reviewStatus), p.limit, p.offset);
        }
        return this.db.prepare(`SELECT * FROM candidates WHERE client_id = ?
            ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`
        ).all(this.clientId, p.limit, p.offset);
    }

    updateCandidate(id, updates) {
        const { sets, values } = buildUpdate(updates, CANDIDATE_FIELDS);
        return this._tx(() => {
            const info = this.db.prepare(`
                UPDATE candidates SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND client_id = ?
            `).run(...values, id, this.clientId);
            if (info.changes !== 1) throw notFound("Candidate");
            this.audit("UPDATE", "candidate", id, { fields: Object.keys(updates) });
            return this.getCandidate(id);
        });
    }

    // ---- documents / extractions ----------------------------------
    createDocument(d) {
        const id = uuidv4();
        return this._tx(() => {
            this.db.prepare(`
                INSERT INTO documents (
                    id, client_id, original_filename, file_path, file_type,
                    file_size, classification, strategy, ocr_confidence
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(id, this.clientId, d.originalFilename ?? null, d.filePath ?? null,
                d.fileType ?? null, d.fileSize ?? null, d.classification ?? null,
                d.strategy ?? null, d.ocrConfidence ?? null);
            this.audit("CREATE", "document", id, { filename: d.originalFilename ?? null });
            return this.getDocument(id);
        });
    }

    getDocument(id) {
        if (typeof id !== "string") return null;
        return this.db.prepare(
            "SELECT * FROM documents WHERE id = ? AND client_id = ?"
        ).get(id, this.clientId) || null;
    }

    createExtraction(e) {
        if (!this._exists("documents", e.documentId)) throw notFound("Document");
        if (e.candidateId != null && !this._exists("candidates", e.candidateId)) {
            throw notFound("Candidate");
        }
        const id = uuidv4();
        return this._tx(() => {
            this.db.prepare(`
                INSERT INTO extractions (
                    id, client_id, document_id, candidate_id, template_id, template_name,
                    confidence_level, requires_review, raw_text, extracted_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(id, this.clientId, e.documentId, e.candidateId ?? null,
                e.templateId ?? null, e.templateName ?? null, e.confidenceLevel ?? null,
                e.requiresReview ? 1 : 0, e.rawText ?? null,
                JSON.stringify(e.extractedFields ?? {}));
            this.audit("CREATE", "extraction", id, { template: e.templateName ?? null });
            return this.getExtraction(id);
        });
    }

    getExtraction(id) {
        if (typeof id !== "string") return null;
        const row = this.db.prepare(
            "SELECT * FROM extractions WHERE id = ? AND client_id = ?"
        ).get(id, this.clientId);
        if (!row) return null;
        row.extracted_json = parseJson(row.extracted_json);
        return row;
    }

    // ---- verification requests ------------------------------------
    createVerificationRequest(r) {
        if (!this._exists("candidates", r.candidateId)) throw notFound("Candidate");
        const id = uuidv4();
        return this._tx(() => {
            this.db.prepare(`
                INSERT INTO verification_requests
                    (id, client_id, candidate_id, provider, status)
                VALUES (?, ?, ?, ?, ?)
            `).run(id, this.clientId, r.candidateId, r.provider ?? null, r.status || "Draft");
            this.audit("CREATE", "verification_request", id, { provider: r.provider ?? null });
            return this.getVerificationRequest(id);
        });
    }

    getVerificationRequest(id) {
        if (typeof id !== "string") return null;
        return this.db.prepare(
            "SELECT * FROM verification_requests WHERE id = ? AND client_id = ?"
        ).get(id, this.clientId) || null;
    }

    listVerificationRequests({ limit, offset, status = null } = {}) {
        const p = page(limit, offset);
        const base = "SELECT * FROM verification_requests WHERE client_id = ?";
        const tail = " ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?";
        return status
            ? this.db.prepare(base + " AND status = ?" + tail)
                .all(this.clientId, String(status), p.limit, p.offset)
            : this.db.prepare(base + tail).all(this.clientId, p.limit, p.offset);
    }

    updateVerificationRequest(id, updates) {
        const { sets, values } = buildUpdate(updates, REQUEST_FIELDS);
        return this._tx(() => {
            const info = this.db.prepare(`UPDATE verification_requests
                SET ${sets.join(", ")} WHERE id = ? AND client_id = ?`
            ).run(...values, id, this.clientId);
            if (info.changes !== 1) throw notFound("Verification request");
            this.audit("UPDATE", "verification_request", id, { fields: Object.keys(updates) });
            return this.getVerificationRequest(id);
        });
    }

    // One atomic unit for POST /verify.
    recordVerification({ document, candidate, decision }) {
        return this._tx(() => {
            const doc = this.createDocument(document);
            const cand = this.createCandidate(candidate);
            const req = this.createVerificationRequest({
                candidateId: cand.id,
                provider: decision.provider,
                status: decision.status === "BLOCKED" ? "Blocked" : "Draft"
            });
            this.audit("VERIFY", "verification_request", req.id, {
                documentId: doc.id, provider: decision.provider, status: decision.status
            });
            return { documentId: doc.id, candidateId: cand.id, requestId: req.id };
        });
    }

    // ---- reviews ---------------------------------------------------
    createReview({ extractionId, fieldsToReview, document }) {
        if (!this._exists("extractions", extractionId)) throw notFound("Extraction");
        const id = "REV-" + uuidv4();
        return this._tx(() => {
            this.db.prepare(`
                INSERT INTO human_reviews
                    (id, client_id, extraction_id, status, reviewer, corrections_json)
                VALUES (?, ?, ?, 'pending', NULL, ?)
            `).run(id, this.clientId, extractionId,
                JSON.stringify({ fieldsToReview, document: document || null }));
            this.audit("CREATE", "human_review", id, { extractionId });
            return this.getReview(id);
        });
    }

    getReview(id) {
        if (typeof id !== "string") return null;
        const row = this.db.prepare(
            "SELECT * FROM human_reviews WHERE id = ? AND client_id = ?"
        ).get(id, this.clientId);
        if (!row) return null;
        row.corrections = row.corrections_json ? parseJson(row.corrections_json) : null;
        return row;
    }

    listReviews({ status = null, limit, offset } = {}) {
        const p = page(limit, offset);
        const base = "SELECT * FROM human_reviews WHERE client_id = ?";
        const tail = " ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?";
        const rows = status
            ? this.db.prepare(base + " AND status = ?" + tail)
                .all(this.clientId, String(status), p.limit, p.offset)
            : this.db.prepare(base + tail).all(this.clientId, p.limit, p.offset);
        return rows.map((r) => {
            r.corrections = r.corrections_json ? parseJson(r.corrections_json) : null;
            return r;
        });
    }

    completeReview(id, { corrections, reviewer }) {
        if (!corrections || typeof corrections !== "object") throw bad("corrections must be an object.");
        return this._tx(() => {
            const info = this.db.prepare(`
                UPDATE human_reviews
                SET status = 'completed', reviewer = ?, reviewed_at = ?, corrections_json = ?
                WHERE id = ? AND client_id = ? AND status = 'pending'
            `).run(reviewer ? String(reviewer) : "unknown", new Date().toISOString(),
                JSON.stringify(corrections), id, this.clientId);
            if (info.changes !== 1) {
                const row = this.getReview(id);
                throw row ? conflict(`Review is already ${row.status}.`) : notFound("Review");
            }
            this.audit("COMPLETE", "human_review", id);
            return this.getReview(id);
        });
    }

    // ---- batches ---------------------------------------------------
    // buildBatches(candidates, provider) -> VerificationBatch[]  (BatchEngine.createBatches)
    createBatches({ provider, candidateIds, buildBatches }) {
        if (!provider || typeof provider.id !== "string") throw bad("Invalid provider.");
        if (!Array.isArray(candidateIds) || candidateIds.length === 0 ||
            candidateIds.length > MAX_BATCH_CANDIDATES) {
            throw bad(`candidateIds must contain 1-${MAX_BATCH_CANDIDATES} ids.`);
        }
        if (candidateIds.some((id) => typeof id !== "string" || !id)) {
            throw bad("candidateIds must be non-empty strings.");
        }
        if (new Set(candidateIds).size !== candidateIds.length) {
            throw bad("candidateIds contains duplicates.");
        }

        const run = this.db.transaction(() => {
            const findCandidate = this.db.prepare(
                "SELECT * FROM candidates WHERE id = ? AND client_id = ?");
            const findRequest = this.db.prepare(`
                SELECT vr.id FROM verification_requests vr
                WHERE vr.candidate_id = ? AND vr.client_id = ? AND vr.status = 'Draft'
                  AND NOT EXISTS (
                      SELECT 1 FROM batch_items bi WHERE bi.verification_request_id = vr.id)
                ORDER BY vr.created_at, vr.rowid LIMIT 1`);

            const candidates = [];
            const requestByCandidate = new Map();
            for (const id of candidateIds) {
                const cand = findCandidate.get(id, this.clientId);
                if (!cand) throw notFound("One or more candidates");
                const req = findRequest.get(id, this.clientId);
                if (!req) throw conflict("One or more candidates have no batchable verification request.");
                candidates.push(cand);
                requestByCandidate.set(cand.id, req.id);
            }

            const batches = buildBatches(candidates, provider);
            if (!Array.isArray(batches) || batches.length === 0) {
                throw new Error("Batch engine returned no batches.");
            }
            const seen = new Set();
            for (const b of batches) {
                if (!b || typeof b.id !== "string" || !Array.isArray(b.candidates) || !b.candidates.length) {
                    throw new Error("Batch engine returned an invalid batch.");
                }
                for (const c of b.candidates) {
                    if (!requestByCandidate.has(c.id) || seen.has(c.id)) {
                        throw new Error("Batch engine returned inconsistent membership.");
                    }
                    seen.add(c.id);
                }
            }
            if (seen.size !== candidates.length) throw new Error("Batch engine dropped candidates.");

            const insBatch = this.db.prepare(`
                INSERT INTO verification_batches
                    (id, client_id, provider, batch_number, status, candidate_count)
                VALUES (?, ?, ?, ?, ?, ?)`);
            const insItem = this.db.prepare(`
                INSERT INTO batch_items
                    (id, client_id, batch_id, verification_request_id, position)
                VALUES (?, ?, ?, ?, ?)`);

            return batches.map((b) => {
                insBatch.run(b.id, this.clientId, provider.id, b.batchNumber ?? null,
                    b.status || "Draft", b.candidates.length);
                b.candidates.forEach((c, position) => {
                    insItem.run(uuidv4(), this.clientId, b.id, requestByCandidate.get(c.id), position);
                });
                this.audit("CREATE", "batch", b.id,
                    { provider: provider.id, candidateCount: b.candidates.length });
                return {
                    id: b.id, batchNumber: b.batchNumber ?? null, provider: provider.id,
                    candidateCount: b.candidates.length, status: b.status || "Draft"
                };
            });
        });
        return run.immediate();
    }

    getBatch(id) {
        if (typeof id !== "string") return null;
        return this.db.prepare(
            "SELECT * FROM verification_batches WHERE id = ? AND client_id = ?"
        ).get(id, this.clientId) || null;
    }

    listBatches({ limit, offset, status = null } = {}) {
        const p = page(limit, offset);
        const base = "SELECT * FROM verification_batches WHERE client_id = ?";
        const tail = " ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?";
        return status
            ? this.db.prepare(base + " AND status = ?" + tail)
                .all(this.clientId, String(status), p.limit, p.offset)
            : this.db.prepare(base + tail).all(this.clientId, p.limit, p.offset);
    }

    // The exact persisted members, in original order.
    getBatchMembers(batchId) {
        return this.db.prepare(`
            SELECT bi.position AS batch_position, bi.verification_request_id AS request_id, c.*
            FROM batch_items bi
            JOIN verification_requests vr
              ON vr.id = bi.verification_request_id AND vr.client_id = bi.client_id
            JOIN candidates c
              ON c.id = vr.candidate_id AND c.client_id = bi.client_id
            WHERE bi.batch_id = ? AND bi.client_id = ?
            ORDER BY bi.position`).all(batchId, this.clientId);
    }

    // Compare-and-set lifecycle change, e.g. Draft -> Submitting before sending email.
    transitionBatch(id, from, to, extra = {}) {
        const { sets, values } = Object.keys(extra).length
            ? buildUpdate(extra, BATCH_FIELDS) : { sets: [], values: [] };
        return this._tx(() => {
            const info = this.db.prepare(`
                UPDATE verification_batches SET ${["status = ?", ...sets].join(", ")}
                WHERE id = ? AND client_id = ? AND status = ?`
            ).run(to, ...values, id, this.clientId, from);
            if (info.changes !== 1) {
                const row = this.getBatch(id);
                throw row ? conflict(`Batch is ${row.status}, expected ${from}.`) : notFound("Batch");
            }
            this.audit("STATUS", "batch", id, { from, to });
            return this.getBatch(id);
        });
    }

    // ---- stats / audit --------------------------------------------
    getStats() {
        const n = (sql) => this.db.prepare(sql).get(this.clientId).count;
        return {
            candidates: n("SELECT COUNT(*) AS count FROM candidates WHERE client_id = ?"),
            documents: n("SELECT COUNT(*) AS count FROM documents WHERE client_id = ?"),
            extractions: n("SELECT COUNT(*) AS count FROM extractions WHERE client_id = ?"),
            verificationRequests: n("SELECT COUNT(*) AS count FROM verification_requests WHERE client_id = ?"),
            batches: n("SELECT COUNT(*) AS count FROM verification_batches WHERE client_id = ?"),
            pendingReviews: n("SELECT COUNT(*) AS count FROM human_reviews WHERE client_id = ? AND status = 'pending'")
        };
    }

    getAuditLog({ entityType = null, limit, offset } = {}) {
        const p = page(limit, offset, 100);
        const base = "SELECT * FROM audit_log WHERE client_id = ?";
        const tail = " ORDER BY id DESC LIMIT ? OFFSET ?";
        return entityType
            ? this.db.prepare(base + " AND entity_type = ?" + tail)
                .all(this.clientId, String(entityType), p.limit, p.offset)
            : this.db.prepare(base + tail).all(this.clientId, p.limit, p.offset);
    }

    // ---- API keys (always this tenant's; raw key never returned or audited) ----
    createApiKey(key, label) {
        if (typeof key !== "string" || key.length < 24) throw bad("Invalid API key.");
        return this._tx(() => {
            this.db.prepare("INSERT INTO api_keys (key, client_id, label) VALUES (?, ?, ?)")
                .run(key, this.clientId, label ? String(label) : null);
            this.audit("CREATE", "api_key", fingerprint(key), { label: label || null });
            return { id: fingerprint(key), label: label || null, active: 1 };
        });
    }

    listApiKeys() {
        return this.db.prepare(`SELECT key, label, active, last_used_at, created_at
            FROM api_keys WHERE client_id = ? ORDER BY created_at DESC`
        ).all(this.clientId).map(({ key, ...rest }) => ({ id: fingerprint(key), ...rest }));
    }

    revokeApiKey(id) {
        return this._tx(() => {
            const match = this.db.prepare(
                "SELECT key FROM api_keys WHERE client_id = ? AND active = 1"
            ).all(this.clientId).find((r) => fingerprint(r.key) === id);
            if (!match) throw notFound("API key");
            this.db.prepare("UPDATE api_keys SET active = 0 WHERE key = ? AND client_id = ?")
                .run(match.key, this.clientId);
            this.audit("REVOKE", "api_key", id);
        });
    }
}

module.exports = { TenantRepository, fingerprint };