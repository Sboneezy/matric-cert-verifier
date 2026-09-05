const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } = require("docx");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

/**
 * Provider Template Generator
 * 
 * Generates Word (.docx) and Excel (.xlsx) files for verification
 * providers who accept submissions via email with attached templates.
 * 
 * Providers:
 * - Umalusi: Word template with candidate details
 * - SAQA: Excel spreadsheet format
 * - Department of Education: Word template
 */
class ProviderTemplateGenerator {
    
    constructor(outputDir) {
        this.outputDir = outputDir || path.join(__dirname, "..", "..", "generated");
        
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }
    
    /**
     * Generate a Word document for Umalusi
     */
    async generateUmalusiTemplate(batch) {
        const doc = new Document({
            sections: [{
                properties: {},
                children: [
                    new Paragraph({
                        text: "UMALUSI VERIFICATION REQUEST",
                        heading: "Heading1",
                        alignment: AlignmentType.CENTER
                    }),
                    new Paragraph({
                        text: `Batch Number: ${batch.batchNumber}`,
                        spacing: { before: 200 }
                    }),
                    new Paragraph({
                        text: `Date: ${new Date().toISOString().split("T")[0]}`,
                        spacing: { before: 100 }
                    }),
                    new Paragraph({
                        text: `Provider: ${batch.provider.name}`,
                        spacing: { before: 100 }
                    }),
                    new Paragraph({
                        text: "",
                        spacing: { before: 200 }
                    }),
                    new Paragraph({
                        text: "Candidate Details",
                        heading: "Heading2"
                    }),
                    this.buildCandidateTable(batch.candidates)
                ]
            }]
        });
        
        const fileName = `umalusi-batch-${batch.batchNumber}-${Date.now()}.docx`;
        const filePath = path.join(this.outputDir, fileName);
        
        const buffer = await Packer.toBuffer(doc);
        fs.writeFileSync(filePath, buffer);
        
        return {
            fileName,
            filePath,
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        };
    }
    
    /**
     * Generate an Excel spreadsheet for SAQA
     */
    async generateSaqaTemplate(batch) {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Verification Request");
        
        // Title row
        worksheet.mergeCells("A1:F1");
        worksheet.getCell("A1").value = "SAQA VERIFICATION REQUEST";
        worksheet.getCell("A1").font = { size: 14, bold: true };
        worksheet.getCell("A1").alignment = { horizontal: "center" };
        
        // Batch info
        worksheet.getCell("A3").value = "Batch Number:";
        worksheet.getCell("B3").value = batch.batchNumber;
        worksheet.getCell("A4").value = "Date:";
        worksheet.getCell("B4").value = new Date().toISOString().split("T")[0];
        
        // Headers
        const headers = [
            "Surname",
            "Full Names",
            "ID Number",
            "Examination Number",
            "Qualification",
            "Year"
        ];
        
        const headerRow = worksheet.getRow(6);
        headers.forEach((header, index) => {
            headerRow.getCell(index + 1).value = header;
            headerRow.getCell(index + 1).font = { bold: true };
            headerRow.getCell(index + 1).fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFD3D3D3" }
            };
        });
        
        // Candidate rows
        batch.candidates.forEach((candidate, rowIndex) => {
            const row = worksheet.getRow(rowIndex + 7);
            row.getCell(1).value = candidate.surname;
            row.getCell(2).value = candidate.fullNames;
            row.getCell(3).value = candidate.idNumber;
            row.getCell(4).value = candidate.examinationNumber || "";
            row.getCell(5).value = candidate.qualificationType;
            row.getCell(6).value = candidate.qualificationYear;
        });
        
        // Auto-fit columns
        worksheet.columns.forEach(column => {
            column.width = 20;
        });
        
        const fileName = `saqa-batch-${batch.batchNumber}-${Date.now()}.xlsx`;
        const filePath = path.join(this.outputDir, fileName);
        
        await workbook.xlsx.writeFile(filePath);
        
        return {
            fileName,
            filePath,
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        };
    }
    
    /**
     * Generate Word document for Department of Education
     */
    async generateDoeTemplate(batch) {
        const doc = new Document({
            sections: [{
                children: [
                    new Paragraph({
                        text: "DEPARTMENT OF EDUCATION - VERIFICATION REQUEST",
                        heading: "Heading1",
                        alignment: AlignmentType.CENTER
                    }),
                    new Paragraph({
                        text: `Batch: ${batch.batchNumber} | Date: ${new Date().toISOString().split("T")[0]}`,
                        spacing: { before: 200 }
                    }),
                    new Paragraph({
                        text: "",
                        spacing: { before: 200 }
                    }),
                    this.buildCandidateTable(batch.candidates)
                ]
            }]
        });
        
        const fileName = `doe-batch-${batch.batchNumber}-${Date.now()}.docx`;
        const filePath = path.join(this.outputDir, fileName);
        
        const buffer = await Packer.toBuffer(doc);
        fs.writeFileSync(filePath, buffer);
        
        return {
            fileName,
            filePath,
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        };
    }
    
    /**
     * Build a candidate table for Word documents
     */
    buildCandidateTable(candidates) {
        const rows = [
            new TableRow({
                children: [
                    "Surname",
                    "Full Names",
                    "ID Number",
                    "Exam Number",
                    "Qualification",
                    "Year"
                ].map(text => new TableCell({
                    children: [new Paragraph({
                        children: [new TextRun({ text, bold: true })]
                    })]
                }))
            }),
            ...candidates.map(candidate => new TableRow({
                children: [
                    candidate.surname || "",
                    candidate.fullNames || "",
                    candidate.idNumber || "",
                    candidate.examinationNumber || "",
                    candidate.qualificationType || "",
                    candidate.qualificationYear?.toString() || ""
                ].map(text => new TableCell({
                    children: [new Paragraph({ text })]
                }))
            }))
        ];
        
        return new Table({
            rows,
            width: {
                size: 100,
                type: WidthType.PERCENTAGE
            }
        });
    }
    
    /**
     * Generate the correct template based on provider
     */
    async generateTemplate(provider, batch) {
        switch (provider.id) {
            case "umalusi":
                return this.generateUmalusiTemplate(batch);
            case "saqa":
                return this.generateSaqaTemplate(batch);
            case "doe":
                return this.generateDoeTemplate(batch);
            default:
                throw new Error(`No template generator for provider: ${provider.id}`);
        }
    }
}

module.exports = ProviderTemplateGenerator;