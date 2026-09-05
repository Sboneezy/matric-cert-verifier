const VerificationRequestService = require("../lib/services/VerificationRequestService");

describe('VerificationRequestService', () => {
  let service;

  beforeEach(() => {
    service = new VerificationRequestService();
  });

  test('should create a verification request', () => {
    const requestData = {
      certificateId: 'cert-001',
      provider: 'Umalusi',
      requester: 'test@example.com'
    };
    
    const request = service.createRequest(requestData);
    
    expect(request).toBeDefined();
    expect(request.id).toBeDefined();
    expect(request.certificateId).toBe('cert-001');
    expect(request.provider).toBe('Umalusi');
    expect(request.status).toBe('Pending');
    expect(request.createdAt).toBeDefined();
  });

  test('should get request by id', () => {
    const requestData = {
      certificateId: 'cert-002',
      provider: 'Umalusi'
    };
    
    const created = service.createRequest(requestData);
    const retrieved = service.getRequest(created.id);
    
    expect(retrieved).toEqual(created);
  });

  test('should update request status', () => {
    const requestData = {
      certificateId: 'cert-003',
      provider: 'Umalusi'
    };
    
    const request = service.createRequest(requestData);
    const updated = service.updateRequestStatus(request.id, 'Processing');
    
    expect(updated.status).toBe('Processing');
  });
});
