/**
 * Region-Based Extraction Engine
 * 
 * Uses word bounding boxes from Tesseract OCR to identify fields
 * based on their spatial position on the certificate.
 * 
 * This is critical for real certificates where:
 * - Text may be positioned differently across certificate versions
 * - Stamps and decorative elements interfere with text extraction
 * - Fields are identified by position rather than labels
 * 
 * The approach:
 * 1. Extract words with bounding boxes from OCR
 * 2. Group words into spatial regions
 * 3. Match regions to known field positions from templates
 * 4. Extract field values from matched regions
 */
class RegionBasedExtractionEngine {
    
    constructor() {
        this.regions = [];
    }
    
    /**
     * Extract word-level data with positions from OCR result
     */
    extractWordsWithPositions(ocrResult) {
        const words = [];
        
        if (!ocrResult || !ocrResult.results) {
            return words;
        }
        
        // Combine words from all OCR variants
        for (const result of ocrResult.results) {
            if (!result.words || result.words.length === 0) {
                continue;
            }
            
            for (const word of result.words) {
                if (word.confidence < 20) {
                    continue;
                }
                
                words.push({
                    text: word.text,
                    confidence: word.confidence,
                    bbox: word.bbox,
                    variant: result.variant,
                    // Normalise bbox to ratios for template matching
                    ratio: word.bbox ? {
                        x: word.bbox.x0,
                        y: word.bbox.y0,
                        width: word.bbox.x1 - word.bbox.x0,
                        height: word.bbox.y1 - word.bbox.y0
                    } : null
                });
            }
        }
        
        return words;
    }
    
    /**
     * Group words into spatial regions using clustering
     */
    groupWordsIntoRegions(words, options = {}) {
        const gapThreshold = options.gapThreshold || 50; // pixels
        const regions = [];
        
        // Sort by Y position (top to bottom)
        const sortedWords = [...words].sort((a, b) => {
            if (!a.bbox || !b.bbox) return 0;
            return a.bbox.y0 - b.bbox.y0;
        });
        
        let currentRegion = null;
        
        for (const word of sortedWords) {
            if (!word.bbox) continue;
            
            if (!currentRegion) {
                // Start a new region
                currentRegion = {
                    words: [word],
                    bbox: { ...word.bbox }
                };
            } else {
                // Check if word belongs to current region
                const yGap = Math.abs(word.bbox.y0 - currentRegion.bbox.y0);
                const xOverlap = this.calculateXOverlap(word.bbox, currentRegion.bbox);
                
                if (yGap < gapThreshold && xOverlap > 0.3) {
                    // Same region
                    currentRegion.words.push(word);
                    currentRegion.bbox = this.expandBbox(currentRegion.bbox, word.bbox);
                } else {
                    // New region
                    regions.push(currentRegion);
                    currentRegion = {
                        words: [word],
                        bbox: { ...word.bbox }
                    };
                }
            }
        }
        
        if (currentRegion) {
            regions.push(currentRegion);
        }
        
        // Sort regions by Y position
        return regions.sort((a, b) => a.bbox.y0 - b.bbox.y0);
    }
    
    calculateXOverlap(bbox1, bbox2) {
        const x1Start = Math.max(bbox1.x0, bbox2.x0);
        const x1End = Math.min(bbox1.x1, bbox2.x1);
        const overlap = Math.max(0, x1End - x1Start);
        
        const width1 = bbox1.x1 - bbox1.x0;
        const width2 = bbox2.x1 - bbox2.x0;
        const minWidth = Math.min(width1, width2);
        
        return minWidth > 0 ? overlap / minWidth : 0;
    }
    
    expandBbox(bbox1, bbox2) {
        return {
            x0: Math.min(bbox1.x0, bbox2.x0),
            y0: Math.min(bbox1.y0, bbox2.y0),
            x1: Math.max(bbox1.x1, bbox2.x1),
            y1: Math.max(bbox1.y1, bbox2.y1)
        };
    }
    
    /**
     * Extract text from a specific region
     */
    extractTextFromRegion(words, bbox) {
        const regionWords = words.filter(word => {
            if (!word.bbox) return false;
            
            return (
                word.bbox.x0 >= bbox.x0 &&
                word.bbox.x1 <= bbox.x1 &&
                word.bbox.y0 >= bbox.y0 &&
                word.bbox.y1 <= bbox.y1
            );
        });
        
        // Sort by reading order (Y then X)
        regionWords.sort((a, b) => {
            const yDiff = a.bbox.y0 - b.bbox.y0;
            if (Math.abs(yDiff) > 10) return yDiff;
            return a.bbox.x0 - b.bbox.x0;
        });
        
        return regionWords.map(w => w.text).join(" ");
    }
    
    /**
     * Match regions to template fields using position
     */
    matchRegionsToTemplate(regions, template, imageWidth, imageHeight) {
        const matches = [];
        
        for (const [fieldName, fieldDef] of Object.entries(template.fields)) {
            if (!fieldDef.position) continue;
            
            const expectedPos = {
                x0: fieldDef.position.x * imageWidth,
                y0: fieldDef.position.y * imageHeight,
                x1: (fieldDef.position.x + fieldDef.position.width) * imageWidth,
                y1: (fieldDef.position.y + fieldDef.position.height) * imageHeight
            };
            
            // Find the region closest to the expected position
            let bestRegion = null;
            let bestDistance = Infinity;
            
            for (const region of regions) {
                const distance = this.calculateDistance(region.bbox, expectedPos);
                
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestRegion = region;
                }
            }
            
            if (bestRegion) {
                const text = bestRegion.words
                    .sort((a, b) => a.bbox.x0 - b.bbox.x0)
                    .map(w => w.text)
                    .join(" ");
                
                matches.push({
                    field: fieldName,
                    text,
                    region: bestRegion.bbox,
                    expectedPosition: expectedPos,
                    distance: bestDistance,
                    confidence: this.calculateConfidence(bestDistance, template)
                });
            }
        }
        
        return matches;
    }
    
    calculateDistance(bbox1, bbox2) {
        // Calculate centre distance
        const centre1 = {
            x: (bbox1.x0 + bbox1.x1) / 2,
            y: (bbox1.y0 + bbox1.y1) / 2
        };
        
        const centre2 = {
            x: (bbox2.x0 + bbox2.x1) / 2,
            y: (bbox2.y0 + bbox2.y1) / 2
        };
        
        return Math.sqrt(
            Math.pow(centre1.x - centre2.x, 2) +
            Math.pow(centre1.y - centre2.y, 2)
        );
    }
    
    calculateConfidence(distance, template) {
        // Convert distance to confidence (closer = higher confidence)
        const maxDistance = 500; // pixels
        const confidence = Math.max(0, 1 - (distance / maxDistance));
        
        return confidence;
    }
}

module.exports = RegionBasedExtractionEngine;