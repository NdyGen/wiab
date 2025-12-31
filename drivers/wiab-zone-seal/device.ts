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
import { BaseWIABDevice } from '../../lib/BaseWIABDevice';
import { ZoneSealErrorId } from '../../constants/errorIds';
import { ErrorSeverity } from '../../lib/ErrorTypes';

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
 * @extends {BaseWIABDevice}
 */
class WIABZoneSealDevice extends BaseWIABDevice {
  private contactSensors: SensorConfig[] = [];
  private aggregator?: ContactSensorAggregator;
  private engine?: ZoneSealEngine;
  private deviceListeners: Map<string, unknown> = new Map();
  private delayTimer?: NodeJS.Timeout;
  private staleSensorMap: Map<string, StaleSensorInfo> = new Map();
  private staleCheckInterval?: NodeJS.Timeout;
  private staleTimeoutMs: number = 30 * 60 * 1000; // Default 30 minutes

  // Error handling utilities inherited from BaseWIABDevice:
  // - warningManager
  // - errorReporter
  // - flowCardHandler
  // - retryManager
  // - errorClassifier

  /**
   * Initializes the WIAB Zone Seal device.
   *
   * Initialization process:
   * 1. Initialize error handling utilities (WarningManager, ErrorReporter, etc.)
   * 2. Parse and validate sensor configuration
   * 3. Initialize ContactSensorAggregator and ZoneSealEngine
   * 4. Determine initial state from current sensor values (no delays)
   * 5. Setup event-driven monitoring via HomeyAPI WebSocket
   * 6. Initialize stale sensor tracking
   * 7. Register flow card handlers
   *
   * Error Handling:
   * - Uses WarningManager to set device warning on initialization failure
   * - Uses ErrorReporter for structured error logging
   * - Device remains in degraded mode if initialization fails
   *
   * @returns {Promise<void>}
   */
  async onInit(): Promise<void> {
    this.log('WIAB Zone Seal device initializing');

    // Orchestrate initialization steps
    this.initializeErrorHandling();

    try {
      await this.loadSensorConfiguration();
      await this.initializeState();
      await this.setupMonitoring();

      this.log('WIAB Zone Seal device initialization complete');
    } catch (error) {
      await this.handleInitializationError(error);
    }
  }

  /**
   * Loads and validates sensor configuration.
   *
   * This method sets up sensor monitoring with current settings, which includes:
   * - Retrieving sensor configuration from settings
   * - Validating sensor configuration
   * - Initializing ContactSensorAggregator and ZoneSealEngine
   */
  private async loadSensorConfiguration(): Promise<void> {
    await this.setupSensorMonitoring();
  }

  /**
   * Initializes device state and registers flow card handlers.
   *
   * Called after sensor configuration is loaded to set up the device's
   * operational state.
   */
  private async initializeState(): Promise<void> {
    // Register flow card handlers
    this.registerFlowCardHandlers();

    // Clear any previous warning on successful initialization
    try {
      await this.warningManager!.clearWarning();
    } catch (warningError) {
      this.error('Failed to clear warning after successful initialization:', warningError);
    }
  }

  /**
   * Sets up monitoring (stale sensor tracking and event listeners).
   *
   * Note: Most monitoring setup is handled by setupSensorMonitoring().
   * This method is a placeholder for any additional monitoring setup
   * that may be added in the future.
   */
  private async setupMonitoring(): Promise<void> {
    // Monitoring is already set up by setupSensorMonitoring()
    // This method exists for consistency with the WIAB device pattern
    // and for future extensibility
  }

  /**
   * Handles initialization errors by reporting and setting device warning.
   *
   * Device remains in degraded mode instead of failing completely.
   *
   * @param error - The error that occurred during initialization
   */
  private async handleInitializationError(error: unknown): Promise<void> {
    const err = error instanceof Error ? error : new Error(String(error));

    this.errorReporter!.reportError({
      errorId: ZoneSealErrorId.DEVICE_INIT_FAILED,
      severity: ErrorSeverity.CRITICAL,
      userMessage: 'Device initialization failed. Check sensor configuration.',
      technicalMessage: `Failed to initialize Zone Seal device: ${err.message}\n${err.stack || 'No stack trace available'}`,
      context: { deviceId: this.getData().id },
    });

    try {
      await this.warningManager!.setWarning(
        ZoneSealErrorId.DEVICE_INIT_FAILED,
        'Device initialization failed. Check sensor configuration in settings.'
      );
    } catch (warningError) {
      this.error('Failed to set warning on device:', warningError);
    }

    // Don't throw - allow device to exist in degraded mode
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

    try {
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

        // Clear warning on successful settings update
        try {
          await this.warningManager!.clearWarning();
        } catch (warningError) {
          this.error('Failed to clear warning after settings update:', warningError);
        }

        this.log('Settings applied successfully');
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

        if (!this.engine) {
          throw new Error('Zone seal engine not initialized');
        }

        this.engine.updateConfig({ openDelaySeconds, closeDelaySeconds });
        this.log(`Updated delays: open=${openDelaySeconds}s, close=${closeDelaySeconds}s`);
      }
    } catch (error) {
      this.errorReporter!.reportError({
        errorId: ZoneSealErrorId.SETTINGS_UPDATE_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'Failed to apply settings. Check sensor configuration.',
        technicalMessage: `Failed to update settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
        context: {
          deviceId: this.getData().id,
          changedKeys: event.changedKeys,
        },
      });

      try {
        await this.warningManager!.setWarning(
          ZoneSealErrorId.SETTINGS_UPDATE_FAILED,
          'Failed to apply settings. Check sensor configuration and try again.'
        );
      } catch (warningError) {
        this.error('Failed to set warning after settings error:', warningError);
      }

      throw error; // Re-throw to show error in Homey settings UI
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

      // Get HomeyAPI instance from app with retry logic
      const app = this.homey.app as WIABApp;

      if (!this.retryManager) {
        throw new Error('RetryManager not initialized');
      }

      // Retry getting HomeyAPI (may not be ready during device initialization)
      const homeyApiResult = await this.retryManager.retryWithBackoff(
        async () => {
          if (!app || !app.homeyApi) {
            throw new Error('HomeyAPI not available');
          }
          return app.homeyApi;
        },
        'Wait for HomeyAPI availability',
        {
          maxAttempts: 5,
          initialDelayMs: 1000,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
        }
      );

      if (!homeyApiResult.success) {
        throw new Error(
          `HomeyAPI not available after ${homeyApiResult.attempts} attempts: ${homeyApiResult.error?.message || 'Unknown error'}`
        );
      }

      const homeyApi = homeyApiResult.value!;

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
      this.errorReporter!.reportError({
        errorId: ZoneSealErrorId.SENSOR_MONITORING_SETUP_FAILED,
        severity: ErrorSeverity.CRITICAL,
        userMessage: 'Cannot connect to sensors. Check device configuration.',
        technicalMessage: `Failed to setup sensor monitoring: ${error instanceof Error ? error.message : 'Unknown error'}`,
        context: { deviceId: this.getData().id },
      });

      try {
        await this.warningManager!.setWarning(
          ZoneSealErrorId.SENSOR_MONITORING_SETUP_FAILED,
          'Cannot connect to sensors. Check device configuration in settings.'
        );
      } catch (warningError) {
        this.error('Failed to set warning for sensor monitoring setup failure:', warningError);
      }

      throw error; // Re-throw to propagate to onInit or onSettings
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

      // Handle state transitions (fire-and-forget)
      void this.handleSensorUpdate();
    };

    // Subscribe to capability changes via WebSocket using makeCapabilityInstance
    // Returns listener reference for cleanup during teardown
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
   * This method orchestrates the state evaluation process by:
   * 1. Checking fail-safe conditions (stale sensors)
   * 2. Evaluating normal state transitions if no fail-safe triggered
   *
   * @private
   * @returns {Promise<void>}
   */
  private async handleSensorUpdate(): Promise<void> {
    try {
      if (!this.aggregator || !this.engine) {
        return;
      }

      // PRIORITY 1: Check fail-safe conditions (stale sensors)
      const failSafeTriggered = await this.checkFailSafeConditions();
      if (failSafeTriggered) {
        return; // Fail-safe triggered, exit early
      }

      // PRIORITY 2: Evaluate normal state transition
      await this.evaluateNormalStateTransition();
    } catch (error) {
      this.errorReporter!.reportError({
        errorId: ZoneSealErrorId.SENSOR_UPDATE_HANDLER_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'Sensor state update failed. Device may not respond to changes.',
        technicalMessage: `Failed to handle sensor update: ${error instanceof Error ? error.message : 'Unknown error'}`,
        context: {
          deviceId: this.getData().id,
          engineState: this.engine?.getCurrentState(),
        },
      });

      // Don't throw - sensor updates are frequent, continue monitoring
    }
  }

  /**
   * Checks fail-safe conditions for stale sensors.
   *
   * Fail-safe priority order:
   * 1. If any stale sensor's last value was "open" → treat zone as leaky
   * 2. If all sensors are stale → treat zone as leaky
   *
   * @private
   * @returns {Promise<boolean>} True if fail-safe was triggered
   */
  private async checkFailSafeConditions(): Promise<boolean> {
    if (!this.aggregator || !this.engine) {
      return false;
    }

    // PRIORITY 1: Check if ANY stale sensor's last value was "open"
    const staleSensorsOpen = this.contactSensors.filter((sensor) => {
      const info = this.staleSensorMap.get(sensor.deviceId);
      if (!info || !info.isStale) {
        return false;
      }

      const lastValue = this.aggregator?.getSensorState(sensor.deviceId);
      return lastValue === true;
    });

    if (staleSensorsOpen.length > 0) {
      const sensorNames = staleSensorsOpen
        .map((s) => s.deviceName || s.deviceId)
        .join(', ');
      this.log(
        `Fail-safe: ${staleSensorsOpen.length} stale sensor(s) were open (${sensorNames}), treating zone as leaky`
      );

      const transition = this.engine.handleAnySensorOpened();
      await this.processStateTransition(transition);
      return true;
    }

    // PRIORITY 2: Check if all sensors are stale
    const nonStaleSensorCount = this.contactSensors.filter((sensor) => {
      const info = this.staleSensorMap.get(sensor.deviceId);
      return !info || !info.isStale;
    }).length;

    if (nonStaleSensorCount === 0) {
      this.log('All sensors are stale, treating zone as leaky (fail-safe)');
      const transition = this.engine.handleAnySensorOpened();
      await this.processStateTransition(transition);
      return true;
    }

    return false;
  }

  /**
   * Evaluates normal state transition based on non-stale sensor states.
   *
   * Determines whether zone should be sealed or leaky based on current
   * sensor values, then processes the appropriate state transition.
   *
   * @private
   * @returns {Promise<void>}
   */
  private async evaluateNormalStateTransition(): Promise<void> {
    if (!this.aggregator || !this.engine) {
      return;
    }

    // Check aggregated state (stale sensors are ignored)
    const allClosed = this.areNonStaleSensorsClosed();
    const anyOpen = this.isAnyNonStaleSensorOpen();

    const nonStaleSensorCount = this.contactSensors.filter((sensor) => {
      const info = this.staleSensorMap.get(sensor.deviceId);
      return !info || !info.isStale;
    }).length;

    this.log(
      `Sensor update: allClosed=${allClosed}, anyOpen=${anyOpen} (evaluating ${nonStaleSensorCount}/${this.contactSensors.length} non-stale sensors)`
    );

    // Capture current state before evaluating transition (for redundancy check)
    const previousState = this.engine.getCurrentState();

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

    // Process the transition with previous state for redundancy check
    await this.processStateTransition(transition, previousState);
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
   * @param previousState - State before the transition (for redundancy check)
   * @returns {Promise<void>}
   */
  private async processStateTransition(
    transition: StateTransition,
    previousState?: ZoneSealState
  ): Promise<void> {
    this.log(
      `Processing transition: ${transition.newState} (immediate: ${transition.immediate})`
    );

    if (transition.immediate) {
      // Only update if state actually changed (prevents redundant flow card triggers)
      if (previousState !== undefined && previousState === transition.newState) {
        this.log(`State unchanged (${transition.newState}), skipping redundant update`);
        return;
      }

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
      try {
        // Validate device still initialized
        if (!this.engine || !this.errorReporter) {
          this.log('Delay timer cancelled: device deinitialized');
          return;
        }

        this.log(`Delay timer expired, transitioning to ${targetState}`);
        await this.updateZoneSealState(targetState);
      } catch (error) {
        // CRITICAL: Prevent unhandled rejection
        if (!this.errorReporter) {
          this.error('Delayed transition failed (device likely deleted):', error);
          return;
        }

        this.errorReporter.reportError({
          errorId: ZoneSealErrorId.DELAYED_TRANSITION_FAILED,
          severity: ErrorSeverity.HIGH,
          userMessage: 'Delayed state transition failed. Device may be out of sync.',
          technicalMessage: `Failed to transition to ${targetState}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          context: {
            deviceId: this.getData().id,
            targetState,
            delaySeconds,
          },
        });
      }
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

      // Update engine state (note: engine may have already updated internally)
      this.engine?.setCurrentState(state);

      // Determine boolean sealed value
      const isSealed = state === ZoneSealState.SEALED;
      await this.setCapabilityValue('alarm_zone_leaky', !isSealed);

      // Trigger state change flow card
      await this.handleStateChanged(state);

      this.log(`Zone seal state updated to: ${state} (sealed: ${isSealed})`);
    } catch (error) {
      this.errorReporter!.reportError({
        errorId: ZoneSealErrorId.STATE_UPDATE_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'Failed to update zone state. Device may be out of sync.',
        technicalMessage: `Failed to update zone seal state to ${state}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        context: { deviceId: this.getData().id, targetState: state },
      });
      try {
        await this.warningManager!.setWarning(
          ZoneSealErrorId.STATE_UPDATE_FAILED,
          'Failed to update zone state. Device may be out of sync with sensor states.'
        );
      } catch (warningError) {
        this.error('Failed to set warning for state update failure:', warningError);
      }
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
    const isLeaky = state !== ZoneSealState.SEALED;

    // Trigger zone_status_changed with token
    await this.flowCardHandler!.triggerDeviceCard(
      this,
      'zone_status_changed',
      { is_leaky: isLeaky },
      ZoneSealErrorId.FLOW_CARD_TRIGGER_FAILED
    );

    // Trigger specific state flow card
    await this.flowCardHandler!.triggerConditionalCard(
      this,
      isLeaky,
      'zone_leaky',
      'zone_sealed',
      {},
      ZoneSealErrorId.FLOW_CARD_TRIGGER_FAILED
    );
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

        // Add detailed logging with current value
        const currentValue = this.aggregator?.getSensorState(sensor.deviceId);
        this.log(
          `Sensor became stale: ${sensor.deviceName || sensor.deviceId} (last value: ${currentValue}, stale for: ${Math.round(timeSinceUpdate / 60000)}min)`
        );

        // Trigger sensor_became_stale flow card (fire-and-forget)
        void this.triggerSensorBecameStale(sensor.deviceName || sensor.deviceId, sensor.deviceId);
      }
    }

    // Check if stale state changed (any sensors stale or all fresh)
    if (hasChanges) {
      this.checkForStaleStateChanged();
      // Trigger immediate re-evaluation when sensors become stale
      void this.handleSensorUpdate();
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

    // Trigger stale_state_changed flow card (fire-and-forget)
    void this.triggerStaleStateChanged(hasAnyStaleSensors);

    // If all sensors fresh, trigger stale_state_ended (fire-and-forget)
    if (!hasAnyStaleSensors) {
      this.log('All sensors are now fresh');
      void this.triggerStaleStateEnded();
    }
  }

  /**
   * Triggers contact_stale flow card when a sensor becomes stale.
   *
   * @private
   * @param deviceName - Name of the device
   * @param deviceId - ID of the device
   * @returns {Promise<void>}
   */
  private async triggerSensorBecameStale(
    deviceName: string,
    _deviceId: string
  ): Promise<void> {
    await this.flowCardHandler!.triggerDeviceCard(
      this,
      'contact_stale',
      { sensor_name: deviceName },
      ZoneSealErrorId.FLOW_CARD_TRIGGER_FAILED
    );
  }

  /**
   * Triggers zone_no_stale_sensors flow card when all sensors become unstale.
   *
   * @private
   * @returns {Promise<void>}
   */
  private async triggerStaleStateEnded(): Promise<void> {
    await this.flowCardHandler!.triggerDeviceCard(
      this,
      'zone_no_stale_sensors',
      {},
      ZoneSealErrorId.FLOW_CARD_TRIGGER_FAILED
    );
  }

  /**
   * Triggers stale_status_changed flow card when stale status changes.
   *
   * @private
   * @param hasStale - Whether any sensors are stale
   * @returns {Promise<void>}
   */
  private async triggerStaleStateChanged(hasStale: boolean): Promise<void> {
    await this.flowCardHandler!.triggerDeviceCard(
      this,
      'stale_status_changed',
      { has_stale: hasStale },
      ZoneSealErrorId.FLOW_CARD_TRIGGER_FAILED
    );
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
    // Register is_zone_leaky condition handler
    this.flowCardHandler!.registerConditionCard(
      'is_zone_leaky',
      async (args: { device: Homey.Device }): Promise<boolean> => {
        const device = args.device as WIABZoneSealDevice;
        const leaky = device.getCapabilityValue('alarm_zone_leaky') as boolean;
        device.log(`is_zone_leaky condition evaluated: ${leaky}`);
        return leaky;
      },
      ZoneSealErrorId.FLOW_CARD_REGISTRATION_FAILED
    );

    // Register has_stale_sensor condition handler
    this.flowCardHandler!.registerConditionCard(
      'has_stale_sensor',
      async (args: { device: Homey.Device }): Promise<boolean> => {
        const device = args.device as WIABZoneSealDevice;
        const hasStale = device.hasAnyStaleSensors();
        device.log(`has_stale_sensor condition evaluated: ${hasStale}`);
        return hasStale;
      },
      ZoneSealErrorId.FLOW_CARD_REGISTRATION_FAILED
    );

    this.log('Flow card handlers registered successfully');
  }
}

export default WIABZoneSealDevice;
module.exports = WIABZoneSealDevice;
