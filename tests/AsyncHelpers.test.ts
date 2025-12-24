import { executeAsync, executeAsyncWithLog } from '../lib/AsyncHelpers';
import { ErrorSeverity } from '../lib/ErrorTypes';
import type { ErrorReporter } from '../lib/ErrorReporter';

// Mock ErrorReporter
interface MockErrorReporter {
  reportError: jest.Mock;
}

// Mock Logger
interface MockLogger {
  log: jest.Mock;
  error: jest.Mock;
}

describe('AsyncHelpers', () => {
  let mockErrorReporter: MockErrorReporter;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockErrorReporter = {
      reportError: jest.fn(),
    };

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
    };
  });

  describe('executeAsync', () => {
    it('should execute operation successfully without calling error reporter', async () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue(undefined);

      // Act
      executeAsync(
        operation,
        mockErrorReporter as unknown as ErrorReporter,
        {
          errorId: 'TEST_001',
          severity: ErrorSeverity.MEDIUM,
          userMessage: 'Test operation failed',
          operationName: 'testOperation',
        }
      );

      // Wait for async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert
      expect(operation).toHaveBeenCalled();
      expect(mockErrorReporter.reportError).not.toHaveBeenCalled();
    });

    it('should report error when operation fails', async () => {
      // Arrange
      const error = new Error('Operation failed');
      const operation = jest.fn().mockRejectedValue(error);

      // Act
      executeAsync(
        operation,
        mockErrorReporter as unknown as ErrorReporter,
        {
          errorId: 'TEST_001',
          severity: ErrorSeverity.HIGH,
          userMessage: 'Test operation failed',
          operationName: 'testOperation',
        }
      );

      // Wait for async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert
      expect(operation).toHaveBeenCalled();
      expect(mockErrorReporter.reportError).toHaveBeenCalledWith({
        errorId: 'TEST_001',
        severity: ErrorSeverity.HIGH,
        userMessage: 'Test operation failed',
        technicalMessage: expect.stringContaining('testOperation failed'),
        context: undefined,
      });
    });

    it('should report error with additional context', async () => {
      // Arrange
      const error = new Error('Operation failed');
      const operation = jest.fn().mockRejectedValue(error);
      const context = { deviceId: 'device-123', zoneId: 'zone-456' };

      // Act
      executeAsync(
        operation,
        mockErrorReporter as unknown as ErrorReporter,
        {
          errorId: 'TEST_002',
          severity: ErrorSeverity.CRITICAL,
          userMessage: 'Critical failure',
          operationName: 'criticalOperation',
          context,
        }
      );

      // Wait for async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert
      expect(mockErrorReporter.reportError).toHaveBeenCalledWith({
        errorId: 'TEST_002',
        severity: ErrorSeverity.CRITICAL,
        userMessage: 'Critical failure',
        technicalMessage: expect.stringContaining('criticalOperation failed'),
        context,
      });
    });

    it('should handle non-Error exceptions', async () => {
      // Arrange
      const operation = jest.fn().mockRejectedValue('String error');

      // Act
      executeAsync(
        operation,
        mockErrorReporter as unknown as ErrorReporter,
        {
          errorId: 'TEST_003',
          severity: ErrorSeverity.LOW,
          userMessage: 'Operation failed',
          operationName: 'testOperation',
        }
      );

      // Wait for async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert
      expect(mockErrorReporter.reportError).toHaveBeenCalledWith({
        errorId: 'TEST_003',
        severity: ErrorSeverity.LOW,
        userMessage: 'Operation failed',
        technicalMessage: expect.stringContaining('String error'),
        context: undefined,
      });
    });

    it('should include stack trace in technical message', async () => {
      // Arrange
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at testFunction (test.ts:10:5)';
      const operation = jest.fn().mockRejectedValue(error);

      // Act
      executeAsync(
        operation,
        mockErrorReporter as unknown as ErrorReporter,
        {
          errorId: 'TEST_004',
          severity: ErrorSeverity.MEDIUM,
          userMessage: 'Operation failed',
          operationName: 'testOperation',
        }
      );

      // Wait for async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert
      expect(mockErrorReporter.reportError).toHaveBeenCalledWith(
        expect.objectContaining({
          technicalMessage: expect.stringContaining('Error: Test error'),
        })
      );
    });
  });

  describe('executeAsyncWithLog', () => {
    it('should execute operation successfully without logging error', async () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue(undefined);

      // Act
      executeAsyncWithLog(operation, mockLogger as unknown as { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void }, 'testOperation');

      // Wait for async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert
      expect(operation).toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should log error when operation fails', async () => {
      // Arrange
      const error = new Error('Operation failed');
      const operation = jest.fn().mockRejectedValue(error);

      // Act
      executeAsyncWithLog(operation, mockLogger as unknown as { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void }, 'testOperation');

      // Wait for async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert
      expect(operation).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('testOperation failed:', error);
    });

    it('should handle non-Error exceptions', async () => {
      // Arrange
      const operation = jest.fn().mockRejectedValue('String error');

      // Act
      executeAsyncWithLog(operation, mockLogger as unknown as { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void }, 'testOperation');

      // Wait for async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'testOperation failed:',
        expect.any(Error)
      );
    });

    it('should convert string errors to Error objects', async () => {
      // Arrange
      const operation = jest.fn().mockRejectedValue('String error');

      // Act
      executeAsyncWithLog(operation, mockLogger as unknown as { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void }, 'stringErrorOp');

      // Wait for async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert
      const errorArg = (mockLogger.error as jest.Mock).mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(Error);
      expect(errorArg.message).toBe('String error');
    });
  });
});
