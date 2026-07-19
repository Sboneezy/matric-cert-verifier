class Certificate {
    constructor(data = {}) {
        this.id = data.id || null;

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
        this.candidateId = null;

        // Errors
        this.errors = [];
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