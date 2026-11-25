"use strict";

const express = require("express");

const BatchEngine = require("../batching/BatchEngine");
const VerificationBatch = require("../models/VerificationBatch");
const TemplateRenderer = require("../templates/TemplateRenderer");
const EmailSubmissionService = require("../providers/EmailSubmissionService");
const { getProvider } = require("../providers/ProviderRegistry");
const { AppError } = require("../middleware/errorHandler");
const { tenantRepo } = require("../middleware/tenant");
const logger = require("../config/logger");
const env = require("../config/env");

const router = express.Router();
router.use(tenantRepo);

// Loads a tenant-owned batch together with its persisted members.
// Never falls back to a global candidate query.
function loadBatch(repo, id) {
    const row = repo.getBatch(id);
    if (!row) throw new AppError("Batch not found.", 404);

    const provider = getProvider(row.provider);
    if (!provider) throw new AppError("Provider not found for batch.", 500);

    const members = repo.getBatchMembers(row.id);
    if (members.length === 0 || members.length !== row.candidate_count) {
        throw new AppError(
            "Batch has no complete persisted membership and cannot be processed.",
            409
        );
    }
    return { row, provider, members };
}

/**
 * GET /api/v1/batches
 */
router.get("/", (req, res, next) => {
    try {
        const status = typeof req.query.status === "string" && req.query.status
            ? req.query.status
            : null;

        const batches = req.repo.listBatches({
            status,
            limit: req.query.limit,
            offset: req.query.offset,
        });

        res.json({ success: true, total: batches.length, data: batches });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/v1/batches/:id
 */
router.get("/:id", (req, res, next) => {
    try {
        const batch = req.repo.getBatch(req.params.id);
        if (!batch) return next(new AppError("Batch not found.", 404));
        res.json({ success: true, data: batch });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/v1/batches
 * Body: { providerId: string, candidateIds: string[] }
 */
router.post("/", (req, res, next) => {
    try {
        const { providerId, candidateIds } = req.body || {};

        if (typeof providerId !== "string" || !providerId) {
            return next(new AppError("providerId is required.", 400));
        }
        if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
            return next(new AppError("candidateIds must be a non-empty array.", 400));
        }

        const provider = getProvider(providerId);
        if (!provider) {
            return next(new AppError(`Unknown provider: ${providerId}`, 400));
        }

        const created = req.repo.createBatches({
            provider,
            candidateIds,
            buildBatches: BatchEngine.createBatches,
        });

        logger.info(
            { batchCount: created.length, provider: provider.id, candidateCount: candidateIds.length },
            "Batches created"
        );

        res.status(201).json({ success: true, batchCount: created.length, data: created });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/v1/batches/:id/submit
 */
router.post("/:id/submit", async (req, res, next) => {
    try {
        const { row, provider, members } = loadBatch(req.repo, req.params.id);

        if (row.status !== "Draft") {
            return next(new AppError(`Batch cannot be submitted in status: ${row.status}`, 409));
        }

        // Atomic claim: only one concurrent request can move Draft -> Submitting.
        req.repo.transitionBatch(row.id, "Draft", "Submitting");

        let batch, templateFile, emailResult;
        try {
            batch = new VerificationBatch({
                id: row.id,
                batchNumber: row.batch_number,
                provider,
                candidates: members,
            });

            templateFile = await new TemplateRenderer().render(batch);

            const emailService = new EmailSubmissionService({
                host:   env.smtp.host,
                port:   env.smtp.port,
                secure: env.smtp.secure,
                user:   env.smtp.user,
                pass:   env.smtp.pass,
                from:   env.smtp.from,
            });

            emailResult = await emailService.sendVerificationBatch(batch, templateFile);
        } catch (err) {
            try {
                req.repo.transitionBatch(row.id, "Submitting", "Draft", {
                    failure_reason: String(err.message || err).slice(0, 500),
                });
            } catch (revertErr) {
                logger.error({ batchId: row.id, error: revertErr.message },
                    "Failed to revert batch to Draft after submit failure");
            }
            return next(err);
        }

        // The email has been sent. Never revert to Draft from here.
        try {
            batch.submit();
            req.repo.transitionBatch(row.id, "Submitting", batch.status, {
                submitted_at: new Date().toISOString(),
            });
            req.repo.audit("SUBMIT", "batch", row.id, {
                provider: provider.id,
                messageId: emailResult.messageId,
                templateFile: templateFile.fileName,
            });
        } catch (err) {
            logger.error(
                { batchId: row.id, messageId: emailResult.messageId, error: err.message },
                "Batch email sent but status could not be recorded"
            );
            return next(new AppError(
                "Batch email was sent but its status could not be recorded. Do not resend; contact support.",
                500
            ));
        }

        logger.info({ batchId: row.id, messageId: emailResult.messageId }, "Batch submitted");

        res.json({
            success: true,
            batchId: row.id,
            status: batch.status,
            emailMessageId: emailResult.messageId,
            templateFile: templateFile.fileName,
            sentAt: emailResult.sentAt,
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/v1/batches/:id/download
 */
router.get("/:id/download", async (req, res, next) => {
    try {
        const { row, provider, members } = loadBatch(req.repo, req.params.id);

        const batch = new VerificationBatch({
            id: row.id,
            batchNumber: row.batch_number,
            provider,
            candidates: members,
        });

        const templateFile = await new TemplateRenderer().render(batch);

        res.setHeader("Content-Disposition", `attachment; filename="${templateFile.fileName}"`);
        res.setHeader("Content-Type", templateFile.mimeType);
        res.sendFile(templateFile.filePath);
    } catch (err) {
        next(err);
    }
});

module.exports = router;