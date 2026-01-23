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

import { Logger, ErrorContext } from './ErrorTypes';
import { ErrorClassifier, ErrorCategory } from './ErrorClassifier';

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

    // Use ErrorClassifier for consistent error categorization
    const classifier = new ErrorClassifier(this.logger);
    const classification = classifier.classifyError(error);

    // Get user message from classifier
    const userMessage = classifier.getUserMessage(classification);

    // For unknown errors, include error message for debugging
    if (classification.category === ErrorCategory.UNKNOWN) {
      return `${defaultMessage}: ${error.message}`;
    }

    return userMessage;
  }
}
