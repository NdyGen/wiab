/**
 * Type definitions for the WIAB (Wasp in a Box) Homey app
 *
 * This module contains all core type definitions used throughout the application
 * for sensor configuration, callbacks, and settings management.
 */

/**
 * Configuration for a sensor used in the WIAB app.
 *
 * Sensors can be either trigger sensors (activate occupancy) or reset sensors
 * (deactivate occupancy). Each sensor is identified by its device ID and the
 * specific capability being monitored.
 *
 * @interface SensorConfig
 * @property {string} deviceId - The unique identifier of the Homey device
 * @property {string} capability - The capability to monitor (e.g., 'alarm_motion', 'alarm_contact')
 * @property {string} [deviceName] - Optional human-readable name of the device for logging purposes
 */
export interface SensorConfig {
  deviceId: string;
  capability: string;
  deviceName?: string;
}

/**
 * Callback functions invoked when sensor state changes occur.
 *
 * These callbacks are triggered by the SensorMonitor when it detects state changes
 * in the configured sensors. The callbacks handle the business logic for responding
 * to sensor events (e.g., updating occupancy state).
 *
 * @interface SensorCallbacks
 * @property {(sensorId: string, value: boolean) => void} onTriggered - Called when a trigger sensor activates (e.g., motion detected - rising edge)
 * @property {(sensorId: string, value: boolean) => void} onReset - Called when a reset sensor activates (e.g., door opened - both edges)
 * @property {(sensorId: string) => void} [onPirCleared] - Called when a trigger sensor deactivates (e.g., motion cleared - falling edge)
 */
export interface SensorCallbacks {
  onTriggered: (sensorId: string, value: boolean) => void;
  onReset: (sensorId: string, value: boolean) => void;
  onPirCleared?: (sensorId: string) => void;
}

/**
 * Application-wide settings for the WIAB app.
 *
 * These settings control the behavior of the virtual occupancy sensor,
 * particularly the timeout duration before automatic occupancy reset.
 *
 * @interface WIABSettings
 * @property {number} timeout - Timeout in minutes before occupancy automatically resets
 * @property {SensorConfig[]} [triggerSensors] - Optional array of sensors that trigger occupancy
 * @property {SensorConfig[]} [resetSensors] - Optional array of sensors that reset occupancy
 */
export interface WIABSettings {
  timeout: number;
  triggerSensors?: SensorConfig[];
  resetSensors?: SensorConfig[];
}

/**
 * Information about a discovered Homey device.
 *
 * Used by DeviceRegistry to provide details about available devices
 * that can be used as sensors in the WIAB app.
 *
 * @interface DeviceInfo
 * @property {string} id - The unique identifier of the device
 * @property {string} name - The user-assigned name of the device
 * @property {string} driverName - The name of the driver managing this device
 * @property {string[]} capabilities - List of capabilities supported by the device
 */
export interface DeviceInfo {
  id: string;
  name: string;
  driverName: string;
  capabilities: string[];
}

/**
 * Response format for device API endpoints.
 *
 * Used by the settings page API to provide information about devices
 * that can be configured as sensors in the WIAB app.
 *
 * @interface DeviceResponse
 * @property {string} id - The unique identifier of the device
 * @property {string} name - The user-assigned name of the device
 * @property {string} class - The device class (e.g., 'sensor', 'light')
 * @property {string} capability - The specific capability being exposed (e.g., 'alarm_motion', 'alarm_contact')
 * @property {string} [zoneName] - Optional name of the zone where the device is located
 */
export interface DeviceResponse {
  id: string;
  name: string;
  class: string;
  capability: string;
  zoneName?: string;
}

/**
 * Homey logger interface for logging and error reporting.
 *
 * This interface defines the logging methods available on the Homey SDK.
 * Used throughout the app for consistent logging.
 *
 * @interface HomeyLogger
 * @property {(...args: unknown[]) => void} log - Logs informational messages
 * @property {(...args: unknown[]) => void} error - Logs error messages
 */
export interface HomeyLogger {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * Device configuration returned during pairing flow.
 *
 * This format is used when presenting devices to the user during the
 * pairing wizard, allowing them to select which sensors to configure.
 *
 * @interface PairingDeviceConfig
 * @property {string} deviceId - The unique identifier of the device
 * @property {string} name - The user-assigned name of the device
 * @property {string | null} zone - The zone name where the device is located, or null if no zone
 * @property {string} capability - The capability exposed (e.g., 'alarm_motion', 'alarm_contact')
 */
export interface PairingDeviceConfig {
  deviceId: string;
  name: string;
  zone: string | null;
  capability: string;
}

/**
 * Capability update event received from HomeyAPI WebSocket.
 *
 * This event is emitted when a device capability value changes.
 * The SensorMonitor listens for these events to detect sensor state changes.
 *
 * @interface CapabilityUpdate
 * @property {string} capabilityId - The capability that changed (e.g., 'alarm_motion')
 * @property {unknown} value - The new value of the capability
 */
export interface CapabilityUpdate {
  capabilityId: string;
  value: unknown;
}

/**
 * Homey device object from HomeyAPI.
 *
 * Represents a device accessible through the HomeyAPI with WebSocket-based
 * updates. Device objects auto-update via WebSocket when their state changes.
 *
 * @interface HomeyAPIDevice
 * @property {string} name - The user-assigned name of the device
 * @property {string} [zoneName] - Optional zone name where the device is located
 * @property {Record<string, { value: unknown }>} capabilitiesObj - Object mapping capability IDs to their current values
 * @property {(event: string, handler: (update: CapabilityUpdate) => void) => void} on - Registers an event listener for device updates
 * @property {(event: string, handler: (update: CapabilityUpdate) => void) => void} removeListener - Removes an event listener
 */
export interface HomeyAPIDevice {
  name: string;
  zoneName?: string;
  capabilitiesObj: Record<string, { value: unknown }>;
  on: (event: string, handler: (update: CapabilityUpdate) => void) => void;
  removeListener: (event: string, handler: (update: CapabilityUpdate) => void) => void;
}

/**
 * HomeyAPI devices interface for accessing all devices.
 *
 * Provides methods to retrieve devices from the Homey system.
 *
 * @interface HomeyAPIDevices
 * @property {() => Promise<Record<string, HomeyAPIDevice>>} getDevices - Retrieves all devices indexed by device ID
 */
export interface HomeyAPIDevices {
  getDevices: () => Promise<Record<string, HomeyAPIDevice>>;
}

/**
 * Homey zone object from HomeyAPI.
 *
 * @interface HomeyAPIZone
 * @property {string} id - The unique identifier of the zone
 * @property {string} name - The user-assigned name of the zone
 * @property {string} [parent] - Optional parent zone ID for nested zones
 */
export interface HomeyAPIZone {
  id: string;
  name: string;
  parent?: string;
}

/**
 * HomeyAPI zones interface for accessing zones.
 *
 * @interface HomeyAPIZones
 * @property {(params: { id: string }) => Promise<HomeyAPIZone>} getZone - Retrieves a zone by ID
 */
export interface HomeyAPIZones {
  getZone: (params: { id: string }) => Promise<HomeyAPIZone>;
}

/**
 * HomeyAPI interface for accessing Homey system resources.
 *
 * This is the main API object provided by HomeyAPI for accessing
 * devices and other Homey resources with WebSocket-based updates.
 *
 * @interface HomeyAPI
 * @property {HomeyAPIDevices} devices - Interface for accessing Homey devices
 * @property {HomeyAPIZones} zones - Interface for accessing Homey zones
 */
export interface HomeyAPI {
  devices: HomeyAPIDevices;
  zones: HomeyAPIZones;
}

/**
 * State transition configuration for room state manager.
 *
 * Defines a transition from one state to another after a specified duration.
 * Transitions can be triggered by zone activity (active) or inactivity (inactive).
 *
 * @interface StateTransition
 * @property {string} targetState - The state ID to transition to
 * @property {number} afterMinutes - Time in minutes before transitioning
 */
export interface StateTransition {
  targetState: string;
  afterMinutes: number;
}

/**
 * Configuration for a single room state.
 *
 * States can have parent-child relationships for inheritance (max 2 levels).
 * Each state defines transitions that occur when the zone is active or inactive.
 *
 * @interface StateConfig
 * @property {string} id - Unique identifier for this state (e.g., "working", "sleeping")
 * @property {string} name - Display name for this state shown in UI and flow cards
 * @property {string} [parent] - Optional parent state ID for hierarchical states
 * @property {StateTransition[]} activeTransitions - Transitions when zone is active
 * @property {StateTransition[]} inactiveTransitions - Transitions when zone is inactive
 */
export interface StateConfig {
  id: string;
  name: string;
  parent?: string;
  activeTransitions: StateTransition[];
  inactiveTransitions: StateTransition[];
}

/**
 * Device settings for room state manager.
 *
 * These settings are stored in the device and control room state behavior.
 * The zone is determined by the device's zone assignment, not stored in settings.
 *
 * The app uses a fixed 4-state model:
 * - idle: Room inactive
 * - extended_idle: Room inactive for idleTimeout minutes (0 = disabled)
 * - occupied: Room active
 * - extended_occupied: Room active for occupiedTimeout minutes (0 = disabled)
 *
 * @interface RoomStateSettings
 * @property {number} idleTimeout - Minutes before idle → extended_idle (0 = disabled)
 * @property {number} occupiedTimeout - Minutes before occupied → extended_occupied (0 = disabled)
 */
export interface RoomStateSettings {
  idleTimeout: number;
  occupiedTimeout: number;
}

/**
 * Zone update event from HomeyAPI.
 *
 * Emitted when a zone's activity status changes.
 *
 * @interface ZoneUpdate
 * @property {boolean} active - Whether the zone is currently active
 * @property {number} timestamp - Timestamp of the update
 */
export interface ZoneUpdate {
  active: boolean;
  timestamp: number;
}
