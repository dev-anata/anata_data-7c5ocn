import { jest, describe, beforeEach, afterEach, it, expect } from '@jest/globals'; // v29.0.0
import { Firestore } from '@google-cloud/firestore'; // v6.5.0
import { FirestoreClientImpl } from '../../src/core/database/firestore.client';
import { FirestoreConfig } from '../../src/core/interfaces/database.interface';
import { NotFoundError } from '../../src/core/utils/error.util';

// Mock Firestore
jest.mock('@google-cloud/firestore');

describe('FirestoreClientImpl', () => {
  let firestoreClient: FirestoreClientImpl;
  let mockFirestore: jest.Mocked<Firestore>;
  let mockCollection: jest.Mock;
  let mockDoc: jest.Mock;
  let mockGet: jest.Mock;
  let mockSet: jest.Mock;
  let mockDelete: jest.Mock;
  let mockWhere: jest.Mock;
  let mockLimit: jest.Mock;

  const mockConfig: FirestoreConfig = {
    projectId: 'test-project',
    collectionName: 'test-collection'
  };

  const mockDocument = {
    id: 'test-doc-id',
    data: {
      field: 'value',
      updatedAt: new Date()
    }
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock implementations
    mockGet = jest.fn();
    mockSet = jest.fn();
    mockDelete = jest.fn();
    mockWhere = jest.fn();
    mockLimit = jest.fn();
    mockDoc = jest.fn().mockReturnValue({
      get: mockGet,
      set: mockSet,
      delete: mockDelete
    });
    mockCollection = jest.fn().mockReturnValue({
      doc: mockDoc,
      where: mockWhere,
      limit: mockLimit,
      get: mockGet
    });

    // Setup Firestore mock
    mockFirestore = {
      collection: mockCollection,
      terminate: jest.fn(),
      projectId: mockConfig.projectId
    } as unknown as jest.Mocked<Firestore>;

    (Firestore as jest.MockedClass<typeof Firestore>).mockImplementation(() => mockFirestore);

    // Create client instance
    firestoreClient = new FirestoreClientImpl(mockConfig);
  });

  afterEach(async () => {
    // Cleanup
    if (firestoreClient.isConnected()) {
      await firestoreClient.disconnect();
    }
  });

  describe('connect', () => {
    it('should successfully connect to Firestore', async () => {
      // Setup
      mockLimit.mockReturnValue({ get: jest.fn().mockResolvedValue([]) });

      // Execute
      await firestoreClient.connect();

      // Verify
      expect(firestoreClient.isConnected()).toBe(true);
      expect(mockCollection).toHaveBeenCalledWith(mockConfig.collectionName);
      expect(mockLimit).toHaveBeenCalledWith(1);
    });

    it('should throw error on connection failure', async () => {
      // Setup
      mockLimit.mockReturnValue({ 
        get: jest.fn().mockRejectedValue(new Error('Connection failed'))
      });

      // Execute & Verify
      await expect(firestoreClient.connect()).rejects.toThrow('Failed to connect to Firestore after multiple attempts');
    });

    it('should not reconnect if already connected', async () => {
      // Setup
      mockLimit.mockReturnValue({ get: jest.fn().mockResolvedValue([]) });
      await firestoreClient.connect();
      const initialCallCount = mockCollection.mock.calls.length;

      // Execute
      await firestoreClient.connect();

      // Verify
      expect(mockCollection.mock.calls.length).toBe(initialCallCount);
    });
  });

  describe('disconnect', () => {
    it('should successfully disconnect from Firestore', async () => {
      // Setup
      mockLimit.mockReturnValue({ get: jest.fn().mockResolvedValue([]) });
      await firestoreClient.connect();

      // Execute
      await firestoreClient.disconnect();

      // Verify
      expect(firestoreClient.isConnected()).toBe(false);
      expect(mockFirestore.terminate).toHaveBeenCalled();
    });

    it('should handle disconnect errors gracefully', async () => {
      // Setup
      mockLimit.mockReturnValue({ get: jest.fn().mockResolvedValue([]) });
      await firestoreClient.connect();
      mockFirestore.terminate.mockRejectedValue(new Error('Disconnect failed'));

      // Execute & Verify
      await expect(firestoreClient.disconnect()).rejects.toThrow('Disconnect failed');
    });
  });

  describe('get', () => {
    beforeEach(async () => {
      mockLimit.mockReturnValue({ get: jest.fn().mockResolvedValue([]) });
      await firestoreClient.connect();
    });

    it('should successfully retrieve document by ID', async () => {
      // Setup
      mockGet.mockResolvedValue({
        exists: true,
        data: () => mockDocument.data
      });

      // Execute
      const result = await firestoreClient.get(mockDocument.id);

      // Verify
      expect(result).toEqual(mockDocument.data);
      expect(mockCollection).toHaveBeenCalledWith(mockConfig.collectionName);
      expect(mockDoc).toHaveBeenCalledWith(mockDocument.id);
    });

    it('should throw NotFoundError for non-existent document', async () => {
      // Setup
      mockGet.mockResolvedValue({ exists: false });

      // Execute & Verify
      await expect(firestoreClient.get(mockDocument.id))
        .rejects
        .toThrow(NotFoundError);
    });

    it('should throw error when not connected', async () => {
      // Setup
      await firestoreClient.disconnect();

      // Execute & Verify
      await expect(firestoreClient.get(mockDocument.id))
        .rejects
        .toThrow('Not connected to Firestore');
    });
  });

  describe('set', () => {
    beforeEach(async () => {
      mockLimit.mockReturnValue({ get: jest.fn().mockResolvedValue([]) });
      await firestoreClient.connect();
    });

    it('should successfully set document data', async () => {
      // Setup
      mockSet.mockResolvedValue(undefined);

      // Execute
      await firestoreClient.set(mockDocument.id, mockDocument.data);

      // Verify
      expect(mockCollection).toHaveBeenCalledWith(mockConfig.collectionName);
      expect(mockDoc).toHaveBeenCalledWith(mockDocument.id);
      expect(mockSet).toHaveBeenCalled();
    });

    it('should throw error for invalid document data', async () => {
      // Execute & Verify
      await expect(firestoreClient.set(mockDocument.id, null))
        .rejects
        .toThrow('Invalid document data');
    });

    it('should throw error for invalid document ID', async () => {
      // Execute & Verify
      await expect(firestoreClient.set('', mockDocument.data))
        .rejects
        .toThrow('Invalid document ID');
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      mockLimit.mockReturnValue({ get: jest.fn().mockResolvedValue([]) });
      await firestoreClient.connect();
    });

    it('should successfully delete document', async () => {
      // Setup
      mockDelete.mockResolvedValue(undefined);

      // Execute
      await firestoreClient.delete(mockDocument.id);

      // Verify
      expect(mockCollection).toHaveBeenCalledWith(mockConfig.collectionName);
      expect(mockDoc).toHaveBeenCalledWith(mockDocument.id);
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should throw error for invalid document ID', async () => {
      // Execute & Verify
      await expect(firestoreClient.delete(''))
        .rejects
        .toThrow('Invalid document ID');
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      mockLimit.mockReturnValue({ get: jest.fn().mockResolvedValue([]) });
      await firestoreClient.connect();
    });

    it('should successfully query documents with filter', async () => {
      // Setup
      const mockFilter = { field: 'value' };
      const mockQuerySnapshot = {
        docs: [{
          id: mockDocument.id,
          data: () => mockDocument.data
        }]
      };
      mockWhere.mockReturnValue({ get: jest.fn().mockResolvedValue(mockQuerySnapshot) });

      // Execute
      const results = await firestoreClient.query(mockFilter);

      // Verify
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ id: mockDocument.id, ...mockDocument.data });
      expect(mockWhere).toHaveBeenCalledWith('field', '==', 'value');
    });

    it('should throw error for invalid filter', async () => {
      // Execute & Verify
      await expect(firestoreClient.query(null as any))
        .rejects
        .toThrow('Invalid query filter');
    });

    it('should return empty array when no documents match filter', async () => {
      // Setup
      const mockFilter = { field: 'nonexistent' };
      mockWhere.mockReturnValue({ get: jest.fn().mockResolvedValue({ docs: [] }) });

      // Execute
      const results = await firestoreClient.query(mockFilter);

      // Verify
      expect(results).toEqual([]);
    });
  });
});