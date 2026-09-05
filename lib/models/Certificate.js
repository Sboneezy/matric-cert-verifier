class Certificate {
    constructor(data = {}) {
        this.id = data.id || null;

        // Certificate identification
        this.number = data.number || null;
        this.type = data.type || null;
        this.year = data.year || null;
        this.provider = data.provider || null;
        this.candidateId = data.candidateId || null;

        // File information
        this.originalFileName = data.originalFileName || "";
        this.storedFileName = data.storedFileName || "";
        this.filePath = data.filePath || "";
        this.fileType = data.fileType || "";
        this.fileSize = data.fileSize || 0;

        // Processing status
        this.uploadDate = data.uploadDate || new Date();
        this.processingStatus = "Uploaded";

        // Extraction
        this.extracted = false;
        this.extractedAt = null;

        // Errors
        this.errors = [];
    }

    isValid() {
        // Validate certificate number format (NSC-YYYY-NNN)
        const numberPattern = /^NSC-\d{4}-\d{3}$/;
        if (!this.number || !numberPattern.test(this.number)) {
            return false;
        }
        
        // Validate type
        if (!this.type || this.type !== 'National Senior Certificate') {
            return false;
        }
        
        // Validate year
        if (!this.year || typeof this.year !== 'number' || this.year < 2000 || this.year > 2050) {
            return false;
        }
        
        // Provider is optional for validation
        return true;
    }

    getDetails() {
        return {
            number: this.number,
            type: this.type,
            year: this.year,
            provider: this.provider,
            id: this.id,
            candidateId: this.candidateId,
            filePath: this.filePath,
            processingStatus: this.processingStatus,
            extracted: this.extracted,
            originalFileName: this.originalFileName
        };
    }

    markExtracted(candidateId) {
        this.processingStatus = "Extracted";
        this.extracted = true;
        this.extractedAt = new Date();
        this.candidateId = candidateId;
    }

    markFailed(error) {
        this.processingStatus = "Failed";
        this.errors.push(error);
    }

    toJSON() {
        return { ...this };
    }
}

module.exports = Certificate;
