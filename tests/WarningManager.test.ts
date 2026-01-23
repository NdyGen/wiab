import { WarningManager } from '../lib/WarningManager';
import { Logger } from '../lib/ErrorTypes';

// Mock Homey Device interface
interface MockDevice {
  setWarning: jest.Mock;
  unsetWarning: jest.Mock;
}

describe('WarningManager', () => {
  let mockDevice: MockDevice;
  let mockLogger: Logger;
  let warningManager: WarningManager;

  beforeEach(() => {
    // Arrange: Create mocks
    mockDevice = {
      setWarning: jest.fn().mockResolvedValue(undefined),
      unsetWarning: jest.fn().mockResolvedValue(undefined),
    };

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
    };

    warningManager = new WarningManager(mockDevice as unknown as {
      setWarning: (message: string) => Promise<void>;
      unsetWarning: () => Promise<void>;
    }, mockLogger);
  });

  describe('setWarning', () => {
    it('should set warning on device', async () => {
      // Arrange
      const errorId = 'TEST_001';
      const message = 'Test warning message';

      // Act
      await warningManager.setWarning(errorId, message);

      // Assert
      expect(mockDevice.setWarning).toHaveBeenCalledWith(message);
      expect(mockDevice.setWarning).toHaveBeenCalledTimes(1);
      expect(mockLogger.log).toHaveBeenCalledWith(
        `Warning set: [${errorId}] ${message}`
      );
    });

    it('should update warning state', async () => {
      // Arrange
      const errorId = 'TEST_001';
      const message = 'Test warning';

      // Act
      await warningManager.setWarning(errorId, message);

      // Assert
      expect(warningManager.hasWarning()).toBe(true);
      expect(warningManager.getCurrentMessage()).toBe(message);
    });

    it('should not call setWarning if same warning already active', async () => {
      // Arrange
      const errorId = 'TEST_001';
      const message = 'Test warning';

      await warningManager.setWarning(errorId, message);
      mockDevice.setWarning.mockClear();
      (mockLogger.log as jest.Mock).mockClear();

      // Act
      await warningManager.setWarning(errorId, message);

      // Assert
      expect(mockDevice.setWarning).not.toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('already active')
      );
    });

    it('should update warning if message changes', async () => {
      // Arrange
      const errorId = 'TEST_001';
      const firstMessage = 'First warning';
      const secondMessage = 'Second warning';

      await warningManager.setWarning(errorId, firstMessage);
      mockDevice.setWarning.mockClear();
      (mockLogger.log as jest.Mock).mockClear();

      // Act
      await warningManager.setWarning(errorId, secondMessage);

      // Assert
      expect(mockDevice.setWarning).toHaveBeenCalledWith(secondMessage);
      expect(warningManager.getCurrentMessage()).toBe(secondMessage);
    });

    it('should update warning if error ID changes', async () => {
      // Arrange
      const firstErrorId = 'TEST_001';
      const secondErrorId = 'TEST_002';
      const message = 'Warning message';

      await warningManager.setWarning(firstErrorId, message);
      mockDevice.setWarning.mockClear();

      // Act
      await warningManager.setWarning(secondErrorId, message);

      // Assert
      expect(mockDevice.setWarning).toHaveBeenCalledWith(message);
      expect(warningManager.hasWarning()).toBe(true);
      expect(warningManager.getCurrentMessage()).toBe(message);
    });

    it('should throw WarningStateError when setWarning fails', async () => {
      // Arrange
      const error = new Error('Device setWarning failed');
      mockDevice.setWarning.mockRejectedValue(error);

      const errorId = 'TEST_001';
      const message = 'Test warning';

      // Act & Assert
      await expect(warningManager.setWarning(errorId, message)).rejects.toThrow('Failed to set warning');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to set warning'),
        error
      );

      // State should NOT be updated if device call fails
      expect(warningManager.hasWarning()).toBe(false);
    });
  });

  describe('clearWarning', () => {
    it('should clear warning from device', async () => {
      // Arrange
      await warningManager.setWarning('TEST_001', 'Test warning');
      (mockLogger.log as jest.Mock).mockClear();

      // Act
      await warningManager.clearWarning();

      // Assert
      expect(mockDevice.unsetWarning).toHaveBeenCalledTimes(1);
      expect(mockLogger.log).toHaveBeenCalledWith('Warning cleared: [TEST_001]');
    });

    it('should update warning state to inactive', async () => {
      // Arrange
      await warningManager.setWarning('TEST_001', 'Test warning');

      // Act
      await warningManager.clearWarning();

      // Assert
      expect(warningManager.hasWarning()).toBe(false);
      expect(warningManager.getCurrentMessage()).toBeNull();
    });

    it('should not call unsetWarning if no warning active', async () => {
      // Act
      await warningManager.clearWarning();

      // Assert
      expect(mockDevice.unsetWarning).not.toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith('No active warning to clear - skipping');
    });

    it('should throw WarningStateError when unsetWarning fails', async () => {
      // Arrange
      const error = new Error('Device unsetWarning failed');
      mockDevice.unsetWarning.mockRejectedValue(error);

      await warningManager.setWarning('TEST_001', 'Test warning');

      // Act & Assert
      await expect(warningManager.clearWarning()).rejects.toThrow('Failed to clear warning');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to clear warning'),
        error
      );

      // State should NOT be cleared if device call fails
      expect(warningManager.hasWarning()).toBe(true);
    });
  });

  describe('hasWarning', () => {
    it('should return false when no warning set', () => {
      // Assert
      expect(warningManager.hasWarning()).toBe(false);
    });

    it('should return true when warning is set', async () => {
      // Arrange
      await warningManager.setWarning('TEST_001', 'Test warning');

      // Assert
      expect(warningManager.hasWarning()).toBe(true);
    });

    it('should return false after warning is cleared', async () => {
      // Arrange
      await warningManager.setWarning('TEST_001', 'Test warning');
      await warningManager.clearWarning();

      // Assert
      expect(warningManager.hasWarning()).toBe(false);
    });
  });

  describe('warning state transitions', () => {
    it('should track multiple warning changes', async () => {
      // Arrange & Act
      await warningManager.setWarning('ERROR_001', 'First error');
      expect(warningManager.hasWarning()).toBe(true);
      expect(warningManager.getCurrentMessage()).toBe('First error');

      await warningManager.setWarning('ERROR_002', 'Second error');
      expect(warningManager.hasWarning()).toBe(true);
      expect(warningManager.getCurrentMessage()).toBe('Second error');

      await warningManager.clearWarning();
      expect(warningManager.hasWarning()).toBe(false);
    });

    it('should handle rapid warning updates', async () => {
      // Arrange & Act
      await warningManager.setWarning('ERROR_001', 'Error 1');
      await warningManager.setWarning('ERROR_002', 'Error 2');
      await warningManager.setWarning('ERROR_003', 'Error 3');

      // Assert - only final state persists
      expect(warningManager.getCurrentMessage()).toBe('Error 3');
      expect(mockDevice.setWarning).toHaveBeenCalledTimes(3);
    });
  });

  describe('edge cases', () => {
    it('should handle empty warning message', async () => {
      // Act
      await warningManager.setWarning('TEST_001', '');

      // Assert
      expect(mockDevice.setWarning).toHaveBeenCalledWith('');
      expect(warningManager.getCurrentMessage()).toBe('');
    });

    it('should handle very long warning message', async () => {
      // Arrange
      const longMessage = 'A'.repeat(1000);

      // Act
      await warningManager.setWarning('TEST_001', longMessage);

      // Assert
      expect(mockDevice.setWarning).toHaveBeenCalledWith(longMessage);
      expect(warningManager.getCurrentMessage()).toBe(longMessage);
    });

    it('should handle special characters in warning message', async () => {
      // Arrange
      const specialMessage = 'Test: <>&"\' message';

      // Act
      await warningManager.setWarning('TEST_001', specialMessage);

      // Assert
      expect(mockDevice.setWarning).toHaveBeenCalledWith(specialMessage);
      expect(warningManager.getCurrentMessage()).toBe(specialMessage);
    });
  });
});
