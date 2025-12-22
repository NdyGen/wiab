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

/**
 * Error ID constants for tracking and monitoring device-related errors.
 *
 * These IDs enable error aggregation, filtering, and analysis in logs.
 * Each error should be logged with its corresponding ID for traceability.
 *
 * @example
 * ```typescript
 * this.error(
 *   `[${DeviceErrorId.SENSOR_MONITORING_SETUP_FAILED}] Failed to setup sensor monitoring`,
 *   error
 * );
 * ```
 */
export enum DeviceErrorId {
  /** Failed to setup sensor monitoring during device initialization */
  SENSOR_MONITORING_SETUP_FAILED = 'DEVICE_001',

  /** Event handler failed to process door event */
  DOOR_EVENT_HANDLER_FAILED = 'DEVICE_002',

  /** Event handler failed to process PIR motion event */
  PIR_MOTION_HANDLER_FAILED = 'DEVICE_003',

  /** Event handler failed to process PIR cleared event */
  PIR_CLEARED_HANDLER_FAILED = 'DEVICE_004',

  /** Failed to update occupancy output capabilities */
  OCCUPANCY_UPDATE_FAILED = 'DEVICE_005',
}

/**
 * Error ID constants for tracking and monitoring registry-related errors.
 *
 * These IDs enable error aggregation, filtering, and analysis in logs.
 * Each error should be logged with its corresponding ID for traceability.
 */
export enum RegistryErrorId {
  /** Error processing individual device during iteration */
  DEVICE_PROCESSING_FAILED = 'REGISTRY_001',

  /** Error accessing devices from driver */
  DRIVER_ACCESS_FAILED = 'REGISTRY_002',

  /** Error retrieving all devices */
  DEVICE_RETRIEVAL_FAILED = 'REGISTRY_003',
}

/**
 * Error ID constants for tracking and monitoring pairing-related errors.
 *
 * These IDs enable error aggregation, filtering, and analysis in logs.
 * Each error should be logged with its corresponding ID for traceability.
 *
 * @example
 * ```typescript
 * this.error(
 *   `[${PairingErrorId.TEMPLATES_LOAD_FAILED}] Failed to load room templates`,
 *   error
 * );
 * ```
 */
export enum PairingErrorId {
  /** Failed to load room templates during pairing */
  TEMPLATES_LOAD_FAILED = 'PAIRING_001',

  /** Failed to fetch motion devices during pairing */
  MOTION_DEVICES_FETCH_FAILED = 'PAIRING_002',

  /** Failed to fetch contact devices during pairing */
  CONTACT_DEVICES_FETCH_FAILED = 'PAIRING_003',

  /** Invalid timer values received during pairing */
  INVALID_TIMER_VALUES = 'PAIRING_004',
}
