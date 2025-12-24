/**
 * AsyncHelpers - Standardized utilities for fire-and-forget async operations
 *
 * Provides safe wrappers for async operations that should not block the caller
 * but need proper error handling. Prevents unhandled promise rejections while
 * integrating with the ErrorReporter system for structured logging.
 *
 * @example
 * ```typescript
 * // Fire-and-forget with ErrorReporter integration
 * executeAsync(
 *   async () => {
 *     await this.warningManager.clearWarning();
 *   },
 *   this.errorReporter,
 *   {
 *     errorId: ErrorIds.WARNING_CLEAR_FAILED,
 *     severity: ErrorSeverity.LOW,
 *     userMessage: 'Failed to clear device warning',
 *     operationName: 'clearWarning',
 *   }
 * );
 * ```
 */

import type { ErrorSeverity } from './ErrorTypes';
import type { ErrorReporter } from './ErrorReporter';

/**
 * Context for error reporting in async operations
 */
export interface AsyncErrorContext {
  /** Error identifier for tracking */
  errorId: string;
  /** Severity level for the error */
  severity: ErrorSeverity;
  /** User-friendly error message */
  userMessage: string;
  /** Operation name for technical logging */
  operationName: string;
  /** Additional context for debugging */
  context?: Record<string, unknown>;
}

/**
 * Executes an async operation in a fire-and-forget manner with ErrorReporter integration.
 *
 * Use this when:
 * - Operation should not block the caller
 * - Failures should be logged but not propagated
 * - You want structured error reporting
 *
 * @param operation - Async operation to execute
 * @param errorReporter - ErrorReporter instance for structured logging
 * @param errorContext - Context for error reporting
 *
 * @example
 * ```typescript
 * executeAsync(
 *   async () => {
 *     await someOperation();
 *   },
 *   this.errorReporter,
 *   {
 *     errorId: 'OPERATION_FAILED',
 *     severity: ErrorSeverity.MEDIUM,
 *     userMessage: 'Operation failed',
 *     operationName: 'someOperation',
 *   }
 * );
 * ```
 */
export function executeAsync(
  operation: () => Promise<void>,
  errorReporter: ErrorReporter,
  errorContext: AsyncErrorContext
): void {
  operation().catch((error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    errorReporter.reportError({
      errorId: errorContext.errorId,
      severity: errorContext.severity,
      userMessage: errorContext.userMessage,
      technicalMessage: `${errorContext.operationName} failed: ${err.message}\n${err.stack || 'No stack trace'}`,
      context: errorContext.context,
    });
  });
}

/**
 * Executes an async operation in a fire-and-forget manner with simple logging.
 *
 * Use this when:
 * - Operation should not block the caller
 * - You don't have an ErrorReporter instance
 * - Simple console logging is sufficient
 *
 * @param operation - Async operation to execute
 * @param logger - Logger with log() and error() methods
 * @param operationName - Name of operation for logging
 *
 * @example
 * ```typescript
 * executeAsyncWithLog(
 *   async () => {
 *     await someOperation();
 *   },
 *   this,
 *   'someOperation'
 * );
 * ```
 */
export function executeAsyncWithLog(
  operation: () => Promise<void>,
  logger: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
  operationName: string
): void {
  operation().catch((error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`${operationName} failed:`, err);
  });
}
