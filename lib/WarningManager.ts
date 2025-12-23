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
   * @param errorId - Error ID for tracking
   * @param message - User-friendly warning message
   * @returns Promise that resolves when warning is set
   *
   * @example
   * ```typescript
   * await warningManager.setWarning('DEVICE_001', 'Cannot connect to sensors');
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
      return;
    }

    try {
      await this.device.setWarning(message);

      this.state = {
        isActive: true,
        message,
        setAt: Date.now(),
        errorId,
      };

      this.logger.log(`Warning set: [${errorId}] ${message}`);
    } catch (error) {
      this.logger.error(`Failed to set warning [${errorId}]:`, error);
      // Don't throw - warning failure shouldn't break device operation
    }
  }

  /**
   * Clears the active warning.
   *
   * Removes the warning message from the device card in Homey UI. If no
   * warning is active, this is a no-op.
   *
   * @returns Promise that resolves when warning is cleared
   *
   * @example
   * ```typescript
   * await warningManager.clearWarning();
   * ```
   */
  public async clearWarning(): Promise<void> {
    if (!this.state.isActive) {
      this.logger.log('No active warning to clear - skipping');
      return;
    }

    const previousErrorId = this.state.errorId;

    try {
      await this.device.unsetWarning();

      this.state = {
        isActive: false,
        message: null,
        setAt: null,
        errorId: null,
      };

      this.logger.log(`Warning cleared: [${previousErrorId}]`);
    } catch (error) {
      this.logger.error('Failed to clear warning:', error);
      // Don't throw - warning failure shouldn't break device operation
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

  /**
   * Gets the current error ID.
   *
   * @returns Current error ID, or null if no warning active
   *
   * @example
   * ```typescript
   * const errorId = warningManager.getCurrentErrorId();
   * if (errorId) {
   *   console.log('Warning error ID:', errorId);
   * }
   * ```
   */
  public getCurrentErrorId(): string | null {
    return this.state.errorId;
  }

  /**
   * Gets the complete warning state.
   *
   * Useful for debugging or persisting warning state.
   *
   * @returns Copy of current warning state
   *
   * @example
   * ```typescript
   * const state = warningManager.getState();
   * console.log('Warning active:', state.isActive);
   * console.log('Set at:', new Date(state.setAt));
   * ```
   */
  public getState(): WarningState {
    return { ...this.state };
  }
}
