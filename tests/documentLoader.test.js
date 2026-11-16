"use strict";

const fs   = require("fs");
const path = require("path");
const DocumentLoader = require("../lib/intake/DocumentLoader");

describe("DocumentLoader", () => {

    const loader = new DocumentLoader();
    const tmpPath = path.join(__dirname, "tmp-loader-test.pdf");

    beforeAll(() => {
        fs.writeFileSync(tmpPath, "Fake PDF Content");
    });

    afterAll(() => {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    });

    test("loads a file and returns metadata", () => {
        const doc = loader.load(tmpPath);

        expect(doc).toBeDefined();
        expect(doc.name).toBe("tmp-loader-test.pdf");
        expect(doc.extension).toBe(".pdf");
        expect(doc.size).toBeGreaterThan(0);
        expect(doc.path).toBe(tmpPath);
    });

    test("throws when no path is provided", () => {
        expect(() => loader.load(null)).toThrow();
        expect(() => loader.load("")).toThrow();
    });

    test("throws when the file does not exist", () => {
        expect(() => loader.load("/nonexistent/path/file.pdf")).toThrow();
    });
});
