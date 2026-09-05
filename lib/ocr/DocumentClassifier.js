const fs = require("fs");
const path = require("path");

/**
 * Document Classifier
 * Determines what kind of document we're dealing with.
 */
class DocumentClassifier {
    
    static classify(filePath, options = {}) {
        const extension = path.extname(filePath).toLowerCase();
        
        // Allow classification without file existence check
        let size = null;
        
        if (options.validate && (!filePath || !fs.existsSync(filePath))) {
            throw new Error(`File not found: ${filePath}`);
        }
        
        if (fs.existsSync(filePath)) {
            size = fs.statSync(filePath).size;
        }
        
        const result = {
            path: filePath,
            extension,
            size,
            type: this.detectType(extension),
            requiresOcr: false,
            strategy: null
        };
        
        switch (result.type) {
            case "pdf":
                result.requiresOcr = true;
                result.strategy = "pdf-ocr";
                break;
                
            case "image":
                result.requiresOcr = true;
                result.strategy = "image-ocr";
                break;
                
            case "text":
                result.requiresOcr = false;
                result.strategy = "text-extraction";
                break;
                
            default:
                result.requiresOcr = false;
                result.strategy = "unsupported";
        }
        
        return result;
    }
    
    static detectType(extension) {
        switch (extension) {
            case ".pdf":
                return "pdf";
            case ".jpg":
            case ".jpeg":
            case ".png":
            case ".tiff":
            case ".tif":
            case ".bmp":
                return "image";
            case ".txt":
            case ".text":
                return "text";
            default:
                return "unknown";
        }
    }
    
    static async detectPdfType(pdfPath) {
        const buffer = fs.readFileSync(pdfPath);
        const pdfString = buffer.toString("latin1");
        
        const hasTextOperators = 
            /BT[\s\S]*?ET/.test(pdfString) ||
            /\bTj\b/.test(pdfString) ||
            /\bTJ\b/.test(pdfString);
        
        const hasFonts = 
            /FontFile/i.test(pdfString) ||
            /Type0/i.test(pdfString) ||
            /TrueType/i.test(pdfString);
        
        return {
            isImageOnly: !hasTextOperators,
            hasEmbeddedFonts: hasFonts,
            likelyScanned: !hasTextOperators && !hasFonts
        };
    }
}

module.exports = DocumentClassifier;