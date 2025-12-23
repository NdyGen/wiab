/**
 * ErrorTypes - Shared type definitions for error handling utilities
 *
 * Provides common interfaces and types used across error handling infrastructure.
 * This module serves as the foundation for all error handling utilities.
 */

/**
 * Logger interface compatible with Homey SDK logging
 */
export interface Logger {
  log(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds before first retry */
  initialDelayMs: number;
  /** Maximum delay in milliseconds between retries */
  maxDelayMs: number;
  /** Multiplier for exponential backoff (e.g., 2 = double delay each retry) */
  backoffMultiplier: number;
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** The result value if successful */
  value?: T;
  /** The error if unsuccessful */
  error?: Error;
  /** Number of attempts made */
  attempts: number;
  /** Total time spent retrying in milliseconds */
  totalDurationMs: number;
}

/**
 * Severity level for error reporting
 */
export enum ErrorSeverity {
  /** Critical error requiring immediate attention */
  CRITICAL = 'critical',
  /** High severity error affecting functionality */
  HIGH = 'high',
  /** Medium severity error with workarounds available */
  MEDIUM = 'medium',
  /** Low severity error or warning */
  LOW = 'low',
  /** Informational message */
  INFO = 'info',
}

/**
 * Error context for structured logging
 */
export interface ErrorContext {
  /** Error ID for tracking and filtering */
  errorId: string;
  /** Severity level */
  severity: ErrorSeverity;
  /** User-friendly error message */
  userMessage: string;
  /** Technical error message for logs */
  technicalMessage?: string;
  /** Additional context data */
  context?: Record<string, unknown>;
}

/**
 * Warning state for device warning management
 */
export interface WarningState {
  /** Whether a warning is currently active */
  isActive: boolean;
  /** Current warning message (null if no warning) */
  message: string | null;
  /** Timestamp when warning was set */
  setAt: number | null;
  /** Error ID associated with warning */
  errorId: string | null;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};
