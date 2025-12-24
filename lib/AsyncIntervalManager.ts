/**
 * AsyncIntervalManager - Safe async operation execution in intervals
 *
 * Manages setInterval callbacks that perform async operations, ensuring:
 * - Operations are queued and executed sequentially
 * - No overlapping async operations from same interval
 * - Proper error handling without crashing interval
 * - Cleanup on stop
 *
 * Addresses Issue #3: Async operations without await in polling intervals.
 *
 * @example
 * ```typescript
 * const manager = new AsyncIntervalManager(
 *   async () => {
 *     // Your async operation
 *     await updateZoneState();
 *   },
 *   5000, // 5 second interval
 *   logger
 * );
 *
 * manager.start();
 *
 * // Later, cleanup
 * manager.stop();
 * ```
 */

import type { Logger } from './ErrorTypes';

/**
 * Configuration for async interval manager
 */
export interface AsyncIntervalConfig {
  /** Async operation to execute */
  operation: () => Promise<void>;
  /** Interval in milliseconds */
  intervalMs: number;
  /** Logger for error reporting */
  logger: Logger;
  /** Error handler callback (optional) */
  onError?: (error: Error) => void;
  /** Success handler callback (optional) */
  onSuccess?: () => void;
  /** Operation name for logging */
  name?: string;
}

/**
 * AsyncIntervalManager - Queues async operations for interval execution
 *
 * Prevents race conditions by ensuring only one operation executes at a time.
 * If an operation is still running when the next interval fires, it's queued
 * instead of executing concurrently.
 */
export class AsyncIntervalManager {
  private config: AsyncIntervalConfig;
  private intervalHandle?: NodeJS.Timeout;
  private isProcessing = false;
  private queue: Array<() => Promise<void>> = [];
  private isRunning = false;

  constructor(config: AsyncIntervalConfig) {
    this.config = config;
  }

  /**
   * Starts the interval timer.
   *
   * Operations are queued and executed sequentially to prevent
   * overlapping async operations.
   */
  public start(): void {
    if (this.isRunning) {
      this.config.logger.log(
        `AsyncIntervalManager already running: ${this.config.name || 'unnamed'}`
      );
      return;
    }

    this.isRunning = true;
    this.config.logger.log(
      `Starting AsyncIntervalManager: ${this.config.name || 'unnamed'} (${this.config.intervalMs}ms)`
    );

    // Execute immediately on start
    this.queueOperation();

    // Then execute on interval
    this.intervalHandle = setInterval(() => {
      this.queueOperation();
    }, this.config.intervalMs);
  }

  /**
   * Stops the interval timer and clears queue.
   *
   * Waits for current operation to complete before stopping.
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.config.logger.log(
      `Stopping AsyncIntervalManager: ${this.config.name || 'unnamed'}`
    );

    // Clear interval
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }

    // Clear queue
    this.queue = [];
    this.isRunning = false;

    this.config.logger.log(
      `AsyncIntervalManager stopped: ${this.config.name || 'unnamed'}`
    );
  }

  /**
   * Checks if manager is currently running.
   *
   * @returns True if interval is active
   */
  public isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Gets number of queued operations.
   *
   * @returns Queue size
   */
  public getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Checks if an operation is currently processing.
   *
   * @returns True if operation is in progress
   */
  public isOperationInProgress(): boolean {
    return this.isProcessing;
  }

  /**
   * Queues an operation for execution.
   *
   * If no operation is currently running, starts processing immediately.
   * Otherwise, adds to queue.
   */
  private queueOperation(): void {
    this.queue.push(this.config.operation);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Processes queued operations sequentially.
   *
   * Executes operations one at a time, with error handling.
   * Continues processing until queue is empty.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const operation = this.queue.shift();
      if (!operation) {
        continue;
      }

      try {
        await operation();

        // Call success handler if provided
        if (this.config.onSuccess) {
          this.config.onSuccess();
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        this.config.logger.error(
          `AsyncIntervalManager operation failed: ${this.config.name || 'unnamed'}`,
          err
        );

        // Call error handler if provided
        if (this.config.onError) {
          try {
            this.config.onError(err);
          } catch (handlerError) {
            this.config.logger.error(
              `AsyncIntervalManager error handler failed: ${this.config.name || 'unnamed'}`,
              handlerError
            );
          }
        }
      }
    }

    this.isProcessing = false;
  }
}

/**
 * Creates an AsyncIntervalManager with simplified configuration.
 *
 * Convenience factory function for common use cases.
 *
 * @param operation - Async operation to execute
 * @param intervalMs - Interval in milliseconds
 * @param logger - Logger instance
 * @param name - Operation name for logging
 * @returns Configured AsyncIntervalManager
 */
export function createAsyncInterval(
  operation: () => Promise<void>,
  intervalMs: number,
  logger: Logger,
  name?: string
): AsyncIntervalManager {
  return new AsyncIntervalManager({
    operation,
    intervalMs,
    logger,
    name,
  });
}
