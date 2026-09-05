const JobService = require("../lib/services/JobService");

describe('JobService', () => {
  let jobService;

  beforeEach(() => {
    jobService = new JobService();
  });

  test('should create a new job', () => {
    const jobData = {
      type: 'verification',
      data: { certificateId: 'test-123' }
    };
    
    const job = jobService.createJob(jobData);
    
    expect(job).toBeDefined();
    expect(job.id).toBeDefined();
    expect(job.type).toBe('verification');
    expect(job.status).toBe('Pending');
    expect(job.createdAt).toBeDefined();
  });

  test('should get job by id', () => {
    const jobData = {
      type: 'verification',
      data: { certificateId: 'test-456' }
    };
    
    const createdJob = jobService.createJob(jobData);
    const retrievedJob = jobService.getJob(createdJob.id);
    
    expect(retrievedJob).toEqual(createdJob);
  });

  test('should update job status', () => {
    const jobData = {
      type: 'verification',
      data: { certificateId: 'test-789' }
    };
    
    const job = jobService.createJob(jobData);
    const updated = jobService.updateJobStatus(job.id, 'Completed');
    
    expect(updated.status).toBe('Completed');
  });
});
