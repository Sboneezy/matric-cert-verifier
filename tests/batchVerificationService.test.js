const BatchVerificationService = require("../lib/services/BatchVerificationService");
const BatchService = require("../lib/services/BatchService");
const { getProvider } = require("../lib/providers/ProviderRegistry");

describe('BatchVerificationService', () => {
  test('submits a batch and creates verification request', () => {
    const provider = getProvider("umalusi");
    const batchService = new BatchService();
    const batch = batchService.createBatch({
      provider,
      candidates: [
        { certificateId: 'cert-001' },
        { certificateId: 'cert-002' }
      ]
    });
    
    const service = new BatchVerificationService();
    const request = service.submitBatch(batch);
    
    expect(request).toBeDefined();
    expect(request.batch).toBe(batch);
    expect(request.provider).toBe(provider);
    expect(request.status).toBe("Submitted");
    expect(batch.status).toBe("Submitted");
  });
});
