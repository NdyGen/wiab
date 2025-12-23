import {
  validateSensorSettings,
  validateNumber,
  validateNumbers
} from '../lib/SensorSettingsValidator';
import type { SensorConfig } from '../lib/types';

describe('SensorSettingsValidator', () => {
  describe('validateSensorSettings', () => {
    describe('valid JSON inputs', () => {
      it('should parse valid JSON array', () => {
        // Arrange
        const validJson = '[{"deviceId":"sensor1","capability":"alarm_contact"}]';

        // Act
        const result = validateSensorSettings(validJson);

        // Assert
        expect(result).toHaveLength(1);
        expect(result[0].deviceId).toBe('sensor1');
        expect(result[0].capability).toBe('alarm_contact');
      });

      it('should parse multiple sensors', () => {
        // Arrange
        const validJson = JSON.stringify([
          { deviceId: 'sensor1', capability: 'alarm_contact' },
          { deviceId: 'sensor2', capability: 'alarm_motion' },
          { deviceId: 'sensor3', capability: 'alarm_contact' }
        ]);

        // Act
        const result = validateSensorSettings(validJson);

        // Assert
        expect(result).toHaveLength(3);
        expect(result[0].deviceId).toBe('sensor1');
        expect(result[1].deviceId).toBe('sensor2');
        expect(result[2].deviceId).toBe('sensor3');
      });

      it('should parse sensors with optional deviceName', () => {
        // Arrange
        const validJson = JSON.stringify([
          { deviceId: 'sensor1', capability: 'alarm_contact', deviceName: 'Front Door' }
        ]);

        // Act
        const result = validateSensorSettings(validJson);

        // Assert
        expect(result).toHaveLength(1);
        expect(result[0].deviceName).toBe('Front Door');
      });

      it('should handle empty array', () => {
        // Arrange
        const validJson = '[]';

        // Act
        const result = validateSensorSettings(validJson);

        // Assert
        expect(result).toHaveLength(0);
        expect(Array.isArray(result)).toBe(true);
      });
    });

    describe('invalid JSON inputs', () => {
      it('should return empty array for invalid JSON syntax', () => {
        // Arrange
        const invalidJson = '{not valid json}';

        // Act
        const result = validateSensorSettings(invalidJson);

        // Assert
        expect(result).toHaveLength(0);
        expect(Array.isArray(result)).toBe(true);
      });

      it('should return empty array for malformed JSON', () => {
        // Arrange
        const invalidJson = '[{"deviceId":"sensor1",}]'; // Trailing comma

        // Act
        const result = validateSensorSettings(invalidJson);

        // Assert
        expect(result).toHaveLength(0);
      });

      it('should return empty array for incomplete JSON', () => {
        // Arrange
        const invalidJson = '[{"deviceId":"sensor1"'; // Missing closing brackets

        // Act
        const result = validateSensorSettings(invalidJson);

        // Assert
        expect(result).toHaveLength(0);
      });

      it('should return empty array for non-JSON string', () => {
        // Arrange
        const invalidJson = 'not json at all';

        // Act
        const result = validateSensorSettings(invalidJson);

        // Assert
        expect(result).toHaveLength(0);
      });
    });

    describe('empty and null inputs', () => {
      it('should return empty array for empty string', () => {
        // Arrange
        const emptyString = '';

        // Act
        const result = validateSensorSettings(emptyString);

        // Assert
        expect(result).toHaveLength(0);
        expect(Array.isArray(result)).toBe(true);
      });

      it('should return empty array for whitespace-only string', () => {
        // Arrange
        const whitespace = '   \n\t  ';

        // Act
        const result = validateSensorSettings(whitespace);

        // Assert
        expect(result).toHaveLength(0);
      });

      it('should return empty array for null-like string', () => {
        // Arrange
        const nullString = 'null';

        // Act
        const result = validateSensorSettings(nullString);

        // Assert
        expect(result).toHaveLength(0);
      });
    });

    describe('non-array JSON', () => {
      it('should return empty array for JSON object', () => {
        // Arrange
        const jsonObject = '{"deviceId":"sensor1","capability":"alarm_contact"}';

        // Act
        const result = validateSensorSettings(jsonObject);

        // Assert
        expect(result).toHaveLength(0);
      });

      it('should return empty array for JSON string', () => {
        // Arrange
        const jsonString = '"some string"';

        // Act
        const result = validateSensorSettings(jsonString);

        // Assert
        expect(result).toHaveLength(0);
      });

      it('should return empty array for JSON number', () => {
        // Arrange
        const jsonNumber = '42';

        // Act
        const result = validateSensorSettings(jsonNumber);

        // Assert
        expect(result).toHaveLength(0);
      });

      it('should return empty array for JSON boolean', () => {
        // Arrange
        const jsonBoolean = 'true';

        // Act
        const result = validateSensorSettings(jsonBoolean);

        // Assert
        expect(result).toHaveLength(0);
      });
    });

    describe('with logger', () => {
      it('should log error for invalid JSON', () => {
        // Arrange
        const invalidJson = '{invalid}';
        const mockLogger = {
          error: jest.fn()
        };

        // Act
        const result = validateSensorSettings(invalidJson, mockLogger);

        // Assert
        expect(result).toHaveLength(0);
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to parse sensor settings JSON:',
          expect.any(Error)
        );
      });

      it('should log error for non-array JSON', () => {
        // Arrange
        const jsonObject = '{"deviceId":"sensor1"}';
        const mockLogger = {
          error: jest.fn()
        };

        // Act
        const result = validateSensorSettings(jsonObject, mockLogger);

        // Assert
        expect(result).toHaveLength(0);
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Sensor settings is not an array:',
          expect.any(Object)
        );
      });

      it('should not log for valid JSON', () => {
        // Arrange
        const validJson = '[]';
        const mockLogger = {
          error: jest.fn()
        };

        // Act
        const result = validateSensorSettings(validJson, mockLogger);

        // Assert
        expect(result).toHaveLength(0);
        expect(mockLogger.error).not.toHaveBeenCalled();
      });

      it('should not log for empty string', () => {
        // Arrange
        const emptyString = '';
        const mockLogger = {
          error: jest.fn()
        };

        // Act
        const result = validateSensorSettings(emptyString, mockLogger);

        // Assert
        expect(result).toHaveLength(0);
        expect(mockLogger.error).not.toHaveBeenCalled();
      });

      it('should handle logger with missing error method', () => {
        // Arrange
        const validJson = '[]';
        const incompleteMockLogger = {} as unknown as { error(...args: unknown[]): void };

        // Act & Assert - should not throw
        expect(() => validateSensorSettings(validJson, incompleteMockLogger)).not.toThrow();
      });
    });

    describe('type safety', () => {
      it('should return SensorConfig array type', () => {
        // Arrange
        const validJson = '[{"deviceId":"sensor1","capability":"alarm_contact"}]';

        // Act
        const result: SensorConfig[] = validateSensorSettings(validJson);

        // Assert
        expect(result).toHaveLength(1);
        expect(result[0]).toHaveProperty('deviceId');
        expect(result[0]).toHaveProperty('capability');
      });
    });
  });

  describe('validateNumber', () => {
    describe('valid number inputs', () => {
      it('should return value when within range', () => {
        // Arrange
        const value = 50;
        const defaultValue = 10;
        const min = 0;
        const max = 100;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(50);
      });

      it('should return value at minimum boundary', () => {
        // Arrange
        const value = 0;
        const defaultValue = 10;
        const min = 0;
        const max = 100;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(0);
      });

      it('should return value at maximum boundary', () => {
        // Arrange
        const value = 100;
        const defaultValue = 10;
        const min = 0;
        const max = 100;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(100);
      });

      it('should handle negative values within range', () => {
        // Arrange
        const value = -50;
        const defaultValue = 0;
        const min = -100;
        const max = 0;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(-50);
      });

      it('should handle decimal values', () => {
        // Arrange
        const value = 3.14;
        const defaultValue = 1.0;
        const min = 0;
        const max = 10;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(3.14);
      });

      it('should handle zero value', () => {
        // Arrange
        const value = 0;
        const defaultValue = 10;
        const min = 0;
        const max = 100;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(0);
      });
    });

    describe('invalid type inputs', () => {
      it('should return default for string value', () => {
        // Arrange
        const value = '50' as unknown;
        const defaultValue = 10;
        const min = 0;
        const max = 100;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(10);
      });

      it('should return default for null value', () => {
        // Arrange
        const value = null as unknown;
        const defaultValue = 10;
        const min = 0;
        const max = 100;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(10);
      });

      it('should return default for undefined value', () => {
        // Arrange
        const value = undefined as unknown;
        const defaultValue = 10;
        const min = 0;
        const max = 100;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(10);
      });

      it('should return default for object value', () => {
        // Arrange
        const value = { num: 50 } as unknown;
        const defaultValue = 10;
        const min = 0;
        const max = 100;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(10);
      });

      it('should return default for array value', () => {
        // Arrange
        const value = [50] as unknown;
        const defaultValue = 10;
        const min = 0;
        const max = 100;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(10);
      });

      it('should return default for boolean value', () => {
        // Arrange
        const value = true as unknown;
        const defaultValue = 10;
        const min = 0;
        const max = 100;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(10);
      });
    });

    describe('NaN handling', () => {
      it('should return default for NaN value', () => {
        // Arrange
        const value = NaN;
        const defaultValue = 10;
        const min = 0;
        const max = 100;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(10);
      });

      it('should return default for NaN from calculation', () => {
        // Arrange
        const value = 0 / 0; // Results in NaN
        const defaultValue = 10;
        const min = 0;
        const max = 100;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(10);
      });
    });

    describe('clamping behavior', () => {
      it('should clamp value below minimum', () => {
        // Arrange
        const value = -10;
        const defaultValue = 10;
        const min = 0;
        const max = 100;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(0);
      });

      it('should clamp value above maximum', () => {
        // Arrange
        const value = 150;
        const defaultValue = 10;
        const min = 0;
        const max = 100;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(100);
      });

      it('should clamp negative value to negative minimum', () => {
        // Arrange
        const value = -200;
        const defaultValue = -50;
        const min = -100;
        const max = 0;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(-100);
      });

      it('should clamp to minimum when far below range', () => {
        // Arrange
        const value = -999999;
        const defaultValue = 10;
        const min = 0;
        const max = 100;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(0);
      });

      it('should clamp to maximum when far above range', () => {
        // Arrange
        const value = 999999;
        const defaultValue = 10;
        const min = 0;
        const max = 100;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(100);
      });
    });

    describe('edge cases', () => {
      it('should handle Infinity by clamping to max', () => {
        // Arrange
        const value = Infinity;
        const defaultValue = 10;
        const min = 0;
        const max = 100;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(100);
      });

      it('should handle negative Infinity by clamping to min', () => {
        // Arrange
        const value = -Infinity;
        const defaultValue = 10;
        const min = 0;
        const max = 100;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(0);
      });

      it('should handle min equal to max', () => {
        // Arrange
        const value = 50;
        const defaultValue = 10;
        const min = 10;
        const max = 10;

        // Act
        const result = validateNumber(value, defaultValue, min, max);

        // Assert
        expect(result).toBe(10);
      });
    });
  });

  describe('validateNumbers', () => {
    describe('batch validation', () => {
      it('should validate multiple settings', () => {
        // Arrange
        const settings = {
          openDelay: 5,
          closeDelay: 10,
          timeout: 30
        };
        const constraints = {
          openDelay: { default: 0, min: 0, max: 300 },
          closeDelay: { default: 0, min: 0, max: 300 },
          timeout: { default: 5, min: 5, max: 120 }
        };

        // Act
        const result = validateNumbers(settings, constraints);

        // Assert
        expect(result.openDelay).toBe(5);
        expect(result.closeDelay).toBe(10);
        expect(result.timeout).toBe(30);
      });

      it('should apply defaults for invalid values', () => {
        // Arrange
        const settings = {
          openDelay: 'invalid' as unknown,
          closeDelay: NaN,
          timeout: null as unknown
        };
        const constraints = {
          openDelay: { default: 0, min: 0, max: 300 },
          closeDelay: { default: 0, min: 0, max: 300 },
          timeout: { default: 5, min: 5, max: 120 }
        };

        // Act
        const result = validateNumbers(settings, constraints);

        // Assert
        expect(result.openDelay).toBe(0);
        expect(result.closeDelay).toBe(0);
        expect(result.timeout).toBe(5);
      });

      it('should clamp values outside range', () => {
        // Arrange
        const settings = {
          openDelay: -10,
          closeDelay: 500,
          timeout: 200
        };
        const constraints = {
          openDelay: { default: 0, min: 0, max: 300 },
          closeDelay: { default: 0, min: 0, max: 300 },
          timeout: { default: 5, min: 5, max: 120 }
        };

        // Act
        const result = validateNumbers(settings, constraints);

        // Assert
        expect(result.openDelay).toBe(0); // Clamped to min
        expect(result.closeDelay).toBe(300); // Clamped to max
        expect(result.timeout).toBe(120); // Clamped to max
      });

      it('should handle missing settings', () => {
        // Arrange
        const settings = {
          openDelay: 5
          // closeDelay and timeout missing
        };
        const constraints = {
          openDelay: { default: 0, min: 0, max: 300 },
          closeDelay: { default: 0, min: 0, max: 300 },
          timeout: { default: 5, min: 5, max: 120 }
        };

        // Act
        const result = validateNumbers(settings, constraints);

        // Assert
        expect(result.openDelay).toBe(5);
        expect(result.closeDelay).toBe(0); // Default
        expect(result.timeout).toBe(5); // Default
      });

      it('should handle empty settings object', () => {
        // Arrange
        const settings = {};
        const constraints = {
          openDelay: { default: 0, min: 0, max: 300 },
          closeDelay: { default: 0, min: 0, max: 300 }
        };

        // Act
        const result = validateNumbers(settings, constraints);

        // Assert
        expect(result.openDelay).toBe(0);
        expect(result.closeDelay).toBe(0);
      });

      it('should handle empty constraints object', () => {
        // Arrange
        const settings = {
          openDelay: 5,
          closeDelay: 10
        };
        const constraints = {};

        // Act
        const result = validateNumbers(settings, constraints);

        // Assert
        expect(Object.keys(result)).toHaveLength(0);
      });

      it('should return new object without mutating input', () => {
        // Arrange
        const settings = {
          openDelay: 5,
          closeDelay: 10
        };
        const constraints = {
          openDelay: { default: 0, min: 0, max: 300 },
          closeDelay: { default: 0, min: 0, max: 300 }
        };

        // Act
        const result = validateNumbers(settings, constraints);

        // Assert - result is different object
        expect(result).not.toBe(settings);
        expect(result.openDelay).toBe(5);
      });
    });

    describe('real-world scenarios', () => {
      it('should validate zone seal settings', () => {
        // Arrange
        const settings = {
          openDelaySeconds: 10,
          closeDelaySeconds: 5,
          staleContactMinutes: 30
        };
        const constraints = {
          openDelaySeconds: { default: 0, min: 0, max: 300 },
          closeDelaySeconds: { default: 0, min: 0, max: 300 },
          staleContactMinutes: { default: 15, min: 5, max: 120 }
        };

        // Act
        const result = validateNumbers(settings, constraints);

        // Assert
        expect(result.openDelaySeconds).toBe(10);
        expect(result.closeDelaySeconds).toBe(5);
        expect(result.staleContactMinutes).toBe(30);
      });

      it('should handle user input errors gracefully', () => {
        // Arrange - simulating corrupted settings
        const settings = {
          openDelaySeconds: '10' as unknown, // String instead of number
          closeDelaySeconds: undefined,
          staleContactMinutes: -999
        };
        const constraints = {
          openDelaySeconds: { default: 0, min: 0, max: 300 },
          closeDelaySeconds: { default: 0, min: 0, max: 300 },
          staleContactMinutes: { default: 15, min: 5, max: 120 }
        };

        // Act
        const result = validateNumbers(settings, constraints);

        // Assert - all values corrected
        expect(result.openDelaySeconds).toBe(0); // Default for invalid type
        expect(result.closeDelaySeconds).toBe(0); // Default for undefined
        expect(result.staleContactMinutes).toBe(5); // Clamped to min
      });
    });
  });
});
