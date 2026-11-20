
"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

/**
 * Secure File Upload Handler
 * Validates and securely stores uploaded certificate files.
 */
class SecureFileUploadHandler {

    constructor(options = {}) {
        this.uploadDir = options.uploadDir || path.join(__dirname, "..", "..", "uploads");
        this.maxSize = options.maxSize || 10 * 1024 * 1024;

        this.allowedTypes = options.allowedTypes || [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/tiff"
        ];

        this.allowedExtensions = options.allowedExtensions || [
            ".pdf",
            ".jpg",
            ".jpeg",
            ".png",
            ".tiff",
            ".tif"
        ];

        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }
    }

    /**
     * Checks whether a file path is strictly inside the upload directory.
     * Rejects the directory itself, parent paths and similarly prefixed
     * sibling directories.
     */
    _isPathInsideUploadDir(filePath) {
        const root = path.resolve(this.uploadDir);
        const target = path.resolve(filePath);
        const relative = path.relative(root, target);

        return relative !== "" &&
            relative !== ".." &&
            !relative.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relative);
    }

    /**
     * Validates and stores an uploaded file.
     */
    async handleUpload(file) {
        const validation = this.validateFile(file);

        if (!validation.valid) {
            throw new Error(`Invalid file: ${validation.errors.join(", ")}`);
        }

        const originalName = path.basename(file.originalname);
        const extension = path.extname(originalName).toLowerCase();
        const secureName = this.generateSecureFilename(extension);
        const targetPath = path.join(this.uploadDir, secureName);

        const resolvedTarget = path.resolve(targetPath);

        if (!this._isPathInsideUploadDir(resolvedTarget)) {
            throw new Error("Invalid file path");
        }

        fs.copyFileSync(file.path, resolvedTarget);

        return {
            originalFilename: originalName,
            secureFilename: secureName,
            filePath: resolvedTarget,
            fileSize: file.size,
            mimetype: file.mimetype,
            uploadedAt: new Date()
        };
    }

    /**
     * Validates file size, MIME type and extension.
     */
    validateFile(file) {
        const errors = [];

        if (!file) {
            errors.push("No file provided");
            return { valid: false, errors };
        }

        if (file.size > this.maxSize) {
            errors.push(
                `File size ${file.size} exceeds maximum ${this.maxSize}`
            );
        }

        if (file.size === 0) {
            errors.push("File is empty");
        }

        if (file.mimetype && !this.allowedTypes.includes(file.mimetype)) {
            errors.push(`File type ${file.mimetype} not allowed`);
        }

        const originalName = file.originalname || "";
        const extension = path.extname(originalName).toLowerCase();

        if (extension && !this.allowedExtensions.includes(extension)) {
            errors.push(`File extension ${extension} not allowed`);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Generates a unique, unpredictable filename.
     */
    generateSecureFilename(extension) {
        const timestamp = Date.now();
        const random = crypto.randomBytes(16).toString("hex");

        return `${timestamp}-${random}${extension}`;
    }

    /**
     * Deletes a file only if it is inside the upload directory.
     */
    deleteFile(filePath) {
        const resolved = path.resolve(filePath);

        if (!this._isPathInsideUploadDir(resolved)) {
            throw new Error("Invalid file path");
        }

        if (fs.existsSync(resolved)) {
            fs.unlinkSync(resolved);
        }
    }

    /**
     * Retrieves file information only for files inside the upload directory.
     */
    getFileInfo(filePath) {
        const resolved = path.resolve(filePath);

        if (!this._isPathInsideUploadDir(resolved)) {
            return null;
        }

        if (!fs.existsSync(resolved)) {
            return null;
        }

        const stats = fs.statSync(resolved);

        return {
            filePath: resolved,
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime
        };
    }
}

module.exports = SecureFileUploadHandler;
