describe("BatchService", () => {
    const BatchService = require("../lib/services/BatchService");
    const { getProvider } = require("../lib/providers/ProviderRegistry");

    test("should create a new batch", () => {
        const service = new BatchService();
        const provider = getProvider("umalusi");
        
        const batch = service.createBatch({
            name: 'Test Batch',
            provider: provider,
            items: [
                { certificateId: 'cert-001' },
                { certificateId: 'cert-002' },
                { certificateId: 'cert-003' }
            ]
        });
        
        expect(batch).toBeDefined();
        expect(batch.name).toBe('Test Batch');
        expect(batch.items).toHaveLength(3);
        expect(batch.status).toBe('Draft');
        expect(batch.createdAt).toBeDefined();
    });

    test("should add item to batch", () => {
        const service = new BatchService();
        const batch = service.createBatch({
            name: 'Test Batch',
            provider: getProvider("umalusi"),
            items: []
        });
        
        const updatedBatch = service.addItem(batch.id, { certificateId: 'cert-004' });
        
        expect(updatedBatch.items).toHaveLength(1);
        expect(updatedBatch.items[0].certificateId).toBe('cert-004');
    });

    test("should get batch by id", () => {
        const service = new BatchService();
        const batch = service.createBatch({
            name: 'Test Batch',
            provider: getProvider("umalusi")
        });
        
        const foundBatch = service.getBatch(batch.id);
        
        expect(foundBatch).toBe(batch);
    });
});