/**
 * Contact sensor aggregation utility for zone seal monitoring.
 *
 * This class implements OR-logic aggregation for contact sensors: if ANY sensor
 * is open (true), the aggregated state is considered open. The zone is only sealed
 * when ALL sensors are closed (false).
 *
 * This is a pure TypeScript utility class with no Homey SDK dependencies, making
 * it easily testable and reusable across different contexts.
 *
 * @example
 * ```typescript
 * const sensors = [
 *   { deviceId: 'door1', capability: 'alarm_contact' },
 *   { deviceId: 'window1', capability: 'alarm_contact' }
 * ];
 * const aggregator = new ContactSensorAggregator(sensors);
 *
 * // Initialize with current values
 * const values = new Map([
 *   ['door1', false],  // closed
 *   ['window1', false] // closed
 * ]);
 * aggregator.initializeFromValues(values);
 *
 * // Check aggregated state
 * console.log(aggregator.areAllClosed()); // true
 *
 * // Update sensor state
 * aggregator.updateSensorState('door1', true); // door opened
 * console.log(aggregator.isAnyOpen()); // true
 * console.log(aggregator.getOpenSensors()); // [{ deviceId: 'door1', ... }]
 * ```
 */

import { SensorConfig } from './types';

/**
 * ContactSensorAggregator - OR-logic aggregation for contact sensors
 *
 * This class tracks the state of multiple contact sensors and provides
 * aggregated state information using OR-logic:
 * - ANY sensor open → aggregated state is OPEN (true)
 * - ALL sensors closed → aggregated state is CLOSED (false)
 *
 * The class maintains internal state for each configured sensor and provides
 * query methods to inspect individual sensor states as well as the aggregated state.
 *
 * Key features:
 * - Pure TypeScript with no external dependencies
 * - Defensive copying to prevent external mutation
 * - Safe handling of empty sensor arrays
 * - Null-safe sensor state queries
 *
 * @public
 */
export class ContactSensorAggregator {
  /**
   * Map of sensor device IDs to their current open/closed state.
   * - true = sensor is open (e.g., door open, window open)
   * - false = sensor is closed (e.g., door closed, window closed)
   *
   * @private
   */
  private readonly sensorStates: Map<string, boolean>;

  /**
   * Array of configured sensor configurations.
   * Used for retrieving sensor details when querying open/closed sensors.
   *
   * @private
   */
  private readonly sensors: SensorConfig[];

  /**
   * Creates a new ContactSensorAggregator instance.
   *
   * Initializes the aggregator with the provided sensor configurations.
   * All sensors start with an undefined state (not tracked) until explicitly
   * initialized via initializeFromValues() or updated via updateSensorState().
   *
   * @param sensors - Array of sensor configurations to track
   *
   * @example
   * ```typescript
   * const sensors = [
   *   { deviceId: 'door1', capability: 'alarm_contact' },
   *   { deviceId: 'window1', capability: 'alarm_contact' }
   * ];
   * const aggregator = new ContactSensorAggregator(sensors);
   * ```
   */
  constructor(sensors: SensorConfig[]) {
    this.sensors = sensors;
    this.sensorStates = new Map<string, boolean>();
  }

  /**
   * Initializes sensor states from a map of current values.
   *
   * This method is typically called during device initialization to set
   * the initial state of all configured sensors based on their current
   * values read from the Homey system.
   *
   * Sensors not present in the values map will remain uninitialized.
   *
   * @param values - Map of device IDs to their current open/closed state
   * @returns {void}
   *
   * @example
   * ```typescript
   * const values = new Map([
   *   ['door1', false],  // closed
   *   ['window1', true]  // open
   * ]);
   * aggregator.initializeFromValues(values);
   * ```
   */
  public initializeFromValues(values: Map<string, boolean>): void {
    for (const sensor of this.sensors) {
      const value = values.get(sensor.deviceId);
      if (value !== undefined) {
        this.sensorStates.set(sensor.deviceId, value);
      }
    }
  }

  /**
   * Updates the state of a specific sensor.
   *
   * This method is called when a sensor's state changes during runtime.
   * It updates the internal state map to reflect the new sensor state.
   *
   * If the sensor ID is not in the configured sensors list, the update
   * is still applied (allowing for dynamic sensor addition, though this
   * is not the typical use case).
   *
   * @param sensorId - The device ID of the sensor to update
   * @param isOpen - The new state: true if open, false if closed
   * @returns {void}
   *
   * @example
   * ```typescript
   * // Door opened
   * aggregator.updateSensorState('door1', true);
   *
   * // Window closed
   * aggregator.updateSensorState('window1', false);
   * ```
   */
  public updateSensorState(sensorId: string, isOpen: boolean): void {
    this.sensorStates.set(sensorId, isOpen);
  }

  /**
   * Checks if ANY sensor is currently open.
   *
   * Returns true if at least one sensor has a state of true (open).
   * Returns false if all sensors are closed or if no sensors are configured.
   *
   * This is the primary method for determining if the zone is "leaky"
   * (i.e., has at least one opening).
   *
   * @returns {boolean} True if any sensor is open, false otherwise
   *
   * @example
   * ```typescript
   * if (aggregator.isAnyOpen()) {
   *   console.log('Zone is leaky - at least one sensor is open');
   * }
   * ```
   */
  public isAnyOpen(): boolean {
    for (const [, isOpen] of this.sensorStates) {
      if (isOpen) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if ALL sensors are currently closed.
   *
   * Returns true if all configured sensors have a state of false (closed).
   * Returns true if no sensors are configured (empty array = no openings exist).
   *
   * This is the primary method for determining if the zone is "sealed"
   * (i.e., has no openings).
   *
   * @returns {boolean} True if all sensors are closed, false otherwise
   *
   * @example
   * ```typescript
   * if (aggregator.areAllClosed()) {
   *   console.log('Zone is sealed - all sensors are closed');
   * }
   * ```
   */
  public areAllClosed(): boolean {
    // Empty sensor array means no openings exist → all closed
    if (this.sensors.length === 0) {
      return true;
    }

    // Check if any sensor is open
    return !this.isAnyOpen();
  }

  /**
   * Retrieves all sensors that are currently open.
   *
   * Returns an array of SensorConfig objects for sensors with a state of true (open).
   * The returned array is a defensive copy, preventing external mutation of internal state.
   *
   * This method is useful for logging, debugging, or displaying which specific
   * sensors are preventing the zone from being sealed.
   *
   * @returns {SensorConfig[]} Array of sensor configurations for open sensors (defensive copy)
   *
   * @example
   * ```typescript
   * const openSensors = aggregator.getOpenSensors();
   * if (openSensors.length > 0) {
   *   console.log('Open sensors:', openSensors.map(s => s.deviceName).join(', '));
   * }
   * ```
   */
  public getOpenSensors(): SensorConfig[] {
    const openSensors: SensorConfig[] = [];

    for (const sensor of this.sensors) {
      const state = this.sensorStates.get(sensor.deviceId);
      if (state === true) {
        openSensors.push(sensor);
      }
    }

    // Return defensive copy
    return [...openSensors];
  }

  /**
   * Retrieves all sensors that are currently closed.
   *
   * Returns an array of SensorConfig objects for sensors with a state of false (closed).
   * The returned array is a defensive copy, preventing external mutation of internal state.
   *
   * This method is useful for logging, debugging, or displaying which specific
   * sensors are currently sealed.
   *
   * @returns {SensorConfig[]} Array of sensor configurations for closed sensors (defensive copy)
   *
   * @example
   * ```typescript
   * const closedSensors = aggregator.getClosedSensors();
   * console.log('Closed sensors:', closedSensors.map(s => s.deviceName).join(', '));
   * ```
   */
  public getClosedSensors(): SensorConfig[] {
    const closedSensors: SensorConfig[] = [];

    for (const sensor of this.sensors) {
      const state = this.sensorStates.get(sensor.deviceId);
      if (state === false) {
        closedSensors.push(sensor);
      }
    }

    // Return defensive copy
    return [...closedSensors];
  }

  /**
   * Gets the current state of a specific sensor.
   *
   * Returns the boolean state if the sensor is being tracked, or null if the
   * sensor ID is not found or has not been initialized.
   *
   * @param sensorId - The device ID of the sensor to query
   * @returns {boolean | null} True if open, false if closed, null if unknown
   *
   * @example
   * ```typescript
   * const doorState = aggregator.getSensorState('door1');
   * if (doorState === true) {
   *   console.log('Door is open');
   * } else if (doorState === false) {
   *   console.log('Door is closed');
   * } else {
   *   console.log('Door state unknown');
   * }
   * ```
   */
  public getSensorState(sensorId: string): boolean | null {
    const state = this.sensorStates.get(sensorId);
    return state !== undefined ? state : null;
  }

  /**
   * Gets the total number of configured sensors.
   *
   * Returns the count of sensors that were provided during construction,
   * regardless of whether they have been initialized or not.
   *
   * @returns {number} Total number of configured sensors
   *
   * @example
   * ```typescript
   * const total = aggregator.getSensorCount();
   * const open = aggregator.getOpenSensors().length;
   * console.log(`${open}/${total} sensors are open`);
   * ```
   */
  public getSensorCount(): number {
    return this.sensors.length;
  }
}
