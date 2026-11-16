"use strict";

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");

const BatchEngine        = require("../batching/BatchEngine");
const VerificationBatch  = require("../models/VerificationBatch");
const TemplateRenderer   = require("../templates/TemplateRenderer");
const EmailSubmissionService = require("../providers/EmailSubmissionService");
const { getProvider }    = require("../providers/ProviderRegistry");
const { AppError }       = require("../middleware/errorHandler");
const logger             = require("../config/logger");
const env                = require("../config/env");

const router = express.Router();

/**
 * GET /api/v1/batches
 * List batches with optional pagination and status filter.
 */
router.get("/", (req, res, next) => {
    try {
        const db     = req.app.locals.db;
        const limit  = Math.min(parseInt(req.query.limit, 10)  || 50, 200);
        const offset = parseInt(req.query.offset, 10) || 0;
        const { status } = req.query;

        const batches = db.listBatches({ limit, offset, status });

        res.json({ success: true, total: batches.length, limit, offset, data: batches });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/v1/batches/:id
 */
router.get("/:id", (req, res, next) => {
    try {
        const db    = req.app.locals.db;
        const batch = db.getBatch(req.params.id);

        if (!batch) {
            return next(new AppError(`Batch not found: ${req.params.id}`, 404));
        }

        res.json({ success: true, data: batch });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/v1/batches
 * Create a batch from a list of candidate IDs.
 *
 * Body (JSON):
 *   providerId   — "umalusi" | "saqa" | "doe"
 *   candidateIds — string[]
 */
router.post("/", async (req, res, next) => {
    try {
        const db = req.app.locals.db;
        const { providerId, candidateIds } = req.body;

        if (!providerId) {
            return next(new AppError("providerId is required.", 400));
        }
        if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
            return next(new AppError("candidateIds must be a non-empty array.", 400));
        }

        const provider = getProvider(providerId);
        if (!provider) {
            return next(new AppError(`Unknown provider: ${providerId}`, 400));
        }

        // Load candidates from the database
        const candidates = candidateIds
            .map((id) => db.getCandidate(id))
            .filter(Boolean);

        if (candidates.length === 0) {
            return next(new AppError("No valid candidates found for the given IDs.", 400));
        }

        // Create batch objects using BatchEngine
        const batches = BatchEngine.createBatches(candidates, provider);

        const saved = batches.map((b) => {
            db.saveBatch(b);
            return b;
        });

        db.logAudit("CREATE", "batch", saved.map((b) => b.id).join(","), {
            provider: providerId,
            candidateCount: candidates.length,
            batchCount: saved.length,
        }, req.clientId, req.ip);

        logger.info(
            { batchCount: saved.length, provider: providerId, candidateCount: candidates.length },
            "Batches created"
        );

        res.status(201).json({
            success: true,
            batchCount: saved.length,
            data: saved.map((b) => ({
                id: b.id,
                batchNumber: b.batchNumber,
                provider: b.provider.id,
                candidateCount: b.candidates.length,
                status: b.status,
            })),
        });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/v1/batches/:id/submit
 * Generate the provider template and send it via email.
 */
router.post("/:id/submit", async (req, res, next) => {
    try {
        const db       = req.app.locals.db;
        const batchRow = db.getBatch(req.params.id);

        if (!batchRow) {
            return next(new AppError(`Batch not found: ${req.params.id}`, 404));
        }
        if (batchRow.status !== "Draft") {
            return next(new AppError(`Batch cannot be submitted in status: ${batchRow.status}`, 409));
        }

        // Reconstruct the batch object (DB row is flat; we need the model)
        const provider = getProvider(batchRow.provider);
        if (!provider) {
            return next(new AppError(`Provider not found: ${batchRow.provider}`, 500));
        }

        // Load candidates for this batch (stored as verification_requests)
        // For now we reconstruct from candidate_count — a real query could join tables.
        // The batch row candidates are re-loaded from the DB via a custom approach:
        const candidateRows = db.listCandidates({ limit: batchRow.candidate_count || 50 });

        const batch = new VerificationBatch({
            id: batchRow.id,
            batchNumber: batchRow.batch_number,
            provider,
            candidates: candidateRows,
        });

        // ── Render template ──────────────────────────────────────────
        const renderer = new TemplateRenderer();
        const templateFile = await renderer.render(batch);

        logger.info({ batchId: batch.id, file: templateFile.fileName }, "Template rendered");

        // ── Send email ───────────────────────────────────────────────
        const emailService = new EmailSubmissionService({
            host:   env.smtp.host,
            port:   env.smtp.port,
            secure: env.smtp.secure,
            user:   env.smtp.user,
            pass:   env.smtp.pass,
            from:   env.smtp.from,
        });

        const emailResult = await emailService.sendVerificationBatch(batch, templateFile);

        // ── Update batch status ──────────────────────────────────────
        batch.submit();
        db.saveBatch(batch);

        db.logAudit("SUBMIT", "batch", batch.id, {
            provider: provider.id,
            messageId: emailResult.messageId,
            templateFile: templateFile.fileName,
        }, req.clientId, req.ip);

        logger.info(
            { batchId: batch.id, messageId: emailResult.messageId },
            "Batch submitted"
        );

        res.json({
            success: true,
            batchId: batch.id,
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
 * Download the generated template file for a batch.
 */
router.get("/:id/download", async (req, res, next) => {
    try {
        const db       = req.app.locals.db;
        const batchRow = db.getBatch(req.params.id);

        if (!batchRow) {
            return next(new AppError(`Batch not found: ${req.params.id}`, 404));
        }

        const provider = getProvider(batchRow.provider);
        if (!provider) {
            return next(new AppError(`Provider not found: ${batchRow.provider}`, 500));
        }

        // Re-render on demand
        const candidateRows = db.listCandidates({ limit: batchRow.candidate_count || 50 });
        const batch = new VerificationBatch({
            id: batchRow.id,
            batchNumber: batchRow.batch_number,
            provider,
            candidates: candidateRows,
        });

        const renderer = new TemplateRenderer();
        const templateFile = await renderer.render(batch);

        res.setHeader("Content-Disposition", `attachment; filename="${templateFile.fileName}"`);
        res.setHeader("Content-Type", templateFile.mimeType);
        res.sendFile(templateFile.filePath);

    } catch (err) {
        next(err);
    }
});

module.exports = router;
