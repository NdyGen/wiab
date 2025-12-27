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
import { DeviceNotFoundError, HierarchyError } from './CircuitBreakerErrors';

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
   * Performs depth-first traversal to update all children, grandchildren, etc.
   *
   * **Sequential Processing Rationale:**
   * Updates descendants one-at-a-time in series (not parallel) to ensure:
   * 1. State consistency - child devices see parent state before grandchildren update
   * 2. Error isolation - one failed device doesn't block others
   * 3. Resource management - prevents overwhelming HomeyAPI with concurrent writes
   * 4. Debugging - clear order of operations in logs
   *
   * Uses await in a for loop to process each device before moving to the next.
   * Result tracking continues even if individual devices fail (best-effort cascade).
   *
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
        return result;
      }

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
        `Cascade complete: ${result.success} succeeded, ${result.failed} failed`
      );
    } catch (error) {
      // Cascade operation threw unexpected exception during getDescendants
      // This is different from individual device update failures (tracked in result.errors)
      // Throw HierarchyError with proper context - caller will log this error
      throw new HierarchyError(
        `Cascade engine failed during getDescendants: ${error instanceof Error ? error.message : String(error)}`,
        CircuitBreakerErrorId.CASCADE_ENGINE_FAILED,
        deviceId,
        'getDescendants',
        error instanceof Error ? error : new Error(String(error)),
        { newState }
      );
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
      // Get device from HomeyAPI
      const allDevices = await this.homeyApi.devices.getDevices();
      const device = allDevices[deviceId] as DeviceWithCapabilityUpdate;

      if (!device) {
        const error = new DeviceNotFoundError(
          deviceId,
          CircuitBreakerErrorId.CHILD_UPDATE_FAILED
        );
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

      return {
        deviceId,
        success: true,
      };
    } catch (error) {
      // Distinguish between system-level failures and device-level failures
      // System failures (HomeyAPI unavailable) should propagate up to abort cascade
      // Device failures (setCapabilityValue errors) are logged and cascade continues
      //
      // NOTE: Uses error message pattern matching to classify errors. This is pragmatic
      // but could misclassify errors if messages don't match expected patterns.

      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();

        // Check for system-level failures that indicate HomeyAPI.devices.getDevices() failed
        // These are failures in retrieving the device list, not failures updating a specific device
        // Matches common HomeyAPI and network error patterns
        if (
          errorMsg.includes('homeyapi') ||
          errorMsg.includes('api.devices.getdevices') ||
          errorMsg.includes('econnrefused') ||
          errorMsg.includes('enotfound') ||
          (errorMsg.includes('getdevices') && errorMsg.includes('failed'))
        ) {
          // System-level error - throw to abort cascade
          throw new Error(
            `Cannot update devices: HomeyAPI unavailable (${error.message}). Wait and try again.`
          );
        }
      }

      // Device-level error - log and return failure result so cascade continues
      // This includes setCapabilityValue failures, capability not supported, device offline, etc.
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
