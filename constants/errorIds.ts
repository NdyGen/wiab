/**
 * Error ID constants for tracking and monitoring sensor-related errors.
 *
 * These IDs enable error aggregation, filtering, and analysis in logs.
 * Each error should be logged with its corresponding ID for traceability.
 *
 * @example
 * ```typescript
 * this.logger.error(
 *   `[${SensorMonitorErrorId.DEVICE_CACHE_LOAD_FAILED}] Failed to load device cache`,
 *   error
 * );
 * ```
 */
export enum SensorMonitorErrorId {
  /** Failed to load device cache from HomeyAPI */
  DEVICE_CACHE_LOAD_FAILED = 'SENSOR_MONITOR_001',

  /** Failed to check if sensor is stale at initialization */
  STALE_CHECK_FAILED = 'SENSOR_MONITOR_002',

  /** Failed to read sensor value */
  SENSOR_VALUE_READ_FAILED = 'SENSOR_MONITOR_003',

  /** Failed to setup capability listener */
  CAPABILITY_LISTENER_FAILED = 'SENSOR_MONITOR_004',

  /** Device reference not found in cache */
  DEVICE_NOT_FOUND = 'SENSOR_MONITOR_005',

  /** Capability not found on device */
  CAPABILITY_NOT_FOUND = 'SENSOR_MONITOR_006',
}
