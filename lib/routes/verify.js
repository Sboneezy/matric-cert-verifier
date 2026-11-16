"use strict";

const express  = require("express");
const multer   = require("multer");
const path     = require("path");
const { v4: uuidv4 } = require("uuid");

const IntakePipeline           = require("../intake/IntakePipeline");
const SecureFileUploadHandler  = require("../security/SecureFileUploadHandler");
const { getProvider }          = require("../providers/ProviderRegistry");
const { AppError }             = require("../middleware/errorHandler");
const logger                   = require("../config/logger");
const env                      = require("../config/env");

const router = express.Router();

// Multer stores files temporarily in /uploads before SecureFileUploadHandler moves them
const upload = multer({
    dest: path.resolve(env.upload.dir),
    limits: { fileSize: env.upload.maxFileSizeBytes },
});

/**
 * POST /api/v1/verify
 *
 * Upload a single certificate file, run the intake pipeline,
 * persist the result, and return the candidate + decision.
 *
 * Body (multipart/form-data):
 *   certificate  — the file
 *   useOcrVoting — (optional) "true" | "false"  (default: true)
 */
router.post("/", upload.single("certificate"), async (req, res, next) => {
    if (!req.file) {
        return next(new AppError("No certificate file uploaded. Use field name: certificate", 400));
    }

    const db             = req.app.locals.db;
    const fileHandler    = new SecureFileUploadHandler({ uploadDir: env.upload.dir });
    let secureFile       = null;

    try {
        // ── Secure the upload ────────────────────────────────────────
        secureFile = await fileHandler.handleUpload(req.file);

        // ── Run the pipeline ─────────────────────────────────────────
        const pipeline = new IntakePipeline({
            ocr: { languages: "eng" },
        });

        const result = await pipeline.process(secureFile.filePath, {
            useOcrVoting: req.body.useOcrVoting !== "false",
        });

        // ── Persist document record ──────────────────────────────────
        const documentId = result.documentId;
        db.createDocument({
            id:               documentId,
            originalFilename: secureFile.originalFilename,
            filePath:         secureFile.filePath,
            fileType:         req.file.mimetype,
            fileSize:         req.file.size,
            classification:   result.strategy,
            strategy:         result.strategy,
            ocrConfidence:    null,
        });

        // ── Persist candidate ────────────────────────────────────────
        const candidate = result.candidate;
        candidate.id = candidate.id || uuidv4();
        db.createCandidate(candidate);

        // ── Persist verification request ─────────────────────────────
        const requestId = uuidv4();
        const decision  = result.decision;

        db.createVerificationRequest({
            id:        requestId,
            candidateId: candidate.id,
            provider:  decision.provider,
            status:    decision.status === "BLOCKED" ? "Blocked" : "Draft",
        });

        db.logAudit(
            "VERIFY",
            "verification_request",
            requestId,
            { documentId, provider: decision.provider, status: decision.status },
            req.clientId || null,
            req.ip
        );

        logger.info(
            { requestId, candidateId: candidate.id, provider: decision.provider, status: decision.status },
            "Verification request created"
        );

        res.status(201).json({
            success:  true,
            requestId,
            documentId,
            strategy: result.strategy,
            candidate: candidate.toJSON ? candidate.toJSON() : candidate,
            decision,
        });

    } catch (err) {
        // Clean up temp file from multer if the pipeline failed
        if (req.file && req.file.path) {
            try { require("fs").unlinkSync(req.file.path); } catch (_) {}
        }
        next(err);
    }
});

module.exports = router;
