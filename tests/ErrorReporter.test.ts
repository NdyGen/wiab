import { ErrorReporter } from '../lib/ErrorReporter';
import { Logger, ErrorContext, ErrorSeverity } from '../lib/ErrorTypes';

describe('ErrorReporter', () => {
  let mockLogger: Logger;
  let errorReporter: ErrorReporter;

  beforeEach(() => {
    // Arrange: Create mock logger
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
    };

    errorReporter = new ErrorReporter(mockLogger);
  });

  describe('reportError', () => {
    it('should log error with correct format', () => {
      // Arrange
      const errorContext: ErrorContext = {
        errorId: 'TEST_001',
        severity: ErrorSeverity.HIGH,
        userMessage: 'User-friendly message',
        technicalMessage: 'Technical details for debugging',
      };

      // Act
      errorReporter.reportError(errorContext);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[TEST_001] [HIGH] Technical details for debugging'
      );
    });

    it('should include context in log message', () => {
      // Arrange
      const errorContext: ErrorContext = {
        errorId: 'TEST_002',
        severity: ErrorSeverity.CRITICAL,
        userMessage: 'Critical error',
        technicalMessage: 'System failure',
        context: { deviceId: 'abc123', retries: 3 },
      };

      // Act
      errorReporter.reportError(errorContext);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[TEST_002] [CRITICAL] System failure | Context: {"deviceId":"abc123","retries":3}')
      );
    });

    it('should use userMessage if technicalMessage not provided', () => {
      // Arrange
      const errorContext: ErrorContext = {
        errorId: 'TEST_003',
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'Something went wrong',
      };

      // Act
      errorReporter.reportError(errorContext);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[TEST_003] [MEDIUM] Something went wrong'
      );
    });

    it('should handle different severity levels', () => {
      // Arrange
      const severities: ErrorSeverity[] = [
        ErrorSeverity.CRITICAL,
        ErrorSeverity.HIGH,
        ErrorSeverity.MEDIUM,
        ErrorSeverity.LOW,
        ErrorSeverity.INFO,
      ];

      // Act & Assert
      severities.forEach((severity) => {
        const errorContext: ErrorContext = {
          errorId: `TEST_${severity}`,
          severity,
          userMessage: `Test ${severity}`,
        };

        errorReporter.reportError(errorContext);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining(`[${severity.toUpperCase()}]`)
        );
      });
    });

    it('should handle empty context', () => {
      // Arrange
      const errorContext: ErrorContext = {
        errorId: 'TEST_004',
        severity: ErrorSeverity.LOW,
        userMessage: 'Low priority error',
        context: {},
      };

      // Act
      errorReporter.reportError(errorContext);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[TEST_004] [LOW] Low priority error | Context: {}'
      );
    });
  });

  describe('reportAndGetMessage', () => {
    it('should report error and return user message', () => {
      // Arrange
      const errorContext: ErrorContext = {
        errorId: 'TEST_005',
        severity: ErrorSeverity.HIGH,
        userMessage: 'User-friendly error',
        technicalMessage: 'Technical details',
      };

      // Act
      const message = errorReporter.reportAndGetMessage(errorContext);

      // Assert
      expect(message).toBe('User-friendly error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getUserMessage', () => {
    describe('HomeyAPI errors', () => {
      it('should detect HomeyAPI not available error', () => {
        // Arrange
        const error = new Error('Homey API not available');

        // Act
        const message = errorReporter.getUserMessage(error, 'TEST_001');

        // Assert
        expect(message).toBe(
          'The app is still initializing. Please wait a moment and try again.'
        );
      });
    });

    describe('network and timeout errors', () => {
      it('should detect timeout error', () => {
        // Arrange
        const error = new Error('Request timeout');

        // Act
        const message = errorReporter.getUserMessage(error, 'TEST_002');

        // Assert
        expect(message).toBe(
          'Request timed out. Please check your network connection and try again.'
        );
      });

      it('should detect ETIMEDOUT error', () => {
        // Arrange
        const error = new Error('ETIMEDOUT: connection timed out');

        // Act
        const message = errorReporter.getUserMessage(error, 'TEST_003');

        // Assert
        expect(message).toContain('Request timed out');
      });

      it('should detect ECONNREFUSED error', () => {
        // Arrange
        const error = new Error('ECONNREFUSED: connection refused');

        // Act
        const message = errorReporter.getUserMessage(error, 'TEST_004');

        // Assert
        expect(message).toContain('Request timed out');
      });
    });

    describe('permission errors', () => {
      it('should detect permission denied error', () => {
        // Arrange
        const error = new Error('Permission denied');

        // Act
        const message = errorReporter.getUserMessage(error, 'TEST_005');

        // Assert
        expect(message).toBe(
          'Permission denied. Please check app permissions in Homey settings.'
        );
      });

      it('should detect unauthorized error', () => {
        // Arrange
        const error = new Error('Unauthorized access');

        // Act
        const message = errorReporter.getUserMessage(error, 'TEST_006');

        // Assert
        expect(message).toContain('Permission denied');
      });

      it('should detect forbidden error', () => {
        // Arrange
        const error = new Error('Forbidden: access denied');

        // Act
        const message = errorReporter.getUserMessage(error, 'TEST_007');

        // Assert
        expect(message).toContain('Permission denied');
      });
    });

    describe('zone-related errors', () => {
      it('should detect zone access error', () => {
        // Arrange
        const error = new Error('Cannot access zone information');

        // Act
        const message = errorReporter.getUserMessage(error, 'TEST_008');

        // Assert
        expect(message).toBe(
          'Cannot access device zones. Some devices may not display zone information.'
        );
      });
    });

    describe('JSON parsing errors', () => {
      it('should detect JSON parsing error', () => {
        // Arrange
        const error = new Error('Unexpected token in JSON');

        // Act
        const message = errorReporter.getUserMessage(error, 'TEST_009');

        // Assert
        expect(message).toBe(
          'Invalid configuration data. Please check device settings.'
        );
      });

      it('should detect parse error', () => {
        // Arrange
        const error = new Error('Failed to parse configuration');

        // Act
        const message = errorReporter.getUserMessage(error, 'TEST_010');

        // Assert
        expect(message).toContain('Invalid configuration data');
      });
    });

    describe('device not found errors', () => {
      it('should detect device not found error', () => {
        // Arrange
        const error = new Error('Device not found');

        // Act
        const message = errorReporter.getUserMessage(error, 'TEST_011');

        // Assert
        expect(message).toBe(
          'Configured device not found. Please check device configuration.'
        );
      });

      it('should detect generic not found error', () => {
        // Arrange
        const error = new Error('Resource not found');

        // Act
        const message = errorReporter.getUserMessage(error, 'TEST_012');

        // Assert
        expect(message).toContain('not found');
      });
    });

    describe('capability errors', () => {
      it('should detect capability error', () => {
        // Arrange
        const error = new Error('Capability alarm_contact not supported');

        // Act
        const message = errorReporter.getUserMessage(error, 'TEST_013');

        // Assert
        expect(message).toBe(
          'Device capability error. Please verify device compatibility.'
        );
      });
    });

    describe('fallback and edge cases', () => {
      it('should use default message for unknown error', () => {
        // Arrange
        const error = new Error('Unknown error type');
        const defaultMessage = 'Operation failed';

        // Act
        const message = errorReporter.getUserMessage(error, 'TEST_014', defaultMessage);

        // Assert
        expect(message).toBe('Operation failed: Unknown error type');
      });

      it('should handle non-Error objects', () => {
        // Arrange
        const error = 'string error';
        const defaultMessage = 'An error occurred';

        // Act
        const message = errorReporter.getUserMessage(error, 'TEST_015', defaultMessage);

        // Assert
        expect(message).toBe(defaultMessage);
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Non-Error object thrown'),
          error
        );
      });

      it('should use default when defaultMessage not provided', () => {
        // Arrange
        const error = 'not an error object';

        // Act
        const message = errorReporter.getUserMessage(error, 'TEST_016');

        // Assert
        expect(message).toBe('An error occurred');
      });

      it('should be case-insensitive in error detection', () => {
        // Arrange
        const error = new Error('TIMEOUT ERROR');

        // Act
        const message = errorReporter.getUserMessage(error, 'TEST_017');

        // Assert
        expect(message).toContain('timed out');
      });
    });
  });

  describe('createContext', () => {
    it('should create complete error context', () => {
      // Act
      const context = ErrorReporter.createContext(
        'TEST_100',
        ErrorSeverity.CRITICAL,
        'User message',
        'Technical message',
        { key: 'value' }
      );

      // Assert
      expect(context).toEqual({
        errorId: 'TEST_100',
        severity: ErrorSeverity.CRITICAL,
        userMessage: 'User message',
        technicalMessage: 'Technical message',
        context: { key: 'value' },
      });
    });

    it('should create context without optional fields', () => {
      // Act
      const context = ErrorReporter.createContext(
        'TEST_101',
        ErrorSeverity.LOW,
        'User message'
      );

      // Assert
      expect(context).toEqual({
        errorId: 'TEST_101',
        severity: ErrorSeverity.LOW,
        userMessage: 'User message',
        technicalMessage: undefined,
        context: undefined,
      });
    });

    it('should be a static method', () => {
      // Assert - can call without instance
      expect(typeof ErrorReporter.createContext).toBe('function');

      const context = ErrorReporter.createContext(
        'TEST_102',
        ErrorSeverity.INFO,
        'Static test'
      );

      expect(context.errorId).toBe('TEST_102');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete error reporting workflow', () => {
      // Arrange
      const context = ErrorReporter.createContext(
        'WORKFLOW_001',
        ErrorSeverity.HIGH,
        'User-facing error message',
        'Detailed technical information',
        { operation: 'fetchData', attempt: 3 }
      );

      // Act
      const userMessage = errorReporter.reportAndGetMessage(context);

      // Assert
      expect(userMessage).toBe('User-facing error message');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[WORKFLOW_001] [HIGH] Detailed technical information')
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('{"operation":"fetchData","attempt":3}')
      );
    });

    it('should classify error and report with custom context', () => {
      // Arrange
      const error = new Error('ETIMEDOUT: request timeout after 30s');
      const errorId = 'NETWORK_001';

      // Act
      const userMessage = errorReporter.getUserMessage(error, errorId);

      const context = ErrorReporter.createContext(
        errorId,
        ErrorSeverity.MEDIUM,
        userMessage,
        error.message,
        { url: 'https://api.example.com', timeout: 30000 }
      );

      errorReporter.reportError(context);

      // Assert
      expect(userMessage).toContain('timed out');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[NETWORK_001]')
      );
    });
  });
});
