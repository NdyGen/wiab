/**
 * SensorMonitor - Polling-based sensor state monitoring
 *
 * This class monitors configured sensors by polling their state at regular intervals
 * and triggers callbacks when state changes are detected. It implements a priority
 * system where reset sensors are checked before trigger sensors.
 *
 * The monitor uses a polling approach (default 2000ms interval) to check sensor states,
 * storing last known values to detect changes. This approach is reliable and works
 * with all Homey devices regardless of their capability change event support.
 */

import { SensorConfig, SensorCallbacks } from './types';

/**
 * SensorMonitor class for polling-based sensor state monitoring
 *
 * @class SensorMonitor
 * @example
 * ```typescript
 * const monitor = new SensorMonitor(
 *   homey,
 *   [{ deviceId: 'motion1', capability: 'alarm_motion' }],
 *   [{ deviceId: 'door1', capability: 'alarm_contact' }],
 *   {
 *     onTriggered: () => console.log('Motion detected!'),
 *     onReset: () => console.log('Door opened!')
 *   }
 * );
 * monitor.start();
 * ```
 */
export class SensorMonitor {
  private homey: any;
  private triggerSensors: SensorConfig[];
  private resetSensors: SensorConfig[];
  private callbacks: SensorCallbacks;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastValues: Map<string, boolean> = new Map();
  private readonly POLL_INTERVAL_MS = 2000;

  /**
   * Creates a new SensorMonitor instance
   *
   * @param homey - The Homey instance for device access and logging
   * @param {SensorConfig[]} triggerSensors - Sensors that activate occupancy when triggered
   * @param {SensorConfig[]} resetSensors - Sensors that deactivate occupancy when triggered (priority over trigger sensors)
   * @param {SensorCallbacks} callbacks - Callback functions for sensor state changes
   */
  constructor(
    homey: any,
    triggerSensors: SensorConfig[],
    resetSensors: SensorConfig[],
    callbacks: SensorCallbacks
  ) {
    this.homey = homey;
    this.triggerSensors = triggerSensors;
    this.resetSensors = resetSensors;
    this.callbacks = callbacks;
  }

  /**
   * Starts the sensor monitoring process
   *
   * Initializes the polling interval and begins monitoring all configured sensors.
   * This method should be called after the SensorMonitor is constructed and ready to operate.
   *
   * @public
   * @returns {void}
   */
  public start(): void {
    if (this.pollInterval) {
      this.homey.log('SensorMonitor already running');
      return;
    }

    this.homey.log('Starting SensorMonitor with polling interval:', this.POLL_INTERVAL_MS, 'ms');
    this.homey.log('Monitoring trigger sensors:', this.triggerSensors.length);
    this.homey.log('Monitoring reset sensors:', this.resetSensors.length);

    // Initialize last values for all sensors
    this.initializeLastValues();

    // Start polling
    this.pollInterval = setInterval(() => {
      this.poll();
    }, this.POLL_INTERVAL_MS);

    // Perform initial poll immediately
    this.poll();
  }

  /**
   * Stops the sensor monitoring process
   *
   * Cleans up the polling interval and releases resources. Should be called
   * when the monitor is no longer needed or during app shutdown.
   *
   * @public
   * @returns {void}
   */
  public stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      this.lastValues.clear();
      this.homey.log('SensorMonitor stopped');
    }
  }

  /**
   * Initializes the last known values for all configured sensors
   *
   * This prevents false positives on the first poll by establishing baseline values.
   * If a sensor cannot be read, it is initialized with false.
   *
   * @private
   * @returns {void}
   */
  private initializeLastValues(): void {
    const allSensors = [...this.resetSensors, ...this.triggerSensors];

    for (const sensor of allSensors) {
      const key = this.getSensorKey(sensor);
      const value = this.getSensorValue(sensor);
      this.lastValues.set(key, value ?? false);
    }
  }

  /**
   * Polls all configured sensors and triggers callbacks on state changes
   *
   * This method implements the core monitoring logic:
   * 1. Check reset sensors first (priority) - if any trigger, call onReset and return
   * 2. Check trigger sensors - if any trigger, call onTriggered
   *
   * State changes are detected by comparing current values with stored last values.
   * Only transitions from false to true trigger callbacks (edge detection).
   *
   * @private
   * @returns {void}
   */
  private poll(): void {
    try {
      // Priority 1: Check reset sensors (these take precedence)
      for (const sensor of this.resetSensors) {
        const key = this.getSensorKey(sensor);
        const currentValue = this.getSensorValue(sensor);
        const lastValue = this.lastValues.get(key) ?? false;

        if (currentValue !== null) {
          this.lastValues.set(key, currentValue);

          // Detect rising edge: false -> true transition
          if (currentValue && !lastValue) {
            this.homey.log(`Reset sensor triggered: ${sensor.deviceName || sensor.deviceId} (${sensor.capability})`);
            this.callbacks.onReset();
            return; // Reset sensors have priority, so we return immediately
          }
        }
      }

      // Priority 2: Check trigger sensors (only if no reset sensor triggered)
      for (const sensor of this.triggerSensors) {
        const key = this.getSensorKey(sensor);
        const currentValue = this.getSensorValue(sensor);
        const lastValue = this.lastValues.get(key) ?? false;

        if (currentValue !== null) {
          this.lastValues.set(key, currentValue);

          // Detect rising edge: false -> true transition
          if (currentValue && !lastValue) {
            this.homey.log(`Trigger sensor activated: ${sensor.deviceName || sensor.deviceId} (${sensor.capability})`);
            this.callbacks.onTriggered();
            // Continue checking other trigger sensors
          }
        }
      }
    } catch (error) {
      this.homey.error('Error during sensor polling:', error);
      // Don't crash the monitor - log the error and continue
    }
  }

  /**
   * Gets the current value of a sensor's capability
   *
   * Retrieves the device and reads the specified capability value.
   * Handles missing devices and capabilities gracefully by returning null.
   *
   * @private
   * @param {SensorConfig} sensor - The sensor configuration
   * @returns {boolean | null} The capability value (true/false) or null if unavailable
   */
  private getSensorValue(sensor: SensorConfig): boolean | null {
    try {
      const device = this.getDevice(sensor.deviceId);

      if (!device) {
        // Don't spam logs - this warning is only shown when first encountering the issue
        if (!this.lastValues.has(this.getSensorKey(sensor))) {
          this.homey.error(`Device not found: ${sensor.deviceId}`);
        }
        return null;
      }

      if (!device.hasCapability(sensor.capability)) {
        this.homey.error(`Device ${sensor.deviceId} does not have capability: ${sensor.capability}`);
        return null;
      }

      const value = device.getCapabilityValue(sensor.capability);
      return typeof value === 'boolean' ? value : false;
    } catch (error) {
      this.homey.error(`Error reading sensor ${sensor.deviceId}:`, error);
      return null;
    }
  }

  /**
   * Finds a device by its unique identifier
   *
   * Searches across all drivers in the Homey system to locate the device.
   * This is necessary because devices can be managed by different drivers.
   *
   * @private
   * @param {string} deviceId - The unique device identifier
   * @returns {any | null} The device instance or null if not found
   */
  private getDevice(deviceId: string): any | null {
    try {
      const drivers = this.homey.drivers.getDrivers();

      for (const driver of Object.values(drivers)) {
        const devices = (driver as any).getDevices();
        const device = devices.find((d: any) => d.getData().id === deviceId);

        if (device) {
          return device;
        }
      }

      return null;
    } catch (error) {
      this.homey.error(`Error finding device ${deviceId}:`, error);
      return null;
    }
  }

  /**
   * Generates a unique key for a sensor configuration
   *
   * Creates a composite key from device ID and capability for tracking
   * sensor states in the lastValues map.
   *
   * @private
   * @param {SensorConfig} sensor - The sensor configuration
   * @returns {string} A unique key in the format "deviceId:capability"
   */
  private getSensorKey(sensor: SensorConfig): string {
    return `${sensor.deviceId}:${sensor.capability}`;
  }
}
