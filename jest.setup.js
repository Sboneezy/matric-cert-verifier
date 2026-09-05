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
  createWorker: jest.fn().mockResolvedValue({
    recognize: jest.fn().mockResolvedValue({
      data: {
        text: 'Mock OCR text',
        confidence: 85,
        words: []
      }
    }),
    terminate: jest.fn().mockResolvedValue()
  })
}));

// Mock Sharp
jest.mock('sharp', () => {
  return jest.fn().mockImplementation(() => {
    return {
      grayscale: jest.fn().mockReturnThis(),
      normalize: jest.fn().mockReturnThis(),
      sharpen: jest.fn().mockReturnThis(),
      linear: jest.fn().mockReturnThis(),
      threshold: jest.fn().mockReturnThis(),
      resize: jest.fn().mockReturnThis(),
      blur: jest.fn().mockReturnThis(),
      median: jest.fn().mockReturnThis(),
      png: jest.fn().mockReturnThis(),
      toFile: jest.fn().mockResolvedValue(),
      metadata: jest.fn().mockResolvedValue({
        width: 1000,
        height: 1400,
        format: 'png',
        space: 'rgb',
        channels: 3,
        hasAlpha: false
      })
    };
  });
});
