/**
 * CapabilityErrorTracker - Aggregates capability update errors for batch reporting
 *
 * Tracks results of multiple capability updates and determines appropriate
 * error severity based on failure patterns. Enables graceful degradation
 * where devices continue operating with partial functionality while clearly
 * reporting issues.
 *
 * Severity determination:
 * - CRITICAL: All capabilities failed (device non-functional)
 * - HIGH: Multiple capabilities failed (major degradation)
 * - MEDIUM: Single capability failed (minor feature unavailable)
 *
 * @example
 * ```typescript
 * const tracker = new CapabilityErrorTracker();
 *
 * for (const cap of capabilities) {
 *   try {
 *     await this.setCapabilityValue(cap, value);
 *     tracker.track(cap, true);
 *   } catch (error) {
 *     tracker.track(cap, false, error);
 *   }
 * }
 *
 * if (tracker.hasAnyFailures()) {
 *   tracker.reportToErrorReporter(
 *     this.errorReporter,
 *     'CAPABILITY_UPDATE_FAILED',
 *     this.getData().id
 *   );
 * }
 * ```
 */

import { ErrorSeverity } from './ErrorTypes';
import type { ErrorReporter } from './ErrorReporter';

/**
 * Result of a single capability update operation
 */
export interface CapabilityUpdateResult {
  /** Capability name (e.g., 'onoff', 'dim') */
  capability: string;
  /** Whether update succeeded */
  success: boolean;
  /** Error if update failed */
  error?: Error;
}

/**
 * CapabilityErrorTracker - Tracks and reports capability update failures
 */
export class CapabilityErrorTracker {
  private results: CapabilityUpdateResult[] = [];

  /**
   * Records the result of a capability update operation.
   *
   * @param capability - Capability name
   * @param success - Whether update succeeded
   * @param error - Error if update failed
   */
  public track(capability: string, success: boolean, error?: Error): void {
    this.results.push({
      capability,
      success,
      error,
    });
  }

  /**
   * Checks if any capability updates failed.
   *
   * @returns True if at least one update failed
   */
  public hasAnyFailures(): boolean {
    return this.results.some((r) => !r.success);
  }

  /**
   * Checks if all capability updates failed.
   *
   * @returns True if all updates failed
   */
  public hasAllFailures(): boolean {
    return this.results.length > 0 && this.results.every((r) => !r.success);
  }

  /**
   * Gets count of failed capability updates.
   *
   * @returns Number of failures
   */
  public getFailureCount(): number {
    return this.results.filter((r) => !r.success).length;
  }

  /**
   * Gets count of successful capability updates.
   *
   * @returns Number of successes
   */
  public getSuccessCount(): number {
    return this.results.filter((r) => r.success).length;
  }

  /**
   * Gets total count of tracked operations.
   *
   * @returns Total operation count
   */
  public getTotalCount(): number {
    return this.results.length;
  }

  /**
   * Gets list of failed capability names.
   *
   * @returns Array of capability names that failed
   */
  public getFailedCapabilities(): string[] {
    return this.results.filter((r) => !r.success).map((r) => r.capability);
  }

  /**
   * Gets list of successful capability names.
   *
   * @returns Array of capability names that succeeded
   */
  public getSuccessfulCapabilities(): string[] {
    return this.results.filter((r) => r.success).map((r) => r.capability);
  }

  /**
   * Determines appropriate error severity based on failure patterns.
   *
   * - CRITICAL: All capabilities failed (device non-functional)
   * - HIGH: Multiple capabilities failed (major degradation)
   * - MEDIUM: Single capability failed (minor feature unavailable)
   *
   * @returns Error severity level
   */
  public determineSeverity(): ErrorSeverity {
    if (this.hasAllFailures()) {
      return ErrorSeverity.CRITICAL;
    }
    if (this.getFailureCount() > 1) {
      return ErrorSeverity.HIGH;
    }
    return ErrorSeverity.MEDIUM;
  }

  /**
   * Reports aggregated errors to ErrorReporter with appropriate severity.
   *
   * Only reports if there are failures. Includes detailed context about
   * which capabilities succeeded/failed.
   *
   * @param errorReporter - ErrorReporter instance
   * @param errorId - Error identifier for tracking
   * @param deviceId - Device ID for context
   * @param additionalContext - Optional additional context
   */
  public reportToErrorReporter(
    errorReporter: ErrorReporter,
    errorId: string,
    deviceId: string,
    additionalContext?: Record<string, unknown>
  ): void {
    if (!this.hasAnyFailures()) {
      return;
    }

    const failedCaps = this.getFailedCapabilities();
    const successfulCaps = this.getSuccessfulCapabilities();
    const severity = this.determineSeverity();

    const userMessage = this.buildUserMessage(failedCaps, successfulCaps);
    const technicalMessage = this.buildTechnicalMessage(failedCaps, successfulCaps);

    errorReporter.reportError({
      errorId,
      severity,
      userMessage,
      technicalMessage,
      context: {
        deviceId,
        failedCapabilities: failedCaps,
        successfulCapabilities: successfulCaps,
        totalAttempts: this.getTotalCount(),
        failureCount: this.getFailureCount(),
        errors: this.results
          .filter((r) => !r.success && r.error)
          .map((r) => ({
            capability: r.capability,
            message: r.error?.message,
          })),
        ...additionalContext,
      },
    });
  }

  /**
   * Builds user-friendly error message.
   */
  private buildUserMessage(failedCaps: string[], successfulCaps: string[]): string {
    if (failedCaps.length === 1 && successfulCaps.length > 0) {
      return `Failed to update ${failedCaps[0]} capability. Other capabilities updated successfully.`;
    }
    if (failedCaps.length > 1 && successfulCaps.length > 0) {
      return `Failed to update ${failedCaps.length} capabilities (${failedCaps.join(', ')}). ${successfulCaps.length} capabilities updated successfully.`;
    }
    if (successfulCaps.length === 0) {
      return `Failed to update all capabilities. Device may not be functioning correctly.`;
    }
    return 'Capability update failed';
  }

  /**
   * Builds technical error message with full details.
   */
  private buildTechnicalMessage(failedCaps: string[], successfulCaps: string[]): string {
    const parts: string[] = [];

    parts.push(`Capability update results: ${this.getSuccessCount()}/${this.getTotalCount()} succeeded`);

    if (failedCaps.length > 0) {
      parts.push(`Failed: ${failedCaps.join(', ')}`);
    }

    if (successfulCaps.length > 0) {
      parts.push(`Succeeded: ${successfulCaps.join(', ')}`);
    }

    const errorDetails = this.results
      .filter((r) => !r.success && r.error)
      .map((r) => `  ${r.capability}: ${r.error?.message}`)
      .join('\n');

    if (errorDetails) {
      parts.push(`Error details:\n${errorDetails}`);
    }

    return parts.join('\n');
  }

  /**
   * Resets tracker state for reuse.
   */
  public reset(): void {
    this.results = [];
  }
}
