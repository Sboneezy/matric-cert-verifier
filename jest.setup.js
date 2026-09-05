// Increase timeout for async tests
jest.setTimeout(30000);

// Mock pdf-parse to avoid ESM dynamic import issues in Jest
jest.mock('pdf-parse', () => {
  return {
    PDFParse: jest.fn().mockImplementation(() => {
      return {
        getText: jest.fn().mockResolvedValue({
          text: [
            "SURNAME: NKOSI",
            "FULL NAMES: JOHN PETER",
            "ID NUMBER: 9201015009087",
            "QUALIFICATION: NATIONAL SENIOR CERTIFICATE",
            "YEAR: 2018",
            "CERTIFICATE NUMBER: ABC123456"
          ].join("\n"),
          numPages: 1
        })
      };
    })
  };
});

// Mock Tesseract.js
jest.mock('tesseract.js', () => ({
  recognize: jest.fn().mockResolvedValue({
    data: {
      text: 'Mock OCR text',
      words: [{ text: 'Mock', confidence: 95 }]
    }
  })
}));