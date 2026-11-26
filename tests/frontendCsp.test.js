"use strict";

const fs = require("fs");
const path = require("path");

describe("dashboard works under the strict CSP", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

    test("has no inline event handler attributes (script-src-attr is 'none')", () => {
        expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    });

    test("wires the controls with addEventListener", () => {
        for (const id of ["saveKeyBtn", "clearKeyBtn"]) {
            expect(html).toContain(`id="${id}"`);
            expect(html).toContain(`getElementById('${id}').addEventListener('click'`);
        }
    });
});