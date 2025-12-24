import { ErrorClassifier, ErrorCategory, ErrorReasonCode } from '../lib/ErrorClassifier';
import { Logger } from '../lib/ErrorTypes';

describe('ErrorClassifier', () => {
  let mockLogger: Logger;
  let classifier: ErrorClassifier;

  beforeEach(() => {
    // Arrange: Create mock logger
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
    };

    classifier = new ErrorClassifier(mockLogger);
  });

  describe('classifyError', () => {
    describe('permanent errors', () => {
      it('should classify "not supported" as PERMANENT', () => {
        // Arrange
        const error = new Error('Feature not supported by device');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.PERMANENT);
        expect(result.reasonCode).toBe(ErrorReasonCode.NOT_SUPPORTED);
        expect(result.isRetryable).toBe(false);
      });

      it('should classify "device class" as PERMANENT', () => {
        // Arrange
        const error = new Error('Invalid device class');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.PERMANENT);
        expect(result.reasonCode).toBe(ErrorReasonCode.DEVICE_CLASS_INVALID);
        expect(result.isRetryable).toBe(false);
      });

      it('should classify "capability not found" as PERMANENT', () => {
        // Arrange
        const error = new Error('Capability not found on device');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.PERMANENT);
        expect(result.reasonCode).toBe(ErrorReasonCode.CAPABILITY_NOT_FOUND);
        expect(result.isRetryable).toBe(false);
      });

      it('should classify "device not found" as PERMANENT', () => {
        // Arrange
        const error = new Error('Device not found in system');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.PERMANENT);
        expect(result.reasonCode).toBe(ErrorReasonCode.DEVICE_NOT_FOUND);
        expect(result.isRetryable).toBe(false);
      });

      it('should classify "zone not found" as PERMANENT', () => {
        // Arrange
        const error = new Error('Zone not found');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.PERMANENT);
        expect(result.reasonCode).toBe(ErrorReasonCode.ZONE_NOT_FOUND);
        expect(result.isRetryable).toBe(false);
      });

      it('should classify "permission denied" as PERMANENT', () => {
        // Arrange
        const error = new Error('Permission denied for operation');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.PERMANENT);
        expect(result.reasonCode).toBe(ErrorReasonCode.PERMISSION_DENIED);
        expect(result.isRetryable).toBe(false);
      });

      it('should classify "unauthorized" as PERMANENT', () => {
        // Arrange
        const error = new Error('Unauthorized access');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.PERMANENT);
        expect(result.reasonCode).toBe(ErrorReasonCode.UNAUTHORIZED);
        expect(result.isRetryable).toBe(false);
      });

      it('should classify "forbidden" as PERMANENT', () => {
        // Arrange
        const error = new Error('Forbidden resource');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.PERMANENT);
        expect(result.reasonCode).toBe(ErrorReasonCode.PERMISSION_DENIED);
        expect(result.isRetryable).toBe(false);
      });
    });

    describe('timeout errors', () => {
      it('should classify "timeout" as TIMEOUT', () => {
        // Arrange
        const error = new Error('Operation timeout');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.TIMEOUT);
        expect(result.reasonCode).toBe(ErrorReasonCode.OPERATION_TIMEOUT);
        expect(result.isRetryable).toBe(true);
      });

      it('should classify "timed out" as TIMEOUT', () => {
        // Arrange
        const error = new Error('Request timed out');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.TIMEOUT);
        expect(result.reasonCode).toBe(ErrorReasonCode.OPERATION_TIMEOUT);
        expect(result.isRetryable).toBe(true);
      });

      it('should classify "deadline exceeded" as TIMEOUT', () => {
        // Arrange
        const error = new Error('Deadline exceeded');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.TIMEOUT);
        expect(result.reasonCode).toBe(ErrorReasonCode.OPERATION_TIMEOUT);
        expect(result.isRetryable).toBe(true);
      });
    });

    describe('transient errors', () => {
      it('should classify "network" as TRANSIENT', () => {
        // Arrange
        const error = new Error('Network connection failed');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.TRANSIENT);
        expect(result.reasonCode).toBe(ErrorReasonCode.NETWORK_ERROR);
        expect(result.isRetryable).toBe(true);
      });

      it('should classify "connection" as TRANSIENT', () => {
        // Arrange
        const error = new Error('Connection refused');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.TRANSIENT);
        expect(result.reasonCode).toBe(ErrorReasonCode.NETWORK_ERROR);
        expect(result.isRetryable).toBe(true);
      });

      it('should classify "unavailable" as TRANSIENT', () => {
        // Arrange
        const error = new Error('Service unavailable');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.TRANSIENT);
        expect(result.reasonCode).toBe(ErrorReasonCode.API_UNAVAILABLE);
        expect(result.isRetryable).toBe(true);
      });

      it('should classify "busy" as TRANSIENT', () => {
        // Arrange
        const error = new Error('Resource busy');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.TRANSIENT);
        expect(result.reasonCode).toBe(ErrorReasonCode.RESOURCE_BUSY);
        expect(result.isRetryable).toBe(true);
      });

      it('should classify "ECONNREFUSED" as TRANSIENT', () => {
        // Arrange
        const error = new Error('ECONNREFUSED: Connection refused');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.TRANSIENT);
        expect(result.reasonCode).toBe(ErrorReasonCode.NETWORK_ERROR);
        expect(result.isRetryable).toBe(true);
      });

      it('should classify "ENOTFOUND" as TRANSIENT', () => {
        // Arrange
        const error = new Error('ENOTFOUND: DNS lookup failed');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.TRANSIENT);
        expect(result.reasonCode).toBe(ErrorReasonCode.NETWORK_ERROR);
        expect(result.isRetryable).toBe(true);
      });
    });

    describe('unknown errors', () => {
      it('should classify unknown error as UNKNOWN', () => {
        // Arrange
        const error = new Error('Something unexpected happened');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.UNKNOWN);
        expect(result.reasonCode).toBe(ErrorReasonCode.UNKNOWN_ERROR);
        expect(result.isRetryable).toBe(true);
        expect(mockLogger.log).toHaveBeenCalledWith(
          expect.stringContaining('Unknown error type')
        );
      });

      it('should treat unknown errors as retryable (safe default)', () => {
        // Arrange
        const error = new Error('Weird edge case');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.isRetryable).toBe(true);
        expect(result.explanation).toContain('transient');
      });
    });

    describe('edge cases', () => {
      it('should handle string errors', () => {
        // Arrange
        const error = 'String error message';

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.UNKNOWN);
      });

      it('should handle null errors', () => {
        // Arrange
        const error = null;

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.UNKNOWN);
      });

      it('should handle undefined errors', () => {
        // Arrange
        const error = undefined;

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.UNKNOWN);
      });

      it('should handle object errors without message', () => {
        // Arrange
        const error = { code: 500 };

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.UNKNOWN);
      });

      it('should handle case-insensitive matching', () => {
        // Arrange
        const error = new Error('NOT SUPPORTED');

        // Act
        const result = classifier.classifyError(error);

        // Assert
        expect(result.category).toBe(ErrorCategory.PERMANENT);
        expect(result.reasonCode).toBe(ErrorReasonCode.NOT_SUPPORTED);
      });
    });
  });

  describe('isPermanentError', () => {
    it('should return true for permanent errors', () => {
      // Arrange
      const errors = [
        new Error('Feature not supported'),
        new Error('Device class invalid'),
        new Error('Capability not found'),
        new Error('Device not found'),
        new Error('Zone not found'),
        new Error('Permission denied'),
        new Error('Unauthorized'),
      ];

      // Act & Assert
      errors.forEach((error) => {
        expect(classifier.isPermanentError(error)).toBe(true);
      });
    });

    it('should return false for transient errors', () => {
      // Arrange
      const errors = [
        new Error('Network error'),
        new Error('Timeout'),
        new Error('Connection failed'),
      ];

      // Act & Assert
      errors.forEach((error) => {
        expect(classifier.isPermanentError(error)).toBe(false);
      });
    });

    it('should return false for unknown errors', () => {
      // Arrange
      const error = new Error('Unknown error');

      // Act
      const result = classifier.isPermanentError(error);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getUserMessage', () => {
    it('should return user-friendly messages for all reason codes', () => {
      // Arrange
      const testCases = [
        {
          reasonCode: ErrorReasonCode.NOT_SUPPORTED,
          expectedMessage: 'Feature not supported',
        },
        {
          reasonCode: ErrorReasonCode.DEVICE_CLASS_INVALID,
          expectedMessage: 'Invalid device configuration',
        },
        {
          reasonCode: ErrorReasonCode.CAPABILITY_NOT_FOUND,
          expectedMessage: 'Device capability not available',
        },
        {
          reasonCode: ErrorReasonCode.DEVICE_NOT_FOUND,
          expectedMessage: 'Device not found',
        },
        {
          reasonCode: ErrorReasonCode.ZONE_NOT_FOUND,
          expectedMessage: 'Zone not found',
        },
        {
          reasonCode: ErrorReasonCode.PERMISSION_DENIED,
          expectedMessage: 'Permission denied',
        },
        {
          reasonCode: ErrorReasonCode.UNAUTHORIZED,
          expectedMessage: 'Authentication failed',
        },
        {
          reasonCode: ErrorReasonCode.NETWORK_ERROR,
          expectedMessage: 'Network error',
        },
        {
          reasonCode: ErrorReasonCode.API_UNAVAILABLE,
          expectedMessage: 'System temporarily unavailable',
        },
        {
          reasonCode: ErrorReasonCode.RESOURCE_BUSY,
          expectedMessage: 'Resource busy',
        },
        {
          reasonCode: ErrorReasonCode.OPERATION_TIMEOUT,
          expectedMessage: 'Operation timed out',
        },
        {
          reasonCode: ErrorReasonCode.UNKNOWN_ERROR,
          expectedMessage: 'Unexpected error occurred',
        },
      ];

      // Act & Assert
      testCases.forEach(({ reasonCode, expectedMessage }) => {
        const classification = {
          reasonCode,
          category: ErrorCategory.UNKNOWN,
          isRetryable: true,
          explanation: '',
        };
        const message = classifier.getUserMessage(classification);
        expect(message).toContain(expectedMessage);
      });
    });
  });

  describe('getTechnicalMessage', () => {
    it('should format technical message with category and reason code', () => {
      // Arrange
      const error = new Error('Test error message');
      const classification = {
        category: ErrorCategory.PERMANENT,
        reasonCode: ErrorReasonCode.NOT_SUPPORTED,
        isRetryable: false,
        explanation: 'Not supported',
      };

      // Act
      const message = classifier.getTechnicalMessage(classification, error);

      // Assert
      expect(message).toBe('[PERMANENT:NOT_SUPPORTED] Test error message');
    });

    it('should handle string errors', () => {
      // Arrange
      const error = 'String error';
      const classification = {
        category: ErrorCategory.TRANSIENT,
        reasonCode: ErrorReasonCode.NETWORK_ERROR,
        isRetryable: true,
        explanation: 'Network error',
      };

      // Act
      const message = classifier.getTechnicalMessage(classification, error);

      // Assert
      expect(message).toBe('[TRANSIENT:NETWORK_ERROR] String error');
    });
  });
});
