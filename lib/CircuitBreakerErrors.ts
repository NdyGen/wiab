/**
 * Custom Error Classes for Circuit Breaker Operations
 *
 * Provides type-safe error handling for circuit breaker operations with
 * structured error information and context.
 *
 * Benefits:
 * - Type-safe error detection via `instanceof`
 * - Structured error context for debugging
 * - Better stack traces
 * - Works across module boundaries via `.name` property
 */

/**
 * Base error class for all circuit breaker errors.
 *
 * Extends the standard Error class with errorId and context properties
 * for structured error reporting.
 */
export class CircuitBreakerError extends Error {
  public readonly errorId: string;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, errorId: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.errorId = errorId;
    this.context = context;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, CircuitBreakerError.prototype);

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CircuitBreakerError);
    }
  }
}

/**
 * Error thrown when cascade operations fail partially or completely.
 *
 * Includes information about which devices succeeded and which failed,
 * enabling partial success reporting to users.
 */
export class CascadeError extends CircuitBreakerError {
  public readonly successCount: number;
  public readonly failedCount: number;
  public readonly cause?: Error;

  constructor(
    message: string,
    errorId: string,
    successCount: number,
    failedCount: number,
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    super(message, errorId, {
      ...context,
      successCount,
      failedCount,
      causeMessage: cause?.message,
    });

    this.name = 'CascadeError';
    this.successCount = successCount;
    this.failedCount = failedCount;
    this.cause = cause;

    Object.setPrototypeOf(this, CascadeError.prototype);
  }
}

/**
 * Error thrown when hierarchy queries or operations fail.
 *
 * Used for cycle detection, parent chain traversal, and descendant queries.
 */
export class HierarchyError extends CircuitBreakerError {
  public readonly deviceId: string;
  public readonly operation: 'getChildren' | 'getParents' | 'getDescendants' | 'detectCycle';
  public readonly cause?: Error;

  constructor(
    message: string,
    errorId: string,
    deviceId: string,
    operation: 'getChildren' | 'getParents' | 'getDescendants' | 'detectCycle',
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    super(message, errorId, {
      ...context,
      deviceId,
      operation,
      causeMessage: cause?.message,
    });

    this.name = 'HierarchyError';
    this.deviceId = deviceId;
    this.operation = operation;
    this.cause = cause;

    Object.setPrototypeOf(this, HierarchyError.prototype);
  }
}

/**
 * Error thrown for validation failures (settings, cycle detection).
 *
 * Distinguishable from operational errors via `.name` property,
 * preventing double error reporting.
 */
export class ValidationError extends CircuitBreakerError {
  public readonly field?: string;
  public readonly invalidValue?: unknown;

  constructor(
    message: string,
    errorId: string,
    field?: string,
    invalidValue?: unknown,
    context?: Record<string, unknown>
  ) {
    super(message, errorId, {
      ...context,
      field,
      invalidValue,
    });

    this.name = 'ValidationError';
    this.field = field;
    this.invalidValue = invalidValue;

    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Error thrown when a device cannot be found in HomeyAPI.
 *
 * Marked with `notFound: true` to enable special handling
 * (e.g., removing from cascade list, showing user-friendly message).
 */
export class DeviceNotFoundError extends CircuitBreakerError {
  public readonly deviceId: string;
  public readonly notFound = true as const;

  constructor(
    deviceId: string,
    errorId: string,
    context?: Record<string, unknown>
  ) {
    super(`Device ${deviceId} not found in HomeyAPI`, errorId, {
      ...context,
      deviceId,
    });

    this.name = 'DeviceNotFoundError';
    this.deviceId = deviceId;

    Object.setPrototypeOf(this, DeviceNotFoundError.prototype);
  }
}
