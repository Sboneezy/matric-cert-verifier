
"use strict";

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const IntakePipeline = require("../intake/IntakePipeline");
const SecureFileUploadHandler = require("../security/SecureFileUploadHandler");
const { AppError } = require("../middleware/errorHandler");
const logger = require("../config/logger");
const env = require("../config/env");

const router = express.Router();

// Multer stores files temporarily before SecureFileUploadHandler
// validates and copies them into permanent storage.
const upload = multer({
    dest: path.resolve(env.upload.dir),
    limits: { fileSize: env.upload.maxFileSizeBytes },
});

/**
 * POST /api/v1/verify
 *
 * Upload a certificate, process it through the intake pipeline,
 * persist the result atomically, and return the candidate + decision.
 *
 * Body (multipart/form-data):
 *   certificate - the uploaded file
 *   useOcrVoting - optional "true" | "false" (default: true)
 */
router.post("/", upload.single("certificate"), async (req, res, next) => {
    if (!req.file) {
        return next(new AppError(
            "No certificate file uploaded. Use field name: certificate",
            400
        ));
    }

    const db = req.app.locals.db;

    let fileHandler = null;
    let secureFile = null;
    let persistenceCommitted = false;

    try {
        // Initialize handler inside try so temporary-file cleanup
        // still runs if initialization fails.
        fileHandler = new SecureFileUploadHandler({
            uploadDir: env.upload.dir
        });

        // Validate and create the permanent secure copy.
        secureFile = await fileHandler.handleUpload(req.file);

        // Run the intake pipeline outside the DB transaction.
        const pipeline = new IntakePipeline({
            ocr: { languages: "eng" },
        });

        const result = await pipeline.process(secureFile.filePath, {
            useOcrVoting: req.body.useOcrVoting !== "false",
        });

        const documentId = result.documentId;
        const candidate = result.candidate;
        candidate.id = candidate.id || uuidv4();

        const requestId = uuidv4();
        const decision = result.decision;

        // Persist all records atomically. If any operation fails,
        // SQLite rolls back the entire persistence transaction,
        // including audit records created by DB service methods.
        const persist = db.db.transaction(() => {
            db.createDocument({
                id: documentId,
                originalFilename: secureFile.originalFilename,
                filePath: secureFile.filePath,
                fileType: req.file.mimetype,
                fileSize: req.file.size,
                classification: result.strategy,
                strategy: result.strategy,
                ocrConfidence: null,
            });

            db.createCandidate(candidate);

            db.createVerificationRequest({
                id: requestId,
                candidateId: candidate.id,
                provider: decision.provider,
                status: decision.status === "BLOCKED"
                    ? "Blocked"
                    : "Draft",
            });

            db.logAudit(
                "VERIFY",
                "verification_request",
                requestId,
                {
                    documentId,
                    provider: decision.provider,
                    status: decision.status
                },
                req.clientId || null,
                req.ip
            );
        });

        persist();

        // The DB transaction completed successfully.
        persistenceCommitted = true;

        logger.info(
            {
                requestId,
                candidateId: candidate.id,
                provider: decision.provider,
                status: decision.status
            },
            "Verification request created"
        );

        return res.status(201).json({
            success: true,
            requestId,
            documentId,
            strategy: result.strategy,
            candidate: candidate.toJSON
                ? candidate.toJSON()
                : candidate,
            decision,
        });

    } catch (err) {
        // If persistence didn't commit, the permanent file is
        // orphaned and should be removed.
        if (secureFile && fileHandler && !persistenceCommitted) {
            try {
                fileHandler.deleteFile(secureFile.filePath);
            } catch (cleanupError) {
                logger.error(
                    {
                        error: cleanupError.message,
                        filePath: secureFile.filePath
                    },
                    "Failed to remove orphaned permanent upload"
                );
            }
        }

        return next(err);

    } finally {
        // Always remove Multer's temporary file.
        // Never remove the permanent copy after a successful commit.
        if (req.file && req.file.path) {
            try {
                await fs.promises.unlink(req.file.path);
            } catch (cleanupError) {
                if (cleanupError.code !== "ENOENT") {
                    logger.warn(
                        {
                            error: cleanupError.message,
                            filePath: req.file.path
                        },
                        "Failed to remove temporary upload file"
                    );
                }
            }
        }
    }
});

module.exports = router;
