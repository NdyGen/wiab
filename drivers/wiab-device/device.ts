import Homey from 'homey';
import { SensorMonitor } from '../../lib/SensorMonitor';
import { SensorConfig, SensorCallbacks } from '../../lib/types';
import {
  OccupancyState,
  StableOccupancyState,
  DoorState,
  TimerDefaults,
  occupancyToBoolean,
  areAllDoorsClosed,
  isAnyDoorOpen,
} from '../../lib/OccupancyState';
import { classifySensors, ClassifiedSensor } from '../../lib/SensorClassifier';

/**
 * WIAB (Wasp in a Box) virtual occupancy sensor device.
 *
 * This device implements a tri-state occupancy model (UNKNOWN, OCCUPIED, UNOCCUPIED)
 * with multiple door sensors and multiple PIR sensors. The model uses two timers:
 * - T_ENTER: Short window after door events to detect entry/exit via motion
 * - T_CLEAR: Longer window with open doors to detect room becoming empty
 *
 * The tri-state model provides a derived boolean output (alarm_occupancy) that
 * represents the last stable occupancy state, maintaining continuity during
 * transitional UNKNOWN periods.
 *
 * Specification: docs/wiab_multi_door_multi_pir_full.md
 *
 * Lifecycle:
 * 1. onInit() - Initialize to UNOCCUPIED, setup sensor monitoring, read PIR values
 * 2. onSettings() - Reconfigure monitoring and timers when settings change
 * 3. onDeleted() - Cleanup all timers and monitoring resources
 */
class WIABDevice extends Homey.Device {
  private sensorMonitor?: SensorMonitor;

  // Tri-state occupancy variables (spec section 5)
  private occupancyState: OccupancyState = OccupancyState.UNOCCUPIED;
  private lastStableOccupancy: StableOccupancyState = StableOccupancyState.UNOCCUPIED;
  private doorStates: Map<string, DoorState> = new Map();

  // PIR tracking
  private lastDoorEventTimestamp: number | null = null;
  private pirSinceLastDoorEvent: boolean = false;
  private lastPirTimestamp: number | null = null;

  // T_ENTER timer (spec section 7.1)
  private enterTimer: NodeJS.Timeout | undefined = undefined;
  private enterTimerDeadline: number | null = null;

  // T_CLEAR timer (spec section 7.2)
  private clearTimer: NodeJS.Timeout | undefined = undefined;
  private clearTimerDeadline: number | null = null;
  private clearTimerAnchor: number | null = null;

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
    this.log('WIAB device initializing with tri-state occupancy model');

    // Ensure occupancy_state capability exists (for migration of existing devices)
    if (!this.hasCapability('occupancy_state')) {
      this.log('Adding occupancy_state capability to existing device');
      await this.addCapability('occupancy_state');
    }

    // Initialize to UNOCCUPIED (spec 5.1)
    this.occupancyState = OccupancyState.UNOCCUPIED;
    this.lastStableOccupancy = StableOccupancyState.UNOCCUPIED;

    // Setup sensor monitoring with current settings
    await this.setupSensorMonitoring();

    // Set initial boolean output from stable state
    await this.updateOccupancyOutput();

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

    if (sensorSettingsChanged) {
      this.log('Sensor configuration changed, reinitializing monitoring');

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
        onTriggered: (sensorId: string, value: boolean) => this.handlePirMotion(sensorId),
        // Door sensors trigger door events (both open and close)
        onReset: (sensorId: string, value: boolean) => this.handleDoorEvent(sensorId, value),
      };

      // Get HomeyAPI instance from app
      const app = this.homey.app as any;
      if (!app || !app.homeyApi) {
        throw new Error('Homey API not available');
      }

      // Create and start sensor monitor
      // Note: SensorMonitor now treats triggerSensors as PIRs and resetSensors as doors
      this.sensorMonitor = new SensorMonitor(
        app.homeyApi,
        this.homey,
        triggerSensors, // PIR sensors
        resetSensors,   // Door sensors
        callbacks
      );

      await this.sensorMonitor.start();

      this.log('Sensor monitoring initialized successfully');
    } catch (error) {
      this.error('Failed to setup sensor monitoring:', error);
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
   * - Reset PIR tracking
   * - Start/restart T_ENTER timer
   * - Manage T_CLEAR timer based on door states and stable occupancy
   *
   * @param doorId - The device ID of the door sensor that changed
   * @param doorValue - The current value of the door sensor (true = open, false = closed)
   */
  private async handleDoorEvent(doorId: string, doorValue: boolean): Promise<void> {
    try {
      const newDoorState = doorValue ? DoorState.OPEN : DoorState.CLOSED;
      const oldDoorState = this.doorStates.get(doorId);

      this.doorStates.set(doorId, newDoorState);

      this.log(
        `Door event: ${doorId} ${oldDoorState} → ${newDoorState}`
      );

      // Update derived door status
      const allClosed = areAllDoorsClosed(this.doorStates);
      const anyOpen = isAnyDoorOpen(this.doorStates);

      // Set transitional occupancy (spec 8.1, 8.2)
      this.occupancyState = OccupancyState.UNKNOWN;

      // Reset PIR tracking
      this.pirSinceLastDoorEvent = false;
      this.lastDoorEventTimestamp = Date.now();

      // Start/restart T_ENTER timer (spec 8.1, 8.2)
      this.startEnterTimer();

      // Manage T_CLEAR timer
      if (allClosed) {
        // All doors closed: stop T_CLEAR (spec 8.2)
        this.stopClearTimer();
      } else if (anyOpen && this.lastStableOccupancy === StableOccupancyState.OCCUPIED) {
        // At least one door open and room was occupied: start/restart T_CLEAR (spec 8.1)
        this.startClearTimer();
      }

      // Update output (will retain last stable state during UNKNOWN)
      await this.updateOccupancyOutput();

      this.log(
        `State after door event: ${this.occupancyState}, stable: ${this.lastStableOccupancy}, doors: ${allClosed ? 'all closed' : 'some open'}`
      );
    } catch (error) {
      this.error('Failed to handle door event:', error);
    }
  }

  /**
   * Handles PIR motion sensor events.
   *
   * Per spec section 8.3:
   * - Mark PIR since last door event
   * - Update last PIR timestamp
   * - Branch based on door status (all closed vs. any open)
   *
   * 8.3.1: All doors closed → immediate OCCUPIED, stop T_CLEAR
   * 8.3.2: Any door open → OCCUPIED, start/restart T_CLEAR
   *
   * @param pirId - The device ID of the PIR sensor that detected motion
   */
  private async handlePirMotion(pirId: string): Promise<void> {
    try {
      this.log(`PIR motion detected: ${pirId}`);

      // Update PIR tracking (spec 8.3)
      this.lastPirTimestamp = Date.now();
      this.pirSinceLastDoorEvent = true;

      // Check door status
      const allClosed = areAllDoorsClosed(this.doorStates);

      if (allClosed) {
        // Spec 8.3.1: All doors closed - sealed room
        this.log('PIR with all doors closed: room is sealed, setting OCCUPIED');

        this.occupancyState = OccupancyState.OCCUPIED;
        this.lastStableOccupancy = StableOccupancyState.OCCUPIED;

        // Stop T_CLEAR (not needed when sealed)
        this.stopClearTimer();
      } else {
        // Spec 8.3.2: At least one door open - leaky room
        this.log('PIR with doors open: room is leaky, state stays UNKNOWN, stable = OCCUPIED, starting T_CLEAR');

        // Tri-state must be UNKNOWN (we know someone was there, but don't know if they're still there)
        this.occupancyState = OccupancyState.UNKNOWN;
        // But stable occupancy is OCCUPIED (for the boolean output)
        this.lastStableOccupancy = StableOccupancyState.OCCUPIED;

        // Start/restart T_CLEAR (room might empty through open doors)
        this.startClearTimer();
      }

      // Update output
      await this.updateOccupancyOutput();

      this.log(
        `State after PIR: ${this.occupancyState}, stable: ${this.lastStableOccupancy}`
      );
    } catch (error) {
      this.error('Failed to handle PIR motion:', error);
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
    // Stop existing timer if running
    this.stopEnterTimer();

    // Get T_ENTER setting with validation
    const tEnterSeconds = this.getSetting('t_enter') as number || TimerDefaults.T_ENTER_SECONDS;
    const validatedTimeout = Math.max(
      TimerDefaults.T_ENTER_MIN_SECONDS,
      Math.min(TimerDefaults.T_ENTER_MAX_SECONDS, tEnterSeconds)
    );
    const timeoutMs = validatedTimeout * 1000;

    // Set deadline
    this.enterTimerDeadline = Date.now() + timeoutMs;

    // Start timer
    this.enterTimer = setTimeout(() => {
      this.handleEnterTimerExpiry();
    }, timeoutMs);

    this.log(`T_ENTER timer started: ${validatedTimeout}s`);
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
   * - If PIR occurred since last door event → OCCUPIED (safety net)
   * - If no PIR occurred → UNOCCUPIED
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

        if (this.pirSinceLastDoorEvent) {
          // PIR occurred during T_ENTER window
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
          // No PIR → UNOCCUPIED (spec 8.4)
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
    // Stop existing timer if running
    this.stopClearTimer();

    // Get T_CLEAR setting with validation
    const tClearSeconds = this.getSetting('t_clear') as number || TimerDefaults.T_CLEAR_SECONDS;
    const validatedTimeout = Math.max(
      TimerDefaults.T_CLEAR_MIN_SECONDS,
      Math.min(TimerDefaults.T_CLEAR_MAX_SECONDS, tClearSeconds)
    );
    const timeoutMs = validatedTimeout * 1000;

    // Set deadline and anchor
    const now = Date.now();
    this.clearTimerDeadline = now + timeoutMs;
    this.clearTimerAnchor = now;

    // Start timer
    this.clearTimer = setTimeout(() => {
      this.handleClearTimerExpiry();
    }, timeoutMs);

    this.log(`T_CLEAR timer started: ${validatedTimeout}s`);
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
   */
  private async updateOccupancyOutput(): Promise<void> {
    try {
      const occupied = occupancyToBoolean(this.lastStableOccupancy);
      await this.setCapabilityValue('alarm_occupancy', occupied);

      // Also update the internal tri-state capability for debugging
      await this.setCapabilityValue('occupancy_state', this.occupancyState);

      this.log(`Occupancy output: ${occupied}, internal state: ${this.occupancyState}`);
    } catch (error) {
      this.error('Failed to update occupancy output:', error);
    }
  }

  /**
   * Reads the current value of a door sensor.
   *
   * @param doorId - The device ID of the door sensor
   * @returns true if open, false if closed, null if unavailable
   */
  private async getDoorSensorValue(doorId: string): Promise<boolean | null> {
    try {
      const app = this.homey.app as any;
      if (!app || !app.homeyApi) {
        this.error('Homey API not available');
        return null;
      }

      const devices = app.homeyApi.devices;
      if (!devices || !devices[doorId]) {
        this.error(`Door sensor device not found: ${doorId}`);
        return null;
      }

      const device = devices[doorId];
      const capabilitiesObj = device.capabilitiesObj;

      // Find the door capability (could be alarm_contact, alarm_door, etc.)
      const resetSensorsJson = this.getSetting('resetSensors') as string;
      const resetSensors = this.validateSensorSettings(resetSensorsJson);
      const sensor = resetSensors.find(s => s.deviceId === doorId);

      if (!sensor) {
        this.error(`Door sensor configuration not found: ${doorId}`);
        return null;
      }

      if (!capabilitiesObj || !(sensor.capability in capabilitiesObj)) {
        this.error(`Device ${doorId} does not have capability: ${sensor.capability}`);
        return null;
      }

      const value = capabilitiesObj[sensor.capability]?.value;
      return typeof value === 'boolean' ? value : false;
    } catch (error) {
      this.error(`Error reading door sensor ${doorId}:`, error);
      return null;
    }
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

module.exports = WIABDevice;
