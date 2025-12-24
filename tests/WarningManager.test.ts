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
      expect(warningManager.getState()).toEqual({
        isActive: true,
        message: message,
        setAt: expect.any(Number),
        errorId: errorId,
      });
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
      expect(warningManager.getState()?.message).toBe(secondMessage);
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
      expect(warningManager.getState()?.errorId).toBe(secondErrorId);
    });

    it('should handle setWarning failure gracefully', async () => {
      // Arrange
      const error = new Error('Device setWarning failed');
      mockDevice.setWarning.mockRejectedValue(error);

      const errorId = 'TEST_001';
      const message = 'Test warning';

      // Act
      const result = await warningManager.setWarning(errorId, message);

      // Assert
      expect(result).toBe(false);
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
      expect(warningManager.getState()).toEqual({
        isActive: false,
        message: null,
        setAt: null,
        errorId: null,
      });
    });

    it('should not call unsetWarning if no warning active', async () => {
      // Act
      await warningManager.clearWarning();

      // Assert
      expect(mockDevice.unsetWarning).not.toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith('No active warning to clear - skipping');
    });

    it('should handle unsetWarning failure gracefully', async () => {
      // Arrange
      const error = new Error('Device unsetWarning failed');
      mockDevice.unsetWarning.mockRejectedValue(error);

      await warningManager.setWarning('TEST_001', 'Test warning');

      // Act
      const result = await warningManager.clearWarning();

      // Assert
      expect(result).toBe(false);
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

  describe('getState', () => {
    it('should return inactive state initially', () => {
      // Assert
      expect(warningManager.getState()).toEqual({
        isActive: false,
        message: null,
        setAt: null,
        errorId: null,
      });
    });

    it('should return current warning state when active', async () => {
      // Arrange
      const errorId = 'TEST_001';
      const message = 'Test warning';
      const beforeTime = Date.now();

      await warningManager.setWarning(errorId, message);

      const afterTime = Date.now();

      // Assert
      const state = warningManager.getState();
      expect(state.isActive).toBe(true);
      expect(state.message).toBe(message);
      expect(state.errorId).toBe(errorId);
      expect(state.setAt).toBeGreaterThanOrEqual(beforeTime);
      expect(state.setAt).toBeLessThanOrEqual(afterTime);
    });

    it('should return a defensive copy of state', async () => {
      // Arrange
      await warningManager.setWarning('TEST_001', 'Test warning');

      // Act
      const state1 = warningManager.getState();
      const state2 = warningManager.getState();

      // Assert - different object instances
      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  describe('warning state transitions', () => {
    it('should track multiple warning changes', async () => {
      // Arrange & Act
      await warningManager.setWarning('ERROR_001', 'First error');
      const state1 = warningManager.getState();

      await warningManager.setWarning('ERROR_002', 'Second error');
      const state2 = warningManager.getState();

      await warningManager.clearWarning();
      const state3 = warningManager.getState();

      // Assert
      expect(state1.errorId).toBe('ERROR_001');
      expect(state1.message).toBe('First error');

      expect(state2.errorId).toBe('ERROR_002');
      expect(state2.message).toBe('Second error');
      expect(state2.setAt).toBeGreaterThanOrEqual(state1.setAt!);

      expect(state3.isActive).toBe(false);
    });

    it('should handle rapid warning updates', async () => {
      // Arrange & Act
      await warningManager.setWarning('ERROR_001', 'Error 1');
      await warningManager.setWarning('ERROR_002', 'Error 2');
      await warningManager.setWarning('ERROR_003', 'Error 3');

      // Assert - only final state persists
      const state = warningManager.getState();
      expect(state.errorId).toBe('ERROR_003');
      expect(state.message).toBe('Error 3');
      expect(mockDevice.setWarning).toHaveBeenCalledTimes(3);
    });
  });

  describe('edge cases', () => {
    it('should handle empty warning message', async () => {
      // Act
      await warningManager.setWarning('TEST_001', '');

      // Assert
      expect(mockDevice.setWarning).toHaveBeenCalledWith('');
      expect(warningManager.getState().message).toBe('');
    });

    it('should handle very long warning message', async () => {
      // Arrange
      const longMessage = 'A'.repeat(1000);

      // Act
      await warningManager.setWarning('TEST_001', longMessage);

      // Assert
      expect(mockDevice.setWarning).toHaveBeenCalledWith(longMessage);
      expect(warningManager.getState().message).toBe(longMessage);
    });

    it('should handle special characters in warning message', async () => {
      // Arrange
      const specialMessage = 'Test: <>&"\' message';

      // Act
      await warningManager.setWarning('TEST_001', specialMessage);

      // Assert
      expect(mockDevice.setWarning).toHaveBeenCalledWith(specialMessage);
      expect(warningManager.getState().message).toBe(specialMessage);
    });
  });
});
