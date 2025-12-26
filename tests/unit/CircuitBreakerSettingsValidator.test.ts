import {
  validateCircuitBreakerSettings,
  validateCircuitBreakerSettingsSync
} from '../../lib/CircuitBreakerSettingsValidator';
import { CircuitBreakerHierarchyManager } from '../../lib/CircuitBreakerHierarchyManager';

describe('CircuitBreakerSettingsValidator', () => {
  let mockHierarchyManager: jest.Mocked<CircuitBreakerHierarchyManager>;

  beforeEach(() => {
    mockHierarchyManager = {
      wouldCreateCycle: jest.fn(),
    } as unknown as jest.Mocked<CircuitBreakerHierarchyManager>;
  });

  describe('validateCircuitBreakerSettings', () => {
    describe('valid inputs', () => {
      it('should accept empty string as no parent', async () => {
        // Arrange
        const settings = { parentId: '' };
        const deviceId = 'device-1';

        // Act
        const result = await validateCircuitBreakerSettings(
          settings,
          deviceId,
          mockHierarchyManager
        );

        // Assert
        expect(result.parentId).toBeNull();
        expect(mockHierarchyManager.wouldCreateCycle).not.toHaveBeenCalled();
      });

      it('should accept valid parent ID', async () => {
        // Arrange
        const settings = { parentId: 'parent-1' };
        const deviceId = 'device-1';
        mockHierarchyManager.wouldCreateCycle.mockResolvedValue(false);

        // Act
        const result = await validateCircuitBreakerSettings(
          settings,
          deviceId,
          mockHierarchyManager
        );

        // Assert
        expect(result.parentId).toBe('parent-1');
        expect(mockHierarchyManager.wouldCreateCycle).toHaveBeenCalledWith(
          'device-1',
          'parent-1'
        );
      });

      it('should accept null as no parent', async () => {
        // Arrange
        const settings = { parentId: null };
        const deviceId = 'device-1';

        // Act
        const result = await validateCircuitBreakerSettings(
          settings,
          deviceId,
          mockHierarchyManager
        );

        // Assert
        expect(result.parentId).toBeNull();
        expect(mockHierarchyManager.wouldCreateCycle).not.toHaveBeenCalled();
      });

      it('should accept undefined as no parent', async () => {
        // Arrange
        const settings = { parentId: undefined };
        const deviceId = 'device-1';

        // Act
        const result = await validateCircuitBreakerSettings(
          settings,
          deviceId,
          mockHierarchyManager
        );

        // Assert
        expect(result.parentId).toBeNull();
        expect(mockHierarchyManager.wouldCreateCycle).not.toHaveBeenCalled();
      });

      it('should accept settings without parentId field', async () => {
        // Arrange
        const settings = {};
        const deviceId = 'device-1';

        // Act
        const result = await validateCircuitBreakerSettings(
          settings,
          deviceId,
          mockHierarchyManager
        );

        // Assert
        expect(result.parentId).toBeNull();
        expect(mockHierarchyManager.wouldCreateCycle).not.toHaveBeenCalled();
      });
    });

    describe('invalid types', () => {
      it('should throw for non-object settings', async () => {
        // Arrange
        const settings = 'not an object';
        const deviceId = 'device-1';

        // Act & Assert
        await expect(
          validateCircuitBreakerSettings(settings, deviceId, mockHierarchyManager)
        ).rejects.toThrow('Settings must be an object');
      });

      it('should throw for array settings', async () => {
        // Arrange
        const settings = ['array'];
        const deviceId = 'device-1';

        // Act & Assert
        await expect(
          validateCircuitBreakerSettings(settings, deviceId, mockHierarchyManager)
        ).rejects.toThrow('Settings must be an object');
      });

      it('should throw for null settings', async () => {
        // Arrange
        const settings = null;
        const deviceId = 'device-1';

        // Act & Assert
        await expect(
          validateCircuitBreakerSettings(settings, deviceId, mockHierarchyManager)
        ).rejects.toThrow('Settings must be an object');
      });

      it('should throw for undefined settings', async () => {
        // Arrange
        const settings = undefined;
        const deviceId = 'device-1';

        // Act & Assert
        await expect(
          validateCircuitBreakerSettings(settings, deviceId, mockHierarchyManager)
        ).rejects.toThrow('Settings must be an object');
      });
    });

    describe('parentId validation', () => {
      it('should throw for non-string parent ID', async () => {
        // Arrange
        const settings = { parentId: 123 };
        const deviceId = 'device-1';

        // Act & Assert
        await expect(
          validateCircuitBreakerSettings(settings, deviceId, mockHierarchyManager)
        ).rejects.toThrow('Parent ID must be a string or null');
      });

      it('should throw for number parent ID', async () => {
        // Arrange
        const settings = { parentId: 42 };
        const deviceId = 'device-1';

        // Act & Assert
        await expect(
          validateCircuitBreakerSettings(settings, deviceId, mockHierarchyManager)
        ).rejects.toThrow('Parent ID must be a string or null');
      });

      it('should throw for object parent ID', async () => {
        // Arrange
        const settings = { parentId: { id: 'parent-1' } };
        const deviceId = 'device-1';

        // Act & Assert
        await expect(
          validateCircuitBreakerSettings(settings, deviceId, mockHierarchyManager)
        ).rejects.toThrow('Parent ID must be a string or null');
      });

      it('should throw for boolean parent ID', async () => {
        // Arrange
        const settings = { parentId: true };
        const deviceId = 'device-1';

        // Act & Assert
        await expect(
          validateCircuitBreakerSettings(settings, deviceId, mockHierarchyManager)
        ).rejects.toThrow('Parent ID must be a string or null');
      });

      it('should throw for whitespace-only string', async () => {
        // Arrange
        const settings = { parentId: '   ' };
        const deviceId = 'device-1';

        // Act & Assert
        await expect(
          validateCircuitBreakerSettings(settings, deviceId, mockHierarchyManager)
        ).rejects.toThrow('Parent ID cannot be an empty string');
      });

      it('should throw for empty string with spaces', async () => {
        // Arrange
        const settings = { parentId: '\t\n ' };
        const deviceId = 'device-1';

        // Act & Assert
        await expect(
          validateCircuitBreakerSettings(settings, deviceId, mockHierarchyManager)
        ).rejects.toThrow('Parent ID cannot be an empty string');
      });

      it('should accept valid string with spaces in middle', async () => {
        // Arrange
        const settings = { parentId: 'parent 1' };
        const deviceId = 'device-1';
        mockHierarchyManager.wouldCreateCycle.mockResolvedValue(false);

        // Act
        const result = await validateCircuitBreakerSettings(
          settings,
          deviceId,
          mockHierarchyManager
        );

        // Assert
        expect(result.parentId).toBe('parent 1');
      });
    });

    describe('cycle detection', () => {
      it('should throw when parent assignment creates cycle', async () => {
        // Arrange
        const settings = { parentId: 'parent-1' };
        const deviceId = 'device-1';
        mockHierarchyManager.wouldCreateCycle.mockResolvedValue(true);

        // Act & Assert
        await expect(
          validateCircuitBreakerSettings(settings, deviceId, mockHierarchyManager)
        ).rejects.toThrow('Cannot set parent: would create circular dependency');
      });

      it('should accept valid parent assignment', async () => {
        // Arrange
        const settings = { parentId: 'parent-1' };
        const deviceId = 'device-1';
        mockHierarchyManager.wouldCreateCycle.mockResolvedValue(false);

        // Act
        const result = await validateCircuitBreakerSettings(
          settings,
          deviceId,
          mockHierarchyManager
        );

        // Assert
        expect(result.parentId).toBe('parent-1');
      });

      it('should handle self-reference as cycle', async () => {
        // Arrange
        const settings = { parentId: 'device-1' };
        const deviceId = 'device-1';
        mockHierarchyManager.wouldCreateCycle.mockResolvedValue(true);

        // Act & Assert
        await expect(
          validateCircuitBreakerSettings(settings, deviceId, mockHierarchyManager)
        ).rejects.toThrow('Cannot set parent: would create circular dependency');
      });

      it('should skip cycle detection for null parent', async () => {
        // Arrange
        const settings = { parentId: null };
        const deviceId = 'device-1';

        // Act
        await validateCircuitBreakerSettings(
          settings,
          deviceId,
          mockHierarchyManager
        );

        // Assert
        expect(mockHierarchyManager.wouldCreateCycle).not.toHaveBeenCalled();
      });

      it('should skip cycle detection for undefined parent', async () => {
        // Arrange
        const settings = { parentId: undefined };
        const deviceId = 'device-1';

        // Act
        await validateCircuitBreakerSettings(
          settings,
          deviceId,
          mockHierarchyManager
        );

        // Assert
        expect(mockHierarchyManager.wouldCreateCycle).not.toHaveBeenCalled();
      });

      it('should skip cycle detection for empty string parent', async () => {
        // Arrange
        const settings = { parentId: '' };
        const deviceId = 'device-1';

        // Act
        await validateCircuitBreakerSettings(
          settings,
          deviceId,
          mockHierarchyManager
        );

        // Assert
        expect(mockHierarchyManager.wouldCreateCycle).not.toHaveBeenCalled();
      });
    });

    describe('error messages', () => {
      it('should provide clear error for invalid settings type', async () => {
        // Arrange
        const settings = 'invalid';
        const deviceId = 'device-1';

        // Act & Assert
        await expect(
          validateCircuitBreakerSettings(settings, deviceId, mockHierarchyManager)
        ).rejects.toThrow('Settings must be an object');
      });

      it('should provide clear error for invalid parent ID type', async () => {
        // Arrange
        const settings = { parentId: 123 };
        const deviceId = 'device-1';

        // Act & Assert
        await expect(
          validateCircuitBreakerSettings(settings, deviceId, mockHierarchyManager)
        ).rejects.toThrow('Parent ID must be a string or null');
      });

      it('should provide clear error for empty parent ID', async () => {
        // Arrange
        const settings = { parentId: '   ' };
        const deviceId = 'device-1';

        // Act & Assert
        await expect(
          validateCircuitBreakerSettings(settings, deviceId, mockHierarchyManager)
        ).rejects.toThrow('Parent ID cannot be an empty string');
      });

      it('should provide clear error for cycle detection', async () => {
        // Arrange
        const settings = { parentId: 'parent-1' };
        const deviceId = 'device-1';
        mockHierarchyManager.wouldCreateCycle.mockResolvedValue(true);

        // Act & Assert
        await expect(
          validateCircuitBreakerSettings(settings, deviceId, mockHierarchyManager)
        ).rejects.toThrow('Cannot set parent: would create circular dependency');
      });
    });
  });

  describe('validateCircuitBreakerSettingsSync', () => {
    describe('valid inputs', () => {
      it('should accept empty string as no parent', () => {
        // Arrange
        const settings = { parentId: '' };

        // Act
        const result = validateCircuitBreakerSettingsSync(settings);

        // Assert
        expect(result.parentId).toBeNull();
      });

      it('should accept valid parent ID', () => {
        // Arrange
        const settings = { parentId: 'parent-1' };

        // Act
        const result = validateCircuitBreakerSettingsSync(settings);

        // Assert
        expect(result.parentId).toBe('parent-1');
      });

      it('should accept null as no parent', () => {
        // Arrange
        const settings = { parentId: null };

        // Act
        const result = validateCircuitBreakerSettingsSync(settings);

        // Assert
        expect(result.parentId).toBeNull();
      });

      it('should accept undefined as no parent', () => {
        // Arrange
        const settings = { parentId: undefined };

        // Act
        const result = validateCircuitBreakerSettingsSync(settings);

        // Assert
        expect(result.parentId).toBeNull();
      });
    });

    describe('invalid types', () => {
      it('should throw for non-object settings', () => {
        // Arrange
        const settings = 'not an object';

        // Act & Assert
        expect(() => validateCircuitBreakerSettingsSync(settings)).toThrow(
          'Settings must be an object'
        );
      });

      it('should throw for array settings', () => {
        // Arrange
        const settings = ['array'];

        // Act & Assert
        expect(() => validateCircuitBreakerSettingsSync(settings)).toThrow(
          'Settings must be an object'
        );
      });

      it('should throw for null settings', () => {
        // Arrange
        const settings = null;

        // Act & Assert
        expect(() => validateCircuitBreakerSettingsSync(settings)).toThrow(
          'Settings must be an object'
        );
      });

      it('should throw for undefined settings', () => {
        // Arrange
        const settings = undefined;

        // Act & Assert
        expect(() => validateCircuitBreakerSettingsSync(settings)).toThrow(
          'Settings must be an object'
        );
      });
    });

    describe('parentId validation', () => {
      it('should throw for non-string parent ID', () => {
        // Arrange
        const settings = { parentId: 123 };

        // Act & Assert
        expect(() => validateCircuitBreakerSettingsSync(settings)).toThrow(
          'Parent ID must be a string or null'
        );
      });

      it('should throw for number parent ID', () => {
        // Arrange
        const settings = { parentId: 42 };

        // Act & Assert
        expect(() => validateCircuitBreakerSettingsSync(settings)).toThrow(
          'Parent ID must be a string or null'
        );
      });

      it('should throw for object parent ID', () => {
        // Arrange
        const settings = { parentId: { id: 'parent-1' } };

        // Act & Assert
        expect(() => validateCircuitBreakerSettingsSync(settings)).toThrow(
          'Parent ID must be a string or null'
        );
      });

      it('should throw for whitespace-only string', () => {
        // Arrange
        const settings = { parentId: '   ' };

        // Act & Assert
        expect(() => validateCircuitBreakerSettingsSync(settings)).toThrow(
          'Parent ID cannot be an empty string'
        );
      });
    });

    describe('no cycle detection', () => {
      it('should not perform cycle detection', () => {
        // Arrange
        const settings = { parentId: 'parent-1' };

        // Act
        const result = validateCircuitBreakerSettingsSync(settings);

        // Assert
        expect(result.parentId).toBe('parent-1');
        // No way to verify cycle detection wasn't called, but it shouldn't be
      });
    });

    describe('error messages', () => {
      it('should provide clear error for invalid settings type', () => {
        // Arrange
        const settings = 'invalid';

        // Act & Assert
        expect(() => validateCircuitBreakerSettingsSync(settings)).toThrow(
          'Settings must be an object'
        );
      });

      it('should provide clear error for invalid parent ID type', () => {
        // Arrange
        const settings = { parentId: 123 };

        // Act & Assert
        expect(() => validateCircuitBreakerSettingsSync(settings)).toThrow(
          'Parent ID must be a string or null'
        );
      });

      it('should provide clear error for empty parent ID', () => {
        // Arrange
        const settings = { parentId: '   ' };

        // Act & Assert
        expect(() => validateCircuitBreakerSettingsSync(settings)).toThrow(
          'Parent ID cannot be an empty string'
        );
      });
    });
  });
});
