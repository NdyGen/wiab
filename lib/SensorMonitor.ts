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

import { SensorConfig, SensorCallbacks, HomeyAPI, HomeyAPIDevice } from './types';

/**
 * Interface for logging instance
 */
interface Logger {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Extended HomeyAPIDevice with additional runtime methods
 */
interface ExtendedHomeyAPIDevice extends HomeyAPIDevice {
  makeCapabilityInstance?(capability: string, callback: (value: boolean) => void): unknown;
  hasCapability?(capability: string): boolean;
  getCapabilityValue?(capability: string): unknown;
}

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
  private homeyApi: HomeyAPI;
  private logger: Logger;
  private triggerSensors: SensorConfig[];
  private resetSensors: SensorConfig[];
  private callbacks: SensorCallbacks;
  private lastValues: Map<string, boolean> = new Map();
  private deviceCache: Record<string, ExtendedHomeyAPIDevice> = {};
  private deviceRefs: Map<string, ExtendedHomeyAPIDevice> = new Map(); // Live device references from HomeyAPI
  private capabilityInstances: Map<string, unknown> = new Map(); // DeviceCapability instances for cleanup

  /**
   * Creates a new SensorMonitor instance
   *
   * @param homeyApi - The HomeyAPI instance for device access
   * @param logger - The Homey SDK instance for logging
   * @param {SensorConfig[]} triggerSensors - Sensors that activate occupancy when triggered
   * @param {SensorConfig[]} resetSensors - Sensors that deactivate occupancy when triggered (priority over trigger sensors)
   * @param {SensorCallbacks} callbacks - Callback functions for sensor state changes
   */
  constructor(
    homeyApi: HomeyAPI,
    logger: Logger,
    triggerSensors: SensorConfig[],
    resetSensors: SensorConfig[],
    callbacks: SensorCallbacks
  ) {
    this.homeyApi = homeyApi;
    this.logger = logger;
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
  public async start(): Promise<void> {
    if (this.capabilityInstances.size > 0) {
      this.logger.log('SensorMonitor already running');
      return;
    }

    this.logger.log('Starting SensorMonitor with real-time capability monitoring');
    this.logger.log('Monitoring trigger sensors:', this.triggerSensors.length);
    this.logger.log('Monitoring reset sensors:', this.resetSensors.length);

    // Populate device cache using getDevices() which returns complete device objects
    try {
      this.logger.log('Loading device cache from HomeyAPI...');
      const allDevices = await this.homeyApi.devices.getDevices();
      this.deviceCache = allDevices;
      this.logger.log(`Device cache loaded with ${Object.keys(this.deviceCache).length} devices`);

      // Store live references to devices we'll be monitoring
      // These device objects auto-update via WebSocket, so we can reuse them
      const allSensors = [...this.resetSensors, ...this.triggerSensors];
      for (const sensor of allSensors) {
        const device = allDevices[sensor.deviceId];
        if (device) {
          this.deviceRefs.set(sensor.deviceId, device);
          this.logger.log(`Stored live reference for device: ${sensor.deviceName || sensor.deviceId}`);
        } else {
          this.logger.error(`Device not found in cache: ${sensor.deviceId}`);
        }
      }
    } catch (error) {
      this.logger.error('Failed to load device cache:', error);
      // Continue anyway - will attempt per-device lookup as fallback
    }

    // Initialize last values for all sensors
    await this.initializeLastValues();

    // Set initial occupancy state based on current sensor values
    this.setInitialOccupancyState();

    // Setup event listeners for device updates
    this.setupEventListeners();
  }

  /**
   * Stops the sensor monitoring process
   *
   * Cleans up event listeners and releases resources. Should be called
   * when the monitor is no longer needed or during app shutdown.
   *
   * @public
   * @returns {void}
   */
  public stop(): void {
    if (this.capabilityInstances.size > 0) {
      this.logger.log('Stopping SensorMonitor - cleaning up capability instances');
      // Capability instances will be garbage collected
      // No explicit cleanup needed as makeCapabilityInstance manages lifecycle
      this.capabilityInstances.clear();
      this.lastValues.clear();
      this.deviceCache = {};
      this.deviceRefs.clear();
      this.logger.log('SensorMonitor stopped');
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
  private async initializeLastValues(): Promise<void> {
    const allSensors = [...this.resetSensors, ...this.triggerSensors];

    for (const sensor of allSensors) {
      const key = this.getSensorKey(sensor);
      const value = await this.getSensorValue(sensor);
      this.lastValues.set(key, value ?? false);
      this.logger.log(`[INIT] ${sensor.deviceName || sensor.deviceId} (${sensor.capability}): ${value}`);
    }
  }

  /**
   * Sets the initial occupancy state based on current sensor values
   *
   * STRATEGY: Determine if the room is currently occupied by checking BOTH:
   * 1. ALL reset sensors (doors/windows) are OFF (closed)
   * 2. At least ONE trigger sensor (motion) is ON (detected)
   *
   * RATIONALE: The "wasp in a box" concept requires two conditions to be true:
   * - The "box" must be closed (all doors/windows closed = reset sensors OFF)
   * - There must be a "wasp" inside (motion detected = trigger sensor ON)
   *
   * If ANY door is open OR no motion is detected, the room is considered not occupied.
   *
   * This ensures the WIAB device reflects the actual occupancy state
   * immediately on startup, rather than waiting for the first state change.
   *
   * @private
   * @returns {void}
   */
  private setInitialOccupancyState(): void {
    // STEP 1: Check if ALL reset sensors are OFF (doors/windows closed)
    let allResetSensorsOff = true;
    for (const sensor of this.resetSensors) {
      const key = this.getSensorKey(sensor);
      const value = this.lastValues.get(key) ?? false;

      if (value) {
        // A door/window is OPEN (reset sensor = true) - cannot be occupied
        this.logger.log(
          `[INITIAL STATE] Reset sensor is ON (door/window open): ${sensor.deviceName || sensor.deviceId} ` +
          `(${sensor.capability}=${value}) - setting occupancy to FALSE`
        );
        allResetSensorsOff = false;
        break;
      }
    }

    if (!allResetSensorsOff) {
      // At least one door/window is open - room is not occupied
      // Pass empty string for initial state as it's not a specific sensor triggering
      // Pass true since at least one door is open (alarm_contact = true means open)
      this.callbacks.onReset('', true);
      return;
    }

    // STEP 2: Check if ANY trigger sensor is ON (motion detected)
    let anyTriggerSensorOn = false;
    for (const sensor of this.triggerSensors) {
      const key = this.getSensorKey(sensor);
      const value = this.lastValues.get(key) ?? false;

      if (value) {
        // Motion detected
        this.logger.log(
          `[INITIAL STATE] Trigger sensor active: ${sensor.deviceName || sensor.deviceId} ` +
          `(${sensor.capability}=${value})`
        );
        anyTriggerSensorOn = true;
        break;
      }
    }

    if (anyTriggerSensorOn && allResetSensorsOff) {
      // Room is OCCUPIED: all doors closed AND motion detected
      this.logger.log(
        `[INITIAL STATE] Setting occupancy to TRUE (all reset sensors OFF, at least one trigger sensor ON)`
      );
      // Pass empty string for initial state as it's not a specific sensor triggering
      // Pass true since at least one trigger sensor is ON (motion detected)
      this.callbacks.onTriggered('', true);
    } else {
      // Room is NOT OCCUPIED: no motion detected (even though all doors are closed)
      this.logger.log(
        `[INITIAL STATE] Setting occupancy to FALSE (no trigger sensors active)`
      );
      // Pass empty string for initial state as it's not a specific sensor triggering
      // Pass false since all doors are closed (reset sensors are OFF)
      this.callbacks.onReset('', false);
    }
  }

  /**
   * Sets up capability listeners for all configured sensors
   *
   * This method creates real-time capability listeners using HomeyAPI's makeCapabilityInstance().
   * Each listener receives immediate callbacks when the capability value changes.
   * This is the correct event-driven approach for monitoring device capabilities in Homey SDK v3.
   *
   * @private
   * @returns {void}
   */
  private setupEventListeners(): void {
    this.logger.log('Setting up capability listeners for all sensors');

    // Setup listeners for reset sensors (priority)
    for (const sensor of this.resetSensors) {
      this.setupSensorListener(sensor, true);
    }

    // Setup listeners for trigger sensors
    for (const sensor of this.triggerSensors) {
      this.setupSensorListener(sensor, false);
    }

    this.logger.log(`Capability listeners setup complete: ${this.capabilityInstances.size} sensors monitored`);
  }

  /**
   * Sets up a capability listener for a specific sensor using makeCapabilityInstance()
   *
   * This method uses the correct HomeyAPI pattern for monitoring device capabilities.
   * The makeCapabilityInstance() method creates a DeviceCapability object that receives
   * real-time value changes via callback, providing true event-driven monitoring.
   *
   * @private
   * @param {SensorConfig} sensor - The sensor configuration
   * @param {boolean} isResetSensor - Whether this is a reset sensor (true) or trigger sensor (false)
   * @returns {void}
   */
  private setupSensorListener(sensor: SensorConfig, isResetSensor: boolean): void {
    const device = this.deviceRefs.get(sensor.deviceId);

    if (!device) {
      this.logger.error(`Cannot setup listener - device reference not found: ${sensor.deviceId}`);
      return;
    }

    const key = this.getSensorKey(sensor);

    // Skip if listener already exists for this sensor
    if (this.capabilityInstances.has(key)) {
      this.logger.log(`Listener already exists for sensor: ${sensor.deviceName || sensor.deviceId} (${sensor.capability})`);
      return;
    }

    try {
      this.logger.log(
        `[CAPABILITY] Creating capability instance for ${isResetSensor ? 'reset' : 'trigger'} sensor: ` +
        `${sensor.deviceName || sensor.deviceId} (${sensor.capability})`
      );

      // Create real-time capability listener using makeCapabilityInstance()
      // This returns a DeviceCapability object and invokes the callback with value changes
      const capabilityInstance = device.makeCapabilityInstance?.(sensor.capability, (value: boolean) => {
        const lastValue = this.lastValues.get(key) ?? false;

        this.logger.log(
          `[CAPABILITY] ${isResetSensor ? 'Reset' : 'Trigger'} sensor value changed: ` +
          `${sensor.deviceName || sensor.deviceId} (${sensor.capability}) ` +
          `from ${lastValue} to ${value}`
        );

        // Update stored value
        if (typeof value === 'boolean') {
          this.lastValues.set(key, value);
        } else {
          this.logger.error(
            `[CAPABILITY] Unexpected value type for ${sensor.deviceName || sensor.deviceId}: ` +
            `expected boolean, got ${typeof value} (${value})`
          );
          return;
        }

        // Handle state changes based on sensor type
        if (value !== lastValue) {
          // Door sensors (reset sensors): trigger on BOTH edges (open and close are both events)
          if (isResetSensor) {
            if (value && !lastValue) {
              // Rising edge: door opened
              this.logger.log(
                `[CAPABILITY] ✅ Reset sensor RISING EDGE: ${sensor.deviceName || sensor.deviceId} ` +
                `(${sensor.capability}) changed from ${lastValue} to ${value} - DOOR OPENED - ` +
                `Calling onReset() callback with sensorId: ${sensor.deviceId}`
              );
              this.callbacks.onReset(sensor.deviceId, value);
            } else if (!value && lastValue) {
              // Falling edge: door closed
              this.logger.log(
                `[CAPABILITY] ✅ Reset sensor FALLING EDGE: ${sensor.deviceName || sensor.deviceId} ` +
                `(${sensor.capability}) changed from ${lastValue} to ${value} - DOOR CLOSED - ` +
                `Calling onReset() callback with sensorId: ${sensor.deviceId}`
              );
              this.callbacks.onReset(sensor.deviceId, value);
            }
          } else {
            // PIR sensors (trigger sensors): trigger on rising edge (motion detected) and falling edge (motion cleared)
            if (value && !lastValue) {
              this.logger.log(
                `[CAPABILITY] ✅ Trigger sensor RISING EDGE: ${sensor.deviceName || sensor.deviceId} ` +
                `(${sensor.capability}) changed from ${lastValue} to ${value} - MOTION DETECTED - ` +
                `Calling onTriggered() callback with sensorId: ${sensor.deviceId}`
              );
              this.callbacks.onTriggered(sensor.deviceId, value);
            } else if (!value && lastValue) {
              // Falling edge: motion cleared
              this.logger.log(
                `[CAPABILITY] ⬇️ Trigger sensor FALLING EDGE: ` +
                `${sensor.deviceName || sensor.deviceId} (${sensor.capability}) ` +
                `from ${lastValue} to ${value} - MOTION CLEARED - ` +
                `Calling onPirCleared() callback with sensorId: ${sensor.deviceId}`
              );
              if (this.callbacks.onPirCleared) {
                this.callbacks.onPirCleared(sensor.deviceId);
              }
            }
          }
        } else {
          this.logger.log(
            `[CAPABILITY] No change: ${sensor.deviceName || sensor.deviceId} (${sensor.capability}) ` +
            `stayed at ${value} - IGNORED`
          );
        }
      });

      // Store the capability instance for cleanup
      this.capabilityInstances.set(key, capabilityInstance);

      this.logger.log(
        `[CAPABILITY] Listener registered for ${isResetSensor ? 'reset' : 'trigger'} sensor: ` +
        `${sensor.deviceName || sensor.deviceId} (${sensor.capability})`
      );
    } catch (error) {
      this.logger.error(`Failed to setup capability listener for ${sensor.deviceId}:`, error);
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
  private async getSensorValue(sensor: SensorConfig): Promise<boolean | null> {
    try {
      // Use stored device reference (auto-updated via WebSocket)
      // This avoids re-fetching and gives us the live-updating object
      const device = this.deviceRefs.get(sensor.deviceId);

      if (!device) {
        // Don't spam logs - this warning is only shown when first encountering the issue
        if (!this.lastValues.has(this.getSensorKey(sensor))) {
          this.logger.error(`Device reference not found: ${sensor.deviceId}`);
        }
        return null;
      }

      // HomeyAPI devices use capabilitiesObj for capability access
      const capabilitiesObj = device.capabilitiesObj;

      // Debug: Log device structure on first access
      if (!this.lastValues.has(this.getSensorKey(sensor))) {
        this.logger.log(`[DEBUG] Device ${sensor.deviceId} structure:`, {
          hasCapabilitiesObj: !!capabilitiesObj,
          capabilityKeys: capabilitiesObj ? Object.keys(capabilitiesObj) : [],
          hasCapability: device.hasCapability ? 'yes' : 'no',
          hasGetCapabilityValue: device.getCapabilityValue ? 'yes' : 'no'
        });
      }

      if (!capabilitiesObj || !(sensor.capability in capabilitiesObj)) {
        this.logger.error(`Device ${sensor.deviceId} does not have capability: ${sensor.capability}`);
        return null;
      }

      // Get the capability value from the capabilitiesObj
      // This value is auto-updated by HomeyAPI via WebSocket
      const capabilityObj = capabilitiesObj[sensor.capability];
      const value = capabilityObj?.value;
      return typeof value === 'boolean' ? value : false;
    } catch (error) {
      this.logger.error(`Error reading sensor ${sensor.deviceId}:`, error);
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
