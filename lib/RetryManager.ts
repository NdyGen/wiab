/**
 * RetryManager - Exponential backoff retry orchestration
 *
 * Provides retry logic with exponential backoff for transient failures.
 * Useful for API initialization, network operations, and other recoverable errors.
 *
 * @example
 * ```typescript
 * const retryManager = new RetryManager(logger);
 * const result = await retryManager.retryWithBackoff(
 *   () => HomeyAPI.createAppAPI({ homey }),
 *   'Initialize HomeyAPI',
 *   { maxAttempts: 5, initialDelayMs: 2000 }
 * );
 *
 * if (result.success) {
 *   console.log('API initialized after', result.attempts, 'attempts');
 * } else {
 *   console.error('Failed after', result.attempts, 'attempts:', result.error);
 * }
 * ```
 */

import { Logger, RetryConfig, RetryResult, DEFAULT_RETRY_CONFIG } from './ErrorTypes';

export class RetryManager {
  private logger: Logger;

  /**
   * Creates a new RetryManager instance.
   *
   * @param logger - Logger for retry progress and errors
   */
  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Executes an operation with exponential backoff retry logic.
   *
   * Retries the operation up to maxAttempts times, waiting between attempts
   * with exponentially increasing delays. Useful for transient failures like
   * network errors or API initialization race conditions.
   *
   * @template T - Type of the operation result
   * @param operation - Async function to retry
   * @param operationName - Human-readable name for logging
   * @param config - Retry configuration (optional, uses defaults if not provided)
   * @returns RetryResult with success status, value/error, and metadata
   *
   * @example
   * ```typescript
   * const result = await retryManager.retryWithBackoff(
   *   () => api.fetchData(),
   *   'Fetch sensor data',
   *   { maxAttempts: 3 }
   * );
   * ```
   */
  public async retryWithBackoff<T>(
    operation: () => Promise<T>,
    operationName: string,
    config: Partial<RetryConfig> = {}
  ): Promise<RetryResult<T>> {
    const finalConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    const startTime = Date.now();
    let lastError: Error | undefined;
    let delayMs = finalConfig.initialDelayMs;

    for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
      try {
        this.logger.log(
          `${operationName} - attempt ${attempt}/${finalConfig.maxAttempts}`
        );

        const value = await operation();
        const totalDurationMs = Date.now() - startTime;

        this.logger.log(
          `${operationName} succeeded after ${attempt} attempt(s) in ${totalDurationMs}ms`
        );

        return {
          success: true,
          value,
          attempts: attempt,
          totalDurationMs,
        };
      } catch (error) {
        lastError = error as Error;

        this.logger.error(
          `${operationName} - attempt ${attempt} failed:`,
          error
        );

        // If we have more attempts, wait and retry
        if (attempt < finalConfig.maxAttempts) {
          this.logger.log(`Retrying in ${delayMs}ms...`);
          await this.sleep(delayMs);

          // Calculate next delay with exponential backoff
          delayMs = Math.min(
            delayMs * finalConfig.backoffMultiplier,
            finalConfig.maxDelayMs
          );
        }
      }
    }

    // All attempts exhausted
    const totalDurationMs = Date.now() - startTime;

    this.logger.error(
      `${operationName} failed after ${finalConfig.maxAttempts} attempts in ${totalDurationMs}ms`,
      lastError
    );

    return {
      success: false,
      error: lastError,
      attempts: finalConfig.maxAttempts,
      totalDurationMs,
    };
  }

  /**
   * Sleeps for specified milliseconds.
   *
   * @param ms - Milliseconds to sleep
   * @returns Promise that resolves after delay
   * @private
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Creates a retry configuration with custom values.
   *
   * Useful for creating reusable configurations for different retry scenarios.
   *
   * @param overrides - Partial configuration to override defaults
   * @returns Complete retry configuration
   *
   * @example
   * ```typescript
   * const fastRetry = RetryManager.createConfig({ maxAttempts: 5, initialDelayMs: 500 });
   * const slowRetry = RetryManager.createConfig({ maxAttempts: 3, initialDelayMs: 5000 });
   * ```
   */
  public static createConfig(overrides: Partial<RetryConfig>): RetryConfig {
    return { ...DEFAULT_RETRY_CONFIG, ...overrides };
  }
}
