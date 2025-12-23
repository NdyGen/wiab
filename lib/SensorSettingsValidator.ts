/**
 * SensorSettingsValidator - Shared validation utilities for sensor configurations
 *
 * This module provides reusable validation functions for sensor settings across
 * all WIAB drivers. It extracts common validation logic to ensure consistent
 * behavior and reduce code duplication.
 *
 * @module SensorSettingsValidator
 */

import { SensorConfig } from './types';

/**
 * Logger interface for validation error reporting
 */
interface Logger {
  error(...args: unknown[]): void;
}

/**
 * Validates and parses sensor settings from JSON string.
 *
 * This function provides forgiving validation - if parsing fails or the structure
 * is invalid, it returns an empty array rather than throwing an error. This ensures
 * the device continues to operate even with invalid configuration.
 *
 * **Validation Rules:**
 * - Empty or whitespace-only strings return empty array
 * - Invalid JSON returns empty array
 * - Non-array JSON returns empty array
 * - Valid JSON array is returned as SensorConfig[]
 *
 * **Error Handling:**
 * - All errors are logged if logger provided
 * - Function never throws - always returns valid SensorConfig[]
 *
 * @param {string} jsonString - JSON string containing sensor configuration array
 * @param {Logger} [logger] - Optional logger for error reporting
 * @returns {SensorConfig[]} Parsed sensor configuration array, or empty array on error
 *
 * @example
 * ```typescript
 * const valid = validateSensorSettings('[{"deviceId":"abc","capability":"alarm_motion"}]');
 * // Returns: [{ deviceId: 'abc', capability: 'alarm_motion' }]
 *
 * const invalid = validateSensorSettings('not json');
 * // Returns: []
 *
 * const empty = validateSensorSettings('');
 * // Returns: []
 * ```
 */
export function validateSensorSettings(
  jsonString: string,
  logger?: Logger
): SensorConfig[] {
  try {
    // Handle empty or whitespace-only input
    if (!jsonString || jsonString.trim() === '') {
      return [];
    }

    // Parse JSON
    const parsed = JSON.parse(jsonString);

    // Validate structure - must be an array
    if (!Array.isArray(parsed)) {
      if (logger) {
        logger.error('Sensor settings is not an array:', parsed);
      }
      return []; // Forgiving: return empty array instead of crashing
    }

    // Return typed result
    return parsed as SensorConfig[];
  } catch (error) {
    if (logger) {
      logger.error('Failed to parse sensor settings JSON:', error);
    }
    return []; // Forgiving: return empty array instead of crashing
  }
}

/**
 * Validates a numeric setting value against min/max constraints.
 *
 * This function ensures numeric settings are within acceptable ranges. If the
 * value is invalid (wrong type, NaN, out of range), it returns the default value.
 *
 * **Validation Rules:**
 * - Non-numeric values return default
 * - NaN values return default
 * - Values < min are clamped to min
 * - Values > max are clamped to max
 * - Valid values within range are returned as-is
 *
 * @param {unknown} value - The value to validate (typically from device settings)
 * @param {number} defaultValue - Default value if validation fails
 * @param {number} min - Minimum allowed value (inclusive)
 * @param {number} max - Maximum allowed value (inclusive)
 * @returns {number} Validated value, clamped to [min, max] or default
 *
 * @example
 * ```typescript
 * validateNumber(42, 10, 0, 100);  // Returns: 42 (valid, within range)
 * validateNumber(150, 10, 0, 100); // Returns: 100 (clamped to max)
 * validateNumber(-5, 10, 0, 100);  // Returns: 0 (clamped to min)
 * validateNumber('abc', 10, 0, 100); // Returns: 10 (invalid type, use default)
 * validateNumber(NaN, 10, 0, 100);   // Returns: 10 (NaN, use default)
 * ```
 */
export function validateNumber(
  value: unknown,
  defaultValue: number,
  min: number,
  max: number
): number {
  // Type check - must be a number
  if (typeof value !== 'number') {
    return defaultValue;
  }

  // NaN check
  if (Number.isNaN(value)) {
    return defaultValue;
  }

  // Range validation - clamp to [min, max]
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  // Valid value within range
  return value;
}

/**
 * Validates multiple numeric settings at once.
 *
 * Convenience function for validating multiple settings in a single call.
 * Each setting is validated independently using the same rules as validateNumber.
 *
 * @param {Record<string, unknown>} settings - Object containing setting values
 * @param {Record<string, { default: number; min: number; max: number }>} constraints - Validation constraints for each setting
 * @returns {Record<string, number>} Validated settings object
 *
 * @example
 * ```typescript
 * const validated = validateNumbers(
 *   { openDelay: 5, closeDelay: 200 },
 *   {
 *     openDelay: { default: 0, min: 0, max: 300 },
 *     closeDelay: { default: 0, min: 0, max: 300 }
 *   }
 * );
 * // Returns: { openDelay: 5, closeDelay: 200 }
 * ```
 */
export function validateNumbers(
  settings: Record<string, unknown>,
  constraints: Record<string, { default: number; min: number; max: number }>
): Record<string, number> {
  const validated: Record<string, number> = {};

  for (const [key, constraint] of Object.entries(constraints)) {
    validated[key] = validateNumber(
      settings[key],
      constraint.default,
      constraint.min,
      constraint.max
    );
  }

  return validated;
}
