
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
        const configuredDir = options.uploadDir ||
            path.join(__dirname, "..", "..", "uploads");

        this.uploadDir = path.resolve(configuredDir);
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

        this.mimeByExtension = {
            ".pdf": "application/pdf",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".tiff": "image/tiff",
            ".tif": "image/tiff"
        };

        fs.mkdirSync(this.uploadDir, { recursive: true });
        this.uploadDir = fs.realpathSync(this.uploadDir);
    }

    /**
     * Checks whether a path is strictly inside the upload directory.
     */
    _isPathInsideUploadDir(filePath) {
        const root = this.uploadDir;
        const target = path.resolve(filePath);
        const relative = path.relative(root, target);

        return relative !== "" &&
            relative !== ".." &&
            !relative.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relative);
    }

    /**
     * Checks whether an existing file is a regular, non-symbolic-link
     * file whose resolved location remains inside the upload directory.
     */
    _isSafeExistingFile(filePath) {
        try {
            const resolved = path.resolve(filePath);

            if (!this._isPathInsideUploadDir(resolved)) {
                return false;
            }

            const stats = fs.lstatSync(resolved);

            if (stats.isSymbolicLink() || !stats.isFile()) {
                return false;
            }

            const realPath = fs.realpathSync(resolved);

            return this._isPathInsideUploadDir(realPath);
        } catch {
            return false;
        }
    }

    /**
     * Checks the actual file signature rather than trusting its
     * extension or client-supplied MIME type.
     */
    _hasValidFileSignature(filePath, mimetype) {
        let descriptor;

        try {
            descriptor = fs.openSync(filePath, "r");

            const buffer = Buffer.alloc(8);
            const bytesRead = fs.readSync(
                descriptor,
                buffer,
                0,
                buffer.length,
                0
            );

            const header = buffer.subarray(0, bytesRead);

            switch (mimetype) {
                case "application/pdf":
                    return header.length >= 5 &&
                        header.subarray(0, 5).toString() === "%PDF-";

                case "image/jpeg":
                    return header.length >= 3 &&
                        header[0] === 0xFF &&
                        header[1] === 0xD8 &&
                        header[2] === 0xFF;

                case "image/png":
                    return header.length >= 8 &&
                        header.equals(Buffer.from([
                            0x89, 0x50, 0x4E, 0x47,
                            0x0D, 0x0A, 0x1A, 0x0A
                        ]));

                case "image/tiff":
                    return header.length >= 4 && (
                        header.subarray(0, 4).equals(
                            Buffer.from([0x49, 0x49, 0x2A, 0x00])
                        ) ||
                        header.subarray(0, 4).equals(
                            Buffer.from([0x4D, 0x4D, 0x00, 0x2A])
                        ) ||
                        header.subarray(0, 4).equals(
                            Buffer.from([0x49, 0x49, 0x2B, 0x00])
                        ) ||
                        header.subarray(0, 4).equals(
                            Buffer.from([0x4D, 0x4D, 0x00, 0x2B])
                        )
                    );

                default:
                    return false;
            }
        } catch {
            return false;
        } finally {
            if (descriptor !== undefined) {
                fs.closeSync(descriptor);
            }
        }
    }

    /**
     * Validates and stores an uploaded file.
     */
    async handleUpload(file) {
        const validation = this.validateFile(file);

        if (!validation.valid) {
            throw new Error(
                `Invalid file: ${validation.errors.join(", ")}`
            );
        }

        if (!file.path || !this._isSafeSourceFile(file.path)) {
            throw new Error("Invalid or unsafe source file");
        }

        const sourceStats = fs.statSync(file.path);

        if (sourceStats.size !== file.size) {
            throw new Error("File size does not match uploaded file metadata");
        }

        if (!this._hasValidFileSignature(file.path, file.mimetype)) {
            throw new Error("File content does not match its declared type");
        }

        const originalName = path.basename(file.originalname);
        const extension = path.extname(originalName).toLowerCase();
        const secureName = this.generateSecureFilename(extension);
        const targetPath = path.join(this.uploadDir, secureName);

        if (!this._isPathInsideUploadDir(targetPath)) {
            throw new Error("Invalid file path");
        }

        if (fs.realpathSync(path.dirname(targetPath)) !== this.uploadDir) {
            throw new Error("Invalid upload directory");
        }

        fs.copyFileSync(
            file.path,
            targetPath,
            fs.constants.COPYFILE_EXCL
        );

        return {
            originalFilename: originalName,
            secureFilename: secureName,
            filePath: targetPath,
            fileSize: sourceStats.size,
            mimetype: file.mimetype,
            uploadedAt: new Date()
        };
    }

    /**
     * Checks a source file without following a symbolic link.
     */
    _isSafeSourceFile(filePath) {
        try {
            const resolved = path.resolve(filePath);
            const stats = fs.lstatSync(resolved);

            return !stats.isSymbolicLink() && stats.isFile();
        } catch {
            return false;
        }
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

        if (!Number.isFinite(file.size) || file.size < 0) {
            errors.push("Invalid file size");
        } else {
            if (file.size > this.maxSize) {
                errors.push(
                    `File size ${file.size} exceeds maximum ${this.maxSize}`
                );
            }

            if (file.size === 0) {
                errors.push("File is empty");
            }
        }

        if (!file.mimetype || !this.allowedTypes.includes(file.mimetype)) {
            errors.push(`File type ${file.mimetype || "missing"} not allowed`);
        }

        const originalName = file.originalname || "";
        const extension = path.extname(originalName).toLowerCase();

        if (!extension || !this.allowedExtensions.includes(extension)) {
            errors.push(`File extension ${extension || "missing"} not allowed`);
        } else if (this.mimeByExtension[extension] !== file.mimetype) {
            errors.push("File extension and MIME type do not match");
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
     * Deletes a file only if it is a safe file inside the upload directory.
     * Uses lstatSync to detect symbolic links, including dangling links.
     */
    deleteFile(filePath) {
        const resolved = path.resolve(filePath);

        if (!this._isPathInsideUploadDir(resolved)) {
            throw new Error("Invalid file path");
        }

        let stats;

        try {
            stats = fs.lstatSync(resolved);
        } catch (error) {
            if (error.code === "ENOENT") {
                return;
            }

            throw error;
        }

        if (stats.isSymbolicLink() || !stats.isFile()) {
            throw new Error("Invalid or unsafe file path");
        }

        if (!this._isSafeExistingFile(resolved)) {
            throw new Error("Invalid or unsafe file path");
        }

        fs.unlinkSync(resolved);
    }

    /**
     * Retrieves file information only for safe files inside the upload directory.
     */
    getFileInfo(filePath) {
        const resolved = path.resolve(filePath);

        if (!this._isSafeExistingFile(resolved)) {
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
