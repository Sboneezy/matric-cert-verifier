"use strict";

const path = require("path");
const fs = require("fs");
const logger = require("../config/logger");

// ExcelJS is lazy-loaded on first use — it's large and slows startup if required at the top

// Optional: docxtemplater + pizzip for template-based DOCX rendering
let PizZip, Docxtemplater;
try {
    PizZip = require("pizzip");
    Docxtemplater = require("docxtemplater");
} catch (_) {
    // Will fall back to raw XML DOCX generation
}

/**
 * TemplateRenderer
 *
 * Renders provider-specific verification templates into actual files:
 *   - Umalusi / DoE  → DOCX
 *   - SAQA            → XLSX
 *
 * Templates live in /templates/*.docx and /templates/*.xlsx.
 * If a real template file doesn't exist, it generates a plain fallback.
 */
class TemplateRenderer {

    constructor(options = {}) {
        this.templatesDir = options.templatesDir ||
            path.join(__dirname, "..", "..", "templates");
        this.outputDir = options.outputDir ||
            path.join(__dirname, "..", "..", "generated");

        [this.templatesDir, this.outputDir].forEach((dir) => {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        });
    }

    // ----------------------------------------------------------------
    // Public API
    // ----------------------------------------------------------------

    /**
     * Render a batch into its provider-specific template file.
     * Returns { fileName, filePath, mimeType }
     */
    async render(batch) {
        const provider = batch.provider;
        if (!provider) throw new Error("Batch has no provider.");

        const templatePath = path.join(this.templatesDir, path.basename(provider.template));
        const extension    = path.extname(provider.template).toLowerCase();

        logger.info(
            { batchId: batch.id, provider: provider.id, extension },
            "Rendering template"
        );

        if (extension === ".xlsx") {
            return this._renderXlsx(batch, templatePath);
        }
        return this._renderDocx(batch, templatePath);
    }

    // ----------------------------------------------------------------
    // DOCX rendering (Umalusi, DoE)
    // ----------------------------------------------------------------

    async _renderDocx(batch, templatePath) {
        const templateData = this._buildTemplateData(batch);
        const outputFileName = `batch-${batch.batchNumber}-${batch.provider.id}-${Date.now()}.docx`;
        const outputPath = path.join(this.outputDir, outputFileName);

        if (fs.existsSync(templatePath) && PizZip && Docxtemplater) {
            // Use the actual DOCX template with docxtemplater
            const content = fs.readFileSync(templatePath, "binary");
            const zip = new PizZip(content);
            const doc = new Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
            });
            doc.render(templateData);
            const buffer = doc.getZip().generate({ type: "nodebuffer" });
            fs.writeFileSync(outputPath, buffer);
        } else {
            // Fallback: generate a basic DOCX without a template
            await this._generateFallbackDocx(templateData, outputPath);
        }

        return {
            fileName: outputFileName,
            filePath: outputPath,
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        };
    }

    // ----------------------------------------------------------------
    // XLSX rendering (SAQA)
    // ----------------------------------------------------------------

    async _renderXlsx(batch, templatePath) {
        const ExcelJS = require("exceljs"); // lazy load — only pay the cost when needed
        const templateData = this._buildTemplateData(batch);
        const outputFileName = `batch-${batch.batchNumber}-${batch.provider.id}-${Date.now()}.xlsx`;
        const outputPath = path.join(this.outputDir, outputFileName);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = "Matric Certificate Verifier";
        workbook.created = new Date();

        const sheet = workbook.addWorksheet("Verification Request");

        // Header rows
        sheet.mergeCells("A1:F1");
        const titleCell = sheet.getCell("A1");
        titleCell.value = `${batch.provider.name} — Verification Request`;
        titleCell.font = { bold: true, size: 14 };
        titleCell.alignment = { horizontal: "center" };

        sheet.addRow([]);
        sheet.addRow([
            "Batch Number:", templateData.batchNumber,
            "Provider:", templateData.providerName,
            "Generated:", new Date(templateData.generatedAt).toLocaleDateString("en-ZA"),
        ]);
        sheet.addRow([]);

        // Column headers
        const headerRow = sheet.addRow([
            "#", "Surname", "Full Names", "ID Number",
            "Qualification", "Year", "Certificate No.", "Examination No."
        ]);
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF12355B" },
        };
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

        // Column widths
        sheet.columns = [
            { width: 5 },
            { width: 20 },
            { width: 25 },
            { width: 18 },
            { width: 28 },
            { width: 8 },
            { width: 18 },
            { width: 18 },
        ];

        // Data rows
        templateData.rows.forEach((row, index) => {
            sheet.addRow([
                index + 1,
                row.surname,
                row.fullNames,
                row.idNumber,
                row.qualification,
                row.year,
                row.certificateNumber || "",
                row.examinationNumber || "",
            ]);
        });

        await workbook.xlsx.writeFile(outputPath);

        return {
            fileName: outputFileName,
            filePath: outputPath,
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        };
    }

    // ----------------------------------------------------------------
    // Fallback DOCX generator (no template file required)
    // ----------------------------------------------------------------

    async _generateFallbackDocx(data, outputPath) {
        const xmlContent = this._buildDocxXml(data);

        if (PizZip) {
            // Use PizZip if available for proper DOCX structure
            const zip = new PizZip();
            zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
            zip.file("_rels/.rels", RELS_XML);
            zip.file("word/_rels/document.xml.rels", DOC_RELS_XML);
            zip.file("word/document.xml", xmlContent);
            fs.writeFileSync(outputPath, zip.generate({ type: "nodebuffer" }));
        } else {
            // Pure Node.js fallback — produce a minimal valid ZIP (DOCX) without external deps
            const { createDocxBuffer } = require("../utils/minimalDocx");
            const buf = createDocxBuffer({
                "[Content_Types].xml": CONTENT_TYPES_XML,
                "_rels/.rels": RELS_XML,
                "word/_rels/document.xml.rels": DOC_RELS_XML,
                "word/document.xml": xmlContent,
            });
            fs.writeFileSync(outputPath, buf);
        }
    }

    _buildDocxXml(data) {
        const rows = data.rows.map((row, i) => `
    <w:tr>
      <w:tc><w:p><w:r><w:t>${i + 1}</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>${this._escXml(row.surname)}</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>${this._escXml(row.fullNames)}</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>${this._escXml(row.idNumber)}</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>${this._escXml(row.qualification)}</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>${row.year}</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>${this._escXml(row.certificateNumber || "")}</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>${this._escXml(row.examinationNumber || "")}</w:t></w:r></w:p></w:tc>
    </w:tr>`).join("");

        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
      <w:t>${this._escXml(data.providerName)} — Verification Request</w:t>
    </w:r></w:p>
    <w:p><w:r><w:t>Batch: ${data.batchNumber}   Candidates: ${data.candidateCount}   Generated: ${new Date(data.generatedAt).toLocaleDateString("en-ZA")}</w:t></w:r></w:p>
    <w:p/>
    <w:tbl>
      <w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>#</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Surname</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Full Names</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>ID Number</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Qualification</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Year</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Cert No.</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Exam No.</w:t></w:r></w:p></w:tc>
      </w:tr>
      ${rows}
    </w:tbl>
  </w:body>
</w:document>`;
    }

    _escXml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    // ----------------------------------------------------------------
    // Shared data builder
    // ----------------------------------------------------------------

    _buildTemplateData(batch) {
        return {
            provider: batch.provider.id,
            providerName: batch.provider.name,
            batchNumber: batch.batchNumber,
            generatedAt: new Date().toISOString(),
            candidateCount: batch.candidates.length,
            rows: batch.candidates.map((c) => ({
                surname: c.surname || "",
                fullNames: c.fullNames || "",
                idNumber: c.idNumber || "",
                qualification: c.qualificationType || "",
                year: c.qualificationYear || "",
                certificateNumber: c.certificateNumber || "",
                examinationNumber: c.examinationNumber || "",
            })),
        };
    }
}

module.exports = TemplateRenderer;

// ── Shared XML fragments ────────────────────────────────────────────
const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;
