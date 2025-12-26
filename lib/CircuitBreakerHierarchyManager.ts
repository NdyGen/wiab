/**
 * CircuitBreakerHierarchyManager - Manages circuit breaker parent-child relationships
 *
 * This class handles hierarchy queries and cycle detection for circuit breaker devices.
 * It provides methods to:
 * - Query children by parent ID
 * - Query parent chain for cycle detection
 * - Detect circular dependencies before they're created
 * - Get all descendants for dropdown filtering
 *
 * Uses HomeyAPI to query circuit breaker devices across the Homey system.
 * Implements defensive programming with graceful error handling.
 *
 * @example
 * ```typescript
 * const manager = new CircuitBreakerHierarchyManager(homeyApi, logger);
 * const wouldCycle = await manager.wouldCreateCycle('device-1', 'device-2');
 * if (wouldCycle) {
 *   throw new Error('Cannot set parent: would create circular dependency');
 * }
 * ```
 */

import { HomeyAPI, HomeyAPIDevice } from './types';
import { CircuitBreakerErrorId } from '../constants/errorIds';
import { ErrorReporter } from './ErrorReporter';
import { ErrorSeverity } from './ErrorTypes';

/**
 * Custom error class for circuit breaker cycle detection
 *
 * Provides type-safe cycle error detection without fragile string matching.
 */
class CircuitBreakerCycleError extends Error {
  constructor(message: string, public errorId: string) {
    super(message);
    this.name = 'CircuitBreakerCycleError';
  }
}

/**
 * Interface for logging instance
 */
interface Logger {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Extended HomeyAPIDevice with circuit breaker specific properties.
 *
 * Circuit breaker devices have:
 * - onoff capability for state
 * - settings.parentId for hierarchy
 * - driverId to identify circuit breakers
 */
interface CircuitBreakerDevice extends HomeyAPIDevice {
  settings: {
    parentId?: string | null;
  };
}

/**
 * CircuitBreakerHierarchyManager class for managing device hierarchy
 *
 * Handles all hierarchy-related queries and validations for circuit breaker devices.
 * Uses HomeyAPI to query devices and settings across the Homey system.
 *
 * @class CircuitBreakerHierarchyManager
 */
export class CircuitBreakerHierarchyManager {
  private homeyApi: HomeyAPI;
  private logger: Logger;

  /**
   * Circuit breaker driver ID for filtering devices
   */
  private static readonly DRIVER_ID = 'wiab-circuit-breaker';

  /**
   * Creates a new CircuitBreakerHierarchyManager instance.
   *
   * @param homeyApi - The HomeyAPI instance for device access
   * @param logger - Logger instance for logging operations
   *
   * @example
   * ```typescript
   * const manager = new CircuitBreakerHierarchyManager(app.homeyApi, app);
   * ```
   */
  constructor(homeyApi: HomeyAPI, logger: Logger) {
    this.homeyApi = homeyApi;
    this.logger = logger;
  }

  /**
   * Gets all circuit breaker devices from HomeyAPI.
   *
   * Filters devices to only include those with the circuit breaker driver ID.
   * Throws on error with user-friendly message.
   *
   * @returns Array of circuit breaker devices
   * @throws Error if device query fails
   *
   * @example
   * ```typescript
   * const devices = await manager.getAllCircuitBreakers();
   * ```
   */
  async getAllCircuitBreakers(): Promise<CircuitBreakerDevice[]> {
    try {
      // Validate preconditions inside try block for proper error reporting
      if (!this.homeyApi || !this.homeyApi.devices) {
        const errorReporter = new ErrorReporter(this.logger);
        throw new Error(errorReporter.reportAndGetMessage({
          errorId: CircuitBreakerErrorId.HIERARCHY_QUERY_FAILED,
          severity: ErrorSeverity.CRITICAL,
          userMessage: 'The app is still initializing. Wait and try again.',
          technicalMessage: 'HomeyAPI not properly initialized',
        }));
      }

      const allDevices = await this.homeyApi.devices.getDevices();
      const circuitBreakers: CircuitBreakerDevice[] = [];

      for (const [deviceId, device] of Object.entries(allDevices)) {
        const cbDevice = device as CircuitBreakerDevice;

        // Filter by driver ID
        if (cbDevice.driverId === CircuitBreakerHierarchyManager.DRIVER_ID) {
          // Ensure device has ID property
          cbDevice.id = deviceId;
          circuitBreakers.push(cbDevice);
        }
      }

      return circuitBreakers;
    } catch (error) {
      // Re-throw errors that already have proper error reporting
      if (error instanceof Error && error.message.includes('The app is still initializing')) {
        throw error;
      }

      const errorReporter = new ErrorReporter(this.logger);
      const message = errorReporter.reportAndGetMessage({
        errorId: CircuitBreakerErrorId.HIERARCHY_QUERY_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'Cannot fetch circuit breakers. Wait a moment and try again. If the problem persists, restart the app.',
        technicalMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(message);
    }
  }

  /**
   * Gets all children of a specific parent circuit breaker.
   *
   * Queries all circuit breaker devices and filters those with matching parentId.
   * Returns empty array if parent has no children. Throws on error.
   *
   * @param parentId - The device ID of the parent circuit breaker
   * @returns Array of child device IDs
   *
   * @example
   * ```typescript
   * const children = await manager.getChildren('parent-1');
   * // Returns: ['child-1', 'child-2']
   * ```
   */
  async getChildren(parentId: string): Promise<string[]> {
    try {
      // Validate preconditions inside try block for proper error reporting
      if (!this.homeyApi || !this.homeyApi.devices) {
        const errorReporter = new ErrorReporter(this.logger);
        throw new Error(errorReporter.reportAndGetMessage({
          errorId: CircuitBreakerErrorId.GET_CHILDREN_FAILED,
          severity: ErrorSeverity.CRITICAL,
          userMessage: 'The app is still initializing. Wait and try again.',
          technicalMessage: 'HomeyAPI not properly initialized',
        }));
      }

      const allDevices = await this.getAllCircuitBreakers();
      const children: string[] = [];

      for (const device of allDevices) {
        const deviceParentId = device.settings?.parentId;

        // Check if this device has the specified parent
        if (deviceParentId === parentId && device.id) {
          children.push(device.id);
        }
      }

      this.logger.log(
        `[HIERARCHY] Found ${children.length} children for parent ${parentId}`
      );

      return children;
    } catch (error) {
      // Re-throw errors that already have proper error reporting
      if (error instanceof Error && error.message.includes('The app is still initializing')) {
        throw error;
      }

      const errorReporter = new ErrorReporter(this.logger);
      const message = errorReporter.reportAndGetMessage({
        errorId: CircuitBreakerErrorId.GET_CHILDREN_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'Cannot fetch child circuit breakers. Wait a moment and try again. If the problem persists, restart the app.',
        technicalMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(message);
    }
  }

  /**
   * Gets the parent chain for a device.
   *
   * Traverses up the hierarchy from the device to the root, collecting all parent IDs.
   * Stops at root devices (parentId = null) or if cycle is detected.
   * Returns empty array if device has no parent. Throws on error.
   *
   * @param deviceId - The device ID to get parent chain for
   * @returns Array of parent device IDs from immediate parent to root
   *
   * @example
   * ```typescript
   * const chain = await manager.getParentChain('child-1');
   * // Returns: ['parent-1', 'grandparent-1'] (immediate parent first)
   * ```
   */
  async getParentChain(deviceId: string): Promise<string[]> {
    try {
      // Validate preconditions inside try block for proper error reporting
      if (!this.homeyApi || !this.homeyApi.devices) {
        const errorReporter = new ErrorReporter(this.logger);
        throw new Error(errorReporter.reportAndGetMessage({
          errorId: CircuitBreakerErrorId.HIERARCHY_QUERY_FAILED,
          severity: ErrorSeverity.CRITICAL,
          userMessage: 'The app is still initializing. Wait and try again.',
          technicalMessage: 'HomeyAPI not properly initialized',
        }));
      }

      const allDevices = await this.getAllCircuitBreakers();
      const deviceMap = this.buildDeviceMap(allDevices);

      const chain: string[] = [];
      const visited = new Set<string>([deviceId]);

      let currentId: string | null | undefined = deviceId;

      while (currentId) {
        const device = deviceMap.get(currentId);
        if (!device) {
          break;
        }

        const parentId = device.settings?.parentId;

        // Stop at root (null parent)
        if (!parentId) {
          break;
        }

        // Cycle detection - stop if we've seen this parent before
        if (visited.has(parentId)) {
          const errorReporter = new ErrorReporter(this.logger);
          const message = errorReporter.reportAndGetMessage({
            errorId: CircuitBreakerErrorId.CYCLE_DETECTED,
            severity: ErrorSeverity.CRITICAL,
            userMessage: 'Circuit breaker hierarchy is corrupted. Please contact support.',
            technicalMessage: `Cycle detected in parent chain for ${deviceId} at ${parentId}`,
          });
          throw new CircuitBreakerCycleError(message, CircuitBreakerErrorId.CYCLE_DETECTED);
        }

        chain.push(parentId);
        visited.add(parentId);
        currentId = parentId;
      }

      return chain;
    } catch (error) {
      // Re-throw cycle detection errors without wrapping
      if (error instanceof CircuitBreakerCycleError) {
        throw error;
      }

      // Re-throw critical errors without wrapping
      if (error instanceof Error &&
          error.message.includes('The app is still initializing')) {
        throw error;
      }

      const errorReporter = new ErrorReporter(this.logger);
      const message = errorReporter.reportAndGetMessage({
        errorId: CircuitBreakerErrorId.HIERARCHY_QUERY_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'Cannot fetch parent hierarchy. Wait a moment and try again. If the problem persists, restart the app.',
        technicalMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(message);
    }
  }

  /**
   * Checks if setting a parent would create a circular dependency.
   *
   * Performs cycle detection by:
   * 1. Checking if device would be its own parent (self-cycle)
   * 2. Checking if proposed parent is already a descendant of the device
   *
   * This prevents cycles like:
   * - A -> A (self-parent)
   * - A -> B -> A (direct cycle)
   * - A -> B -> C -> A (deep cycle)
   *
   * @param deviceId - The device that would have a new parent
   * @param proposedParentId - The proposed parent device ID
   * @returns true if setting parent would create a cycle, false otherwise
   *
   * @example
   * ```typescript
   * const wouldCycle = await manager.wouldCreateCycle('child-1', 'grandchild-1');
   * if (wouldCycle) {
   *   throw new Error('Cannot set parent: would create circular dependency');
   * }
   * ```
   */
  async wouldCreateCycle(deviceId: string, proposedParentId: string): Promise<boolean> {
    try {
      // Validate preconditions inside try block for proper error reporting
      if (!this.homeyApi || !this.homeyApi.devices) {
        const errorReporter = new ErrorReporter(this.logger);
        throw new Error(errorReporter.reportAndGetMessage({
          errorId: CircuitBreakerErrorId.PARENT_VALIDATION_FAILED,
          severity: ErrorSeverity.CRITICAL,
          userMessage: 'The app is still initializing. Wait and try again.',
          technicalMessage: 'HomeyAPI not properly initialized',
        }));
      }

      // Self-parent check
      if (deviceId === proposedParentId) {
        this.logger.log(
          `[CYCLE DETECTION] Device ${deviceId} cannot be its own parent`
        );
        return true;
      }

      // Get all descendants of the device
      const descendants = await this.getDescendants(deviceId);

      // Check if proposed parent is in descendants
      if (descendants.includes(proposedParentId)) {
        this.logger.log(
          `[CYCLE DETECTION] Proposed parent ${proposedParentId} is a descendant of ${deviceId}`
        );
        return true;
      }

      return false;
    } catch (error) {
      // Re-throw errors that already have proper error reporting
      if (error instanceof Error && error.message.includes('The app is still initializing')) {
        throw error;
      }

      const errorReporter = new ErrorReporter(this.logger);
      const message = errorReporter.reportAndGetMessage({
        errorId: CircuitBreakerErrorId.PARENT_VALIDATION_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'Cannot validate parent assignment. Wait a moment and try again. If the problem persists, restart the app.',
        technicalMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(message);
    }
  }

  /**
   * Gets all descendants of a device.
   *
   * Performs depth-first traversal to collect all children, grandchildren, etc.
   * Uses Set-based visited tracking to handle potential cycles gracefully.
   * Uses iterative approach with a stack for efficient traversal.
   * Returns empty array if device has no descendants. Throws on error.
   *
   * @param deviceId - The device ID to get descendants for
   * @returns Array of all descendant device IDs
   *
   * @example
   * ```typescript
   * const descendants = await manager.getDescendants('parent-1');
   * // Returns: ['child-1', 'child-2', 'grandchild-1']
   * ```
   */
  async getDescendants(deviceId: string): Promise<string[]> {
    try {
      // Validate preconditions inside try block for proper error reporting
      if (!this.homeyApi || !this.homeyApi.devices) {
        const errorReporter = new ErrorReporter(this.logger);
        throw new Error(errorReporter.reportAndGetMessage({
          errorId: CircuitBreakerErrorId.HIERARCHY_QUERY_FAILED,
          severity: ErrorSeverity.CRITICAL,
          userMessage: 'The app is still initializing. Wait and try again.',
          technicalMessage: 'HomeyAPI not properly initialized',
        }));
      }

      const allDevices = await this.getAllCircuitBreakers();
      const descendants: string[] = [];
      const visited = new Set<string>([deviceId]);

      // Use iterative approach with stack for depth-first traversal
      const stack: string[] = [deviceId];

      while (stack.length > 0) {
        const currentId = stack.pop()!;

        // Get children of current device
        const children = allDevices
          .filter(device =>
            device.settings?.parentId === currentId &&
            device.id &&
            !visited.has(device.id)
          )
          .map(device => device.id!);

        // Add children to descendants and stack
        for (const childId of children) {
          if (!visited.has(childId)) {
            descendants.push(childId);
            visited.add(childId);
            stack.push(childId);
          }
        }
      }

      return descendants;
    } catch (error) {
      // Re-throw errors that already have proper error reporting
      if (error instanceof Error && error.message.includes('The app is still initializing')) {
        throw error;
      }

      const errorReporter = new ErrorReporter(this.logger);
      const message = errorReporter.reportAndGetMessage({
        errorId: CircuitBreakerErrorId.HIERARCHY_QUERY_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'Cannot fetch circuit breaker hierarchy. Wait a moment and try again. If the problem persists, restart the app.',
        technicalMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(message);
    }
  }

  /**
   * Gets device information by ID.
   *
   * Retrieves a specific circuit breaker device from HomeyAPI.
   * Returns null if device not found or is not a circuit breaker.
   *
   * @param deviceId - The device ID to retrieve
   * @returns Device information or null if not found
   *
   * @example
   * ```typescript
   * const device = await manager.getDeviceById('device-1');
   * if (device) {
   *   console.log(`Device: ${device.name}, Parent: ${device.settings?.parentId}`);
   * }
   * ```
   */
  async getDeviceById(deviceId: string): Promise<CircuitBreakerDevice | null> {
    try {
      // Validate preconditions inside try block for proper error reporting
      if (!this.homeyApi || !this.homeyApi.devices) {
        const errorReporter = new ErrorReporter(this.logger);
        throw new Error(errorReporter.reportAndGetMessage({
          errorId: CircuitBreakerErrorId.HIERARCHY_QUERY_FAILED,
          severity: ErrorSeverity.CRITICAL,
          userMessage: 'The app is still initializing. Wait and try again.',
          technicalMessage: 'HomeyAPI not properly initialized',
        }));
      }

      const allDevices = await this.getAllCircuitBreakers();

      for (const device of allDevices) {
        if (device.id === deviceId) {
          return device;
        }
      }

      this.logger.log(`[HIERARCHY] Device ${deviceId} not found or not a circuit breaker`);
      return null;
    } catch (error) {
      // Re-throw errors that already have proper error reporting
      if (error instanceof Error && error.message.includes('The app is still initializing')) {
        throw error;
      }

      const errorReporter = new ErrorReporter(this.logger);
      const message = errorReporter.reportAndGetMessage({
        errorId: CircuitBreakerErrorId.HIERARCHY_QUERY_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'Cannot fetch circuit breaker device. Wait a moment and try again. If the problem persists, restart the app.',
        technicalMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(message);
    }
  }

  /**
   * Builds a Map of device ID to device for efficient lookups.
   *
   * @param devices - Array of circuit breaker devices
   * @returns Map of device ID to device
   */
  private buildDeviceMap(devices: CircuitBreakerDevice[]): Map<string, CircuitBreakerDevice> {
    const map = new Map<string, CircuitBreakerDevice>();

    for (const device of devices) {
      if (device.id) {
        map.set(device.id, device);
      }
    }

    return map;
  }
}
