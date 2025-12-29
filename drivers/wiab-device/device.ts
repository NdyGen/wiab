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

  /**
   * Initializes the WIAB device.
   *
   * Per spec section 5.1:
   * - Initialize occupancy_state = UNOCCUPIED
   * - Initialize last_stable_occupancy = UNOCCUPIED
   * - Initialize all door states to CLOSED (or read actual values if available)
   * - Setup sensor monitoring
   * - Read current PIR sensor values to set initial occupancy state
   */
  async onInit(): Promise<void> {
    this.log('WIAB device initializing with quad-state occupancy model');

    // Ensure occupancy_state capability exists (for migration of existing devices)
    if (!this.hasCapability('occupancy_state')) {
      this.log('Adding occupancy_state capability to existing device');
      await this.addCapability('occupancy_state');
    }

    // Ensure alarm_paused capability exists (for migration of existing devices)
    if (!this.hasCapability('alarm_paused')) {
      this.log('Adding alarm_paused capability to existing device');
      await this.addCapability('alarm_paused');
    }

    // Initialize to UNOCCUPIED (spec 5.1)
    this.occupancyState = OccupancyState.UNOCCUPIED;
    this.lastStableOccupancy = StableOccupancyState.UNOCCUPIED;

    // Setup sensor monitoring with current settings
    await this.setupSensorMonitoring();

    // Set initial boolean output from stable state
    await this.updateOccupancyOutput();

    // Initialize pause indicator to false
    await this.setCapabilityValue('alarm_paused', false).catch((err) => {
      this.error('Failed to initialize alarm_paused capability:', err);
    });

    /**
     * Registers the alarm_paused capability listener to handle UI toggle events.
     *
     * This listener syncs the UI toggle with internal pause state:
     * - When user toggles ON → pauses device with current stable occupancy
     * - When user toggles OFF → unpauses device and resumes monitoring
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
      this.log(`Pause toggle changed to: ${value}`);

      // Check if state change is needed (prevent loops from programmatic sets)
      if (value && !this.isPaused) {
        // User toggled pause ON - pause with current stable state
        this.log('User requested pause via UI toggle');
        await this.pauseDevice(this.lastStableOccupancy);
      } else if (!value && this.isPaused) {
        // User toggled pause OFF - unpause
        this.log('User requested unpause via UI toggle');
        await this.unpauseDevice();
      } else {
        this.log(`Pause state already ${value ? 'paused' : 'unpaused'} - ignoring redundant toggle`);
      }
    });

    // Register action handlers
    this.registerActionHandlers();

    // Register condition handlers
    this.registerConditionHandlers();

    this.log('WIAB device initialization complete');
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
  }

  /**
   * Handles device deletion.
   *
   * Cleanup all timers and sensor monitoring to prevent memory leaks.
   */
  async onDeleted(): Promise<void> {
    this.log('WIAB device deleted, cleaning up resources');

    // Stop both timers
    this.stopEnterTimer();
    this.stopClearTimer();

    // Cleanup sensor monitoring
    this.teardownSensorMonitoring();
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

    if (this.sensorMonitor) {
      this.log('Tearing down sensor monitoring');
      this.sensorMonitor.stop();
      this.sensorMonitor = undefined;
    }
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
    this.enterTimer = setTimeout(() => this.handleEnterTimerExpiry(), timeoutMs);

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

    this.clearTimer = setTimeout(() => this.handleClearTimerExpiry(), timeoutMs);

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
   */
  private async updateOccupancyOutput(): Promise<void> {
    try {
      const occupied = occupancyToBoolean(this.lastStableOccupancy);

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

      // Set pause indicator
      await this.setCapabilityValue('alarm_paused', true).catch((err) => {
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

      // Clear pause indicator
      await this.setCapabilityValue('alarm_paused', false).catch((err) => {
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
   * Registers action handlers for set_state and unpause actions.
   *
   * Called during device initialization to register the action listeners
   * that will be invoked when the user triggers these actions in flows.
   */
  private registerActionHandlers(): void {
    try {
      // Register set_state action handler
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

      this.log('Action handlers registered successfully');
    } catch (error) {
      this.error('Failed to register action handlers:', error);
      throw error;
    }
  }

  /**
   * Registers condition handlers for is_paused condition.
   *
   * Called during device initialization to register the condition listener
   * that will be evaluated when the user includes this condition in flows.
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
}

export default WIABDevice;
module.exports = WIABDevice;
