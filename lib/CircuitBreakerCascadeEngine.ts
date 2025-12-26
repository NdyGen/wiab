/**
 * CircuitBreakerCascadeEngine - Manages state propagation through circuit breaker hierarchy
 *
 * This class handles cascading state changes from parent to children in the circuit breaker
 * hierarchy. It implements:
 * - Depth-first sequential traversal of the hierarchy
 * - Asynchronous state updates for child devices
 * - Best-effort error handling (log and continue)
 * - Result tracking (success/failed counts)
 *
 * Uses HomeyAPI to update child device states across the Homey system.
 * Implements defensive programming with graceful error handling.
 *
 * @example
 * ```typescript
 * const engine = new CircuitBreakerCascadeEngine(homeyApi, hierarchyManager, logger);
 * const result = await engine.cascadeStateChange('parent-1', true);
 * console.log(`Updated ${result.success} devices, ${result.failed} failed`);
 * ```
 */

import { HomeyAPI, CascadeResult, DeviceCascadeResult } from './types';
import { CircuitBreakerHierarchyManager } from './CircuitBreakerHierarchyManager';
import { CircuitBreakerErrorId } from '../constants/errorIds';
import { ErrorReporter } from './ErrorReporter';
import { ErrorSeverity } from './ErrorTypes';

/**
 * Interface for logging instance
 */
interface Logger {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Extended HomeyAPIDevice with setCapabilityValue method.
 *
 * Circuit breaker devices use setCapabilityValue to update their state.
 */
interface DeviceWithCapabilityUpdate {
  id?: string;
  name: string;
  setCapabilityValue?(capability: string, value: boolean): Promise<void>;
}

/**
 * CircuitBreakerCascadeEngine class for managing state propagation
 *
 * Handles cascading state changes through the circuit breaker hierarchy.
 * Uses depth-first sequential traversal to update all descendants.
 *
 * @class CircuitBreakerCascadeEngine
 */
export class CircuitBreakerCascadeEngine {
  private homeyApi: HomeyAPI;
  private hierarchyManager: CircuitBreakerHierarchyManager;
  private logger: Logger;

  /**
   * Capability name for circuit breaker on/off state
   */
  private static readonly ONOFF_CAPABILITY = 'onoff';

  /**
   * Creates a new CircuitBreakerCascadeEngine instance.
   *
   * @param homeyApi - The HomeyAPI instance for device access
   * @param hierarchyManager - Hierarchy manager for querying relationships
   * @param logger - Logger instance for logging operations
   *
   * @example
   * ```typescript
   * const engine = new CircuitBreakerCascadeEngine(
   *   app.homeyApi,
   *   hierarchyManager,
   *   app
   * );
   * ```
   */
  constructor(
    homeyApi: HomeyAPI,
    hierarchyManager: CircuitBreakerHierarchyManager,
    logger: Logger
  ) {
    this.homeyApi = homeyApi;
    this.hierarchyManager = hierarchyManager;
    this.logger = logger;
  }

  /**
   * Cascades a state change to all descendants of a device.
   *
   * Performs depth-first sequential traversal to update all children, grandchildren, etc.
   * Updates are performed sequentially (not in parallel) to avoid race conditions.
   * Updates descendants one at a time in sequence using await in a for loop.
   * Continues processing all descendants even if individual updates fail.
   *
   * @param deviceId - The device ID that changed state
   * @param newState - The new state to cascade (true = on, false = off)
   * @returns Result with success/failed counts and error details
   *
   * @example
   * ```typescript
   * const result = await engine.cascadeStateChange('parent-1', false);
   * if (result.failed > 0) {
   *   console.log('Some devices failed to update:', result.errors);
   * }
   * ```
   */
  async cascadeStateChange(deviceId: string, newState: boolean): Promise<CascadeResult> {
    this.logger.log(
      `[CASCADE] Starting cascade from ${deviceId} with state=${newState}`
    );

    // Validate preconditions
    if (!this.hierarchyManager) {
      throw new Error('HierarchyManager not initialized');
    }

    const result: CascadeResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    try {
      // Get all descendants
      const descendants = await this.hierarchyManager.getDescendants(deviceId);

      if (descendants.length === 0) {
        this.logger.log(`[CASCADE] No descendants found for ${deviceId}`);
        return result;
      }

      this.logger.log(
        `[CASCADE] Found ${descendants.length} descendants to update: ${descendants.join(', ')}`
      );

      // Update descendants sequentially
      for (const descendantId of descendants) {
        const updateResult = await this.updateDeviceState(descendantId, newState);

        if (updateResult.success) {
          result.success++;
        } else {
          result.failed++;
          result.errors.push(updateResult);
        }
      }

      this.logger.log(
        `[CASCADE] Cascade complete: ${result.success} succeeded, ${result.failed} failed`
      );
    } catch (error) {
      const errorReporter = new ErrorReporter(this.logger);
      const message = errorReporter.reportAndGetMessage({
        errorId: CircuitBreakerErrorId.CASCADE_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'Failed to cascade state change. Wait a moment and try again. If the problem persists, restart the app.',
        technicalMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(message);
    }

    return result;
  }

  /**
   * Updates the state of a single device.
   *
   * Retrieves device from HomeyAPI and updates its onoff capability.
   * Handles errors gracefully by logging and returning failure result.
   *
   * @param deviceId - The device ID to update
   * @param newState - The new state to set (true = on, false = off)
   * @returns Result indicating success or failure with error details
   *
   * @example
   * ```typescript
   * const result = await engine.updateDeviceState('child-1', false);
   * if (!result.success) {
   *   console.error('Update failed:', result.error);
   * }
   * ```
   */
  async updateDeviceState(deviceId: string, newState: boolean): Promise<DeviceCascadeResult> {
    try {
      this.logger.log(`[CASCADE] Updating device ${deviceId} to state=${newState}`);

      // Get device from HomeyAPI
      const allDevices = await this.homeyApi.devices.getDevices();
      const device = allDevices[deviceId] as DeviceWithCapabilityUpdate;

      if (!device) {
        const error = new Error(`Device ${deviceId} not found`);
        this.logger.error(
          `[${CircuitBreakerErrorId.CHILD_UPDATE_FAILED}] ${error.message}`
        );
        return {
          deviceId,
          success: false,
          error,
          notFound: true,
        };
      }

      // Update device state using setCapabilityValue
      if (device.setCapabilityValue) {
        await device.setCapabilityValue(
          CircuitBreakerCascadeEngine.ONOFF_CAPABILITY,
          newState
        );
      } else {
        const error = new Error(`Device ${deviceId} does not support setCapabilityValue`);
        this.logger.error(
          `[${CircuitBreakerErrorId.CHILD_UPDATE_FAILED}] ${error.message}`
        );
        return {
          deviceId,
          success: false,
          error,
        };
      }

      this.logger.log(
        `[CASCADE] Successfully updated device ${device.name} (${deviceId}) to ${newState}`
      );

      return {
        deviceId,
        success: true,
      };
    } catch (error) {
      // Check if this is a critical programming error that should bubble up
      const isCritical = error instanceof TypeError ||
                         error instanceof ReferenceError ||
                         (error instanceof Error && error.message.includes('platform'));

      if (isCritical) {
        this.logger.error(
          `[${CircuitBreakerErrorId.CASCADE_FAILED}] CRITICAL: Unexpected error in cascade logic:`,
          error
        );
        throw error;
      } else {
        // Expected errors - device not found, capability issues, etc.
        this.logger.error(
          `[${CircuitBreakerErrorId.CHILD_UPDATE_FAILED}] Device update failed:`,
          error
        );
        return {
          deviceId,
          success: false,
          error: error as Error,
        };
      }
    }
  }

  /**
   * Updates multiple devices in batch.
   *
   * Uses Promise.allSettled to update all devices, collecting results.
   * This allows partial success - some devices can fail while others succeed.
   *
   * @param deviceIds - Array of device IDs to update
   * @param newState - The new state to set for all devices
   * @returns Result with success/failed counts and error details
   *
   * @example
   * ```typescript
   * const result = await engine.updateMultipleDevices(['child-1', 'child-2'], false);
   * ```
   */
  async updateMultipleDevices(
    deviceIds: string[],
    newState: boolean
  ): Promise<CascadeResult> {
    this.logger.log(
      `[CASCADE] Batch updating ${deviceIds.length} devices to state=${newState}`
    );

    const result: CascadeResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    // Update all devices using Promise.allSettled for partial success
    const updatePromises = deviceIds.map(deviceId =>
      this.updateDeviceState(deviceId, newState)
    );

    const results = await Promise.allSettled(updatePromises);

    // Process results
    for (const promiseResult of results) {
      if (promiseResult.status === 'fulfilled') {
        const updateResult = promiseResult.value;
        if (updateResult.success) {
          result.success++;
        } else {
          result.failed++;
          result.errors.push(updateResult);
        }
      } else {
        // Promise rejected (should not happen with proper error handling)
        result.failed++;
        this.logger.error(
          `[${CircuitBreakerErrorId.CASCADE_FAILED}] Promise rejected during batch update:`,
          promiseResult.reason
        );
      }
    }

    this.logger.log(
      `[CASCADE] Batch update complete: ${result.success} succeeded, ${result.failed} failed`
    );

    return result;
  }
}
