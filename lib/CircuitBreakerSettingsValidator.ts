/**
 * CircuitBreakerSettingsValidator - Validates circuit breaker device settings
 *
 * This module provides validation for circuit breaker settings with:
 * - Parent ID validation
 * - Cycle detection to prevent circular dependencies
 * - Type safety and error handling
 *
 * Follows the "fail fast" principle - validates settings before they enter the system.
 */

import { CircuitBreakerSettings } from './types';
import { CircuitBreakerHierarchyManager } from './CircuitBreakerHierarchyManager';

/**
 * Validates circuit breaker settings.
 *
 * @param settings - Unknown settings object to validate
 * @param deviceId - ID of the device being configured
 * @param hierarchyManager - Manager for hierarchy queries (cycle detection)
 * @returns Validated and typed settings object
 * @throws Error if settings are invalid or would create a cycle
 *
 * @example
 * ```typescript
 * const settings = await validateCircuitBreakerSettings(
 *   rawSettings,
 *   'cb-123',
 *   hierarchyManager
 * );
 * ```
 */
export async function validateCircuitBreakerSettings(
  settings: unknown,
  deviceId: string,
  hierarchyManager: CircuitBreakerHierarchyManager
): Promise<CircuitBreakerSettings> {
  // Validate settings is an object
  if (!settings || typeof settings !== 'object') {
    throw new Error('Settings must be an object');
  }

  const settingsObj = settings as Record<string, unknown>;

  // Validate parentId field
  const parentId = settingsObj.parentId;

  if (parentId !== null && parentId !== undefined) {
    // Parent ID must be a string if provided
    if (typeof parentId !== 'string') {
      throw new Error('Parent ID must be a string or null');
    }

    // Parent ID must not be empty string
    if (parentId.trim() === '') {
      throw new Error('Parent ID cannot be an empty string');
    }

    // Check for cycle detection
    const wouldCreateCycle = await hierarchyManager.wouldCreateCycle(deviceId, parentId);
    if (wouldCreateCycle) {
      throw new Error('Cannot set parent: would create circular dependency');
    }
  }

  return {
    parentId: parentId === null || parentId === undefined ? null : String(parentId),
  };
}

/**
 * Validates circuit breaker settings synchronously (no cycle detection).
 *
 * Use this for initial validation before async hierarchy checks.
 * For complete validation including cycle detection, use validateCircuitBreakerSettings.
 *
 * @param settings - Unknown settings object to validate
 * @returns Validated and typed settings object
 * @throws Error if settings structure is invalid
 *
 * @example
 * ```typescript
 * const settings = validateCircuitBreakerSettingsSync(rawSettings);
 * ```
 */
export function validateCircuitBreakerSettingsSync(
  settings: unknown
): CircuitBreakerSettings {
  // Validate settings is an object
  if (!settings || typeof settings !== 'object') {
    throw new Error('Settings must be an object');
  }

  const settingsObj = settings as Record<string, unknown>;

  // Validate parentId field
  const parentId = settingsObj.parentId;

  if (parentId !== null && parentId !== undefined) {
    // Parent ID must be a string if provided
    if (typeof parentId !== 'string') {
      throw new Error('Parent ID must be a string or null');
    }

    // Parent ID must not be empty string
    if (parentId.trim() === '') {
      throw new Error('Parent ID cannot be an empty string');
    }
  }

  return {
    parentId: parentId === null || parentId === undefined ? null : String(parentId),
  };
}
