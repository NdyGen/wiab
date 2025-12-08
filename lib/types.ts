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
 * @property {() => void} onTriggered - Called when a trigger sensor activates (e.g., motion detected)
 * @property {() => void} onReset - Called when a reset sensor activates (e.g., door opened)
 */
export interface SensorCallbacks {
  onTriggered: () => void;
  onReset: () => void;
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
