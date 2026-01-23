/**
 * WarningManager - Device warning state management
 *
 * Manages warning state for Homey devices, providing a clean interface
 * for setting, clearing, and tracking warnings. Prevents redundant warning
 * updates and provides warning state queries.
 *
 * @example
 * ```typescript
 * const warningManager = new WarningManager(device, logger);
 *
 * // Set a warning
 * await warningManager.setWarning('DEVICE_001', 'Sensor monitoring failed');
 *
 * // Check if warning is active
 * if (warningManager.hasWarning()) {
 *   console.log('Active warning:', warningManager.getCurrentMessage());
 * }
 *
 * // Clear warning on successful operation
 * await warningManager.clearWarning();
 * ```
 */

import { Logger, WarningState } from './ErrorTypes';

/**
 * WarningStateError - Thrown when warning state operations fail
 *
 * Custom error type for warning state management failures. Preserves
 * context about the operation (set/clear) and error ID for tracking.
 */
export class WarningStateError extends Error {
  public readonly errorId: string | null;
  public readonly operation: 'set' | 'clear';
  public readonly cause?: Error;

  constructor(operation: 'set' | 'clear', errorId: string | null, cause?: Error) {
    const opName = operation === 'set' ? 'set warning' : 'clear warning';
    const idStr = errorId ? ` [${errorId}]` : '';
    super(`Failed to ${opName}${idStr}: ${cause?.message || 'Unknown error'}`);

    this.name = 'WarningStateError';
    this.errorId = errorId;
    this.operation = operation;
    this.cause = cause;

    Object.setPrototypeOf(this, WarningStateError.prototype);
  }
}

/**
 * Homey Device interface for warning methods
 */
export interface DeviceWithWarnings {
  setWarning(message: string | null): Promise<void>;
  unsetWarning(): Promise<void>;
}

export class WarningManager {
  private device: DeviceWithWarnings;
  private logger: Logger;
  private state: WarningState;

  /**
   * Creates a new WarningManager instance.
   *
   * @param device - Homey device with setWarning/unsetWarning methods
   * @param logger - Logger for warning state changes
   */
  constructor(device: DeviceWithWarnings, logger: Logger) {
    this.device = device;
    this.logger = logger;
    this.state = {
      isActive: false,
      message: null,
      setAt: null,
      errorId: null,
    };
  }

  /**
   * Sets a warning on the device.
   *
   * Displays a warning message on the device card in Homey UI. If a warning
   * is already active with the same message, this is a no-op to prevent
   * redundant API calls.
   *
   * State is only updated after successful device API call to prevent
   * state corruption on failure.
   *
   * @param errorId - Error ID for tracking
   * @param message - User-friendly warning message
   * @throws {WarningStateError} If device API call fails
   *
   * @example
   * ```typescript
   * try {
   *   await warningManager.setWarning('DEVICE_001', 'Cannot connect to sensors');
   * } catch (error) {
   *   this.error('Failed to set warning:', error);
   * }
   * ```
   */
  public async setWarning(errorId: string, message: string): Promise<void> {
    // Skip if same warning already active
    if (
      this.state.isActive &&
      this.state.message === message &&
      this.state.errorId === errorId
    ) {
      this.logger.log(
        `Warning already active: [${errorId}] ${message} - skipping redundant update`
      );
      return; // Already in correct state
    }

    try {
      await this.device.setWarning(message);

      // Only update state after successful API call
      this.state = {
        isActive: true,
        message,
        setAt: Date.now(),
        errorId,
      };

      this.logger.log(`Warning set: [${errorId}] ${message}`);
    } catch (error) {
      this.logger.error(`Failed to set warning [${errorId}]:`, error);
      // State remains unchanged on failure - prevents corruption
      throw new WarningStateError('set', errorId, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Clears the active warning.
   *
   * Removes the warning message from the device card in Homey UI. If no
   * warning is active, this is a no-op.
   *
   * State is only updated after successful device API call to prevent
   * state corruption on failure.
   *
   * @throws {WarningStateError} If device API call fails
   *
   * @example
   * ```typescript
   * try {
   *   await warningManager.clearWarning();
   * } catch (error) {
   *   this.error('Failed to clear warning:', error);
   * }
   * ```
   */
  public async clearWarning(): Promise<void> {
    if (!this.state.isActive) {
      this.logger.log('No active warning to clear - skipping');
      return; // Already in correct state
    }

    const previousErrorId = this.state.errorId;

    try {
      await this.device.unsetWarning();

      // Only update state after successful API call
      this.state = {
        isActive: false,
        message: null,
        setAt: null,
        errorId: null,
      };

      this.logger.log(`Warning cleared: [${previousErrorId}]`);
    } catch (error) {
      this.logger.error('Failed to clear warning:', error);
      // State remains unchanged on failure - prevents corruption
      throw new WarningStateError('clear', previousErrorId, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Checks if a warning is currently active.
   *
   * @returns True if warning is active
   *
   * @example
   * ```typescript
   * if (warningManager.hasWarning()) {
   *   console.log('Device has active warning');
   * }
   * ```
   */
  public hasWarning(): boolean {
    return this.state.isActive;
  }

  /**
   * Gets the current warning message.
   *
   * @returns Current warning message, or null if no warning active
   *
   * @example
   * ```typescript
   * const message = warningManager.getCurrentMessage();
   * if (message) {
   *   console.log('Current warning:', message);
   * }
   * ```
   */
  public getCurrentMessage(): string | null {
    return this.state.message;
  }
}
