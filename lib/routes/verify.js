"use strict";

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const IntakePipeline = require("../intake/IntakePipeline");
const SecureFileUploadHandler = require("../security/SecureFileUploadHandler");
const { AppError } = require("../middleware/errorHandler");
const { tenantRepo } = require("../middleware/tenant");
const logger = require("../config/logger");
const env = require("../config/env");

const router = express.Router();
router.use(tenantRepo);

const upload = multer({
    dest: path.resolve(env.upload.dir),
    limits: { fileSize: env.upload.maxFileSizeBytes },
});

/**
 * POST /api/v1/verify
 *
 * Upload a certificate, run the intake pipeline, and persist the result
 * atomically for the authenticated tenant.
 */
router.post("/", upload.single("certificate"), async (req, res, next) => {
    if (!req.file) {
        return next(new AppError(
            "No certificate file uploaded. Use field name: certificate",
            400
        ));
    }

    let fileHandler = null;
    let secureFile = null;
    let persistenceCommitted = false;

    try {
        fileHandler = new SecureFileUploadHandler({
            uploadDir: env.upload.dir
        });

        secureFile = await fileHandler.handleUpload(req.file);

        const pipeline = new IntakePipeline({
            ocr: { languages: "eng" },
        });

        const result = await pipeline.process(secureFile.filePath, {
            useOcrVoting: req.body.useOcrVoting !== "false",
        });

        const candidate = result.candidate;
        const decision = result.decision;

        // One transaction: document, candidate, request and audit rows,
        // all owned by the authenticated tenant. IDs are server-generated.
        const ids = req.repo.recordVerification({
            document: {
                originalFilename: secureFile.originalFilename,
                filePath: secureFile.filePath,
                fileType: req.file.mimetype,
                fileSize: req.file.size,
                classification: result.strategy,
                strategy: result.strategy,
                ocrConfidence: null,
            },
            candidate,
            decision,
        });

        persistenceCommitted = true;
        candidate.id = ids.candidateId;

        logger.info(
            {
                requestId: ids.requestId,
                candidateId: ids.candidateId,
                provider: decision.provider,
                status: decision.status
            },
            "Verification request created"
        );

        return res.status(201).json({
            success: true,
            requestId: ids.requestId,
            documentId: ids.documentId,
            strategy: result.strategy,
            candidate: candidate.toJSON ? candidate.toJSON() : candidate,
            decision,
        });

    } catch (err) {
        if (secureFile && fileHandler && !persistenceCommitted) {
            try {
                fileHandler.deleteFile(secureFile.filePath);
            } catch (cleanupError) {
                logger.error(
                    { error: cleanupError.message, filePath: secureFile.filePath },
                    "Failed to remove orphaned permanent upload"
                );
            }
        }
        return next(err);

    } finally {
        if (req.file && req.file.path) {
            try {
                await fs.promises.unlink(req.file.path);
            } catch (cleanupError) {
                if (cleanupError.code !== "ENOENT") {
                    logger.warn(
                        { error: cleanupError.message, filePath: req.file.path },
                        "Failed to remove temporary upload file"
                    );
                }
            }
        }
    }
});

module.exports = router;