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
  id?: string;
  driverId?: string;
  settings?: {
    parentId?: string | null;
  };
  capabilitiesObj: Record<string, { value: unknown }>;
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
   * Handles errors gracefully by logging and returning empty array.
   *
   * @returns Array of circuit breaker devices
   *
   * @example
   * ```typescript
   * const devices = await manager.getAllCircuitBreakers();
   * ```
   */
  async getAllCircuitBreakers(): Promise<CircuitBreakerDevice[]> {
    try {
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
      this.logger.error(
        `[${CircuitBreakerErrorId.HIERARCHY_QUERY_FAILED}] Failed to get circuit breaker devices:`,
        error
      );
      return [];
    }
  }

  /**
   * Gets all children of a specific parent circuit breaker.
   *
   * Queries all circuit breaker devices and filters those with matching parentId.
   * Returns empty array if parent has no children or on error.
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
      this.logger.error(
        `[${CircuitBreakerErrorId.GET_CHILDREN_FAILED}] Failed to get children for ${parentId}:`,
        error
      );
      return [];
    }
  }

  /**
   * Gets the parent chain for a device.
   *
   * Traverses up the hierarchy from the device to the root, collecting all parent IDs.
   * Stops at root devices (parentId = null) or if cycle is detected.
   * Returns empty array if device has no parent or on error.
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
          this.logger.error(
            `[${CircuitBreakerErrorId.CYCLE_DETECTED}] Cycle detected in parent chain for ${deviceId} at ${parentId}`
          );
          break;
        }

        chain.push(parentId);
        visited.add(parentId);
        currentId = parentId;
      }

      return chain;
    } catch (error) {
      this.logger.error(
        `[${CircuitBreakerErrorId.HIERARCHY_QUERY_FAILED}] Failed to get parent chain for ${deviceId}:`,
        error
      );
      return [];
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
      this.logger.error(
        `[${CircuitBreakerErrorId.PARENT_VALIDATION_FAILED}] Error checking cycle for ${deviceId} -> ${proposedParentId}:`,
        error
      );
      // Fail-safe: treat as would create cycle to prevent potential cycles
      return true;
    }
  }

  /**
   * Gets all descendants of a device.
   *
   * Performs depth-first traversal to collect all children, grandchildren, etc.
   * Uses Set-based visited tracking to handle potential cycles gracefully.
   * Returns empty array if device has no descendants or on error.
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
      this.logger.error(
        `[${CircuitBreakerErrorId.HIERARCHY_QUERY_FAILED}] Failed to get descendants for ${deviceId}:`,
        error
      );
      return [];
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
      const allDevices = await this.getAllCircuitBreakers();

      for (const device of allDevices) {
        if (device.id === deviceId) {
          return device;
        }
      }

      this.logger.log(`[HIERARCHY] Device ${deviceId} not found or not a circuit breaker`);
      return null;
    } catch (error) {
      this.logger.error(
        `[${CircuitBreakerErrorId.HIERARCHY_QUERY_FAILED}] Failed to get device ${deviceId}:`,
        error
      );
      return null;
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
