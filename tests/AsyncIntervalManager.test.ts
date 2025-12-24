import { AsyncIntervalManager } from '../lib/AsyncIntervalManager';
import { Logger } from '../lib/ErrorTypes';

describe('AsyncIntervalManager', () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
    };

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('lifecycle', () => {
    it('should start and stop without errors', () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue(undefined);
      const manager = new AsyncIntervalManager({
        operation,
        intervalMs: 1000,
        logger: mockLogger,
      });

      // Act & Assert
      expect(() => {
        manager.start();
        manager.stop();
      }).not.toThrow();
    });

    it('should report running status correctly', () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue(undefined);
      const manager = new AsyncIntervalManager({
        operation,
        intervalMs: 1000,
        logger: mockLogger,
      });

      // Assert
      expect(manager.isActive()).toBe(false);

      manager.start();
      expect(manager.isActive()).toBe(true);

      manager.stop();
      expect(manager.isActive()).toBe(false);
    });

    it('should not start if already running', () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue(undefined);
      const manager = new AsyncIntervalManager({
        operation,
        intervalMs: 1000,
        logger: mockLogger,
      });

      // Act
      manager.start();
      manager.start();

      // Assert
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('already running')
      );
    });

    it('should handle stop when not running', () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue(undefined);
      const manager = new AsyncIntervalManager({
        operation,
        intervalMs: 1000,
        logger: mockLogger,
      });

      // Act & Assert
      expect(() => manager.stop()).not.toThrow();
    });
  });

  describe('operation execution', () => {
    it('should call operation with logger name', async () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue(undefined);
      const manager = new AsyncIntervalManager({
        operation,
        intervalMs: 1000,
        logger: mockLogger,
        name: 'TestManager',
      });

      // Act
      manager.start();
      await jest.runOnlyPendingTimersAsync();
      manager.stop();

      // Assert
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('TestManager')
      );
    });

    it('should call operation on start', async () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue(undefined);
      const manager = new AsyncIntervalManager({
        operation,
        intervalMs: 1000,
        logger: mockLogger,
      });

      // Act
      manager.start();
      await jest.runOnlyPendingTimersAsync();
      manager.stop();

      // Assert
      expect(operation).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should call onError when operation fails', async () => {
      // Arrange
      const error = new Error('Operation failed');
      const operation = jest.fn().mockRejectedValue(error);
      const onError = jest.fn();

      const manager = new AsyncIntervalManager({
        operation,
        intervalMs: 1000,
        logger: mockLogger,
        onError,
      });

      // Act
      manager.start();
      await jest.runOnlyPendingTimersAsync();
      manager.stop();

      // Assert
      expect(onError).toHaveBeenCalledWith(error);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('operation failed'),
        error
      );
    });

    it('should handle onError throwing error', async () => {
      // Arrange
      const operation = jest.fn().mockRejectedValue(new Error('Op error'));
      const onError = jest.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });

      const manager = new AsyncIntervalManager({
        operation,
        intervalMs: 1000,
        logger: mockLogger,
        onError,
      });

      // Act
      manager.start();
      await jest.runOnlyPendingTimersAsync();
      manager.stop();

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('error handler failed'),
        expect.any(Error)
      );
    });
  });

  describe('success callback', () => {
    it('should call onSuccess when operation succeeds', async () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue(undefined);
      const onSuccess = jest.fn();

      const manager = new AsyncIntervalManager({
        operation,
        intervalMs: 1000,
        logger: mockLogger,
        onSuccess,
      });

      // Act
      manager.start();
      await jest.runOnlyPendingTimersAsync();
      manager.stop();

      // Assert
      expect(onSuccess).toHaveBeenCalled();
    });

    it('should not call onSuccess when operation fails', async () => {
      // Arrange
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));
      const onSuccess = jest.fn();

      const manager = new AsyncIntervalManager({
        operation,
        intervalMs: 1000,
        logger: mockLogger,
        onSuccess,
      });

      // Act
      manager.start();
      await jest.runOnlyPendingTimersAsync();
      manager.stop();

      // Assert
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  describe('status queries', () => {
    it('should report queue size', () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue(undefined);
      const manager = new AsyncIntervalManager({
        operation,
        intervalMs: 1000,
        logger: mockLogger,
      });

      // Assert - queue starts empty
      expect(manager.getQueueSize()).toBe(0);
    });

    it('should report operation in progress status', () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue(undefined);
      const manager = new AsyncIntervalManager({
        operation,
        intervalMs: 1000,
        logger: mockLogger,
      });

      // Assert - initially not in progress
      expect(manager.isOperationInProgress()).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle operation with no name', async () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue(undefined);
      const manager = new AsyncIntervalManager({
        operation,
        intervalMs: 1000,
        logger: mockLogger,
        // name not provided
      });

      // Act
      manager.start();
      await jest.runOnlyPendingTimersAsync();
      manager.stop();

      // Assert
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('unnamed')
      );
    });

    it('should handle very short intervals', async () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue(undefined);
      const manager = new AsyncIntervalManager({
        operation,
        intervalMs: 1,
        logger: mockLogger,
      });

      // Act
      manager.start();
      await jest.runOnlyPendingTimersAsync();
      manager.stop();

      // Assert
      expect(operation).toHaveBeenCalled();
    });
  });
});
