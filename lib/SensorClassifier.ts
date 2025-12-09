/**
 * Sensor classification utilities for the tri-state occupancy model.
 *
 * This module provides functions to automatically classify sensors based on
 * their capabilities, distinguishing between door sensors (contact-based) and
 * PIR sensors (motion-based).
 *
 * As per user requirements (Question 2: Option A), sensor types are inferred
 * from capability names rather than requiring explicit user configuration.
 */

import { SensorConfig } from './types';

/**
 * Sensor type classification.
 *
 * @enum {string}
 * @property {string} DOOR - Contact sensor (door/window)
 * @property {string} PIR - Motion/presence sensor
 */
export enum SensorType {
  DOOR = 'DOOR',
  PIR = 'PIR',
}

/**
 * Classified sensor configuration.
 *
 * Extends SensorConfig with inferred type information.
 *
 * @interface ClassifiedSensor
 * @extends SensorConfig
 * @property {SensorType} type - The inferred sensor type
 */
export interface ClassifiedSensor extends SensorConfig {
  type: SensorType;
}

/**
 * Capability names that indicate door/window contact sensors.
 *
 * These capabilities typically represent boolean states where:
 * - true = door/window open
 * - false = door/window closed
 */
const DOOR_CAPABILITIES = [
  'alarm_contact',
  'alarm_window',
  'alarm_door',
  'contact_alarm',
  'window_alarm',
  'door_alarm',
] as const;

/**
 * Capability names that indicate motion/presence sensors (PIR).
 *
 * These capabilities typically represent boolean states where:
 * - true = motion detected
 * - false = no motion
 */
const PIR_CAPABILITIES = [
  'alarm_motion',
  'alarm_presence',
  'motion_alarm',
  'presence_alarm',
  'motion',
  'presence',
] as const;

/**
 * Classifies a sensor based on its capability name.
 *
 * Uses pattern matching on the capability string to determine whether
 * the sensor is a door/window contact sensor or a PIR motion sensor.
 *
 * Classification rules:
 * 1. Exact match against known capability names (case-insensitive)
 * 2. Substring match for "contact", "door", "window" → DOOR
 * 3. Substring match for "motion", "presence" → PIR
 * 4. Default fallback: PIR (safer assumption for occupancy)
 *
 * @param sensor - The sensor configuration to classify
 * @returns {ClassifiedSensor} Sensor with inferred type
 *
 * @example
 * ```typescript
 * const sensor = { deviceId: 'd1', capability: 'alarm_contact' };
 * const classified = classifySensor(sensor);
 * // classified.type === SensorType.DOOR
 * ```
 */
export function classifySensor(sensor: SensorConfig): ClassifiedSensor {
  const capability = sensor.capability.toLowerCase();

  // Check exact matches for door sensors
  if (
    DOOR_CAPABILITIES.some((cap) => cap.toLowerCase() === capability)
  ) {
    return {
      ...sensor,
      type: SensorType.DOOR,
    };
  }

  // Check exact matches for PIR sensors
  if (
    PIR_CAPABILITIES.some((cap) => cap.toLowerCase() === capability)
  ) {
    return {
      ...sensor,
      type: SensorType.PIR,
    };
  }

  // Substring matching for door-related capabilities
  if (
    capability.includes('contact') ||
    capability.includes('door') ||
    capability.includes('window')
  ) {
    return {
      ...sensor,
      type: SensorType.DOOR,
    };
  }

  // Substring matching for motion-related capabilities
  if (
    capability.includes('motion') ||
    capability.includes('presence')
  ) {
    return {
      ...sensor,
      type: SensorType.PIR,
    };
  }

  // Default fallback: treat as PIR (safer for occupancy detection)
  return {
    ...sensor,
    type: SensorType.PIR,
  };
}

/**
 * Classifies a list of sensors and separates them by type.
 *
 * This function takes all configured sensors (previously categorized as
 * "trigger" or "reset" sensors) and re-classifies them based on their
 * capabilities into door and PIR sensors.
 *
 * @param sensors - Array of sensor configurations to classify
 * @returns {{ doors: ClassifiedSensor[], pirs: ClassifiedSensor[] }} Sensors separated by type
 *
 * @example
 * ```typescript
 * const sensors = [
 *   { deviceId: 'd1', capability: 'alarm_contact' },
 *   { deviceId: 'd2', capability: 'alarm_motion' }
 * ];
 * const { doors, pirs } = classifySensors(sensors);
 * // doors.length === 1, pirs.length === 1
 * ```
 */
export function classifySensors(
  sensors: SensorConfig[]
): { doors: ClassifiedSensor[]; pirs: ClassifiedSensor[] } {
  const classified = sensors.map(classifySensor);

  const doors = classified.filter((s) => s.type === SensorType.DOOR);
  const pirs = classified.filter((s) => s.type === SensorType.PIR);

  return { doors, pirs };
}

/**
 * Checks if a capability name represents a door/window sensor.
 *
 * @param capability - The capability name to check
 * @returns {boolean} True if this is a door/window capability, false otherwise
 *
 * @example
 * ```typescript
 * isDoorCapability('alarm_contact'); // true
 * isDoorCapability('alarm_motion');  // false
 * ```
 */
export function isDoorCapability(capability: string): boolean {
  const classified = classifySensor({ deviceId: '', capability });
  return classified.type === SensorType.DOOR;
}

/**
 * Checks if a capability name represents a PIR motion/presence sensor.
 *
 * @param capability - The capability name to check
 * @returns {boolean} True if this is a motion/presence capability, false otherwise
 *
 * @example
 * ```typescript
 * isPirCapability('alarm_motion');  // true
 * isPirCapability('alarm_contact'); // false
 * ```
 */
export function isPirCapability(capability: string): boolean {
  const classified = classifySensor({ deviceId: '', capability });
  return classified.type === SensorType.PIR;
}
