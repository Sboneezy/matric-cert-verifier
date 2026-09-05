const Certificate = require("../lib/models/Certificate");

describe('Certificate', () => {
  test('should create a certificate with valid data', () => {
    const certData = {
      number: 'NSC-2023-001',
      type: 'National Senior Certificate',
      year: 2023,
      provider: 'Umalusi',
      candidateId: 'cand-001'
    };
    
    const cert = new Certificate(certData);
    
    expect(cert).toBeDefined();
    expect(cert.number).toBe('NSC-2023-001');
    expect(cert.type).toBe('National Senior Certificate');
    expect(cert.year).toBe(2023);
    expect(cert.provider).toBe('Umalusi');
  });

  test('should validate certificate number format', () => {
    const validCert = new Certificate({
      number: 'NSC-2023-001',
      type: 'National Senior Certificate',
      year: 2023
    });
    
    expect(validCert.isValid()).toBe(true);
  });

  test('should return certificate details', () => {
    const cert = new Certificate({
      number: 'NSC-2023-001',
      type: 'National Senior Certificate',
      year: 2023,
      provider: 'Umalusi'
    });
    
    const details = cert.getDetails();
    expect(details).toHaveProperty('number', 'NSC-2023-001');
    expect(details).toHaveProperty('type', 'National Senior Certificate');
    expect(details).toHaveProperty('year', 2023);
  });
});
