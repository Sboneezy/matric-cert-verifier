describe("DatabaseService", () => {
    const DatabaseService = require("../lib/database/DatabaseService");
    const path = require("path");
    const fs = require("fs");
    
    let db;
    let testDbPath;
    
    beforeEach(() => {
        testDbPath = path.join(__dirname, "test-" + Date.now() + ".db");
        db = new DatabaseService(testDbPath);
    });
    
    afterEach(() => {
        db.close();
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
        if (fs.existsSync(testDbPath + "-wal")) {
            fs.unlinkSync(testDbPath + "-wal");
        }
        if (fs.existsSync(testDbPath + "-shm")) {
            fs.unlinkSync(testDbPath + "-shm");
        }
    });
    
    test("creates and retrieves a candidate", () => {
        const candidate = {
            id: "CAND-001",
            surname: "SITHEBE",
            fullNames: "SIBONELO",
            idNumber: "9302245319083",
            qualificationType: "NATIONAL SENIOR CERTIFICATE",
            qualificationYear: 2011,
            extractionConfidence: 0.85
        };
        
        db.createCandidate(candidate);
        
        const retrieved = db.getCandidate("CAND-001");
        
        expect(retrieved).toBeDefined();
        expect(retrieved.surname).toBe("SITHEBE");
        expect(retrieved.full_names).toBe("SIBONELO");
        expect(retrieved.id_number).toBe("9302245319083");
        expect(retrieved.qualification_year).toBe(2011);
    });
    
    test("creates and retrieves a document", () => {
        const document = {
            id: "DOC-001",
            originalFilename: "Qualifications-1.pdf",
            filePath: "C:\\Downloads\\Qualifications-1.pdf",
            fileType: "pdf",
            fileSize: 457311,
            classification: "pdf",
            strategy: "pdf-ocr"
        };
        
        db.createDocument(document);
        
        const retrieved = db.getDocument("DOC-001");
        
        expect(retrieved).toBeDefined();
        expect(retrieved.original_filename).toBe("Qualifications-1.pdf");
        expect(retrieved.file_type).toBe("pdf");
    });
    
    test("creates and retrieves extraction results", () => {
        // First create the related candidate and document
        db.createCandidate({
            id: "CAND-001",
            surname: "SITHEBE",
            fullNames: "SIBONELO",
            idNumber: "9302245319083"
        });
        
        db.createDocument({
            id: "DOC-001",
            originalFilename: "Qualifications-1.pdf",
            filePath: "C:\\Downloads\\Qualifications-1.pdf",
            fileType: "pdf",
            fileSize: 457311
        });
        
        const extraction = {
            id: "EXT-001",
            documentId: "DOC-001",
            candidateId: "CAND-001",
            templateId: "nsc-current",
            templateName: "National Senior Certificate (Current)",
            confidenceLevel: "high",
            requiresReview: false,
            rawText: "SIBONELO SITHEBE\nIdentity number 9302245319083",
            extractedFields: {
                idNumber: { value: "9302245319083", confidence: 0.95 }
            }
        };
        
        db.createExtraction(extraction);
        
        const retrieved = db.getExtraction("EXT-001");
        
        expect(retrieved).toBeDefined();
        expect(retrieved.template_name).toBe("National Senior Certificate (Current)");
        expect(retrieved.confidence_level).toBe("high");
        expect(retrieved.extracted_json.idNumber.value).toBe("9302245319083");
    });
    
    test("logs and retrieves audit entries", () => {
        db.logAudit("TEST", "candidate", "CAND-001", { action: "test" });
        
        const auditLog = db.getAuditLog("candidate");
        
        expect(auditLog.length).toBeGreaterThan(0);
        expect(auditLog[0].action).toBe("TEST");
        expect(auditLog[0].entity_type).toBe("candidate");
    });
    
    test("returns database statistics", () => {
        db.createCandidate({
            id: "CAND-001",
            surname: "TEST"
        });
        
        db.createDocument({
            id: "DOC-001",
            originalFilename: "test.pdf",
            fileType: "pdf"
        });
        
        const stats = db.getStats();
        
        expect(stats.candidates).toBe(1);
        expect(stats.documents).toBe(1);
    });
});