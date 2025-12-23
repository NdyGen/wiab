/**
 * ErrorReporter - Structured logging with user-friendly messages
 *
 * Provides centralized error reporting that separates user-facing messages
 * from technical logging. Ensures consistent error ID usage and severity tracking.
 *
 * @example
 * ```typescript
 * const errorReporter = new ErrorReporter(logger);
 *
 * // Report an error with context
 * errorReporter.reportError({
 *   errorId: 'ZONE_SEAL_001',
 *   severity: ErrorSeverity.CRITICAL,
 *   userMessage: 'Failed to initialize sensors',
 *   technicalMessage: 'HomeyAPI not available during device initialization',
 *   context: { deviceId: device.getData().id }
 * });
 *
 * // Get user-friendly error message
 * const message = errorReporter.getUserMessage(error, 'ZONE_SEAL_002');
 * ```
 */

import { Logger, ErrorContext, ErrorSeverity } from './ErrorTypes';

export class ErrorReporter {
  private logger: Logger;

  /**
   * Creates a new ErrorReporter instance.
   *
   * @param logger - Logger for error reporting
   */
  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Reports an error with structured context.
   *
   * Logs the error with technical details and error ID for debugging,
   * while keeping user-friendly messages separate.
   *
   * @param errorContext - Error context with ID, severity, and messages
   *
   * @example
   * ```typescript
   * errorReporter.reportError({
   *   errorId: 'DEVICE_001',
   *   severity: ErrorSeverity.HIGH,
   *   userMessage: 'Cannot connect to sensors',
   *   technicalMessage: 'HomeyAPI.devices.getDevices() timeout after 30s',
   *   context: { retries: 3, lastAttempt: Date.now() }
   * });
   * ```
   */
  public reportError(errorContext: ErrorContext): void {
    const {
      errorId,
      severity,
      userMessage,
      technicalMessage,
      context,
    } = errorContext;

    // Build log message with error ID prefix
    const logMessage = technicalMessage || userMessage;
    const contextStr = context ? ` | Context: ${JSON.stringify(context)}` : '';

    this.logger.error(
      `[${errorId}] [${severity.toUpperCase()}] ${logMessage}${contextStr}`
    );
  }

  /**
   * Reports an error and returns the user-friendly message.
   *
   * Convenience method that reports the error and returns the user message
   * for immediate use (e.g., setting device warning or throwing).
   *
   * @param errorContext - Error context with ID, severity, and messages
   * @returns User-friendly error message
   *
   * @example
   * ```typescript
   * const userMessage = errorReporter.reportAndGetMessage({
   *   errorId: 'PAIRING_001',
   *   severity: ErrorSeverity.HIGH,
   *   userMessage: 'Cannot fetch contact sensors. Please try again.',
   *   technicalMessage: 'HomeyAPI not initialized'
   * });
   *
   * throw new Error(userMessage);
   * ```
   */
  public reportAndGetMessage(errorContext: ErrorContext): string {
    this.reportError(errorContext);
    return errorContext.userMessage;
  }

  /**
   * Gets a user-friendly error message from an Error object.
   *
   * Classifies common error types and returns appropriate user-facing messages.
   * Falls back to a generic message if error type is unknown.
   *
   * @param error - Error object to classify
   * @param errorId - Error ID for logging
   * @param defaultMessage - Default message if classification fails
   * @returns User-friendly error message
   *
   * @example
   * ```typescript
   * try {
   *   await homeyApi.devices.getDevices();
   * } catch (error) {
   *   const message = errorReporter.getUserMessage(
   *     error,
   *     'API_001',
   *     'Failed to fetch devices'
   *   );
   *   await device.setWarning(message);
   * }
   * ```
   */
  public getUserMessage(
    error: unknown,
    errorId: string,
    defaultMessage = 'An error occurred'
  ): string {
    if (!(error instanceof Error)) {
      this.logger.error(`[${errorId}] Non-Error object thrown:`, error);
      return defaultMessage;
    }

    const message = error.message.toLowerCase();

    // HomeyAPI not available
    if (message.includes('homey api not available')) {
      return 'The app is still initializing. Please wait a moment and try again.';
    }

    // Network/timeout errors
    if (
      message.includes('timeout') ||
      message.includes('etimedout') ||
      message.includes('econnrefused')
    ) {
      return 'Request timed out. Please check your network connection and try again.';
    }

    // Permission errors
    if (
      message.includes('permission') ||
      message.includes('unauthorized') ||
      message.includes('forbidden')
    ) {
      return 'Permission denied. Please check app permissions in Homey settings.';
    }

    // Zone-related errors
    if (message.includes('zone')) {
      return 'Cannot access device zones. Some devices may not display zone information.';
    }

    // JSON parsing errors
    if (message.includes('json') || message.includes('parse')) {
      return 'Invalid configuration data. Please check device settings.';
    }

    // Device not found
    if (message.includes('device not found') || message.includes('not found')) {
      return 'Configured device not found. Please check device configuration.';
    }

    // Capability errors
    if (message.includes('capability')) {
      return 'Device capability error. Please verify device compatibility.';
    }

    // Generic fallback with error message
    return `${defaultMessage}: ${error.message}`;
  }

  /**
   * Creates an error context object.
   *
   * Helper method for building ErrorContext objects with consistent structure.
   *
   * @param errorId - Error ID
   * @param severity - Error severity level
   * @param userMessage - User-friendly message
   * @param technicalMessage - Optional technical details
   * @param context - Optional additional context data
   * @returns Complete error context
   *
   * @example
   * ```typescript
   * const errorContext = ErrorReporter.createContext(
   *   'SENSOR_001',
   *   ErrorSeverity.CRITICAL,
   *   'Cannot connect to sensors',
   *   'makeCapabilityInstance not supported',
   *   { deviceId: 'abc123', capability: 'alarm_contact' }
   * );
   *
   * errorReporter.reportError(errorContext);
   * ```
   */
  public static createContext(
    errorId: string,
    severity: ErrorSeverity,
    userMessage: string,
    technicalMessage?: string,
    context?: Record<string, unknown>
  ): ErrorContext {
    return {
      errorId,
      severity,
      userMessage,
      technicalMessage,
      context,
    };
  }
}
