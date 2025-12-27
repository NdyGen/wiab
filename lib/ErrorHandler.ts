/**
 * ErrorHandler - Centralized error handling for circuit breaker operations
 *
 * Provides helpers for robust error classification and custom error creation.
 * Replaces fragile string matching with ErrorClassifier reason codes and
 * custom error class detection via `.name` property.
 *
 * Benefits:
 * - Type-safe error detection using custom error classes
 * - Consistent error classification using ErrorClassifier
 * - Reusable patterns for common error scenarios
 * - Better error context and debugging
 *
 * @example
 * ```typescript
 * import { ErrorHandler } from './ErrorHandler';
 * import { CircuitBreakerErrorId } from '../constants/errorIds';
 *
 * try {
 *   await device.setWarning('message');
 * } catch (error) {
 *   if (ErrorHandler.isWarningApiError(error)) {
 *     // Expected warning API unavailable - log but don't escalate
 *   } else {
 *     // Unexpected error - needs investigation
 *   }
 * }
 * ```
 */

import { ErrorClassifier, ErrorReasonCode } from './ErrorClassifier';
import {
  CascadeError,
  HierarchyError,
  ValidationError,
  DeviceNotFoundError,
} from './CircuitBreakerErrors';

/**
 * ErrorHandler class providing centralized error handling utilities
 */
export class ErrorHandler {
  private static classifier = new ErrorClassifier();

  /**
   * Detects if error is from warning API being unavailable or not supported.
   *
   * Uses ErrorClassifier reason codes instead of fragile string matching.
   * Replaces pattern: error.message.toLowerCase().includes('warning')
   *
   * @param error - Error to check
   * @returns True if error is from warning API unavailability
   *
   * @example
   * ```typescript
   * try {
   *   await device.setWarning('message');
   * } catch (error) {
   *   if (ErrorHandler.isWarningApiError(error)) {
   *     // Expected - log but don't escalate
   *   }
   * }
   * ```
   */
  static isWarningApiError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const classification = this.classifier.classifyError(error);
    return classification.reasonCode === ErrorReasonCode.NOT_SUPPORTED;
  }

  /**
   * Detects if error is from flow card system being unavailable or disabled.
   *
   * Uses ErrorClassifier reason codes instead of fragile string matching.
   * Replaces pattern: error.message.toLowerCase().includes('trigger')
   *
   * @param error - Error to check
   * @returns True if error is from flow card unavailability
   *
   * @example
   * ```typescript
   * try {
   *   await flowCard.trigger(device, {}, {});
   * } catch (error) {
   *   if (ErrorHandler.isFlowCardError(error)) {
   *     // Expected - flow cards are non-critical
   *   }
   * }
   * ```
   */
  static isFlowCardError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const classification = this.classifier.classifyError(error);
    return classification.reasonCode === ErrorReasonCode.NOT_SUPPORTED;
  }

  /**
   * Detects if error indicates device not found in HomeyAPI.
   *
   * Uses custom error class detection via `.name` property.
   * More reliable than string matching across module boundaries.
   *
   * @param error - Error to check
   * @returns True if error is DeviceNotFoundError
   *
   * @example
   * ```typescript
   * const result = await updateDeviceState(deviceId, state);
   * if (!result.success && result.error) {
   *   if (ErrorHandler.isDeviceNotFound(result.error)) {
   *     // Device was deleted - remove from cascade list
   *   }
   * }
   * ```
   */
  static isDeviceNotFound(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    // Check custom error class name first (most reliable)
    if (error.name === 'DeviceNotFoundError') {
      return true;
    }

    // Fallback to DeviceNotFoundError instance check
    if (error instanceof DeviceNotFoundError) {
      return true;
    }

    // Additional check for notFound flag
    const errorWithFlag = error as { notFound?: boolean };
    return errorWithFlag.notFound === true;
  }

  /**
   * Creates a CascadeError with proper context.
   *
   * Helper for cascade operations that fail partially or completely.
   * Includes success/failed counts for partial success reporting.
   *
   * @param message - Error message
   * @param errorId - Circuit breaker error ID
   * @param successCount - Number of successful updates
   * @param failedCount - Number of failed updates
   * @param cause - Underlying error that caused the cascade failure
   * @param context - Additional context data
   * @returns CascadeError instance
   *
   * @example
   * ```typescript
   * throw ErrorHandler.createCascadeError(
   *   'Cascade failed for 3 devices',
   *   CircuitBreakerErrorId.CASCADE_FAILED,
   *   2, // success
   *   3, // failed
   *   originalError,
   *   { deviceId: 'parent-1' }
   * );
   * ```
   */
  static createCascadeError(
    message: string,
    errorId: string,
    successCount: number,
    failedCount: number,
    cause?: Error,
    context?: Record<string, unknown>
  ): CascadeError {
    return new CascadeError(message, errorId, successCount, failedCount, cause, context);
  }

  /**
   * Creates a HierarchyError with proper context.
   *
   * Helper for hierarchy query operations that fail.
   * Includes device ID and operation type for debugging.
   *
   * @param message - Error message
   * @param errorId - Circuit breaker error ID
   * @param deviceId - Device ID where hierarchy operation failed
   * @param operation - Type of hierarchy operation
   * @param cause - Underlying error that caused the failure
   * @param context - Additional context data
   * @returns HierarchyError instance
   *
   * @example
   * ```typescript
   * throw ErrorHandler.createHierarchyError(
   *   'Failed to get children',
   *   CircuitBreakerErrorId.GET_CHILDREN_FAILED,
   *   'parent-1',
   *   'getChildren',
   *   originalError
   * );
   * ```
   */
  static createHierarchyError(
    message: string,
    errorId: string,
    deviceId: string,
    operation: 'getChildren' | 'getParents' | 'getDescendants' | 'detectCycle',
    cause?: Error,
    context?: Record<string, unknown>
  ): HierarchyError {
    return new HierarchyError(message, errorId, deviceId, operation, cause, context);
  }

  /**
   * Creates a ValidationError with proper context.
   *
   * Helper for validation failures (settings, cycle detection).
   * Includes field name and invalid value for debugging.
   *
   * @param message - Error message
   * @param errorId - Circuit breaker error ID
   * @param field - Field name that failed validation
   * @param invalidValue - Invalid value that was rejected
   * @param context - Additional context data
   * @returns ValidationError instance
   *
   * @example
   * ```typescript
   * throw ErrorHandler.createValidationError(
   *   'Cycle detected in parent chain',
   *   CircuitBreakerErrorId.CYCLE_DETECTED,
   *   'parentId',
   *   'circuit-breaker-123'
   * );
   * ```
   */
  static createValidationError(
    message: string,
    errorId: string,
    field?: string,
    invalidValue?: unknown,
    context?: Record<string, unknown>
  ): ValidationError {
    return new ValidationError(message, errorId, field, invalidValue, context);
  }

  /**
   * Creates a DeviceNotFoundError with proper context.
   *
   * Helper for device lookup failures.
   * Includes deviceId and notFound flag for special handling.
   *
   * @param deviceId - Device ID that was not found
   * @param errorId - Circuit breaker error ID
   * @param context - Additional context data
   * @returns DeviceNotFoundError instance
   *
   * @example
   * ```typescript
   * if (!device) {
   *   throw ErrorHandler.createDeviceNotFoundError(
   *     'child-1',
   *     CircuitBreakerErrorId.CHILD_UPDATE_FAILED
   *   );
   * }
   * ```
   */
  static createDeviceNotFoundError(
    deviceId: string,
    errorId: string,
    context?: Record<string, unknown>
  ): DeviceNotFoundError {
    return new DeviceNotFoundError(deviceId, errorId, context);
  }
}
