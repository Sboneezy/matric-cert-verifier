const fs = require("fs");
const path = require("path");

class DocumentLoader {
    load(filePath) {
        if (!filePath) {
            throw new Error("A file path is required.");
        }

        if (!fs.existsSync(filePath)) {
            throw new Error(`File does not exist: ${filePath}`);
        }

        return {
            name: path.basename(filePath),
            extension: path.extname(filePath).toLowerCase(),
            size: fs.statSync(filePath).size,
            path: filePath
        };
    }
}

module.exports = DocumentLoader;