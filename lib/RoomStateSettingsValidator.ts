import type { RoomStateSettings } from './types';

/**
 * Validates and normalizes room state settings.
 *
 * This function provides runtime validation for RoomStateSettings,
 * ensuring all required fields are present and values are within
 * acceptable ranges.
 *
 * @param settings - Unknown settings object to validate
 * @returns Validated and normalized RoomStateSettings
 * @throws Error if validation fails with descriptive message
 *
 * @example
 * ```typescript
 * const settings = validateRoomStateSettings(this.getSettings());
 * ```
 */
export function validateRoomStateSettings(settings: unknown): RoomStateSettings {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('Settings must be an object');
  }

  const obj = settings as Partial<RoomStateSettings>;

  // Validate wiabDeviceId
  if (!obj.wiabDeviceId || typeof obj.wiabDeviceId !== 'string') {
    throw new Error('wiabDeviceId is required and must be a non-empty string');
  }
  if (obj.wiabDeviceId.trim() === '') {
    throw new Error('wiabDeviceId cannot be empty or whitespace');
  }

  // Validate idleTimeout
  const idleTimeout = obj.idleTimeout ?? 0;
  if (typeof idleTimeout !== 'number' || !Number.isFinite(idleTimeout)) {
    throw new Error('idleTimeout must be a finite number');
  }
  if (idleTimeout < 0) {
    throw new Error('idleTimeout cannot be negative (use 0 to disable)');
  }
  if (idleTimeout > 1440) {
    throw new Error('idleTimeout cannot exceed 1440 minutes (24 hours)');
  }

  // Validate occupiedTimeout
  const occupiedTimeout = obj.occupiedTimeout ?? 0;
  if (typeof occupiedTimeout !== 'number' || !Number.isFinite(occupiedTimeout)) {
    throw new Error('occupiedTimeout must be a finite number');
  }
  if (occupiedTimeout < 0) {
    throw new Error('occupiedTimeout cannot be negative (use 0 to disable)');
  }
  if (occupiedTimeout > 1440) {
    throw new Error('occupiedTimeout cannot exceed 1440 minutes (24 hours)');
  }

  return {
    wiabDeviceId: obj.wiabDeviceId.trim(),
    idleTimeout,
    occupiedTimeout,
  };
}
