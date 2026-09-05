const { createWorker } = require("tesseract.js");
const OcrPreprocessor = require("./OcrPreprocessor");

/**
 * OCR Voting Engine
 * Runs OCR across multiple preprocessing variants and merges results.
 */
class OcrVotingEngine {
    
    constructor(options = {}) {
        this.worker = null;
        this.options = {
            languages: options.languages || "eng",
            minConfidence: options.minConfidence || 20,
            ...options
        };
    }
    
    async initialise() {
        if (!this.worker) {
            this.worker = await createWorker(this.options.languages);
        }
    }
    
    async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
    }
    
    async recognise(imagePath) {
        await this.initialise();
        
        const result = await this.worker.recognize(imagePath);
        
        return {
            text: result.data.text || "",
            confidence: result.data.confidence || 0,
            words: result.data.words || []
        };
    }
    
    async recogniseWithVariants(imagePath) {
        const { outputDir, variants } = 
            await OcrPreprocessor.generateVariants(imagePath);
        
        const results = [];
        
        console.log(`Running OCR on original...`);
        const originalResult = await this.recognise(imagePath);
        results.push({
            variant: "original",
            path: imagePath,
            ...originalResult
        });
        
        for (const variant of variants) {
            console.log(`Running OCR on: ${variant.name}...`);
            
            const result = await this.recognise(variant.path);
            
            results.push({
                variant: variant.name,
                path: variant.path,
                ...result
            });
        }
        
        const ranked = [...results].sort(
            (a, b) => b.confidence - a.confidence
        );
        
        return {
            outputDir,
            results,
            ranked,
            best: ranked[0]
        };
    }
    
    static mergeResults(results) {
        const allWords = [];
        
        for (const result of results) {
            if (!result.words || result.words.length === 0) {
                if (result.text && result.text.trim()) {
                    allWords.push({
                        text: result.text.trim(),
                        confidence: result.confidence,
                        variant: result.variant,
                        bbox: null
                    });
                }
                continue;
            }
            
            for (const word of result.words) {
                if (word.confidence >= 20) {
                    allWords.push({
                        text: word.text,
                        confidence: word.confidence,
                        variant: result.variant,
                        bbox: word.bbox || null
                    });
                }
            }
        }
        
        if (allWords.length === 0) {
            return results
                .filter(r => r.text && r.text.trim())
                .sort((a, b) => b.confidence - a.confidence)[0]?.text || "";
        }
        
        const groups = new Map();
        
        for (const word of allWords) {
            const key = word.text.toLowerCase().replace(/[^a-z0-9]/g, "");
            
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            
            groups.get(key).push(word);
        }
        
        const bestWords = [];
        
        for (const [key, words] of groups) {
            const best = words.sort(
                (a, b) => b.confidence - a.confidence
            )[0];
            
            bestWords.push(best);
        }
        
        if (bestWords.some(w => w.bbox)) {
            bestWords.sort((a, b) => {
                if (!a.bbox || !b.bbox) return 0;
                
                const yDiff = a.bbox.y0 - b.bbox.y0;
                
                if (Math.abs(yDiff) > 10) {
                    return yDiff;
                }
                
                return a.bbox.x0 - b.bbox.x0;
            });
        } else {
            bestWords.sort(
                (a, b) => b.confidence - a.confidence
            );
        }
        
        return bestWords.map(w => w.text).join(" ");
    }
}

module.exports = OcrVotingEngine;