import Homey from 'homey';
import {
  SensorConfig,
  HomeyAPI,
  HomeyAPIDevice,
  ZoneSealState,
} from '../../lib/types';
import { ContactSensorAggregator } from '../../lib/ContactSensorAggregator';
import { ZoneSealEngine, StateTransition } from '../../lib/ZoneSealEngine';
import { validateSensorSettings, validateNumber } from '../../lib/SensorSettingsValidator';

/**
 * Interface for WIABApp with HomeyAPI
 */
interface WIABApp extends Homey.App {
  homeyApi?: HomeyAPI;
}

/**
 * Stale sensor tracking information.
 *
 * Tracks when a sensor was last updated to detect stale sensors.
 *
 * @interface StaleSensorInfo
 * @property {number} lastUpdated - Timestamp of last update in milliseconds
 * @property {boolean} isStale - Whether sensor is currently marked as stale
 */
interface StaleSensorInfo {
  lastUpdated: number;
  isStale: boolean;
}

/**
 * WIAB Zone Seal virtual device.
 *
 * This device monitors configured contact sensors (doors, windows) and provides
 * a zone seal state with configurable delay timers. The device implements:
 * - OR-logic aggregation: ANY sensor open → zone is leaky
 * - Delay timers: Configurable delays before state transitions
 * - Stale sensor detection: Marks sensors stale after timeout
 * - Event-driven monitoring: Uses HomeyAPI WebSocket for real-time updates
 *
 * State Machine:
 * - SEALED: All sensors closed (zone is sealed)
 * - OPEN_DELAY: Waiting before marking zone as leaky
 * - LEAKY: At least one sensor open (zone is leaky)
 * - CLOSE_DELAY: Waiting before marking zone as sealed
 *
 * Lifecycle:
 * 1. onInit() - Initialize state from current sensor values (no delays)
 * 2. onSettings() - Reconfigure monitoring when settings change
 * 3. onDeleted() - Cleanup all timers and monitoring resources
 *
 * Flow Cards:
 * - Triggers: zone_became_sealed, zone_became_leaky, zone_seal_changed,
 *   sensor_became_stale, stale_state_ended, stale_state_changed
 * - Conditions: is_sealed, has_stale_sensors
 *
 * @class WIABZoneSealDevice
 * @extends {Homey.Device}
 */
class WIABZoneSealDevice extends Homey.Device {
  private contactSensors: SensorConfig[] = [];
  private aggregator?: ContactSensorAggregator;
  private engine?: ZoneSealEngine;
  private deviceListeners: Map<string, unknown> = new Map();
  private delayTimer?: NodeJS.Timeout;
  private staleSensorMap: Map<string, StaleSensorInfo> = new Map();
  private staleCheckInterval?: NodeJS.Timeout;
  private staleTimeoutMs: number = 30 * 60 * 1000; // Default 30 minutes

  /**
   * Initializes the WIAB Zone Seal device.
   *
   * Initialization process:
   * 1. Parse and validate sensor configuration
   * 2. Initialize ContactSensorAggregator and ZoneSealEngine
   * 3. Determine initial state from current sensor values (no delays)
   * 4. Setup event-driven monitoring via HomeyAPI WebSocket
   * 5. Initialize stale sensor tracking
   * 6. Register flow card handlers
   *
   * @returns {Promise<void>}
   */
  async onInit(): Promise<void> {
    this.log('WIAB Zone Seal device initializing');

    try {
      // Setup sensor monitoring with current settings
      await this.setupSensorMonitoring();

      // Register flow card handlers
      this.registerFlowCardHandlers();

      this.log('WIAB Zone Seal device initialization complete');
    } catch (error) {
      this.error('Failed to initialize Zone Seal device:', error);
      // Don't throw - allow device to exist in degraded mode
    }
  }

  /**
   * Handles device settings changes.
   *
   * When sensor configuration or delay settings change, teardown existing
   * monitoring and restart with new settings.
   *
   * @param event - Settings change event
   * @returns {Promise<void>}
   */
  async onSettings(event: {
    oldSettings: { [key: string]: unknown };
    newSettings: { [key: string]: unknown };
    changedKeys: string[];
  }): Promise<void> {
    this.log('Zone Seal device settings changed:', event.changedKeys);

    // Check if sensor configuration changed
    const sensorSettingsChanged = event.changedKeys.includes('contactSensors');

    // Check if delay settings changed
    const delaySettingsChanged =
      event.changedKeys.includes('openDelaySeconds') ||
      event.changedKeys.includes('closeDelaySeconds');

    // Check if stale timeout changed
    const staleTimeoutChanged = event.changedKeys.includes('staleContactMinutes');

    if (sensorSettingsChanged || staleTimeoutChanged) {
      this.log('Sensor configuration or stale timeout changed, reinitializing monitoring');

      // Teardown existing monitoring
      this.teardownSensorMonitoring();

      // Setup new monitoring with updated settings
      await this.setupSensorMonitoring();
    } else if (delaySettingsChanged) {
      this.log('Delay settings changed, updating engine configuration');

      // Update engine configuration without reinitializing
      const openDelaySeconds = validateNumber(
        event.newSettings.openDelaySeconds,
        0,
        0,
        300
      );
      const closeDelaySeconds = validateNumber(
        event.newSettings.closeDelaySeconds,
        0,
        0,
        300
      );

      this.engine?.updateConfig({ openDelaySeconds, closeDelaySeconds });
      this.log(`Updated delays: open=${openDelaySeconds}s, close=${closeDelaySeconds}s`);
    }
  }

  /**
   * Handles device deletion.
   *
   * Cleanup all timers, listeners, and monitoring to prevent memory leaks.
   *
   * @returns {Promise<void>}
   */
  async onDeleted(): Promise<void> {
    this.log('Zone Seal device deleted, cleaning up resources');
    this.teardownSensorMonitoring();
  }

  /**
   * Handles device addition (after pairing completes).
   *
   * Called when the device is first added to Homey. This is a good place
   * to log initial state or perform any post-pairing setup.
   *
   * @returns {Promise<void>}
   */
  async onAdded(): Promise<void> {
    this.log('Zone Seal device added to Homey');
  }

  /**
   * Sets up sensor monitoring based on current device settings.
   *
   * This method:
   * 1. Retrieves and validates sensor configurations
   * 2. Initializes ContactSensorAggregator with current values
   * 3. Creates ZoneSealEngine with delay configuration
   * 4. Determines initial state (no delays)
   * 5. Registers WebSocket listeners for sensor updates
   * 6. Starts stale sensor monitoring
   *
   * @private
   * @returns {Promise<void>}
   */
  private async setupSensorMonitoring(): Promise<void> {
    try {
      // Get sensor configurations from device settings
      const contactSensorsJson = this.getSetting('contactSensors') as string;
      this.contactSensors = validateSensorSettings(contactSensorsJson, this);

      if (this.contactSensors.length === 0) {
        this.log('No contact sensors configured, device in idle state');
        // Set sealed state (no sensors = no openings)
        await this.setCapabilityValue('alarm_zone_leaky', false);
        return;
      }

      this.log(`Configuring monitoring for ${this.contactSensors.length} contact sensors`);

      // Get HomeyAPI instance from app
      const app = this.homey.app as WIABApp;
      if (!app || !app.homeyApi) {
        throw new Error('Homey API not available');
      }

      const homeyApi = app.homeyApi;

      // Get stale timeout setting
      const staleContactMinutes = validateNumber(
        this.getSetting('staleContactMinutes'),
        30,
        5,
        120
      );
      this.staleTimeoutMs = staleContactMinutes * 60 * 1000;
      this.log(`Stale timeout: ${staleContactMinutes} minutes`);

      // Initialize aggregator
      this.aggregator = new ContactSensorAggregator(this.contactSensors);

      // Read current sensor values to initialize aggregator
      const devices = await homeyApi.devices.getDevices();
      const currentValues = new Map<string, boolean>();

      for (const sensor of this.contactSensors) {
        const device = devices[sensor.deviceId];
        if (device && device.capabilitiesObj) {
          const capabilityValue = device.capabilitiesObj[sensor.capability]?.value;
          const isOpen = typeof capabilityValue === 'boolean' ? capabilityValue : false;
          currentValues.set(sensor.deviceId, isOpen);
          this.log(`Initial value: ${sensor.deviceName || sensor.deviceId} = ${isOpen}`);

          // Initialize stale tracking
          this.staleSensorMap.set(sensor.deviceId, {
            lastUpdated: Date.now(),
            isStale: false,
          });
        } else {
          this.log(`Warning: Device ${sensor.deviceId} not found or has no capabilities`);
        }
      }

      // Initialize aggregator with current values
      this.aggregator.initializeFromValues(currentValues);

      // Get delay configuration
      const openDelaySeconds = validateNumber(
        this.getSetting('openDelaySeconds'),
        0,
        0,
        300
      );
      const closeDelaySeconds = validateNumber(
        this.getSetting('closeDelaySeconds'),
        0,
        0,
        300
      );

      this.log(`Delay configuration: open=${openDelaySeconds}s, close=${closeDelaySeconds}s`);

      // Determine initial state from current sensor values (no delays)
      const initiallySealed = this.aggregator.areAllClosed();
      const initialState = initiallySealed ? ZoneSealState.SEALED : ZoneSealState.LEAKY;

      this.log(`Initial zone seal state: ${initialState}`);

      // Create engine with initial state (pure state machine, no callbacks)
      this.engine = new ZoneSealEngine(
        { openDelaySeconds, closeDelaySeconds },
        initialState
      );

      // Set initial capability values
      await this.setCapabilityValue('alarm_zone_leaky', !initiallySealed);

      // Register WebSocket listeners for all contact sensors
      for (const sensor of this.contactSensors) {
        const device = devices[sensor.deviceId];
        if (device) {
          await this.registerDeviceListener(device, sensor);
        }
      }

      // Start stale sensor monitoring
      this.startStaleMonitoring();

      this.log('Sensor monitoring initialized successfully');
    } catch (error) {
      this.error('Failed to setup sensor monitoring:', error);
      // Don't throw - allow device to function in degraded mode
    }
  }

  /**
   * Registers a WebSocket listener for a specific sensor device.
   *
   * The listener is called whenever the sensor's capability value changes.
   * It updates the aggregator, engine, and triggers flow cards as needed.
   *
   * @private
   * @param device - The HomeyAPI device object
   * @param sensor - The sensor configuration
   * @returns {Promise<void>}
   */
  private async registerDeviceListener(
    device: HomeyAPIDevice,
    sensor: SensorConfig
  ): Promise<void> {
    const handler = (value: boolean) => {
      const isOpen = typeof value === 'boolean' ? value : false;
      this.log(
        `Sensor update: ${sensor.deviceName || sensor.deviceId} = ${isOpen}`
      );

      // Update stale tracking
      this.updateStaleSensorTracking(sensor.deviceId);

      // Update aggregator
      this.aggregator?.updateSensorState(sensor.deviceId, isOpen);

      // Handle state transitions
      this.handleSensorUpdate();
    };

    // Create capability instance using makeCapabilityInstance
    const extendedDevice = device as unknown as {
      makeCapabilityInstance?: (capability: string, callback: (value: boolean) => void) => unknown;
    };

    if (extendedDevice.makeCapabilityInstance) {
      const capabilityInstance = extendedDevice.makeCapabilityInstance(
        sensor.capability,
        handler
      );

      // Store capability instance for cleanup
      this.deviceListeners.set(sensor.deviceId, capabilityInstance);

      this.log(`Registered listener for ${sensor.deviceName || sensor.deviceId}`);
    } else {
      this.error(`Device ${sensor.deviceId} does not support makeCapabilityInstance`);
    }
  }

  /**
   * Handles sensor update by evaluating state transitions.
   *
   * This method is called whenever a sensor's state changes. It determines
   * whether the zone is sealed or leaky, and handles state transitions
   * according to the configured delay logic.
   *
   * @private
   * @returns {Promise<void>}
   */
  private async handleSensorUpdate(): Promise<void> {
    try {
      if (!this.aggregator || !this.engine) {
        return;
      }

      // Filter out stale sensors from consideration
      const nonStaleSensors = this.contactSensors.filter((sensor) => {
        const info = this.staleSensorMap.get(sensor.deviceId);
        return info && !info.isStale;
      });

      // If all sensors are stale, treat as all closed (sealed)
      if (nonStaleSensors.length === 0) {
        this.log('All sensors are stale, treating zone as sealed');
        const transition = this.engine.handleAllSensorsClosed();
        await this.processStateTransition(transition);
        return;
      }

      // Check aggregated state (excluding stale sensors)
      const allClosed = this.areNonStaleSensorsClosed();
      const anyOpen = this.isAnyNonStaleSensorOpen();

      this.log(`Sensor update: allClosed=${allClosed}, anyOpen=${anyOpen}`);

      // Evaluate state transition
      let transition: StateTransition;

      if (allClosed) {
        // All non-stale sensors closed
        transition = this.engine.handleAllSensorsClosed();
      } else if (anyOpen) {
        // At least one non-stale sensor open
        transition = this.engine.handleAnySensorOpened();
      } else {
        // Should not happen (either all closed or any open)
        this.log('Warning: Unexpected sensor state (neither all closed nor any open)');
        return;
      }

      // Process the transition
      await this.processStateTransition(transition);
    } catch (error) {
      this.error('Failed to handle sensor update:', error);
    }
  }

  /**
   * Checks if all non-stale sensors are closed.
   *
   * @private
   * @returns {boolean} True if all non-stale sensors are closed
   */
  private areNonStaleSensorsClosed(): boolean {
    if (!this.aggregator) {
      return true;
    }

    for (const sensor of this.contactSensors) {
      const info = this.staleSensorMap.get(sensor.deviceId);
      // Skip stale sensors
      if (info && info.isStale) {
        continue;
      }

      // Check if sensor is open
      const state = this.aggregator.getSensorState(sensor.deviceId);
      if (state === true) {
        return false; // Found an open sensor
      }
    }

    return true; // All non-stale sensors are closed
  }

  /**
   * Checks if any non-stale sensor is open.
   *
   * @private
   * @returns {boolean} True if any non-stale sensor is open
   */
  private isAnyNonStaleSensorOpen(): boolean {
    if (!this.aggregator) {
      return false;
    }

    for (const sensor of this.contactSensors) {
      const info = this.staleSensorMap.get(sensor.deviceId);
      // Skip stale sensors
      if (info && info.isStale) {
        continue;
      }

      // Check if sensor is open
      const state = this.aggregator.getSensorState(sensor.deviceId);
      if (state === true) {
        return true; // Found an open sensor
      }
    }

    return false; // No non-stale sensors are open
  }

  /**
   * Processes a state transition from the engine.
   *
   * If the transition is immediate, updates state immediately.
   * If delayed, schedules a timer to complete the transition.
   *
   * @private
   * @param transition - State transition result from engine
   * @returns {Promise<void>}
   */
  private async processStateTransition(transition: StateTransition): Promise<void> {
    this.log(
      `Processing transition: ${transition.newState} (immediate: ${transition.immediate})`
    );

    if (transition.immediate) {
      // Immediate transition - update state now
      await this.updateZoneSealState(transition.newState);
    } else if (transition.delaySeconds !== undefined) {
      // Delayed transition - schedule timer
      this.scheduleDelayTimer(transition.newState, transition.delaySeconds);
    }
  }

  /**
   * Schedules a delay timer for state transition.
   *
   * Cancels any existing timer before scheduling a new one.
   *
   * @private
   * @param targetState - State to transition to after delay
   * @param delaySeconds - Delay duration in seconds
   * @returns {void}
   */
  private scheduleDelayTimer(targetState: ZoneSealState, delaySeconds: number): void {
    // Cancel any existing timer
    this.cancelDelayTimer();

    this.log(`Scheduling ${delaySeconds}s delay timer for transition to ${targetState}`);

    this.delayTimer = setTimeout(async () => {
      this.log(`Delay timer expired, transitioning to ${targetState}`);
      await this.updateZoneSealState(targetState);
    }, delaySeconds * 1000);
  }

  /**
   * Cancels any active delay timer.
   *
   * @private
   * @returns {void}
   */
  private cancelDelayTimer(): void {
    if (this.delayTimer) {
      clearTimeout(this.delayTimer);
      this.delayTimer = undefined;
      this.log('Delay timer cancelled');
    }
  }

  /**
   * Updates the zone seal state and triggers appropriate flow cards.
   *
   * @private
   * @param state - New zone seal state
   * @returns {Promise<void>}
   */
  private async updateZoneSealState(state: ZoneSealState): Promise<void> {
    try {
      this.log(`Updating zone seal state to: ${state}`);

      // Update engine state
      this.engine?.setCurrentState(state);

      // Determine boolean sealed value
      const isSealed = state === ZoneSealState.SEALED;
      await this.setCapabilityValue('alarm_zone_leaky', !isSealed);

      // Trigger state change flow card
      await this.handleStateChanged(state);

      this.log(`Zone seal state updated to: ${state} (sealed: ${isSealed})`);
    } catch (error) {
      this.error('Failed to update zone seal state:', error);
    }
  }

  /**
   * Handles zone seal state change.
   *
   * Triggers the appropriate flow cards based on state.
   *
   * @private
   * @param state - New zone seal state
   * @returns {Promise<void>}
   */
  private async handleStateChanged(state: ZoneSealState): Promise<void> {
    try {
      const isLeaky = state !== ZoneSealState.SEALED;

      // Trigger zone_status_changed with token
      await this.homey.flow
        .getDeviceTriggerCard('zone_status_changed')
        .trigger(this, { is_leaky: isLeaky });
      this.log(`Triggered zone_status_changed flow card: is_leaky=${isLeaky}`);

      // Trigger specific state flow card
      if (isLeaky) {
        await this.homey.flow.getDeviceTriggerCard('zone_leaky').trigger(this);
        this.log('Triggered zone_leaky flow card');
      } else {
        await this.homey.flow.getDeviceTriggerCard('zone_sealed').trigger(this);
        this.log('Triggered zone_sealed flow card');
      }
    } catch (error) {
      this.error('Failed to trigger flow card:', error);
    }
  }

  /**
   * Handles open delay timer starting.
   *
   * @private
   * @param delaySeconds - Delay duration in seconds
   * @returns {void}
   */
  private handleOpenDelayStarted(delaySeconds: number): void {
    this.log(`Open delay started: ${delaySeconds}s`);
  }

  /**
   * Handles open delay timer cancellation.
   *
   * @private
   * @returns {void}
   */
  private handleOpenDelayCancelled(): void {
    this.log('Open delay cancelled');
  }

  /**
   * Handles close delay timer starting.
   *
   * @private
   * @param delaySeconds - Delay duration in seconds
   * @returns {void}
   */
  private handleCloseDelayStarted(delaySeconds: number): void {
    this.log(`Close delay started: ${delaySeconds}s`);
  }

  /**
   * Handles close delay timer cancellation.
   *
   * @private
   * @returns {void}
   */
  private handleCloseDelayCancelled(): void {
    this.log('Close delay cancelled');
  }

  /**
   * Starts stale sensor monitoring.
   *
   * Checks sensors periodically for stale detection.
   *
   * @private
   * @returns {void}
   */
  private startStaleMonitoring(): void {
    // Check every minute
    const checkIntervalMs = 60 * 1000;

    this.staleCheckInterval = setInterval(() => {
      this.checkForStaleSensors();
    }, checkIntervalMs);

    this.log('Stale sensor monitoring started');
  }

  /**
   * Stops stale sensor monitoring.
   *
   * @private
   * @returns {void}
   */
  private stopStaleMonitoring(): void {
    if (this.staleCheckInterval) {
      clearInterval(this.staleCheckInterval);
      this.staleCheckInterval = undefined;
      this.log('Stale sensor monitoring stopped');
    }
  }

  /**
   * Updates stale sensor tracking for a specific sensor.
   *
   * Called when a sensor update is received.
   *
   * @private
   * @param sensorId - Device ID of the sensor
   * @returns {void}
   */
  private updateStaleSensorTracking(sensorId: string): void {
    const info = this.staleSensorMap.get(sensorId);
    if (info) {
      const wasStale = info.isStale;
      info.lastUpdated = Date.now();
      info.isStale = false;

      // If sensor was stale and now fresh, trigger flow card
      if (wasStale) {
        this.log(`Sensor ${sensorId} is now fresh (was stale)`);
        this.checkForStaleStateChanged();
      }
    }
  }

  /**
   * Checks all sensors for stale detection.
   *
   * Marks sensors as stale if they haven't updated within the timeout.
   * Triggers flow cards when stale state changes.
   *
   * @private
   * @returns {void}
   */
  private checkForStaleSensors(): void {
    const now = Date.now();
    let hasChanges = false;

    for (const sensor of this.contactSensors) {
      const info = this.staleSensorMap.get(sensor.deviceId);
      if (!info) {
        continue;
      }

      const timeSinceUpdate = now - info.lastUpdated;
      const shouldBeStale = timeSinceUpdate > this.staleTimeoutMs;

      // Check if stale state changed
      if (shouldBeStale && !info.isStale) {
        // Sensor became stale
        info.isStale = true;
        hasChanges = true;

        this.log(`Sensor became stale: ${sensor.deviceName || sensor.deviceId}`);

        // Trigger sensor_became_stale flow card
        this.triggerSensorBecameStale(sensor.deviceName || sensor.deviceId, sensor.deviceId);
      }
    }

    // Check if stale state changed (any sensors stale or all fresh)
    if (hasChanges) {
      this.checkForStaleStateChanged();
    }
  }

  /**
   * Checks if overall stale state changed and triggers flow cards.
   *
   * @private
   * @returns {void}
   */
  private checkForStaleStateChanged(): void {
    const hasAnyStaleSensors = Array.from(this.staleSensorMap.values()).some(
      (info) => info.isStale
    );

    // Trigger stale_state_changed flow card
    this.triggerStaleStateChanged(hasAnyStaleSensors);

    // If all sensors fresh, trigger stale_state_ended
    if (!hasAnyStaleSensors) {
      this.log('All sensors are now fresh');
      this.triggerStaleStateEnded();
    }
  }

  /**
   * Triggers contact_stale flow card when a sensor becomes stale.
   *
   * @private
   * @param deviceName - Name of the device
   * @param deviceId - ID of the device
   * @returns {void}
   */
  private async triggerSensorBecameStale(
    deviceName: string,
    deviceId: string
  ): Promise<void> {
    try {
      await this.homey.flow
        .getDeviceTriggerCard('contact_stale')
        .trigger(this, { sensor_name: deviceName });

      this.log(`Triggered contact_stale for ${deviceName}`);
    } catch (error) {
      this.error('Failed to trigger contact_stale flow card:', error);
    }
  }

  /**
   * Triggers zone_no_stale_sensors flow card when all sensors become unstale.
   *
   * @private
   * @returns {void}
   */
  private async triggerStaleStateEnded(): Promise<void> {
    try {
      await this.homey.flow.getDeviceTriggerCard('zone_no_stale_sensors').trigger(this);

      this.log('Triggered zone_no_stale_sensors flow card');
    } catch (error) {
      this.error('Failed to trigger zone_no_stale_sensors flow card:', error);
    }
  }

  /**
   * Triggers stale_status_changed flow card when stale status changes.
   *
   * @private
   * @param hasStale - Whether any sensors are stale
   * @returns {void}
   */
  private async triggerStaleStateChanged(hasStale: boolean): Promise<void> {
    try {
      await this.homey.flow
        .getDeviceTriggerCard('stale_status_changed')
        .trigger(this, { has_stale: hasStale });

      this.log(`Triggered stale_status_changed: has_stale=${hasStale}`);
    } catch (error) {
      this.error('Failed to trigger stale_status_changed flow card:', error);
    }
  }

  /**
   * Tears down sensor monitoring and cleans up resources.
   *
   * @private
   * @returns {void}
   */
  private teardownSensorMonitoring(): void {
    this.log('Tearing down sensor monitoring');

    // Cancel any active delay timer
    this.cancelDelayTimer();

    // Stop stale monitoring
    this.stopStaleMonitoring();

    // Remove all WebSocket listeners
    if (this.deviceListeners.size > 0) {
      const app = this.homey.app as WIABApp;
      if (app && app.homeyApi) {
        // Capability instances are automatically cleaned up by HomeyAPI
        // Just clear our references
        this.deviceListeners.clear();
        this.log('Cleared device listener references');
      }
    }

    // Clear listeners map
    this.deviceListeners.clear();

    // Clear stale tracking
    this.staleSensorMap.clear();

    // Clear components
    this.aggregator = undefined;
    this.engine = undefined;

    this.log('Sensor monitoring torn down');
  }

  /**
   * Checks if zone has any stale sensors.
   *
   * Public method for flow card condition handlers.
   *
   * @public
   * @returns {boolean} True if at least one sensor is stale
   */
  public hasAnyStaleSensors(): boolean {
    return Array.from(this.staleSensorMap.values()).some((info) => info.isStale);
  }

  /**
   * Registers flow card handlers for triggers and conditions.
   *
   * Called during device initialization to register the handlers that will
   * be invoked when flow cards are used in flows.
   *
   * @private
   * @returns {void}
   */
  private registerFlowCardHandlers(): void {
    try {
      // Register is_zone_leaky condition handler
      const isLeakyCard = this.homey.flow.getConditionCard('is_zone_leaky');
      if (isLeakyCard) {
        isLeakyCard.registerRunListener(
          async (args: { device: WIABZoneSealDevice }): Promise<boolean> => {
            try {
              const leaky = args.device.getCapabilityValue('alarm_zone_leaky') as boolean;
              args.device.log(`is_zone_leaky condition evaluated: ${leaky}`);
              return leaky;
            } catch (error) {
              args.device.error('is_zone_leaky condition evaluation failed:', error);
              throw error;
            }
          }
        );
        this.log('Registered is_zone_leaky condition handler');
      }

      // Register has_stale_sensor condition handler
      const hasStaleSensorCard = this.homey.flow.getConditionCard('has_stale_sensor');
      if (hasStaleSensorCard) {
        hasStaleSensorCard.registerRunListener(
          async (args: { device: WIABZoneSealDevice }): Promise<boolean> => {
            try {
              const hasStale = args.device.hasAnyStaleSensors();
              args.device.log(`has_stale_sensor condition evaluated: ${hasStale}`);
              return hasStale;
            } catch (error) {
              args.device.error('has_stale_sensor condition evaluation failed:', error);
              throw error;
            }
          }
        );
        this.log('Registered has_stale_sensor condition handler');
      }

      this.log('Flow card handlers registered successfully');
    } catch (error) {
      this.error('Failed to register flow card handlers:', error);
      throw error;
    }
  }
}

export default WIABZoneSealDevice;
module.exports = WIABZoneSealDevice;
