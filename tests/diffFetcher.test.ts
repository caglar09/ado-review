import { DiffFetcher } from '../src/core/diffFetcher';
import { ADOClient } from '../src/core/adoClient';
import { GitManager } from '../src/core/gitManager';
import { Logger } from '../src/core/logger';
import { ErrorHandler } from '../src/core/errorHandler';

// Mock dependencies
jest.mock('../src/core/adoClient');
jest.mock('../src/core/gitManager');
jest.mock('../src/core/logger');
jest.mock('../src/core/errorHandler');

describe('DiffFetcher', () => {
  let diffFetcher: DiffFetcher;
  let mockAdoClient: jest.Mocked<ADOClient>;
  let mockGitManager: jest.Mocked<GitManager>;
  let mockLogger: jest.Mocked<Logger>;
  let mockErrorHandler: jest.Mocked<ErrorHandler>;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      logDiff: jest.fn()
    } as any;
    mockErrorHandler = {
      createInternalError: jest.fn(),
      createUserError: jest.fn(),
      normalizeError: jest.fn().mockImplementation((error) => {
        return {
          message: error instanceof Error ? error.message : String(error),
          code: 5,
          context: undefined
        };
      })
    } as any;
    
    mockAdoClient = {
      getPullRequestFinalDiff: jest.fn(),
      getPullRequestIterations: jest.fn(),
      getIterationChanges: jest.fn()
    } as any;
    
    mockGitManager = {
      getDiff: jest.fn()
    } as any;

    diffFetcher = new DiffFetcher(mockAdoClient, mockGitManager, mockLogger, mockErrorHandler);
  });

  describe('fetchPullRequestDiff', () => {
    it('should use git diff when hunks are not available and working directory is provided', async () => {
      const pullRequestId = 123;
      const workingDirectory = '/test/workspace';
      const mockIteration = {
        id: 1,
        description: 'Test iteration',
        author: { displayName: 'Test User' },
        createdDate: '2024-01-01T00:00:00Z',
        updatedDate: '2024-01-01T00:00:00Z',
        sourceRefCommit: { commitId: 'source123' },
        targetRefCommit: { commitId: 'target456' }
      };
      const mockFinalDiff = {
        changes: [
          {
            item: {
              path: '/test/file.ts',
              isFolder: false
            },
            changeType: 'edit'
            // No hunks property - this should trigger git diff fallback
          }
        ]
      };
      const mockGitDiff = `@@ -1,3 +1,3 @@
 function test() {
-  return 'old';
+  return 'new';
 }`;

      mockAdoClient.getPullRequestFinalDiff.mockResolvedValue(mockFinalDiff);
      mockAdoClient.getPullRequestIterations.mockResolvedValue([mockIteration]);
      mockAdoClient.getIterationChanges.mockResolvedValue(mockFinalDiff.changes);
      mockGitManager.getDiff.mockResolvedValue(mockGitDiff);

      const result = await diffFetcher.fetchPullRequestDiff(pullRequestId, workingDirectory);

      // Verify git diff was called with correct parameters
      expect(mockGitManager.getDiff).toHaveBeenCalledWith(
        workingDirectory,
        'target456', // target commit
        'source123', // source commit
        'test/file.ts' // file path
      );

      // Verify the result contains the git diff content
      expect(result.files).toHaveLength(1);
      expect(result.files[0]?.filePath).toBe('/test/file.ts');
      expect(result.files[0]?.hunks).toHaveLength(1);
      expect(result.files[0]?.hunks[0]?.content).toContain('return \'new\';');
    });

    it('should fallback to basic diff when git diff fails', async () => {
      const pullRequestId = 123;
      const workingDirectory = '/test/workspace';
      const mockIteration = {
        id: 1,
        description: 'Test iteration',
        author: { displayName: 'Test User' },
        createdDate: '2024-01-01T00:00:00Z',
        updatedDate: '2024-01-01T00:00:00Z',
        sourceRefCommit: { commitId: 'source123' },
        targetRefCommit: { commitId: 'target456' }
      };
      const mockFinalDiff = {
        changes: [
          {
            item: {
              path: '/test/file.ts',
              isFolder: false
            },
            changeType: 'edit'
            // No hunks property
          }
        ]
      };

      mockAdoClient.getPullRequestFinalDiff.mockResolvedValue(mockFinalDiff);
      mockAdoClient.getPullRequestIterations.mockResolvedValue([mockIteration]);
      mockAdoClient.getIterationChanges.mockResolvedValue(mockFinalDiff.changes);
      mockGitManager.getDiff.mockRejectedValue(new Error('Git command failed'));

      const result = await diffFetcher.fetchPullRequestDiff(pullRequestId, workingDirectory);

      // Verify git diff was attempted
      expect(mockGitManager.getDiff).toHaveBeenCalled();
      
      // Verify warning was logged about git failure
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get git diff for /test/file.ts')
      );

      // Should still return a result with basic diff
      expect(result.files).toHaveLength(1);
      expect(result.files[0]?.filePath).toBe('/test/file.ts');
    });

    it('should use basic diff when no working directory is provided', async () => {
      const pullRequestId = 123;
      const mockIteration = {
        id: 1,
        description: 'Test iteration',
        author: { displayName: 'Test User' },
        createdDate: '2024-01-01T00:00:00Z',
        updatedDate: '2024-01-01T00:00:00Z',
        sourceRefCommit: { commitId: 'source123' },
        targetRefCommit: { commitId: 'target456' }
      };
      const mockFinalDiff = {
        changes: [
          {
            item: {
              path: '/test/file.ts',
              isFolder: false
            },
            changeType: 'edit'
            // No hunks property
          }
        ]
      };

      mockAdoClient.getPullRequestFinalDiff.mockResolvedValue(mockFinalDiff);
      mockAdoClient.getPullRequestIterations.mockResolvedValue([mockIteration]);
      mockAdoClient.getIterationChanges.mockResolvedValue(mockFinalDiff.changes);

      const result = await diffFetcher.fetchPullRequestDiff(pullRequestId); // No working directory

      // Verify git diff was NOT called
      expect(mockGitManager.getDiff).not.toHaveBeenCalled();

      // Should still return a result with basic diff
      expect(result.files).toHaveLength(1);
      expect(result.files[0]?.filePath).toBe('/test/file.ts');
    });
  });
});