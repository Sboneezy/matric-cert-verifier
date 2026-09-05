const { createWorker } = require("tesseract.js");
const OcrPreprocessor = require("./OcrPreprocessor");

/**
 * OCR Voting Engine
 * 
 * Runs OCR across multiple preprocessing variants and merges results.
 * The insight is that different preprocessing strategies reveal
 * different parts of the document:
 * 
 * - High contrast may reveal faint text
 * - Threshold may isolate clean text from stamps
 * - Upscaling may reveal small text
 * - Denoising may remove background interference
 * 
 * By comparing confidence scores and text patterns across variants,
 * we can build a more complete and reliable extraction.
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
        // Generate preprocessing variants
        const { outputDir, variants } = 
            await OcrPreprocessor.generateVariants(imagePath);
        
        const results = [];
        
        // Run OCR on original
        console.log(Running OCR on original...);
        const originalResult = await this.recognise(imagePath);
        results.push({
            variant: "original",
            path: imagePath,
            ...originalResult
        });
        
        // Run OCR on each variant
        for (const variant of variants) {
            console.log(Running OCR on: ...);
            
            const result = await this.recognise(variant.path);
            
            results.push({
                variant: variant.name,
                path: variant.path,
                ...result
            });
        }
        
        // Sort by confidence
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
    
    /**
     * Merge OCR text from multiple variants using word-level voting.
     * 
     * The approach:
     * 1. Extract words with positions from each variant
     * 2. Group words by spatial proximity
     * 3. For each group, pick the word with highest confidence
     * 4. Reconstruct text in reading order
     */
    static mergeResults(results) {
        // Extract all words with confidence
        const allWords = [];
        
        for (const result of results) {
            if (!result.words || result.words.length === 0) {
                // If no word-level data, fall back to text
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
        
        // If no words, return best text
        if (allWords.length === 0) {
            return results
                .filter(r => r.text && r.text.trim())
                .sort((a, b) => b.confidence - a.confidence)[0]?.text || "";
        }
        
        // Group by text similarity (normalised)
        const groups = new Map();
        
        for (const word of allWords) {
            const key = word.text.toLowerCase().replace(/[^a-z0-9]/g, "");
            
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            
            groups.get(key).push(word);
        }
        
        // Pick highest confidence representative from each group
        const bestWords = [];
        
        for (const [key, words] of groups) {
            const best = words.sort(
                (a, b) => b.confidence - a.confidence
            )[0];
            
            bestWords.push(best);
        }
        
        // If we have bbox data, sort by position
        // Otherwise, preserve confidence order
        if (bestWords.some(w => w.bbox)) {
            bestWords.sort((a, b) => {
                if (!a.bbox || !b.bbox) return 0;
                
                // Sort by Y (top to bottom), then X (left to right)
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
        
        // Reconstruct text
        return bestWords.map(w => w.text).join(" ");
    }
}

module.exports = OcrVotingEngine;
