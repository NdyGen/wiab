import { validateRoomStateSettings } from '../lib/RoomStateSettingsValidator';

describe('validateRoomStateSettings', () => {


  describe('valid inputs', () => {
    it('should accept valid settings with all fields', () => {
      // Arrange
      const settings = {
        wiabDeviceId: 'wiab-device-123',
        idleTimeout: 30,
        occupiedTimeout: 60,
      };

      // Act
      const result = validateRoomStateSettings(settings);

      // Assert
      expect(result).toEqual({
        wiabDeviceId: 'wiab-device-123',
        idleTimeout: 30,
        occupiedTimeout: 60,
      });
    });

    it('should trim whitespace from wiabDeviceId', () => {
      // Arrange
      const settings = {
        wiabDeviceId: '  wiab-device-123  ',
        idleTimeout: 0,
        occupiedTimeout: 0,
      };

      // Act
      const result = validateRoomStateSettings(settings);

      // Assert
      expect(result.wiabDeviceId).toBe('wiab-device-123');
    });

    it('should default missing idleTimeout to 0', () => {
      // Arrange
      const settings = {
        wiabDeviceId: 'wiab-device-123',
        occupiedTimeout: 60,
      };

      // Act
      const result = validateRoomStateSettings(settings);

      // Assert
      expect(result.idleTimeout).toBe(0);
    });

    it('should default missing occupiedTimeout to 0', () => {
      // Arrange
      const settings = {
        wiabDeviceId: 'wiab-device-123',
        idleTimeout: 30,
      };

      // Act
      const result = validateRoomStateSettings(settings);

      // Assert
      expect(result.occupiedTimeout).toBe(0);
    });

    it('should accept 0 timeout values (disabled)', () => {
      // Arrange
      const settings = {
        wiabDeviceId: 'wiab-device-123',
        idleTimeout: 0,
        occupiedTimeout: 0,
      };

      // Act
      const result = validateRoomStateSettings(settings);

      // Assert
      expect(result.idleTimeout).toBe(0);
      expect(result.occupiedTimeout).toBe(0);
    });

    it('should accept maximum timeout values (1440 minutes)', () => {
      // Arrange
      const settings = {
        wiabDeviceId: 'wiab-device-123',
        idleTimeout: 1440,
        occupiedTimeout: 1440,
      };

      // Act
      const result = validateRoomStateSettings(settings);

      // Assert
      expect(result.idleTimeout).toBe(1440);
      expect(result.occupiedTimeout).toBe(1440);
    });

    it('should accept typical timeout values', () => {
      // Arrange
      const settings = {
        wiabDeviceId: 'wiab-device-123',
        idleTimeout: 15,
        occupiedTimeout: 120,
      };

      // Act
      const result = validateRoomStateSettings(settings);

      // Assert
      expect(result.idleTimeout).toBe(15);
      expect(result.occupiedTimeout).toBe(120);
    });
  });

  describe('invalid settings object', () => {
    it('should throw error for null settings', () => {
      // Arrange & Act & Assert
      expect(() => validateRoomStateSettings(null)).toThrow('Settings must be an object');
    });

    it('should throw error for undefined settings', () => {
      // Arrange & Act & Assert
      expect(() => validateRoomStateSettings(undefined)).toThrow('Settings must be an object');
    });

    it('should throw error for string settings', () => {
      // Arrange & Act & Assert
      expect(() => validateRoomStateSettings('not an object')).toThrow('Settings must be an object');
    });

    it('should throw error for number settings', () => {
      // Arrange & Act & Assert
      expect(() => validateRoomStateSettings(123)).toThrow('Settings must be an object');
    });

    it('should throw error for array settings', () => {
      // Arrange & Act & Assert
      expect(() => validateRoomStateSettings([])).toThrow('Settings must be an object');
    });
  });

  describe('invalid wiabDeviceId', () => {
    it('should throw error for missing wiabDeviceId', () => {
      // Arrange
      const settings = {
        idleTimeout: 30,
        occupiedTimeout: 60,
      };

      // Act & Assert
      expect(() => validateRoomStateSettings(settings)).toThrow(
        'wiabDeviceId is required and must be a non-empty string'
      );
    });

    it('should throw error for null wiabDeviceId', () => {
      // Arrange
      const settings = {
        wiabDeviceId: null,
        idleTimeout: 30,
        occupiedTimeout: 60,
      };

      // Act & Assert
      expect(() => validateRoomStateSettings(settings)).toThrow(
        'wiabDeviceId is required and must be a non-empty string'
      );
    });

    it('should throw error for empty string wiabDeviceId', () => {
      // Arrange
      const settings = {
        wiabDeviceId: '',
        idleTimeout: 30,
        occupiedTimeout: 60,
      };

      // Act & Assert
      expect(() => validateRoomStateSettings(settings)).toThrow(
        'wiabDeviceId is required and must be a non-empty string'
      );
    });

    it('should throw error for whitespace-only wiabDeviceId', () => {
      // Arrange
      const settings = {
        wiabDeviceId: '   ',
        idleTimeout: 30,
        occupiedTimeout: 60,
      };

      // Act & Assert
      expect(() => validateRoomStateSettings(settings)).toThrow(
        'wiabDeviceId cannot be empty or whitespace'
      );
    });

    it('should throw error for number wiabDeviceId', () => {
      // Arrange
      const settings = {
        wiabDeviceId: 123,
        idleTimeout: 30,
        occupiedTimeout: 60,
      };

      // Act & Assert
      expect(() => validateRoomStateSettings(settings)).toThrow(
        'wiabDeviceId is required and must be a non-empty string'
      );
    });

    it('should throw error for object wiabDeviceId', () => {
      // Arrange
      const settings = {
        wiabDeviceId: { id: 'test' },
        idleTimeout: 30,
        occupiedTimeout: 60,
      };

      // Act & Assert
      expect(() => validateRoomStateSettings(settings)).toThrow(
        'wiabDeviceId is required and must be a non-empty string'
      );
    });
  });

  describe('invalid idleTimeout', () => {
    it('should throw error for string idleTimeout', () => {
      // Arrange
      const settings = {
        wiabDeviceId: 'wiab-device-123',
        idleTimeout: '30',
        occupiedTimeout: 60,
      };

      // Act & Assert
      expect(() => validateRoomStateSettings(settings)).toThrow(
        'idleTimeout must be a finite number'
      );
    });

    it('should throw error for NaN idleTimeout', () => {
      // Arrange
      const settings = {
        wiabDeviceId: 'wiab-device-123',
        idleTimeout: NaN,
        occupiedTimeout: 60,
      };

      // Act & Assert
      expect(() => validateRoomStateSettings(settings)).toThrow(
        'idleTimeout must be a finite number'
      );
    });

    it('should throw error for Infinity idleTimeout', () => {
      // Arrange
      const settings = {
        wiabDeviceId: 'wiab-device-123',
        idleTimeout: Infinity,
        occupiedTimeout: 60,
      };

      // Act & Assert
      expect(() => validateRoomStateSettings(settings)).toThrow(
        'idleTimeout must be a finite number'
      );
    });

    it('should throw error for negative idleTimeout', () => {
      // Arrange
      const settings = {
        wiabDeviceId: 'wiab-device-123',
        idleTimeout: -10,
        occupiedTimeout: 60,
      };

      // Act & Assert
      expect(() => validateRoomStateSettings(settings)).toThrow(
        'idleTimeout cannot be negative (use 0 to disable)'
      );
    });

    it('should throw error for idleTimeout > 1440', () => {
      // Arrange
      const settings = {
        wiabDeviceId: 'wiab-device-123',
        idleTimeout: 1441,
        occupiedTimeout: 60,
      };

      // Act & Assert
      expect(() => validateRoomStateSettings(settings)).toThrow(
        'idleTimeout cannot exceed 1440 minutes (24 hours)'
      );
    });
  });

  describe('invalid occupiedTimeout', () => {
    it('should throw error for string occupiedTimeout', () => {
      // Arrange
      const settings = {
        wiabDeviceId: 'wiab-device-123',
        idleTimeout: 30,
        occupiedTimeout: '60',
      };

      // Act & Assert
      expect(() => validateRoomStateSettings(settings)).toThrow(
        'occupiedTimeout must be a finite number'
      );
    });

    it('should throw error for NaN occupiedTimeout', () => {
      // Arrange
      const settings = {
        wiabDeviceId: 'wiab-device-123',
        idleTimeout: 30,
        occupiedTimeout: NaN,
      };

      // Act & Assert
      expect(() => validateRoomStateSettings(settings)).toThrow(
        'occupiedTimeout must be a finite number'
      );
    });

    it('should throw error for Infinity occupiedTimeout', () => {
      // Arrange
      const settings = {
        wiabDeviceId: 'wiab-device-123',
        idleTimeout: 30,
        occupiedTimeout: Infinity,
      };

      // Act & Assert
      expect(() => validateRoomStateSettings(settings)).toThrow(
        'occupiedTimeout must be a finite number'
      );
    });

    it('should throw error for negative occupiedTimeout', () => {
      // Arrange
      const settings = {
        wiabDeviceId: 'wiab-device-123',
        idleTimeout: 30,
        occupiedTimeout: -10,
      };

      // Act & Assert
      expect(() => validateRoomStateSettings(settings)).toThrow(
        'occupiedTimeout cannot be negative (use 0 to disable)'
      );
    });

    it('should throw error for occupiedTimeout > 1440', () => {
      // Arrange
      const settings = {
        wiabDeviceId: 'wiab-device-123',
        idleTimeout: 30,
        occupiedTimeout: 1441,
      };

      // Act & Assert
      expect(() => validateRoomStateSettings(settings)).toThrow(
        'occupiedTimeout cannot exceed 1440 minutes (24 hours)'
      );
    });
  });
});
