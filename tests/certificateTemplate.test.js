describe("Certificate Template System", () => {
    const { 
        CertificateTemplate, 
        CertificateTemplateRegistry 
    } = require("../lib/ocr/CertificateTemplateSystem");
    
    test("creates a certificate template", () => {
        const template = new CertificateTemplate({
            id: "test-template",
            name: "Test Template",
            era: "2008+",
            provider: "umalusi",
            version: "1.0",
            identifiers: ["TEST CERTIFICATE"],
            fields: {
                idNumber: {
                    position: { x: 0.25, y: 0.42, width: 0.3, height: 0.05 },
                    pattern: /\b\d{13}\b/,
                    description: "Test ID number"
                }
            }
        });
        
        expect(template.id).toBe("test-template");
        expect(template.era).toBe("2008+");
        expect(template.identifiers).toContain("TEST CERTIFICATE");
    });
    
    test("registry contains default templates", () => {
        const registry = new CertificateTemplateRegistry();
        const templates = registry.getAllTemplates();
        
        expect(templates.length).toBeGreaterThan(3);
        expect(templates.find(t => t.id === "nsc-current")).toBeDefined();
        expect(templates.find(t => t.id === "pre-1992")).toBeDefined();
        expect(templates.find(t => t.id === "statement-of-results")).toBeDefined();
    });
    
    test("matches templates by text", () => {
        const registry = new CertificateTemplateRegistry();
        
        const nscText = "REPLACEMENT NATIONAL SENIOR CERTIFICATE";
        const matches = registry.findMatchingTemplates(nscText);
        
        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].id).toBe("nsc-current");
    });
    
    test("calculates expected positions", () => {
        const template = new CertificateTemplate({
            id: "test",
            name: "Test",
            era: "2008+",
            provider: "umalusi",
            version: "1.0",
            identifiers: [],
            fields: {
                surname: {
                    position: { x: 0.3, y: 0.35, width: 0.4, height: 0.05 }
                }
            }
        });
        
        const position = template.getExpectedPosition("surname", 2000, 3000);
        
        expect(position.x).toBe(600);
        expect(position.y).toBe(1050);
        expect(position.width).toBe(800);
        expect(position.height).toBe(150);
    });
});
