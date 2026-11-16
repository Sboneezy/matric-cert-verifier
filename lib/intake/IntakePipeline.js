"use strict";

const { v4: uuidv4 } = require("uuid");

const DocumentLoader = require("./DocumentLoader");
const TextExtractor = require("./TextExtractor");
const CertificateParser = require("./CertificateParser");
const BusinessRuleEngine = require("./BusinessRuleEngine");
const OcrService = require("../ocr/OcrService");
const ConfidenceScoringService = require("../ocr/ConfidenceScoringService");
const logger = require("../config/logger");

/**
 * IntakePipeline
 *
 * Orchestrates the full document-to-candidate flow:
 *   1. Load & validate the uploaded file
 *   2. Try to extract the text layer (fast path for digital PDFs)
 *   3. Fall back to OCR if no text layer is present (scanned PDFs / images)
 *   4. Parse candidate fields from the extracted text
 *   5. Apply business rules (provider routing, validation, status)
 */
class IntakePipeline {

    constructor(options = {}) {
        this.documentLoader    = new DocumentLoader();
        this.textExtractor     = new TextExtractor();
        this.certificateParser = new CertificateParser();
        this.businessRuleEngine = new BusinessRuleEngine();
        this.ocrService        = new OcrService(options.ocr || {});
        this.confidenceScorer  = new ConfidenceScoringService();
    }

    async process(filePath, options = {}) {
        const documentId = uuidv4();

        // ── 1. Load ──────────────────────────────────────────────────
        const document = this.documentLoader.load(filePath);
        logger.info({ documentId, filename: document.name }, "Document loaded");

        // ── 2. Text extraction (digital PDF) ─────────────────────────
        let text = "";
        let strategy = "text-layer";

        try {
            text = await this.textExtractor.extract(document);
        } catch (err) {
            logger.warn({ documentId, err: err.message }, "Text extraction failed, falling back to OCR");
        }

        // ── 3. OCR fallback ──────────────────────────────────────────
        if (!text || text.trim().length < 50) {
            logger.info({ documentId }, "No text layer detected — running OCR");
            strategy = "ocr";

            try {
                const ocrResult = document.extension === ".pdf"
                    ? await this.ocrService.extractFromPdf(document.path, {
                          useVoting: options.useOcrVoting !== false,
                      })
                    : await this.ocrService.extractFromImage(document.path, {
                          useVoting: options.useOcrVoting !== false,
                      });

                text = ocrResult.text || ocrResult.mergedText || "";

                logger.info(
                    { documentId, confidence: ocrResult.confidence, strategy: ocrResult.strategy },
                    "OCR completed"
                );
            } catch (ocrErr) {
                logger.error({ documentId, err: ocrErr.message }, "OCR failed");
                throw new Error(`Document processing failed: ${ocrErr.message}`);
            } finally {
                // Always release the Tesseract worker
                await this.ocrService.terminate();
            }
        }

        if (!text || text.trim().length === 0) {
            throw new Error("No text could be extracted from this document.");
        }

        // ── 4. Parse ─────────────────────────────────────────────────
        const candidate = this.certificateParser.parse(text);
        candidate.id = candidate.id || uuidv4();

        logger.info({ documentId, candidateId: candidate.id }, "Candidate parsed");

        // ── 5. Business rules ─────────────────────────────────────────
        const decision = this.businessRuleEngine.evaluate(candidate);

        logger.info(
            { documentId, candidateId: candidate.id, status: decision.status, provider: decision.provider },
            "Business rules evaluated"
        );

        return {
            documentId,
            candidate,
            decision,
            strategy,
            rawText: text,
        };
    }
}

module.exports = IntakePipeline;
