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

  /** T_ENTER timer expiry handler failed */
  ENTER_TIMER_EXPIRY_FAILED = 'DEVICE_006',

  /** T_CLEAR timer expiry handler failed */
  CLEAR_TIMER_EXPIRY_FAILED = 'DEVICE_007',
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

/**
 * Error ID constants for tracking and monitoring room state manager errors.
 *
 * These IDs enable error aggregation, filtering, and analysis in logs.
 * Each error should be logged with its corresponding ID for traceability.
 *
 * @example
 * ```typescript
 * this.error(
 *   `[${RoomStateErrorId.STATE_ENGINE_VALIDATION_FAILED}] Invalid state configuration`,
 *   error
 * );
 * ```
 */
export enum RoomStateErrorId {
  /** State hierarchy validation failed (cycles, depth, duplicates) */
  STATE_ENGINE_VALIDATION_FAILED = 'ROOM_STATE_001',

  /** Failed to setup zone activity monitoring */
  ZONE_MONITOR_SETUP_FAILED = 'ROOM_STATE_002',

  /** Zone activity event handler failed */
  ZONE_ACTIVITY_HANDLER_FAILED = 'ROOM_STATE_003',

  /** State transition failed */
  STATE_TRANSITION_FAILED = 'ROOM_STATE_004',

  /** Timer management failed */
  TIMER_MANAGEMENT_FAILED = 'ROOM_STATE_005',

  /** Failed to update device capabilities */
  CAPABILITY_UPDATE_FAILED = 'ROOM_STATE_006',

  /** Zone not found in Homey (deprecated - use WIAB_DEVICE_NOT_FOUND) */
  ZONE_NOT_FOUND = 'ROOM_STATE_007',

  /** Invalid state configuration in settings */
  INVALID_STATE_CONFIG = 'ROOM_STATE_008',

  /** Device initialization failed */
  DEVICE_INIT_FAILED = 'ROOM_STATE_009',

  /** Settings update failed */
  SETTINGS_UPDATE_FAILED = 'ROOM_STATE_010',

  /** Zone lookup failed (deprecated - use WIAB_DEVICE_LOOKUP_FAILED) */
  ZONE_LOOKUP_FAILED = 'ROOM_STATE_011',

  /** Zone polling failed (deprecated - not used with WIAB device monitoring) */
  ZONE_POLLING_FAILED = 'ROOM_STATE_012',

  /** Zone change detection failed (deprecated - not used with WIAB device monitoring) */
  ZONE_CHANGE_DETECTION_FAILED = 'ROOM_STATE_013',

  /** Failed to set device warning */
  WARNING_SET_FAILED = 'ROOM_STATE_014',

  /** Failed to clear device warning */
  WARNING_CLEAR_FAILED = 'ROOM_STATE_015',

  /** WIAB device not found in Homey */
  WIAB_DEVICE_NOT_FOUND = 'ROOM_STATE_016',

  /** WIAB device lookup failed */
  WIAB_DEVICE_LOOKUP_FAILED = 'ROOM_STATE_017',

  /** Flow trigger failed to execute */
  FLOW_TRIGGER_FAILED = 'ROOM_STATE_018',

  /** Settings validation failed */
  SETTINGS_VALIDATION_FAILED = 'ROOM_STATE_019',

  /** Resource teardown/cleanup failed */
  TEARDOWN_FAILED = 'ROOM_STATE_020',

  /** Failed to return to automatic mode */
  AUTOMATIC_MODE_FAILED = 'ROOM_STATE_021',
}

/**
 * Error ID constants for tracking and monitoring zone seal device errors.
 *
 * These IDs enable error aggregation, filtering, and analysis in logs.
 * Each error should be logged with its corresponding ID for traceability.
 *
 * @example
 * ```typescript
 * this.error(
 *   `[${ZoneSealErrorId.DEVICE_INIT_FAILED}] Failed to initialize device`,
 *   error
 * );
 * ```
 */
export enum ZoneSealErrorId {
  /** Failed to initialize device (onInit) */
  DEVICE_INIT_FAILED = 'ZONE_SEAL_001',

  /** Failed to setup sensor monitoring */
  SENSOR_MONITORING_SETUP_FAILED = 'ZONE_SEAL_002',

  /** Failed to handle sensor update */
  SENSOR_UPDATE_HANDLER_FAILED = 'ZONE_SEAL_003',

  /** Failed to trigger flow card */
  FLOW_CARD_TRIGGER_FAILED = 'ZONE_SEAL_004',

  /** Zone name retrieval failed (driver) */
  ZONE_NAME_RETRIEVAL_FAILED = 'ZONE_SEAL_005',

  /** Pairing handler error */
  PAIRING_HANDLER_FAILED = 'ZONE_SEAL_006',

  /** Settings update failed */
  SETTINGS_UPDATE_FAILED = 'ZONE_SEAL_007',

  /** State update failed */
  STATE_UPDATE_FAILED = 'ZONE_SEAL_008',

  /** Flow card registration failed */
  FLOW_CARD_REGISTRATION_FAILED = 'ZONE_SEAL_009',

  /** Capability update partially failed */
  CAPABILITY_UPDATE_PARTIAL_FAILURE = 'ZONE_SEAL_010',

  /** Failed to set device warning */
  WARNING_SET_FAILED = 'ZONE_SEAL_011',

  /** Failed to clear device warning */
  WARNING_CLEAR_FAILED = 'ZONE_SEAL_012',
}

/**
 * Error ID constants for tracking and monitoring circuit breaker errors.
 *
 * These IDs enable error aggregation, filtering, and analysis in logs.
 * Each error should be logged with its corresponding ID for traceability.
 *
 * @example
 * ```typescript
 * this.error(
 *   `[${CircuitBreakerErrorId.CASCADE_FAILED}] Failed to cascade state change`,
 *   error
 * );
 * ```
 */
export enum CircuitBreakerErrorId {
  /** Failed to initialize device (onInit) */
  DEVICE_INIT_FAILED = 'CIRCUIT_BREAKER_001',

  /** Failed to cascade state change to children */
  CASCADE_FAILED = 'CIRCUIT_BREAKER_002',

  /** Failed to update child device state */
  CHILD_UPDATE_FAILED = 'CIRCUIT_BREAKER_003',

  /** Failed to orphan children on deletion */
  ORPHAN_CHILDREN_FAILED = 'CIRCUIT_BREAKER_004',

  /** Cycle detected in parent assignment */
  CYCLE_DETECTED = 'CIRCUIT_BREAKER_005',

  /** Failed to validate parent assignment */
  PARENT_VALIDATION_FAILED = 'CIRCUIT_BREAKER_006',

  /** Failed to get parent state */
  PARENT_STATE_FAILED = 'CIRCUIT_BREAKER_007',

  /** Failed to get children */
  GET_CHILDREN_FAILED = 'CIRCUIT_BREAKER_008',

  /** Failed to trigger flow card */
  FLOW_CARD_TRIGGER_FAILED = 'CIRCUIT_BREAKER_009',

  /** Settings update failed */
  SETTINGS_UPDATE_FAILED = 'CIRCUIT_BREAKER_010',

  /** Pairing handler failed */
  PAIRING_HANDLER_FAILED = 'CIRCUIT_BREAKER_011',

  /** Flow card registration failed */
  FLOW_CARD_REGISTRATION_FAILED = 'CIRCUIT_BREAKER_012',

  /** Hierarchy query failed */
  HIERARCHY_QUERY_FAILED = 'CIRCUIT_BREAKER_013',

  /** Capability update failed */
  CAPABILITY_UPDATE_FAILED = 'CIRCUIT_BREAKER_014',

  /** Failed to delete device and cleanup resources */
  DEVICE_DELETION_FAILED = 'CIRCUIT_BREAKER_015',

  /** Driver initialization failed (onInit) */
  DRIVER_INIT_FAILED = 'CIRCUIT_BREAKER_016',

  /** Failed to set device warning */
  WARNING_SET_FAILED = 'CIRCUIT_BREAKER_017',

  /** Failed to clear device warning */
  WARNING_CLEAR_FAILED = 'CIRCUIT_BREAKER_018',

  /** Promise rejected during batch update (should not happen) */
  CASCADE_PROMISE_REJECTED = 'CIRCUIT_BREAKER_019',

  /** Cascade engine threw unexpected exception */
  CASCADE_ENGINE_FAILED = 'CIRCUIT_BREAKER_020',
}
