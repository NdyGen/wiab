import { RetryManager } from '../lib/RetryManager';
import { Logger, RetryConfig } from '../lib/ErrorTypes';

describe('RetryManager', () => {
  let mockLogger: Logger;
  let retryManager: RetryManager;

  beforeEach(() => {
    // Arrange: Create mock logger
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
    };

    retryManager = new RetryManager(mockLogger);

    // Use fake timers for time-based tests
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('retryWithBackoff', () => {
    describe('successful operations', () => {
      it('should return success on first attempt', async () => {
        // Arrange
        const operation = jest.fn().mockResolvedValue('success');

        // Act
        const result = await retryManager.retryWithBackoff(
          operation,
          'Test operation'
        );

        // Assert
        expect(result.success).toBe(true);
        expect(result.value).toBe('success');
        expect(result.attempts).toBe(1);
        expect(result.error).toBeUndefined();
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should retry and succeed after initial failures', async () => {
        // Arrange
        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('Fail 1'))
          .mockRejectedValueOnce(new Error('Fail 2'))
          .mockResolvedValue('success');

        const config: Partial<RetryConfig> = {
          maxAttempts: 5,
          initialDelayMs: 100,
        };

        // Act
        const promise = retryManager.retryWithBackoff(
          operation,
          'Test operation',
          config
        );

        // Fast-forward through delays
        await jest.advanceTimersByTimeAsync(100); // First retry delay
        await jest.advanceTimersByTimeAsync(200); // Second retry delay

        const result = await promise;

        // Assert
        expect(result.success).toBe(true);
        expect(result.value).toBe('success');
        expect(result.attempts).toBe(3);
        expect(operation).toHaveBeenCalledTimes(3);
      });
    });

    describe('exponential backoff', () => {
      it('should apply exponential backoff between retries', async () => {
        // Arrange
        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('Fail 1'))
          .mockRejectedValueOnce(new Error('Fail 2'))
          .mockRejectedValueOnce(new Error('Fail 3'))
          .mockResolvedValue('success');

        const config: Partial<RetryConfig> = {
          maxAttempts: 5,
          initialDelayMs: 100,
          backoffMultiplier: 2,
        };

        // Act
        const promise = retryManager.retryWithBackoff(
          operation,
          'Test operation',
          config
        );

        // Verify delays: 100ms, 200ms, 400ms
        await jest.advanceTimersByTimeAsync(100);
        await jest.advanceTimersByTimeAsync(200);
        await jest.advanceTimersByTimeAsync(400);

        const result = await promise;

        // Assert
        expect(result.success).toBe(true);
        expect(result.attempts).toBe(4);
      });

      it('should respect maxDelayMs cap', async () => {
        // Arrange
        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('Fail 1'))
          .mockRejectedValueOnce(new Error('Fail 2'))
          .mockRejectedValueOnce(new Error('Fail 3'))
          .mockResolvedValue('success');

        const config: Partial<RetryConfig> = {
          maxAttempts: 5,
          initialDelayMs: 1000,
          backoffMultiplier: 2,
          maxDelayMs: 1500, // Cap at 1.5 seconds
        };

        // Act
        const promise = retryManager.retryWithBackoff(
          operation,
          'Test operation',
          config
        );

        // Delays should be: 1000ms, 1500ms (capped from 2000), 1500ms (capped from 4000)
        await jest.advanceTimersByTimeAsync(1000);
        await jest.advanceTimersByTimeAsync(1500);
        await jest.advanceTimersByTimeAsync(1500);

        const result = await promise;

        // Assert
        expect(result.success).toBe(true);
        expect(result.attempts).toBe(4);
      });
    });

    describe('max attempts exhausted', () => {
      it('should return failure after max attempts', async () => {
        // Arrange
        const error = new Error('Persistent failure');
        const operation = jest.fn().mockRejectedValue(error);

        const config: Partial<RetryConfig> = {
          maxAttempts: 3,
          initialDelayMs: 100,
        };

        // Act
        const promise = retryManager.retryWithBackoff(
          operation,
          'Test operation',
          config
        );

        await jest.advanceTimersByTimeAsync(100); // First retry
        await jest.advanceTimersByTimeAsync(200); // Second retry

        const result = await promise;

        // Assert
        expect(result.success).toBe(false);
        expect(result.value).toBeUndefined();
        expect(result.attempts).toBe(3);
        expect(result.error).toBe(error);
        expect(operation).toHaveBeenCalledTimes(3);
      });

      it('should log each retry attempt', async () => {
        // Arrange
        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('Fail 1'))
          .mockRejectedValueOnce(new Error('Fail 2'))
          .mockResolvedValue('success');

        const config: Partial<RetryConfig> = {
          maxAttempts: 3,
          initialDelayMs: 100,
        };

        // Act
        const promise = retryManager.retryWithBackoff(
          operation,
          'Test operation',
          config
        );

        await jest.advanceTimersByTimeAsync(100);
        await jest.advanceTimersByTimeAsync(200);

        await promise;

        // Assert
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Test operation - attempt 1 failed'),
          expect.any(Error)
        );
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Test operation - attempt 2 failed'),
          expect.any(Error)
        );
      });
    });

    describe('default configuration', () => {
      it('should use default retry config when not provided', async () => {
        // Arrange
        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('Fail'))
          .mockResolvedValue('success');

        // Act
        const promise = retryManager.retryWithBackoff(operation, 'Test operation');

        // Default config: 3 attempts, 1000ms initial delay, 2x multiplier
        await jest.advanceTimersByTimeAsync(1000);

        const result = await promise;

        // Assert
        expect(result.success).toBe(true);
        expect(result.attempts).toBe(2);
      });

      it('should merge partial config with defaults', async () => {
        // Arrange
        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('Fail'))
          .mockResolvedValue('success');

        const partialConfig: Partial<RetryConfig> = {
          maxAttempts: 5, // Override default
          // Other fields use defaults
        };

        // Act
        const promise = retryManager.retryWithBackoff(
          operation,
          'Test operation',
          partialConfig
        );

        await jest.advanceTimersByTimeAsync(1000); // Default initialDelayMs

        const result = await promise;

        // Assert
        expect(result.success).toBe(true);
        expect(result.attempts).toBe(2);
      });
    });

    describe('edge cases', () => {
      it('should handle maxAttempts = 1 (no retries)', async () => {
        // Arrange
        const operation = jest.fn().mockRejectedValue(new Error('Fail'));

        const config: Partial<RetryConfig> = {
          maxAttempts: 1,
        };

        // Act
        const result = await retryManager.retryWithBackoff(
          operation,
          'Test operation',
          config
        );

        // Assert
        expect(result.success).toBe(false);
        expect(result.attempts).toBe(1);
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should handle non-Error objects being thrown', async () => {
        // Arrange
        const operation = jest.fn().mockRejectedValue('string error');

        const config: Partial<RetryConfig> = {
          maxAttempts: 2,
          initialDelayMs: 100,
        };

        // Act
        const promise = retryManager.retryWithBackoff(
          operation,
          'Test operation',
          config
        );

        await jest.advanceTimersByTimeAsync(100);

        const result = await promise;

        // Assert
        expect(result.success).toBe(false);
        expect(result.attempts).toBe(2);
        expect(result.error).toBe('string error');
      });

      it('should handle zero delay', async () => {
        // Arrange
        jest.useRealTimers(); // Use real timers for zero delay test

        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('Fail'))
          .mockResolvedValue('success');

        const config: Partial<RetryConfig> = {
          maxAttempts: 3,
          initialDelayMs: 0,
        };

        // Act
        const result = await retryManager.retryWithBackoff(
          operation,
          'Test operation',
          config
        );

        // Assert - should succeed immediately without delay
        expect(result.success).toBe(true);
        expect(result.attempts).toBe(2);

        jest.useFakeTimers(); // Restore fake timers for other tests
      });
    });
  });
});
