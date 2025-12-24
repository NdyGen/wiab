/**
 * ErrorClassifier - Categorizes errors and provides reason codes
 *
 * Classifies errors into categories (permanent, transient, timeout) to determine
 * appropriate recovery strategies. Provides specific reason codes for detailed
 * error tracking and user messaging.
 *
 * Used by devices to decide whether to retry operations, set warnings, or fail fast.
 *
 * @example
 * ```typescript
 * const classifier = new ErrorClassifier();
 * const category = classifier.classifyError(error);
 *
 * if (category === ErrorCategory.PERMANENT) {
 *   // Don't retry, set warning immediately
 *   await warningManager.setWarning(errorId, message);
 * } else {
 *   // Retry with backoff
 *   await retryManager.retryWithBackoff(operation);
 * }
 * ```
 */

import type { Logger } from './ErrorTypes';

/**
 * Error categories for recovery strategy selection
 */
export enum ErrorCategory {
  /** Error is permanent, retrying won't help */
  PERMANENT = 'PERMANENT',
  /** Error is transient, retrying may succeed */
  TRANSIENT = 'TRANSIENT',
  /** Operation timed out */
  TIMEOUT = 'TIMEOUT',
  /** Unknown error type */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Specific error reason codes for detailed tracking
 */
export enum ErrorReasonCode {
  // Configuration/Setup Errors (Permanent)
  /** Feature not supported by SDK or device */
  NOT_SUPPORTED = 'NOT_SUPPORTED',
  /** Invalid device class */
  DEVICE_CLASS_INVALID = 'DEVICE_CLASS_INVALID',
  /** Capability not found on device */
  CAPABILITY_NOT_FOUND = 'CAPABILITY_NOT_FOUND',
  /** Device not found in system */
  DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND',
  /** Zone not found in system */
  ZONE_NOT_FOUND = 'ZONE_NOT_FOUND',

  // Permission Errors (Permanent)
  /** Operation not permitted */
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  /** Authentication failed */
  UNAUTHORIZED = 'UNAUTHORIZED',

  // Transient Errors
  /** Network request failed */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** API temporarily unavailable */
  API_UNAVAILABLE = 'API_UNAVAILABLE',
  /** Resource temporarily busy */
  RESOURCE_BUSY = 'RESOURCE_BUSY',

  // Timeout Errors
  /** Operation exceeded timeout */
  OPERATION_TIMEOUT = 'OPERATION_TIMEOUT',

  // Unknown
  /** Unclassified error */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Error classification result
 */
export interface ErrorClassification {
  /** Error category */
  category: ErrorCategory;
  /** Specific reason code */
  reasonCode: ErrorReasonCode;
  /** Whether error is retryable */
  isRetryable: boolean;
  /** Human-readable explanation */
  explanation: string;
}

/**
 * ErrorClassifier - Analyzes errors and provides classification
 */
export class ErrorClassifier {
  private logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /**
   * Classifies an error into category and reason code.
   *
   * Analyzes error message and type to determine:
   * - Category (permanent, transient, timeout, unknown)
   * - Specific reason code
   * - Whether operation should be retried
   * - User-friendly explanation
   *
   * @param error - Error to classify
   * @returns ErrorClassification with category and metadata
   */
  public classifyError(error: Error | unknown): ErrorClassification {
    const errorMessage = this.extractErrorMessage(error);
    const lowerMessage = errorMessage.toLowerCase();

    // Check for permanent errors (user confirmed list in Phase 3)
    if (this.isPermanentError(error)) {
      return this.createPermanentClassification(lowerMessage);
    }

    // Check for timeout errors
    if (this.isTimeoutError(lowerMessage)) {
      return {
        category: ErrorCategory.TIMEOUT,
        reasonCode: ErrorReasonCode.OPERATION_TIMEOUT,
        isRetryable: true,
        explanation: 'Operation timed out - may succeed with retry',
      };
    }

    // Check for transient errors
    if (this.isTransientError(lowerMessage)) {
      return this.createTransientClassification(lowerMessage);
    }

    // Unknown error - treat as transient (safe default)
    this.logger?.log(`Unknown error type, treating as transient: ${errorMessage}`);
    return {
      category: ErrorCategory.UNKNOWN,
      reasonCode: ErrorReasonCode.UNKNOWN_ERROR,
      isRetryable: true,
      explanation: 'Unknown error - treating as transient',
    };
  }

  /**
   * Checks if error is permanent (shouldn't be retried).
   *
   * Permanent errors include:
   * - Feature not supported
   * - Invalid device class
   * - Capability not found
   * - Device not found
   * - Zone not found
   * - Permission denied
   * - Unauthorized
   *
   * Based on user confirmation in Phase 3, Question 4: Option C.
   *
   * @param error - Error to check
   * @returns True if error is permanent
   */
  public isPermanentError(error: Error | unknown): boolean {
    const message = this.extractErrorMessage(error).toLowerCase();

    const permanentPatterns = [
      'not supported',
      'unsupported',
      'device class',
      'capability not found',
      'device not found',
      'zone not found',
      'permission denied',
      'unauthorized',
      'forbidden',
      'invalid capability',
      'missing capability',
    ];

    return permanentPatterns.some((pattern) => message.includes(pattern));
  }

  /**
   * Gets user-friendly message for error classification.
   *
   * @param classification - Error classification
   * @returns User-friendly message
   */
  public getUserMessage(classification: ErrorClassification): string {
    switch (classification.reasonCode) {
      case ErrorReasonCode.NOT_SUPPORTED:
        return 'Feature not supported. Check device compatibility.';
      case ErrorReasonCode.DEVICE_CLASS_INVALID:
        return 'Invalid device configuration. Check device class.';
      case ErrorReasonCode.CAPABILITY_NOT_FOUND:
        return 'Device capability not available. Check device configuration.';
      case ErrorReasonCode.DEVICE_NOT_FOUND:
        return 'Device not found. Check if device still exists.';
      case ErrorReasonCode.ZONE_NOT_FOUND:
        return 'Zone not found. Check zone assignment.';
      case ErrorReasonCode.PERMISSION_DENIED:
        return 'Permission denied. Check app permissions.';
      case ErrorReasonCode.UNAUTHORIZED:
        return 'Authentication failed. Check app authorization.';
      case ErrorReasonCode.NETWORK_ERROR:
        return 'Network error. Check connectivity.';
      case ErrorReasonCode.API_UNAVAILABLE:
        return 'System temporarily unavailable. Will retry.';
      case ErrorReasonCode.RESOURCE_BUSY:
        return 'Resource busy. Will retry shortly.';
      case ErrorReasonCode.OPERATION_TIMEOUT:
        return 'Operation timed out. Will retry.';
      default:
        return 'Unexpected error occurred. Will retry.';
    }
  }

  /**
   * Gets technical message for error classification.
   *
   * @param classification - Error classification
   * @param originalError - Original error object
   * @returns Technical message for logging
   */
  public getTechnicalMessage(
    classification: ErrorClassification,
    originalError: Error | unknown
  ): string {
    const errorMessage = this.extractErrorMessage(originalError);
    return `[${classification.category}:${classification.reasonCode}] ${errorMessage}`;
  }

  private extractErrorMessage(error: Error | unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return String(error);
  }

  private isTimeoutError(message: string): boolean {
    const timeoutPatterns = ['timeout', 'timed out', 'time out', 'deadline exceeded'];
    return timeoutPatterns.some((pattern) => message.includes(pattern));
  }

  private isTransientError(message: string): boolean {
    const transientPatterns = [
      'network',
      'connection',
      'unavailable',
      'busy',
      'temporary',
      'retry',
      'econnrefused',
      'enotfound',
      'etimedout',
    ];
    return transientPatterns.some((pattern) => message.includes(pattern));
  }

  private createPermanentClassification(message: string): ErrorClassification {
    // Determine specific reason code
    let reasonCode = ErrorReasonCode.NOT_SUPPORTED;
    let explanation = 'Feature not supported';

    if (message.includes('not supported') || message.includes('unsupported')) {
      reasonCode = ErrorReasonCode.NOT_SUPPORTED;
      explanation = 'Feature not supported by device or SDK';
    } else if (message.includes('device class')) {
      reasonCode = ErrorReasonCode.DEVICE_CLASS_INVALID;
      explanation = 'Invalid device class configuration';
    } else if (message.includes('capability not found') || message.includes('missing capability')) {
      reasonCode = ErrorReasonCode.CAPABILITY_NOT_FOUND;
      explanation = 'Required capability not available on device';
    } else if (message.includes('device not found')) {
      reasonCode = ErrorReasonCode.DEVICE_NOT_FOUND;
      explanation = 'Device not found in system';
    } else if (message.includes('zone not found')) {
      reasonCode = ErrorReasonCode.ZONE_NOT_FOUND;
      explanation = 'Zone not found in system';
    } else if (message.includes('permission denied') || message.includes('forbidden')) {
      reasonCode = ErrorReasonCode.PERMISSION_DENIED;
      explanation = 'Operation not permitted';
    } else if (message.includes('unauthorized')) {
      reasonCode = ErrorReasonCode.UNAUTHORIZED;
      explanation = 'Authentication required or failed';
    }

    return {
      category: ErrorCategory.PERMANENT,
      reasonCode,
      isRetryable: false,
      explanation,
    };
  }

  private createTransientClassification(message: string): ErrorClassification {
    let reasonCode = ErrorReasonCode.NETWORK_ERROR;
    let explanation = 'Network error';

    if (
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    ) {
      reasonCode = ErrorReasonCode.NETWORK_ERROR;
      explanation = 'Network connectivity issue - retryable';
    } else if (message.includes('unavailable') || message.includes('api')) {
      reasonCode = ErrorReasonCode.API_UNAVAILABLE;
      explanation = 'API temporarily unavailable - retryable';
    } else if (message.includes('busy')) {
      reasonCode = ErrorReasonCode.RESOURCE_BUSY;
      explanation = 'Resource temporarily busy - retryable';
    }

    return {
      category: ErrorCategory.TRANSIENT,
      reasonCode,
      isRetryable: true,
      explanation,
    };
  }
}
