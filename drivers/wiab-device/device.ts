import Homey from 'homey';
import { SensorMonitor } from '../../lib/SensorMonitor';
import { SensorConfig, SensorCallbacks, HomeyAPI } from '../../lib/types';
import {
  OccupancyState,
  StableOccupancyState,
  DoorState,
  TimerDefaults,
  occupancyToBoolean,
  areAllDoorsClosed,
  isAnyDoorOpen,
} from '../../lib/OccupancyState';
import { classifySensors } from '../../lib/SensorClassifier';
import { DeviceErrorId } from '../../constants/errorIds';
import {
  WIABStateEngine,
  RoomState,
  StateTransitionResult,
  RoomStateTimerConfig,
} from '../../lib/WIABStateEngine';

/**
 * Extended HomeyAPIDevice with runtime methods
 */
interface ExtendedHomeyAPIDevice {
  capabilitiesObj: Record<string, { value: unknown }>;
}

/**
 * Interface for WIABApp with HomeyAPI
 * Note: The HomeyAPI devices property is indexed directly, not via getDevices()
 */
interface WIABApp extends Homey.App {
  homeyApi?: {
    devices: Record<string, ExtendedHomeyAPIDevice>;
    zones: {
      getZone(params: { id: string }): Promise<{ name: string }>;
    };
  };
}

/**
 * Sensor stale tracking information
 */
interface SensorStaleInfo {
  lastUpdated: number;  // Timestamp of last sensor update
  isStale: boolean;     // Whether sensor is currently stale
  timeoutMs: number;    // Stale timeout for this sensor
}

/**
 * WIAB (Wasp in a Box) virtual occupancy sensor device.
 *
 * This device implements a quad-state occupancy model (UNKNOWN, OCCUPIED, UNOCCUPIED, PAUSED)
 * with multiple door sensors and multiple PIR sensors. The model uses two timers:
 * - T_ENTER: Short window after door events to detect entry/exit via motion
 * - T_CLEAR: Longer window with open doors to detect room becoming empty
 *
 * The quad-state model provides a derived boolean output (alarm_occupancy) that
 * represents the last stable occupancy state, maintaining continuity during
 * transitional UNKNOWN periods. When PAUSED, the device ignores sensor events
 * and maintains a fixed state until resumed.
 *
 * Specification: docs/wiab_multi_door_multi_pir_full.md
 *
 * Lifecycle:
 * 1. onInit() - Initialize to UNOCCUPIED, setup sensor monitoring, read PIR values
 * 2. onSettings() - Reconfigure monitoring and timers when settings change
 * 3. onDeleted() - Cleanup all timers and monitoring resources
 *
 * Manual Control:
 * - SET STATE action: Pauses device with specified occupancy state
 * - UNPAUSE action: Resumes sensor monitoring and reinitializes state
 * - IS PAUSED condition: Check if device is currently paused in flows
 */
class WIABDevice extends Homey.Device {
  private sensorMonitor?: SensorMonitor;

  // Tri-state occupancy variables (spec section 5)
  private occupancyState: OccupancyState = OccupancyState.UNOCCUPIED;
  private lastStableOccupancy: StableOccupancyState = StableOccupancyState.UNOCCUPIED;
  private doorStates: Map<string, DoorState> = new Map();
  private triggerSensors: SensorConfig[] = []; // PIR sensors stored for checking their state

  // PIR tracking
  private lastDoorEventTimestamp: number | null = null;
  private waitingForPirFallingEdge: boolean = false;
  private lastPirTimestamp: number | null = null;

  // T_ENTER timer (spec section 7.1)
  private enterTimer: NodeJS.Timeout | undefined = undefined;
  private enterTimerDeadline: number | null = null;

  // T_CLEAR timer (spec section 7.2)
  private clearTimer: NodeJS.Timeout | undefined = undefined;
  private clearTimerDeadline: number | null = null;
  private clearTimerAnchor: number | null = null;

  // Pause/unpause state management
  private isPaused: boolean = false;
  private pausedWithState: StableOccupancyState = StableOccupancyState.UNOCCUPIED;
  private isInitializing: boolean = false;

  // Stale sensor detection
  private staleSensorMap: Map<string, SensorStaleInfo> = new Map();
  private staleCheckInterval?: NodeJS.Timeout;

  // Room state management
  private stateEngine?: WIABStateEngine;
  private roomStateTimer?: NodeJS.Timeout;
  private manualOverride: boolean = false;

  /**
   * Initializes the WIAB device.
   *
   * Per spec section 5.1:
   * - Initialize occupancy_state = UNOCCUPIED
   * - Initialize last_stable_occupancy = UNOCCUPIED
   * - Initialize all door states to CLOSED (or read actual values if available)
   * - Setup sensor monitoring
   * - Read current PIR sensor values to set initial occupancy state
   *
   * Performance Optimizations:
   * - Overall 30-second timeout prevents indefinite hanging
   */
  async onInit(): Promise<void> {
    this.log('WIAB device initializing with quad-state occupancy model');

    // Mark device as initializing to prevent listener loops
    this.isInitializing = true;

    const INIT_TIMEOUT_MS = 30000; // 30 seconds

    try {
      // Wrap initialization in timeout to prevent indefinite hanging
      await Promise.race([
        this.performInitialization(),
        new Promise<void>((_, reject) =>
          setTimeout(() => {
            try {
              reject(new Error('Initialization timeout after 30 seconds'));
            } catch (error) {
              this.error('Init timeout handler failed:', error);
            }
          }, INIT_TIMEOUT_MS)
        ),
      ]);

      this.log('WIAB device initialization complete');
    } catch (error) {
      this.error(
        `[${DeviceErrorId.DEVICE_INIT_FAILED}] Device initialization failed:`,
        error
      );

      // Set device warning instead of crashing
      try {
        await this.setWarning('Device initialization failed. Check sensor configuration.');
      } catch (warningError) {
        this.error('Failed to set warning on device:', warningError);
      }
    } finally {
      // Clear initialization flag even on failure
      this.isInitializing = false;
    }
  }

  /**
   * Performs the actual initialization steps.
   *
   * Separated from onInit() to allow timeout wrapper.
   *
   * @private
   * @returns {Promise<void>}
   */
  private async performInitialization(): Promise<void> {
    await this.migrateCapabilities();
    this.initializeState();
    this.initializeRoomStateEngine();
    this.restoreManualOverrideState();
    await this.setupMonitoring();
    this.registerFlowCardHandlers();
  }

  /**
   * Restores the manual override state from device store.
   *
   * Called during initialization to restore the manual override flag
   * if the device was in manual override mode before restart.
   */
  private restoreManualOverrideState(): void {
    const storedOverride = this.getStoreValue('manualOverride') as boolean | null;
    if (storedOverride === true) {
      this.manualOverride = true;
      this.log('Restored manual override state from device store');
    }
  }

  /**
   * Initializes the room state engine with current settings.
   *
   * Creates a WIABStateEngine instance with timer configuration from device settings.
   * The engine manages room state transitions (idle ↔ extended_idle, occupied ↔ extended_occupied).
   */
  private initializeRoomStateEngine(): void {
    const idleTimeoutMinutes = (this.getSetting('idleTimeoutMinutes') as number) ?? TimerDefaults.ROOM_STATE_IDLE_DEFAULT_MINUTES;
    const occupiedTimeoutMinutes = (this.getSetting('occupiedTimeoutMinutes') as number) ?? TimerDefaults.ROOM_STATE_OCCUPIED_DEFAULT_MINUTES;

    const config: RoomStateTimerConfig = {
      idleTimeoutMinutes: Math.max(
        TimerDefaults.ROOM_STATE_IDLE_MIN_MINUTES,
        Math.min(TimerDefaults.ROOM_STATE_IDLE_MAX_MINUTES, idleTimeoutMinutes)
      ),
      occupiedTimeoutMinutes: Math.max(
        TimerDefaults.ROOM_STATE_OCCUPIED_MIN_MINUTES,
        Math.min(TimerDefaults.ROOM_STATE_OCCUPIED_MAX_MINUTES, occupiedTimeoutMinutes)
      ),
    };

    this.stateEngine = new WIABStateEngine(config, RoomState.IDLE);
    this.log(`Room state engine initialized: idleTimeout=${config.idleTimeoutMinutes}min, occupiedTimeout=${config.occupiedTimeoutMinutes}min`);
  }

  /**
   * Migrates device capabilities for existing devices.
   *
   * Ensures all required capabilities exist and are properly initialized.
   * This method handles backward compatibility for devices created with older versions.
   */
  private async migrateCapabilities(): Promise<void> {
    // Ensure occupancy_state capability exists (for migration of existing devices)
    if (!this.hasCapability('occupancy_state')) {
      this.log('Adding occupancy_state capability to existing device');
      await this.addCapability('occupancy_state');
    }

    // Ensure alarm_paused capability exists (for migration of existing devices)
    if (!this.hasCapability('alarm_paused')) {
      this.log('Adding alarm_paused capability to existing device');
      await this.addCapability('alarm_paused');
      // Immediately set to true (inverted: true = active/highlighted) after adding
      await this.setCapabilityValue('alarm_paused', true).catch((err) => {
        this.error('Failed to initialize alarm_paused capability during migration:', err);
      });
    }

    // Ensure alarm_data_stale capability exists (for migration of existing devices)
    if (!this.hasCapability('alarm_data_stale')) {
      this.log('Adding alarm_data_stale capability to existing device');
      await this.addCapability('alarm_data_stale');
      // Initialize to false (no stale sensors at startup)
      await this.setCapabilityValue('alarm_data_stale', false).catch((err) => {
        this.error('Failed to initialize alarm_data_stale capability during migration:', err);
      });
    }
  }

  /**
   * Initializes device state variables to default values.
   *
   * Per spec 5.1: Initialize to UNOCCUPIED state.
   */
  private initializeState(): void {
    // Initialize to UNOCCUPIED (spec 5.1)
    this.occupancyState = OccupancyState.UNOCCUPIED;
    this.lastStableOccupancy = StableOccupancyState.UNOCCUPIED;
  }

  /**
   * Sets up monitoring and initializes output capabilities.
   *
   * This method:
   * - Sets up sensor monitoring with current settings
   * - Sets initial boolean output from stable state
   * - Registers pause capability listener
   * - Initializes alarm_paused capability to active state
   */
  private async setupMonitoring(): Promise<void> {
    // Setup sensor monitoring with current settings
    await this.setupSensorMonitoring();

    // Set initial boolean output from stable state
    await this.updateOccupancyOutput();

    /**
     * Registers the alarm_paused capability listener to handle UI toggle events.
     *
     * IMPORTANT: alarm_paused uses INVERTED semantics to leverage Homey's UI highlighting:
     * - TRUE (highlighted) = device is ACTIVE/monitoring sensors
     * - FALSE (dimmed) = device is PAUSED/ignoring sensors
     *
     * This inversion makes paused devices appear visually "disabled" (dimmed) while
     * active devices appear normal (highlighted), providing better visual feedback.
     *
     * User interaction flow:
     * - When user toggles to FALSE (dimmed) → pauses device with current stable occupancy
     * - When user toggles to TRUE (highlighted) → unpauses device and resumes monitoring
     *
     * The listener includes smart deduplication: programmatic setCapabilityValue()
     * calls (from pauseDevice/unpauseDevice methods) are ignored if the internal
     * state already matches, preventing infinite loops.
     *
     * State flow:
     * 1. User clicks toggle → listener fires
     * 2. Listener checks isPaused flag
     * 3. If state change needed → calls pauseDevice() or unpauseDevice()
     * 4. Those methods call setCapabilityValue() → listener fires again
     * 5. Listener sees isPaused already matches → ignores (no loop)
     */
    this.registerCapabilityListener('alarm_paused', async (value: boolean) => {
      // Ignore events during initialization to prevent race conditions
      if (this.isInitializing) {
        this.log('Ignoring alarm_paused change during initialization');
        return;
      }

      this.log(`Pause toggle changed to: ${value}`);

      // Check if state change is needed (prevent loops from programmatic sets)
      // INVERTED: FALSE = paused (dimmed), TRUE = active (highlighted)
      if (!value && !this.isPaused) {
        // User toggled to FALSE (dimmed) - pause with current stable state
        this.log('User requested pause via UI toggle');
        await this.pauseDevice(this.lastStableOccupancy);
      } else if (value && this.isPaused) {
        // User toggled to TRUE (highlighted) - unpause
        this.log('User requested unpause via UI toggle');
        await this.unpauseDevice();
      } else {
        this.log(`Pause state already ${value ? 'active' : 'paused'} - ignoring redundant toggle`);
      }
    });

    // Set initial value for alarm_paused (for existing devices that already have the capability)
    // This ensures devices start in active/highlighted state
    await this.setCapabilityValue('alarm_paused', true).catch((err) => {
      this.error('Failed to initialize alarm_paused capability:', err);
    });
  }

  /**
   * Registers all flow card handlers for actions and conditions.
   *
   * Called during device initialization to register the handlers that will
   * be invoked when flow cards are used in flows.
   */
  private registerFlowCardHandlers(): void {
    // Register action handlers
    this.registerActionHandlers();

    // Register condition handlers
    this.registerConditionHandlers();
  }

  /**
   * Handles device settings changes.
   *
   * When sensor configuration or timer settings change, teardown existing
   * monitoring and restart with new settings.
   */
  async onSettings(event: {
    oldSettings: { [key: string]: unknown };
    newSettings: { [key: string]: unknown };
    changedKeys: string[];
  }): Promise<void> {
    this.log('WIAB device settings changed:', event.changedKeys);

    // Check if sensor configuration changed
    const sensorSettingsChanged =
      event.changedKeys.includes('triggerSensors') ||
      event.changedKeys.includes('resetSensors');

    // Check if timer settings changed
    const timerSettingsChanged =
      event.changedKeys.includes('t_enter') ||
      event.changedKeys.includes('t_clear');

    // Check if stale timeout settings changed
    const staleTimeoutChanged =
      event.changedKeys.includes('stalePirMinutes') ||
      event.changedKeys.includes('staleDoorMinutes');

    // Check if room state timer settings changed
    const roomStateTimerChanged =
      event.changedKeys.includes('idleTimeoutMinutes') ||
      event.changedKeys.includes('occupiedTimeoutMinutes');

    if (sensorSettingsChanged || staleTimeoutChanged) {
      this.log('Sensor configuration or stale timeout settings changed, reinitializing monitoring');

      // Teardown existing monitoring
      this.teardownSensorMonitoring();

      // Setup new monitoring with updated settings
      await this.setupSensorMonitoring();
    } else if (timerSettingsChanged) {
      this.log('Timer settings changed, timers will use new values on next activation');
      // Timers read settings dynamically, no action needed
    }

    // Handle room state timer settings
    if (roomStateTimerChanged) {
      this.log('Room state timer settings changed, updating engine configuration');
      this.updateRoomStateEngineConfig();
    }
  }

  /**
   * Updates the room state engine configuration from current settings.
   *
   * Called when idleTimeoutMinutes or occupiedTimeoutMinutes settings change.
   * Updates the engine and reschedules any active timer with new duration.
   */
  private updateRoomStateEngineConfig(): void {
    if (!this.stateEngine) {
      return;
    }

    const idleTimeoutMinutes = (this.getSetting('idleTimeoutMinutes') as number) ?? TimerDefaults.ROOM_STATE_IDLE_DEFAULT_MINUTES;
    const occupiedTimeoutMinutes = (this.getSetting('occupiedTimeoutMinutes') as number) ?? TimerDefaults.ROOM_STATE_OCCUPIED_DEFAULT_MINUTES;

    this.stateEngine.updateConfig({
      idleTimeoutMinutes: Math.max(
        TimerDefaults.ROOM_STATE_IDLE_MIN_MINUTES,
        Math.min(TimerDefaults.ROOM_STATE_IDLE_MAX_MINUTES, idleTimeoutMinutes)
      ),
      occupiedTimeoutMinutes: Math.max(
        TimerDefaults.ROOM_STATE_OCCUPIED_MIN_MINUTES,
        Math.min(TimerDefaults.ROOM_STATE_OCCUPIED_MAX_MINUTES, occupiedTimeoutMinutes)
      ),
    });

    // If not in manual override and in a base state, reschedule timer with new duration
    if (!this.manualOverride) {
      const currentState = this.stateEngine.getCurrentState();
      const timerMinutes = this.stateEngine.getTimerForState(currentState);
      if (timerMinutes !== null) {
        this.scheduleRoomStateTimer(timerMinutes);
      }
    }

    this.log(`Room state engine config updated: idleTimeout=${idleTimeoutMinutes}min, occupiedTimeout=${occupiedTimeoutMinutes}min`);
  }

  /**
   * Handles device deletion.
   *
   * Cleanup all timers and sensor monitoring to prevent memory leaks.
   */
  async onDeleted(): Promise<void> {
    this.log('WIAB device deleted, cleaning up resources');

    // Stop all timers
    this.stopEnterTimer();
    this.stopClearTimer();
    this.stopRoomStateTimer();

    // Cleanup sensor monitoring
    this.teardownSensorMonitoring();

    // Clear state engine
    this.stateEngine = undefined;
  }

  /**
   * Stops the room state timer if active.
   */
  private stopRoomStateTimer(): void {
    if (this.roomStateTimer) {
      clearTimeout(this.roomStateTimer);
      this.roomStateTimer = undefined;
      this.log('Room state timer stopped');
    }
  }

  /**
   * Sets up sensor monitoring based on current device settings.
   *
   * This method:
   * 1. Retrieves and validates sensor configurations
   * 2. Classifies sensors into doors and PIRs automatically
   * 3. Initializes door state tracking
   * 4. Creates SensorMonitor with appropriate callbacks
   * 5. Starts monitoring (which will read initial PIR values per spec 5.1)
   */
  private async setupSensorMonitoring(): Promise<void> {
    try {
      // Get sensor configurations from device settings
      const triggerSensorsJson = this.getSetting('triggerSensors') as string;
      const resetSensorsJson = this.getSetting('resetSensors') as string;

      // Validate and parse sensor configurations
      const triggerSensors = this.validateSensorSettings(triggerSensorsJson);
      const resetSensors = this.validateSensorSettings(resetSensorsJson);

      // Store trigger sensors for later reference (checking if any PIR is inactive)
      this.triggerSensors = triggerSensors;

      // Combine all sensors for classification
      const allSensors = [...triggerSensors, ...resetSensors];

      // Classify sensors automatically by capability name
      const { doors, pirs } = classifySensors(allSensors);

      this.log(
        `Classified sensors: ${doors.length} doors, ${pirs.length} PIRs`
      );

      // Initialize door states map
      this.doorStates.clear();
      for (const door of doors) {
        // Initialize to CLOSED per spec 5.1
        // Actual values will be read by SensorMonitor during initialization
        this.doorStates.set(door.deviceId, DoorState.CLOSED);
      }

      // Define callbacks for sensor events
      const callbacks: SensorCallbacks = {
        // PIR sensors trigger motion events
        onTriggered: (sensorId: string, _value: boolean) => this.handlePirMotion(sensorId),
        // Door sensors trigger door events (both open and close)
        onReset: (sensorId: string, value: boolean) => this.handleDoorEvent(sensorId, value),
        // PIR falling edge (motion cleared) - only meaningful after door event
        onPirCleared: (sensorId: string) => this.handlePirCleared(sensorId),
      };

      // Get HomeyAPI instance from app
      const app = this.homey.app as WIABApp;
      if (!app || !app.homeyApi) {
        throw new Error('Homey API not available');
      }

      // Get stale timeout settings
      const stalePirMinutes = (this.getSetting('stalePirMinutes') as number) || 30;
      const staleDoorMinutes = (this.getSetting('staleDoorMinutes') as number) || 30;

      // Convert to milliseconds with validation
      const stalePirTimeoutMs = Math.max(5, Math.min(120, stalePirMinutes)) * 60 * 1000;
      const staleDoorTimeoutMs = Math.max(5, Math.min(120, staleDoorMinutes)) * 60 * 1000;

      this.log(`Stale timeouts: PIR=${stalePirMinutes}min, Door=${staleDoorMinutes}min`);

      // Create and start sensor monitor
      // Note: SensorMonitor now treats triggerSensors as PIRs and resetSensors as doors
      this.sensorMonitor = new SensorMonitor(
        app.homeyApi as unknown as HomeyAPI,
        this.homey,
        triggerSensors, // PIR sensors
        resetSensors,   // Door sensors
        callbacks,
        stalePirTimeoutMs,   // Stale timeout for PIR sensors
        staleDoorTimeoutMs   // Stale timeout for door sensors
      );

      await this.sensorMonitor.start();

      // Initialize stale sensor tracking for all sensors
      this.staleSensorMap.clear();
      const now = Date.now();

      for (const sensor of triggerSensors) {
        this.staleSensorMap.set(sensor.deviceId, {
          lastUpdated: now,
          isStale: false,
          timeoutMs: stalePirTimeoutMs,
        });
      }

      for (const sensor of resetSensors) {
        this.staleSensorMap.set(sensor.deviceId, {
          lastUpdated: now,
          isStale: false,
          timeoutMs: staleDoorTimeoutMs,
        });
      }

      // Start stale sensor monitoring
      this.startStaleMonitoring();

      this.log('Sensor monitoring initialized successfully');
    } catch (error) {
      this.error(
        `[${DeviceErrorId.SENSOR_MONITORING_SETUP_FAILED}] Failed to setup sensor monitoring:`,
        error
      );
      // Don't throw - allow device to function in degraded mode
    }
  }

  /**
   * Tears down sensor monitoring and cleans up resources.
   */
  private teardownSensorMonitoring(): void {
    this.stopEnterTimer();
    this.stopClearTimer();
    this.stopStaleMonitoring();

    if (this.sensorMonitor) {
      this.log('Tearing down sensor monitoring');
      this.sensorMonitor.stop();
      this.sensorMonitor = undefined;
    }

    // Clear stale sensor map
    this.staleSensorMap.clear();
  }

  /**
   * Handles door sensor events (both open and close).
   *
   * Per spec sections 8.1 and 8.2:
   * - Update door state
   * - Set occupancy_state = UNKNOWN
   * - Set flag to wait for PIR falling edge (someone leaving)
   * - Manage T_CLEAR timer based on door states and stable occupancy
   *
   * T_ENTER only starts when PIR clears after a door event (see handlePirCleared).
   * This prevents false negatives when PIR is continuously active (e.g., bedroom).
   *
   * @param doorId - The device ID of the door sensor that changed
   * @param doorValue - The current value of the door sensor (true = open, false = closed)
   */
  private async handleDoorEvent(doorId: string, doorValue: boolean): Promise<void> {
    if (this.isPaused) {
      return;
    }

    try {
      // CRITICAL: Check if sensor is stale BEFORE processing event
      // Fail-safe: Ignore events from stale sensors to prevent false state changes
      const doorState = doorValue ? 'open' : 'closed';
      if (this.shouldIgnoreStaleSensor(doorId, `reporting ${doorState}`)) {
        return;
      }

      // Update stale sensor tracking
      this.updateStaleSensorTracking(doorId);

      this.updateDoorState(doorId, doorValue);
      this.occupancyState = OccupancyState.UNKNOWN;

      await this.configureEnterTimer();
      this.configureClearTimer();

      await this.updateOccupancyOutput();
      this.logDoorEventState();
    } catch (error) {
      this.error(
        `[${DeviceErrorId.DOOR_EVENT_HANDLER_FAILED}] Failed to handle door event:`,
        error
      );
    }
  }

  /**
   * Updates the door state and logs the transition.
   *
   * @param doorId - The device ID of the door sensor
   * @param doorValue - The current value (true = open, false = closed)
   */
  private updateDoorState(doorId: string, doorValue: boolean): void {
    const newDoorState = doorValue ? DoorState.OPEN : DoorState.CLOSED;
    const oldDoorState = this.doorStates.get(doorId);
    this.doorStates.set(doorId, newDoorState);
    this.log(`Door event: ${doorId} ${oldDoorState} → ${newDoorState}`);
  }

  /**
   * Configures the enter timer based on PIR activity.
   * Determines whether to start T_ENTER immediately or wait for PIR falling edge.
   */
  private async configureEnterTimer(): Promise<void> {
    const anyPirInactive = await this.isAnyPirInactive();
    this.lastDoorEventTimestamp = Date.now();

    if (anyPirInactive) {
      this.log('Door event: at least one PIR inactive - starting T_ENTER immediately');
      this.startEnterTimer();
      this.waitingForPirFallingEdge = false;
    } else {
      this.log('Door event: all PIRs active - waiting for PIR falling edge to start T_ENTER');
      this.waitingForPirFallingEdge = true;
    }
  }

  /**
   * Configures the clear timer based on door states and occupancy.
   * Manages T_CLEAR timer according to spec sections 8.1 and 8.2.
   */
  private configureClearTimer(): void {
    const allClosed = areAllDoorsClosed(this.doorStates);
    const anyOpen = isAnyDoorOpen(this.doorStates);

    if (allClosed) {
      this.stopClearTimer();
    } else if (anyOpen && this.lastStableOccupancy === StableOccupancyState.OCCUPIED) {
      this.startClearTimer();
    }
  }

  /**
   * Logs the current state after a door event.
   */
  private logDoorEventState(): void {
    const allClosed = areAllDoorsClosed(this.doorStates);
    const doorStatus = allClosed ? 'all closed' : 'some open';
    this.log(
      `State after door event: ${this.occupancyState}, stable: ${this.lastStableOccupancy}, doors: ${doorStatus}`
    );
  }

  /**
   * Handles PIR motion sensor events (rising edge - motion detected).
   *
   * Per spec section 8.3:
   * - Update last PIR timestamp
   * - Clear the waiting-for-falling-edge flag (motion detected = someone coming back)
   * - Branch based on door status (all closed vs. any open)
   *
   * 8.3.1: All doors closed → immediate OCCUPIED, stop T_CLEAR
   * 8.3.2: Any door open → OCCUPIED, start/restart T_CLEAR
   *
   * @param pirId - The device ID of the PIR sensor that detected motion
   */
  private async handlePirMotion(pirId: string): Promise<void> {
    if (this.isPaused) {
      return;
    }

    try {
      // CRITICAL: Check if sensor is stale BEFORE processing event
      // Fail-safe: Ignore motion from stale sensors to prevent false activations
      if (this.shouldIgnoreStaleSensor(pirId, 'reporting motion')) {
        return;
      }

      // Update stale sensor tracking
      this.updateStaleSensorTracking(pirId);

      this.log(`PIR motion detected: ${pirId}`);
      this.updatePirTracking();
      this.stopEnterTimer();

      const allClosed = areAllDoorsClosed(this.doorStates);
      this.applyPirOccupancyLogic(allClosed);

      await this.updateOccupancyOutput();
      this.log(`State after PIR: ${this.occupancyState}, stable: ${this.lastStableOccupancy}`);
    } catch (error) {
      this.error(
        `[${DeviceErrorId.PIR_MOTION_HANDLER_FAILED}] Failed to handle PIR motion:`,
        error
      );
    }
  }

  /**
   * Updates PIR tracking state when motion is detected.
   */
  private updatePirTracking(): void {
    this.lastPirTimestamp = Date.now();
    this.waitingForPirFallingEdge = false;
  }

  /**
   * Applies occupancy logic based on PIR motion and door states.
   *
   * @param allClosed - Whether all doors are currently closed
   */
  private applyPirOccupancyLogic(allClosed: boolean): void {
    if (allClosed) {
      this.handleSealedRoomMotion();
    } else {
      this.handleLeakyRoomMotion();
    }
  }

  /**
   * Handles motion detection in a sealed room (all doors closed).
   * Per spec 8.3.1: immediate OCCUPIED, stop T_CLEAR.
   */
  private handleSealedRoomMotion(): void {
    this.log('PIR with all doors closed: room is sealed, setting OCCUPIED');
    this.occupancyState = OccupancyState.OCCUPIED;
    this.lastStableOccupancy = StableOccupancyState.OCCUPIED;
    this.stopClearTimer();
  }

  /**
   * Handles motion detection in a leaky room (at least one door open).
   * Per spec 8.3.2: state stays UNKNOWN, stable = OCCUPIED, start T_CLEAR.
   */
  private handleLeakyRoomMotion(): void {
    this.log('PIR with doors open: room is leaky, state stays UNKNOWN, stable = OCCUPIED, starting T_CLEAR');
    this.occupancyState = OccupancyState.UNKNOWN;
    this.lastStableOccupancy = StableOccupancyState.OCCUPIED;
    this.startClearTimer();
  }

  /**
   * Handles PIR sensor falling edge (motion cleared).
   *
   * Only relevant if we were waiting for this after a door event.
   * Starts T_ENTER timer to determine if someone is coming back within the timeout window.
   *
   * @param pirId - The device ID of the PIR sensor
   */
  private async handlePirCleared(pirId: string): Promise<void> {
    // Ignore sensor events if device is paused
    if (this.isPaused) {
      return;
    }

    try {
      // CRITICAL: Check if sensor is stale BEFORE processing event
      // Fail-safe: Ignore events from stale sensors
      if (this.shouldIgnoreStaleSensor(pirId, 'reporting motion cleared')) {
        return;
      }

      // Update stale sensor tracking
      this.updateStaleSensorTracking(pirId);

      this.log(`PIR motion cleared: ${pirId}`);

      // Only meaningful if we're waiting for falling edge after a door event
      if (!this.waitingForPirFallingEdge) {
        this.log('PIR cleared but not waiting for falling edge - ignoring');
        return;
      }

      // Clear the flag - we've received the falling edge we were waiting for
      this.waitingForPirFallingEdge = false;

      // Start T_ENTER timer to determine if motion resumes within timeout
      // If motion resumes (someone coming back) → OCCUPIED
      // If timeout expires without motion → UNOCCUPIED
      this.startEnterTimer();

      this.log(
        `PIR cleared after door event - T_ENTER timer started to detect return`
      );
    } catch (error) {
      this.error(
        `[${DeviceErrorId.PIR_CLEARED_HANDLER_FAILED}] Failed to handle PIR cleared:`,
        error
      );
    }
  }

  /**
   * Starts or restarts the T_ENTER timer.
   *
   * Per spec section 7.1 and 8.4:
   * - Timer expires after T_ENTER seconds
   * - Resolves UNKNOWN state to OCCUPIED or UNOCCUPIED based on PIR activity
   */
  private startEnterTimer(): void {
    this.stopEnterTimer();

    const timeoutSeconds = this.getValidatedTimerSetting(
      't_enter',
      TimerDefaults.T_ENTER_SECONDS,
      TimerDefaults.T_ENTER_MIN_SECONDS,
      TimerDefaults.T_ENTER_MAX_SECONDS
    );
    const timeoutMs = timeoutSeconds * 1000;

    this.enterTimerDeadline = Date.now() + timeoutMs;
    this.enterTimer = setTimeout(async () => {
      try {
        // Validate device still initialized
        if (!this.sensorMonitor) {
          this.log('T_ENTER timer cancelled: device deinitialized');
          return;
        }

        this.log(`T_ENTER timer expired after ${timeoutSeconds}s`);
        await this.handleEnterTimerExpiry();
      } catch (error) {
        // CRITICAL: Prevent unhandled rejection
        this.error(`[${DeviceErrorId.ENTER_TIMER_EXPIRY_FAILED}] T_ENTER timer expiry failed (device may be deleted):`, error);
      }
    }, timeoutMs);

    this.log(`T_ENTER timer started: ${timeoutSeconds}s`);
  }

  /**
   * Stops the T_ENTER timer if active.
   */
  private stopEnterTimer(): void {
    if (this.enterTimer) {
      clearTimeout(this.enterTimer);
      this.enterTimer = undefined;
      this.enterTimerDeadline = null;
      this.log('T_ENTER timer stopped');
    }
  }

  /**
   * Handles T_ENTER timer expiry.
   *
   * Per spec section 8.4:
   * T_ENTER is started when PIR clears after a door event.
   * It determines if someone is coming back within the timeout window:
   * - If PIR occurs during T_ENTER → OCCUPIED (someone came back or never really left)
   * - If T_ENTER expires without PIR → UNOCCUPIED (nobody came back, room is empty)
   */
  private async handleEnterTimerExpiry(): Promise<void> {
    try {
      this.log('T_ENTER timer expired');

      this.enterTimer = undefined;
      this.enterTimerDeadline = null;

      // Only resolve if still in UNKNOWN state
      if (this.occupancyState === OccupancyState.UNKNOWN) {
        // Check if any doors are open (leaky room scenario)
        const anyOpen = isAnyDoorOpen(this.doorStates);

        // Check if motion was detected since last door event
        // (handlePirMotion sets lastPirTimestamp and clears waitingForPirFallingEdge)
        const pirOccurredDuringWait = this.lastPirTimestamp !== null &&
                                      this.lastDoorEventTimestamp !== null &&
                                      this.lastPirTimestamp > this.lastDoorEventTimestamp;

        if (pirOccurredDuringWait) {
          // Motion detected during T_ENTER window after door event
          if (anyOpen) {
            // Leaky room: keep tri-state UNKNOWN, set stable occupancy OCCUPIED
            this.log('T_ENTER expired with PIR but doors open: tri-state stays UNKNOWN, stable = OCCUPIED');
            // occupancyState stays UNKNOWN (don't change it)
            this.lastStableOccupancy = StableOccupancyState.OCCUPIED;
          } else {
            // Sealed room: PIR occurred → OCCUPIED (spec 8.4)
            this.log('T_ENTER expired with PIR and all doors closed: setting OCCUPIED');
            this.occupancyState = OccupancyState.OCCUPIED;
            this.lastStableOccupancy = StableOccupancyState.OCCUPIED;
          }
        } else {
          // No PIR during T_ENTER window → UNOCCUPIED (spec 8.4)
          this.log('T_ENTER expired without PIR: setting UNOCCUPIED');
          this.occupancyState = OccupancyState.UNOCCUPIED;
          this.lastStableOccupancy = StableOccupancyState.UNOCCUPIED;
        }

        // Update output
        await this.updateOccupancyOutput();
      }
    } catch (error) {
      this.error('Failed to handle T_ENTER expiry:', error);
    }
  }

  /**
   * Starts or restarts the T_CLEAR timer.
   *
   * Per spec section 7.2 and 8.5:
   * - Timer expires after T_CLEAR seconds
   * - Used when room is OCCUPIED and at least one door is open
   * - Resolves to UNOCCUPIED if no PIR since timer start
   */
  private startClearTimer(): void {
    this.stopClearTimer();

    const timeoutSeconds = this.getValidatedTimerSetting(
      't_clear',
      TimerDefaults.T_CLEAR_SECONDS,
      TimerDefaults.T_CLEAR_MIN_SECONDS,
      TimerDefaults.T_CLEAR_MAX_SECONDS
    );
    const timeoutMs = timeoutSeconds * 1000;

    const now = Date.now();
    this.clearTimerDeadline = now + timeoutMs;
    this.clearTimerAnchor = now;

    this.clearTimer = setTimeout(async () => {
      try {
        // Validate device still initialized
        if (!this.sensorMonitor) {
          this.log('T_CLEAR timer cancelled: device deinitialized');
          return;
        }

        this.log(`T_CLEAR timer expired after ${timeoutSeconds}s`);
        await this.handleClearTimerExpiry();
      } catch (error) {
        // CRITICAL: Prevent unhandled rejection
        this.error(`[${DeviceErrorId.CLEAR_TIMER_EXPIRY_FAILED}] T_CLEAR timer expiry failed (device may be deleted):`, error);
      }
    }, timeoutMs);

    this.log(`T_CLEAR timer started: ${timeoutSeconds}s`);
  }

  /**
   * Stops the T_CLEAR timer if active.
   */
  private stopClearTimer(): void {
    if (this.clearTimer) {
      clearTimeout(this.clearTimer);
      this.clearTimer = undefined;
      this.clearTimerDeadline = null;
      this.clearTimerAnchor = null;
      this.log('T_CLEAR timer stopped');
    }
  }

  /**
   * Handles T_CLEAR timer expiry.
   *
   * Per spec section 8.5:
   * - Only meaningful if room is OCCUPIED and at least one door is open
   * - Check if PIR occurred since timer start
   * - If no PIR → UNOCCUPIED (room emptied through open door)
   * - If PIR occurred → do nothing (PIR handler already restarted timer)
   */
  private async handleClearTimerExpiry(): Promise<void> {
    try {
      this.log('T_CLEAR timer expired');

      this.clearTimer = undefined;
      this.clearTimerDeadline = null;

      // Check if conditions still apply (spec 8.5)
      const anyOpen = isAnyDoorOpen(this.doorStates);

      // T_CLEAR is only meaningful when stable occupancy is OCCUPIED and doors are open
      if (this.lastStableOccupancy === StableOccupancyState.OCCUPIED && anyOpen) {
        // Check PIR activity since timer start
        if (this.lastPirTimestamp === null ||
            this.lastPirTimestamp <= (this.clearTimerAnchor || 0)) {
          // No PIR since timer start → UNOCCUPIED (spec 8.5)
          this.log('T_CLEAR expired without PIR: setting UNOCCUPIED');
          this.occupancyState = OccupancyState.UNOCCUPIED;
          this.lastStableOccupancy = StableOccupancyState.UNOCCUPIED;

          // Update output
          await this.updateOccupancyOutput();
        } else {
          // PIR occurred since timer start - should not happen (PIR handler restarts timer)
          this.log('T_CLEAR expired but PIR occurred since start: no action');
        }
      }

      this.clearTimerAnchor = null;
    } catch (error) {
      this.error('Failed to handle T_CLEAR expiry:', error);
    }
  }

  /**
   * Updates the alarm_occupancy capability based on last stable occupancy.
   *
   * Per spec section 6:
   * - occupied = true if last_stable_occupancy == OCCUPIED
   * - occupied = false if last_stable_occupancy == UNOCCUPIED
   * - During UNKNOWN periods, the boolean retains the last stable value
   * - When PAUSED, the boolean reflects the paused state (not the internal PAUSED state)
   *
   * Also drives room state transitions when occupancy changes.
   */
  private async updateOccupancyOutput(): Promise<void> {
    try {
      const occupied = occupancyToBoolean(this.lastStableOccupancy);
      const previousOccupied = this.getCapabilityValue('alarm_occupancy') as boolean | null;

      try {
        await this.setCapabilityValue('alarm_occupancy', occupied);
      } catch (error) {
        this.error(`Failed to set alarm_occupancy capability to ${occupied}:`, error);
        throw error;
      }

      // Also update the internal quad-state capability for debugging
      try {
        await this.setCapabilityValue('occupancy_state', this.occupancyState);
      } catch (error) {
        this.error(`Failed to set occupancy_state capability to ${this.occupancyState}:`, error);
        throw error;
      }

      this.log(`Occupancy output: ${occupied}, internal state: ${this.occupancyState}`);

      // Drive room state machine when occupancy changes
      // Only trigger if the boolean output actually changed (not during UNKNOWN fluctuations)
      if (previousOccupied !== null && previousOccupied !== occupied && !this.isPaused) {
        // Fire-and-forget: room state change doesn't need to block occupancy update
        void this.handleOccupancyChangeForRoomState(occupied);
      }
    } catch (error) {
      this.error('Failed to update occupancy output:', error);
      throw error;
    }
  }

  /**
   * Checks if any trigger sensor (PIR) is currently inactive (FALSE).
   *
   * This is used to determine if we should start T_ENTER immediately on door event.
   * With multiple PIRs: if ANY PIR is inactive, we can detect return motion through other active PIRs,
   * so we start T_ENTER immediately. Only wait for falling edge if ALL PIRs are continuously active.
   *
   * @returns true if at least one trigger sensor is inactive (FALSE), false if all are active or none available
   */
  private async isAnyPirInactive(): Promise<boolean> {
    try {
      const app = this.homey.app as WIABApp;
      if (!app || !app.homeyApi) {
        return false; // If API unavailable, assume all PIRs are active
      }

      const devices = app.homeyApi.devices;
      if (!devices) {
        return false;
      }

      // Check each trigger sensor (PIR)
      for (const sensor of this.triggerSensors) {
        const device = devices[sensor.deviceId];
        if (!device || !device.capabilitiesObj) {
          continue; // Skip if device not found
        }

        const capabilitiesObj = device.capabilitiesObj;
        if (!(sensor.capability in capabilitiesObj)) {
          continue; // Skip if capability not found
        }

        const value = capabilitiesObj[sensor.capability]?.value;
        const isPirActive = typeof value === 'boolean' ? value : false;

        // If any PIR is inactive, return true
        if (!isPirActive) {
          this.log(`Detected inactive PIR: ${sensor.deviceId} - starting T_ENTER immediately`);
          return true;
        }
      }

      // All PIRs are active (or no PIRs available)
      return false;
    } catch (error) {
      this.error('Error checking PIR status:', error);
      return false; // Default to false if we can't check
    }
  }

  /**
   * Pauses the device and sets it to a specific occupancy state.
   *
   * When paused:
   * - Device stops monitoring sensors (callbacks are ignored)
   * - All timers are stopped
   * - occupancy_state capability is set to PAUSED
   * - alarm_occupancy is set to the specified state
   *
   * @param state - The occupancy state to set (OCCUPIED or UNOCCUPIED)
   */
  private async pauseDevice(state: StableOccupancyState): Promise<void> {
    try {
      this.log(`Pausing device with state: ${state}`);

      // Mark as paused
      this.isPaused = true;
      this.pausedWithState = state;

      // Stop all monitoring and timers
      this.teardownSensorMonitoring();

      // Set occupancy state to PAUSED
      this.occupancyState = OccupancyState.PAUSED;
      this.lastStableOccupancy = state;

      // Update capabilities
      await this.updateOccupancyOutput();

      // Set pause indicator (inverted: false = paused/dimmed)
      await this.setCapabilityValue('alarm_paused', false).catch((err) => {
        this.error('Failed to set alarm_paused capability:', err);
      });

      this.log(`Device paused with state: ${state}`);
    } catch (error) {
      this.error('Failed to pause device:', error);
      throw error;
    }
  }

  /**
   * Unpauses the device and reinitializes sensor monitoring.
   *
   * This is idempotent - only the first call after pausing will reinitialize.
   * Subsequent calls while already unpaused are ignored.
   *
   * When unpaused:
   * - Device resumes sensor monitoring
   * - Occupancy state is reinitialized based on current sensor values
   * - Timers are restarted
   */
  private async unpauseDevice(): Promise<void> {
    try {
      // Only allow unpause once - subsequent calls are ignored
      if (!this.isPaused) {
        this.log('Device is not paused - unpause request ignored');
        return;
      }

      this.log('Unpausing device and reinitializing with current sensor values');

      // Mark as unpaused
      this.isPaused = false;

      // Clear pause indicator (inverted: true = active/highlighted)
      await this.setCapabilityValue('alarm_paused', true).catch((err) => {
        this.error('Failed to clear alarm_paused capability:', err);
      });

      // Reinitialize state machine to UNOCCUPIED (like onInit)
      this.occupancyState = OccupancyState.UNOCCUPIED;
      this.lastStableOccupancy = StableOccupancyState.UNOCCUPIED;

      // Clear door states
      this.doorStates.clear();

      // Clear PIR tracking
      this.lastDoorEventTimestamp = null;
      this.waitingForPirFallingEdge = false;
      this.lastPirTimestamp = null;

      // Stop any running timers
      this.stopEnterTimer();
      this.stopClearTimer();

      // Restart sensor monitoring (which will read initial PIR values)
      await this.setupSensorMonitoring();

      // Update output
      await this.updateOccupancyOutput();

      this.log('Device resumed, sensor monitoring reinitialized');
    } catch (error) {
      this.error('Failed to unpause device:', error);
      throw error;
    }
  }

  /**
   * Gets the current paused state of the device.
   *
   * @returns true if device is paused, false otherwise
   */
  private getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Registers action handlers for set_state, unpause, set_room_state, and return_to_automatic actions.
   *
   * Called during device initialization to register the action listeners
   * that will be invoked when the user triggers these actions in flows.
   */
  private registerActionHandlers(): void {
    try {
      // Register set_state action handler (legacy occupancy control)
      const setStateCard = this.homey.flow.getActionCard('set_state');
      if (!setStateCard) {
        throw new Error('set_state action card not found in flow definition');
      }

      setStateCard.registerRunListener(
        async (args: {
          device: WIABDevice;
          state: 'occupied' | 'unoccupied';
        }) => {
          args.device.log(`Set state action triggered: ${args.state}`);

          // Convert action argument to StableOccupancyState
          const state =
            args.state === 'occupied'
              ? StableOccupancyState.OCCUPIED
              : StableOccupancyState.UNOCCUPIED;

          // Pause device with specified state and propagate errors to flow engine
          try {
            await args.device.pauseDevice(state);
          } catch (error) {
            args.device.error(`Set state action failed: ${error}`, error);
            throw error;
          }
        }
      );

      // Register unpause action handler
      const unpauseCard = this.homey.flow.getActionCard('unpause');
      if (!unpauseCard) {
        throw new Error('unpause action card not found in flow definition');
      }

      unpauseCard.registerRunListener(async (args: { device: WIABDevice }) => {
        args.device.log('Unpause action triggered');
        try {
          await args.device.unpauseDevice();
        } catch (error) {
          args.device.error(`Unpause action failed: ${error}`, error);
          throw error;
        }
      });

      // Register set_room_state action handler (new room state control with manual override)
      const setRoomStateCard = this.homey.flow.getActionCard('set_room_state');
      if (setRoomStateCard) {
        setRoomStateCard.registerRunListener(
          async (args: {
            device: WIABDevice;
            state: 'idle' | 'extended_idle' | 'occupied' | 'extended_occupied';
          }) => {
            args.device.log(`Set room state action triggered: ${args.state}`);
            try {
              await args.device.setManualRoomState(args.state);
            } catch (error) {
              args.device.error(`Set room state action failed: ${error}`, error);
              throw error;
            }
          }
        );
      }

      // Register return_to_automatic action handler
      const returnToAutomaticCard = this.homey.flow.getActionCard('return_to_automatic');
      if (returnToAutomaticCard) {
        returnToAutomaticCard.registerRunListener(async (args: { device: WIABDevice }) => {
          args.device.log('Return to automatic action triggered');
          try {
            await args.device.returnToAutomaticMode();
          } catch (error) {
            args.device.error(`Return to automatic action failed: ${error}`, error);
            throw error;
          }
        });
      }

      this.log('Action handlers registered successfully');
    } catch (error) {
      this.error('Failed to register action handlers:', error);
      throw error;
    }
  }

  /**
   * Registers condition handlers for is_paused, is_in_room_state, is_exactly_room_state,
   * and is_manual_override conditions.
   *
   * Called during device initialization to register the condition listeners
   * that will be evaluated when the user includes these conditions in flows.
   */
  private registerConditionHandlers(): void {
    try {
      // Register is_paused condition handler
      const isPausedCard = this.homey.flow.getConditionCard('is_paused');
      if (!isPausedCard) {
        throw new Error('is_paused condition card not found in flow definition');
      }

      isPausedCard.registerRunListener(
        async (args: { device: WIABDevice }): Promise<boolean> => {
          try {
            const paused = args.device.getIsPaused();
            args.device.log(`Is paused condition evaluated: ${paused}`);
            return paused;
          } catch (error) {
            args.device.error(`Is paused condition evaluation failed: ${error}`, error);
            throw error;
          }
        }
      );

      // Register is_in_room_state condition handler (with hierarchy)
      const isInRoomStateCard = this.homey.flow.getConditionCard('is_in_room_state');
      if (isInRoomStateCard) {
        isInRoomStateCard.registerRunListener(
          async (args: {
            device: WIABDevice;
            state: 'idle' | 'extended_idle' | 'occupied' | 'extended_occupied';
          }): Promise<boolean> => {
            try {
              const result = args.device.isInRoomState(args.state);
              args.device.log(`Is in room state '${args.state}' (with hierarchy): ${result}`);
              return result;
            } catch (error) {
              args.device.error(`Is in room state condition evaluation failed: ${error}`, error);
              throw error;
            }
          }
        );
      }

      // Register is_exactly_room_state condition handler (exact match)
      const isExactlyRoomStateCard = this.homey.flow.getConditionCard('is_exactly_room_state');
      if (isExactlyRoomStateCard) {
        isExactlyRoomStateCard.registerRunListener(
          async (args: {
            device: WIABDevice;
            state: 'idle' | 'extended_idle' | 'occupied' | 'extended_occupied';
          }): Promise<boolean> => {
            try {
              const result = args.device.isExactlyInRoomState(args.state);
              args.device.log(`Is exactly in room state '${args.state}': ${result}`);
              return result;
            } catch (error) {
              args.device.error(`Is exactly room state condition evaluation failed: ${error}`, error);
              throw error;
            }
          }
        );
      }

      // Register is_manual_override condition handler
      const isManualOverrideCard = this.homey.flow.getConditionCard('is_manual_override');
      if (isManualOverrideCard) {
        isManualOverrideCard.registerRunListener(
          async (args: { device: WIABDevice }): Promise<boolean> => {
            try {
              const result = args.device.isManualOverrideActive();
              args.device.log(`Is manual override active: ${result}`);
              return result;
            } catch (error) {
              args.device.error(`Is manual override condition evaluation failed: ${error}`, error);
              throw error;
            }
          }
        );
      }

      this.log('Condition handlers registered successfully');
    } catch (error) {
      this.error('Failed to register condition handlers:', error);
      throw error;
    }
  }

  /**
   * Gets and validates a timer setting value.
   *
   * @param settingName - Name of the timer setting
   * @param defaultValue - Default value if setting is not configured
   * @param minValue - Minimum allowed value
   * @param maxValue - Maximum allowed value
   * @returns Validated timer value in seconds
   */
  private getValidatedTimerSetting(
    settingName: string,
    defaultValue: number,
    minValue: number,
    maxValue: number
  ): number {
    const settingValue = this.getSetting(settingName) as number || defaultValue;
    return Math.max(minValue, Math.min(maxValue, settingValue));
  }

  /**
   * Validates and parses sensor settings JSON.
   *
   * @param jsonString - JSON string containing sensor configuration array
   * @returns Parsed and validated sensor configuration array, or empty array if invalid
   */
  private validateSensorSettings(jsonString: string): SensorConfig[] {
    try {
      // Handle null, undefined, or empty string
      if (!jsonString || jsonString.trim() === '') {
        return [];
      }

      const parsed = JSON.parse(jsonString);

      // Validate that parsed result is an array
      if (!Array.isArray(parsed)) {
        this.error('Sensor settings is not an array:', parsed);
        return [];
      }

      return parsed as SensorConfig[];
    } catch (error) {
      this.error('Failed to parse sensor settings JSON:', error);
      return [];
    }
  }

  /**
   * Checks if a sensor is stale and should have its events ignored.
   *
   * Implements fail-safe behavior: events from stale sensors are logged and ignored
   * to prevent false state changes. The sensor tracking is still updated (marks sensor
   * as fresh) so future events will be processed normally once staleness clears.
   *
   * @private
   * @param sensorId - The device ID of the sensor
   * @param eventDescription - Human-readable event description for logging
   * @returns {boolean} True if the sensor is stale and event should be ignored
   */
  private shouldIgnoreStaleSensor(sensorId: string, eventDescription: string): boolean {
    const sensorInfo = this.staleSensorMap.get(sensorId);
    if (sensorInfo && sensorInfo.isStale) {
      const staleDuration = Math.round((Date.now() - sensorInfo.lastUpdated) / 60000);
      this.log(`Ignoring event from stale sensor: ${sensorId} ${eventDescription} (stale for ${staleDuration}min)`);

      // Update tracking (marks sensor fresh) but return true to signal event should be ignored
      this.updateStaleSensorTracking(sensorId);
      return true;
    }
    return false;
  }

  /**
   * Updates stale sensor tracking when a sensor reports an update.
   *
   * Called from sensor event handlers (handlePirMotion, handleDoorEvent, handlePirCleared)
   * to track the last time each sensor reported data.
   *
   * @private
   * @param sensorId - The device ID of the sensor that updated
   * @returns {void}
   */
  private updateStaleSensorTracking(sensorId: string): void {
    const info = this.staleSensorMap.get(sensorId);
    if (!info) {
      return;
    }

    const now = Date.now();
    const wasStale = info.isStale;

    // Update last update timestamp
    info.lastUpdated = now;

    // If sensor was stale, mark it fresh and trigger re-evaluation
    if (wasStale) {
      info.isStale = false;
      this.log(`Sensor became fresh: ${sensorId} (was stale, now reporting again)`);

      // Check if all sensors are now fresh
      this.checkAndUpdateDataStaleCapability();
    }
  }

  /**
   * Starts stale sensor monitoring.
   *
   * Checks every minute if any sensors have become stale.
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
   * Checks all sensors for staleness and updates alarm_data_stale capability.
   *
   * Called periodically (every minute) by staleCheckInterval.
   * When sensors become stale, sets alarm_data_stale to true.
   * When all sensors are fresh, sets alarm_data_stale to false.
   *
   * @private
   * @returns {void}
   */
  private checkForStaleSensors(): void {
    const now = Date.now();
    let hasChanges = false;

    for (const [sensorId, info] of this.staleSensorMap.entries()) {
      const timeSinceUpdate = now - info.lastUpdated;
      const shouldBeStale = timeSinceUpdate > info.timeoutMs;

      // Check if stale state changed
      if (shouldBeStale && !info.isStale) {
        // Sensor became stale
        info.isStale = true;
        hasChanges = true;

        // Production debugging log with timeout type
        const timeoutMinutes = Math.round(info.timeoutMs / 60000);
        const staleDuration = Math.round(timeSinceUpdate / 60000);
        this.log(
          `Sensor became stale: ${sensorId} (timeout: ${timeoutMinutes}min, stale for: ${staleDuration}min)`
        );
      }
    }

    if (hasChanges) {
      this.checkAndUpdateDataStaleCapability();

      // CRITICAL: Trigger immediate fail-safe evaluation
      // Don't wait for next sensor event to apply fail-safe
      void this.evaluateStaleFailSafe();
    }
  }

  /**
   * Checks stale sensor state and updates alarm_data_stale capability.
   *
   * Sets alarm_data_stale to true if ANY sensor is stale.
   * Sets alarm_data_stale to false if ALL sensors are fresh.
   *
   * @private
   * @returns {void}
   */
  private checkAndUpdateDataStaleCapability(): void {
    const hasAnyStaleSensors = Array.from(this.staleSensorMap.values()).some(
      (info) => info.isStale
    );

    // Update capability if needed
    const currentValue = this.getCapabilityValue('alarm_data_stale');
    if (currentValue !== hasAnyStaleSensors) {
      this.setCapabilityValue('alarm_data_stale', hasAnyStaleSensors).catch((err) => {
        this.error('Failed to update alarm_data_stale capability:', err);
      });

      if (hasAnyStaleSensors) {
        const staleCount = Array.from(this.staleSensorMap.values()).filter(
          (info) => info.isStale
        ).length;
        this.log(`Data quality warning: ${staleCount} sensor(s) are stale`);
      } else {
        this.log('All sensors are now fresh - data quality normal');
      }
    }
  }

  /**
   * Evaluates fail-safe conditions when sensors become stale.
   *
   * Implements fail-safe behavior per CLAUDE.md guidelines:
   * - If ALL sensors are stale → set occupancy to UNCERTAIN
   * - Unknown state = unsafe state (fail-safe principle)
   *
   * This method is called when sensors become stale to immediately apply
   * fail-safe logic without waiting for the next sensor event.
   *
   * @private
   * @returns {Promise<void>}
   */
  private async evaluateStaleFailSafe(): Promise<void> {
    try {
      // Ignore if device is paused
      if (this.isPaused) {
        return;
      }

      // Check if ALL sensors are stale
      const allStale = Array.from(this.staleSensorMap.values()).every(
        (info) => info.isStale
      );

      if (allStale) {
        this.log('Fail-safe: All sensors are stale, setting tri-state=UNKNOWN, boolean=UNOCCUPIED');

        // Set tri-state to UNKNOWN (sensors unreliable)
        this.occupancyState = OccupancyState.UNKNOWN;

        // Set stable state to UNOCCUPIED (fail-safe)
        // Rationale: When sensors are stale/unreliable, we cannot confirm occupancy.
        // Fail-safe principle: unknown state defaults to safer state (UNOCCUPIED).
        // This prevents indefinite OCCUPIED state when sensors stop reporting.
        this.lastStableOccupancy = StableOccupancyState.UNOCCUPIED;

        // Stop timers - sensors are unreliable
        this.stopEnterTimer();
        this.stopClearTimer();

        // Update output capabilities
        await this.updateOccupancyOutput();

        this.log(`Fail-safe applied: tri-state=${this.occupancyState}, boolean=${this.lastStableOccupancy}`);
      }
    } catch (error) {
      this.error('Failed to evaluate stale fail-safe:', error);
      // Don't throw - fail-safe evaluation is non-critical background operation
    }
  }

  // ========================================
  // Room State Management Methods
  // ========================================

  /**
   * Schedules a room state timer for transitioning to extended states.
   *
   * @param minutes - Duration in minutes before timer expires
   */
  private scheduleRoomStateTimer(minutes: number): void {
    this.stopRoomStateTimer();

    if (minutes <= 0) {
      this.log('Room state timer disabled (duration is 0)');
      return;
    }

    const timeoutMs = minutes * 60 * 1000;
    this.roomStateTimer = setTimeout(async () => {
      try {
        // Validate device still initialized
        if (!this.stateEngine) {
          this.log('Room state timer cancelled: device deinitialized');
          return;
        }

        // Ignore if in manual override
        if (this.manualOverride) {
          this.log('Room state timer expired but manual override active - ignoring');
          return;
        }

        this.log(`Room state timer expired after ${minutes} minutes`);
        await this.handleRoomStateTimerExpiry();
      } catch (error) {
        // CRITICAL: Prevent unhandled rejection
        this.error(`[${DeviceErrorId.ROOM_STATE_TIMER_FAILED}] Room state timer expiry failed (device may be deleted):`, error);
      }
    }, timeoutMs);

    this.log(`Room state timer scheduled: ${minutes} minutes`);
  }

  /**
   * Handles room state timer expiry.
   *
   * Transitions from base state to extended state via the state engine.
   */
  private async handleRoomStateTimerExpiry(): Promise<void> {
    if (!this.stateEngine) {
      return;
    }

    const result = this.stateEngine.handleTimerExpiry();

    if (result.newState) {
      await this.executeRoomStateTransition(result);
    }
  }

  /**
   * Executes a room state transition and triggers flow cards.
   *
   * @param result - The state transition result from the engine
   */
  private async executeRoomStateTransition(result: StateTransitionResult): Promise<void> {
    if (!result.newState || !result.previousState) {
      return;
    }

    this.log(`Room state transition: ${result.previousState} → ${result.newState} (${result.reason})`);

    // Trigger flow cards
    await this.triggerRoomStateFlowCards(result.newState, result.previousState);

    // Schedule next timer if applicable
    if (result.scheduledTimerMinutes !== null && result.scheduledTimerMinutes > 0) {
      this.scheduleRoomStateTimer(result.scheduledTimerMinutes);
    } else {
      this.stopRoomStateTimer();
    }
  }

  /**
   * Triggers room state flow cards for a state transition.
   *
   * @param newState - The new room state
   * @param previousState - The previous room state
   */
  private async triggerRoomStateFlowCards(newState: RoomState, previousState: RoomState): Promise<void> {
    try {
      // Trigger generic state changed card with tokens
      const stateChangedCard = this.homey.flow.getDeviceTriggerCard('room_state_changed');
      if (stateChangedCard) {
        await stateChangedCard.trigger(this, {
          state: newState,
          previous_state: previousState,
        }).catch((err: Error) => {
          this.error('Failed to trigger room_state_changed:', err);
        });
      }

      // Trigger specific state cards
      const specificCardId = `room_state_became_${newState}`;
      const specificCard = this.homey.flow.getDeviceTriggerCard(specificCardId);
      if (specificCard) {
        await specificCard.trigger(this).catch((err: Error) => {
          this.error(`Failed to trigger ${specificCardId}:`, err);
        });
      }
    } catch (error) {
      this.error('Failed to trigger room state flow cards:', error);
    }
  }

  /**
   * Handles occupancy change and updates room state.
   *
   * Called when the boolean occupancy output changes.
   * Drives the room state machine based on occupancy.
   *
   * @param isOccupied - Whether the room is now occupied
   */
  private async handleOccupancyChangeForRoomState(isOccupied: boolean): Promise<void> {
    try {
      if (!this.stateEngine) {
        return;
      }

      // Skip if in manual override mode
      if (this.manualOverride) {
        this.log(`Occupancy changed to ${isOccupied ? 'occupied' : 'unoccupied'} but manual override active - ignoring`);
        return;
      }

      const result = this.stateEngine.handleOccupancyChange(isOccupied);

      if (result.newState) {
        await this.executeRoomStateTransition(result);
      } else if (result.scheduledTimerMinutes !== null) {
        // No state change but timer may need scheduling
        this.scheduleRoomStateTimer(result.scheduledTimerMinutes);
      }
    } catch (error) {
      // Log error but don't throw - room state is non-critical background operation
      this.error(
        `[${DeviceErrorId.ROOM_STATE_TIMER_FAILED}] Failed to handle occupancy change for room state:`,
        error
      );
    }
  }

  /**
   * Sets the room state manually (for manual override mode).
   *
   * When called:
   * - Enables manual override mode
   * - Sets the room state to the specified value
   * - Stops room state timers (no automatic transitions)
   * - Sensor monitoring continues (occupancy is still tracked)
   *
   * @param stateString - The room state to set ('idle', 'extended_idle', 'occupied', 'extended_occupied')
   */
  private async setManualRoomState(stateString: string): Promise<void> {
    if (!this.stateEngine) {
      return;
    }

    // Validate state
    if (!WIABStateEngine.isValidState(stateString)) {
      this.error(`Invalid room state: ${stateString}`);
      throw new Error(`Invalid room state: ${stateString}`);
    }

    const state = stateString as RoomState;
    const previousState = this.stateEngine.getCurrentState();

    // Enable manual override and persist to device store
    this.manualOverride = true;
    await this.setStoreValue('manualOverride', true).catch((err) => {
      this.error('Failed to persist manualOverride state:', err);
    });

    // Set the state manually
    const result = this.stateEngine.setManualState(state);

    // Stop automatic timers
    this.stopRoomStateTimer();

    if (result.newState) {
      await this.triggerRoomStateFlowCards(result.newState, previousState);
    }

    this.log(`Manual room state set: ${state} (override enabled)`);
  }

  /**
   * Returns to automatic room state management.
   *
   * When called:
   * - Disables manual override mode
   * - Re-evaluates room state based on current occupancy
   * - Restarts automatic timers
   */
  private async returnToAutomaticMode(): Promise<void> {
    if (!this.stateEngine) {
      return;
    }

    // Disable manual override and persist to device store
    this.manualOverride = false;
    await this.setStoreValue('manualOverride', false).catch((err) => {
      this.error('Failed to persist manualOverride state:', err);
    });

    // Re-evaluate based on current occupancy
    const isOccupied = this.lastStableOccupancy === StableOccupancyState.OCCUPIED;
    const result = this.stateEngine.handleOccupancyChange(isOccupied);

    if (result.newState) {
      await this.executeRoomStateTransition(result);
    } else if (result.scheduledTimerMinutes !== null) {
      this.scheduleRoomStateTimer(result.scheduledTimerMinutes);
    }

    this.log('Returned to automatic room state mode');
  }

  /**
   * Checks if the current room state matches the target (with hierarchy).
   *
   * Returns true if:
   * - Current state equals target state
   * - Current state is a child of target state (e.g., extended_occupied matches occupied)
   *
   * @param targetStateString - The target state to check
   * @returns True if current state matches target (with inheritance)
   */
  private isInRoomState(targetStateString: string): boolean {
    if (!this.stateEngine || !WIABStateEngine.isValidState(targetStateString)) {
      return false;
    }

    return this.stateEngine.isInState(targetStateString as RoomState);
  }

  /**
   * Checks if the current room state exactly matches the target (no hierarchy).
   *
   * @param targetStateString - The target state to check
   * @returns True only if current state exactly equals target
   */
  private isExactlyInRoomState(targetStateString: string): boolean {
    if (!this.stateEngine || !WIABStateEngine.isValidState(targetStateString)) {
      return false;
    }

    return this.stateEngine.isExactlyInState(targetStateString as RoomState);
  }

  /**
   * Checks if manual override is currently active.
   *
   * @returns True if manual override is active
   */
  private isManualOverrideActive(): boolean {
    return this.manualOverride;
  }

  /**
   * Gets the current room state.
   *
   * @returns The current room state, or 'idle' if engine not initialized
   */
  private getCurrentRoomState(): RoomState {
    return this.stateEngine?.getCurrentState() ?? RoomState.IDLE;
  }
}

export default WIABDevice;
module.exports = WIABDevice;
