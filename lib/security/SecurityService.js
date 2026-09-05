const crypto = require("crypto");
const bcrypt = require("bcryptjs");

/**
 * Security Service
 * Handles authentication, encryption, and secure data handling.
 */
class SecurityService {
    
    constructor(options = {}) {
        this.saltRounds = options.saltRounds || 12;
        this.encryptionKey = options.encryptionKey || process.env.ENCRYPTION_KEY;
        this.encryptionAlgorithm = "aes-256-gcm";
    }
    
    async hashPassword(password) {
        return bcrypt.hash(password, this.saltRounds);
    }
    
    async verifyPassword(password, hash) {
        return bcrypt.compare(password, hash);
    }
    
    encryptData(plaintext) {
        if (!this.encryptionKey) {
            throw new Error("Encryption key is required. Set ENCRYPTION_KEY environment variable.");
        }
        
        const iv = crypto.randomBytes(16);
        const key = crypto.createHash("sha256").update(this.encryptionKey).digest();
        const cipher = crypto.createCipheriv(this.encryptionAlgorithm, key, iv);
        
        let encrypted = cipher.update(plaintext, "utf8", "hex");
        encrypted += cipher.final("hex");
        
        const authTag = cipher.getAuthTag().toString("hex");
        
        return {
            iv: iv.toString("hex"),
            authTag,
            encrypted,
            algorithm: this.encryptionAlgorithm
        };
    }
    
    decryptData(encryptedData) {
        if (!this.encryptionKey) {
            throw new Error("Encryption key is required.");
        }
        
        const key = crypto.createHash("sha256").update(this.encryptionKey).digest();
        const decipher = crypto.createDecipheriv(
            this.encryptionAlgorithm,
            key,
            Buffer.from(encryptedData.iv, "hex")
        );
        
        decipher.setAuthTag(Buffer.from(encryptedData.authTag, "hex"));
        
        let decrypted = decipher.update(encryptedData.encrypted, "hex", "utf8");
        decrypted += decipher.final("utf8");
        
        return decrypted;
    }
    
    maskIdNumber(idNumber) {
        if (!idNumber || idNumber.length < 7) {
            return idNumber;
        }
        
        const first3 = idNumber.substring(0, 3);
        const last3 = idNumber.substring(idNumber.length - 3);
        const maskLength = idNumber.length - 6;
        
        return first3 + "*".repeat(maskLength) + last3;
    }
    
    maskName(name) {
        if (!name || name.length < 3) {
            return name;
        }
        
        return name.charAt(0) + "*".repeat(name.length - 2) + name.charAt(name.length - 1);
    }
    
    generateToken(length = 32) {
        return crypto.randomBytes(length).toString("hex");
    }
    
    generateApiKey() {
        return "mk_" + crypto.randomBytes(32).toString("hex");
    }
    
    validateFile(fileInfo, options = {}) {
        const errors = [];
        const warnings = [];
        
        const maxSize = options.maxSize || 10 * 1024 * 1024;
        const allowedTypes = options.allowedTypes || [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/tiff"
        ];
        
        if (fileInfo.size > maxSize) {
            errors.push(`File size ${fileInfo.size} exceeds maximum ${maxSize} bytes`);
        }
        
        if (!allowedTypes.includes(fileInfo.mimetype)) {
            errors.push(`File type ${fileInfo.mimetype} is not allowed`);
        }
        
        const extension = (fileInfo.originalname || "").toLowerCase();
        if (extension) {
            const ext = extension.substring(extension.lastIndexOf("."));
            const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif"];
            
            if (!allowedExtensions.includes(ext)) {
                errors.push(`File extension ${ext} is not allowed`);
            }
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    
    createAuditEntry(action, user, details = {}) {
        return {
            timestamp: new Date().toISOString(),
            action,
            user: user || "system",
            ip: details.ip || null,
            details: details
        };
    }
}

module.exports = SecurityService;