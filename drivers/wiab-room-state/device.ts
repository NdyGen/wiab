import Homey from 'homey';
import { RoomStateEngine } from '../../lib/RoomStateEngine';
import type { StateConfig, RoomStateSettings, HomeyAPI, HomeyAPIZone } from '../../lib/types';
import { RoomStateErrorId } from '../../constants/errorIds';

/**
 * Interface for WIABApp with HomeyAPI
 */
interface WIABApp extends Homey.App {
  homeyApi?: HomeyAPI;
}

/**
 * Extended HomeyAPIZone with active property
 */
interface ExtendedHomeyAPIZone extends HomeyAPIZone {
  active?: boolean;
}

/**
 * Room State Manager Device
 *
 * Manages room states based on zone activity with configurable state hierarchies
 * and timer-based transitions. Monitors a Homey zone for activity and transitions
 * between user-defined states based on active/inactive timers.
 *
 * Features:
 * - Polling-based zone activity monitoring (every 5 seconds)
 * - 2-level state hierarchy (parent + child)
 * - Timer-based state transitions for both active and inactive states
 * - Manual state override with indefinite duration
 * - Flow card integration for triggers, conditions, and actions
 *
 * Lifecycle:
 * 1. onInit() - Load settings, setup zone monitoring, initialize state
 * 2. onSettings() - Reconfigure when settings change
 * 3. onDeleted() - Cleanup timers and polling intervals
 */
class RoomStateDevice extends Homey.Device {
  private stateEngine?: RoomStateEngine;
  private zone?: ExtendedHomeyAPIZone;
  private stateTimer?: NodeJS.Timeout;
  private lastActivityTimestamp: number | null = null;
  private isZoneActive: boolean = false;
  private manualOverride: boolean = false;
  private currentZoneId?: string;
  private zonePollingInterval?: NodeJS.Timeout;
  private zoneChangeDetectionInterval?: NodeJS.Timeout;

  /**
   * Initializes the Room State device.
   *
   * Steps:
   * 1. Load and validate settings
   * 2. Create RoomStateEngine with state configuration
   * 3. Setup zone activity monitoring
   * 4. Initialize capabilities
   * 5. Set initial state
   */
  async onInit(): Promise<void> {
    this.log('Room State device initializing');

    try {
      // Register capability listeners for manual state changes
      this.registerCapabilityListeners();

      // Setup zone monitoring and state engine
      await this.setupRoomStateManagement();

      this.log('Room State device initialized successfully');
    } catch (error) {
      this.error(
        `[${RoomStateErrorId.STATE_ENGINE_VALIDATION_FAILED}] Failed to initialize device:`,
        error
      );
      throw error;
    }
  }

  /**
   * Handles settings changes.
   *
   * When timers change or zone assignment changes, teardown
   * existing monitoring and reinitialize with new configuration.
   * This ensures the device re-evaluates zone activity and sets
   * the correct initial state.
   *
   * @param event - Settings change event
   */
  async onSettings(event: {
    oldSettings: { [key: string]: string | number | boolean | null | undefined };
    newSettings: { [key: string]: string | number | boolean | null | undefined };
    changedKeys: string[];
  }): Promise<void> {
    this.log('Settings changed:', event.changedKeys);

    try {
      // If timer settings changed, reinitialize
      const criticalKeys = ['idleTimeout', 'occupiedTimeout'];
      const needsReinit = event.changedKeys.some((key) => criticalKeys.includes(key));

      if (needsReinit) {
        this.log('Timer settings changed, reinitializing...');
        this.teardownRoomStateManagement();
        await this.setupRoomStateManagement();
      }
    } catch (error) {
      this.error(
        `[${RoomStateErrorId.STATE_ENGINE_VALIDATION_FAILED}] Failed to apply settings:`,
        error
      );
      throw error;
    }
  }

  /**
   * Cleanup when device is deleted.
   *
   * Removes zone event listeners and clears all timers.
   */
  async onDeleted(): Promise<void> {
    this.log('Room State device being deleted');
    this.teardownRoomStateManagement();
  }

  /**
   * Registers capability listeners for manual state control.
   *
   * Currently no capabilities are registered as state management
   * is done through flow cards only.
   */
  private registerCapabilityListeners(): void {
    // No capability listeners needed - flow cards handle all interactions
  }

  /**
   * Gets the zone ID this device is assigned to.
   *
   * Uses HomeyAPI to get device information including zone assignment.
   * In Homey, ALL devices are always assigned to a zone - they cannot exist without one.
   *
   * @private
   * @returns {Promise<string | null>} Zone ID or null if lookup fails
   */
  private async getDeviceZone(): Promise<string | null> {
    try {
      const app = this.homey.app as WIABApp;
      const homeyApi = app.homeyApi;

      if (!homeyApi) {
        this.error('HomeyAPI not available');
        return null;
      }

      // Get all devices from HomeyAPI
      const devices = await homeyApi.devices.getDevices();
      this.log(`[DEBUG] Found ${Object.keys(devices).length} total devices in Homey`);

      // Get our unique pairing ID to identify ourselves
      const ourPairingId = this.getData().id;
      this.log(`[DEBUG] Our pairing ID: ${ourPairingId}`);
      this.log(`[DEBUG] Looking for Room State Manager device in HomeyAPI...`);

      // Get our current settings to use as additional matching criteria
      const ourSettings = this.getSettings() as RoomStateSettings;

      // Find ourselves by matching the device ID directly
      // The deviceId from HomeyAPI should match the device's Homey ID
      let device: unknown | null = null;
      let matchedDeviceId: string | null = null;

      for (const [deviceId, dev] of Object.entries(devices)) {
        const deviceObj = dev as unknown as {
          id?: string;
          name?: string;
          zone?: string;
          driverId?: string;
          data?: { id?: string };
          settings?: RoomStateSettings;
        };

        // Only check devices from our driver
        // driverId format: "homey:app:net.dongen.wiab:wiab-room-state"
        if (!deviceObj.driverId?.endsWith(':wiab-room-state')) {
          continue;
        }

        // Try to match by device ID (deviceId key from HomeyAPI)
        // This is the most reliable way to identify ourselves
        if (deviceId === this.getData().id || deviceObj.id === this.getData().id) {
          this.log(`[DEBUG] Matched device by ID: ${deviceId}`);
          device = deviceObj;
          matchedDeviceId = deviceId;
          break;
        }

        // Fallback: Match by pairing ID in device data
        if (deviceObj.data?.id === ourPairingId) {
          this.log(`[DEBUG] Matched device by pairing ID in data: ${deviceId}`);
          device = deviceObj;
          matchedDeviceId = deviceId;
          break;
        }

        // Final fallback: Match by unique settings combination
        if (deviceObj.settings &&
            deviceObj.settings.idleTimeout === ourSettings.idleTimeout &&
            deviceObj.settings.occupiedTimeout === ourSettings.occupiedTimeout) {
          this.log(`[DEBUG] Matched device by settings: ${deviceId}`);
          device = deviceObj;
          matchedDeviceId = deviceId;
          break;
        }
      }

      if (!device || !matchedDeviceId) {
        this.error(`Could not find ourselves in HomeyAPI devices`);
        this.error(`Our pairing ID: ${ourPairingId}, settings: idle=${ourSettings.idleTimeout}, occupied=${ourSettings.occupiedTimeout}`);
        return null;
      }

      const deviceObj = device as unknown as {
        name?: string;
        zone?: string;
      };

      this.log(`[DEBUG] Found our device: ${deviceObj.name}`);
      this.log(`[DEBUG] Device zone: ${deviceObj.zone}`);

      if (!deviceObj.zone) {
        this.error(`No zone assigned to device "${deviceObj.name}"`);
        this.error('Device needs to be manually assigned to a zone in Homey settings');
        return null;
      }

      this.log(`Device is in zone: ${deviceObj.zone}`);
      return deviceObj.zone;
    } catch (error) {
      this.error('Failed to get device zone:', error);
      return null;
    }
  }

  /**
   * Sets up room state management.
   *
   * Steps:
   * 1. Load and parse settings
   * 2. Validate state configuration
   * 3. Create RoomStateEngine
   * 4. Setup zone monitoring
   * 5. Check current zone activity
   * 6. Initialize state based on actual zone activity
   * 7. Initialize capabilities
   */
  private async setupRoomStateManagement(): Promise<void> {
    try {
      // Get zone from device assignment via HomeyAPI
      const zoneId = await this.getDeviceZone();

      if (!zoneId) {
        this.error('No zone assigned - please assign this device to a zone in device settings');
        throw new Error('No zone assigned to device');
      }

      this.log(`Monitoring zone: ${zoneId}`);

      // Store current zone ID for change detection
      this.currentZoneId = zoneId;

      // Load settings
      const settings = this.getSettings() as RoomStateSettings;
      const idleTimeout = settings.idleTimeout || 0;
      const occupiedTimeout = settings.occupiedTimeout || 0;

      // Build fixed 4-state configuration based on timer settings
      const stateConfigs = this.buildStateConfiguration(idleTimeout, occupiedTimeout);

      // Setup zone monitoring FIRST to get zone object
      await this.setupZoneMonitoring(zoneId);

      // Check current zone activity to determine initial state
      const isZoneActive = this.zone?.active || false;
      const initialState = isZoneActive ? 'occupied' : 'idle';
      this.log(`Zone is currently ${isZoneActive ? 'ACTIVE' : 'INACTIVE'}, starting in state: ${initialState}`);

      // Create state engine with correct initial state
      this.stateEngine = new RoomStateEngine(stateConfigs, initialState);
      this.log(`State engine created with timers: idle=${idleTimeout}min, occupied=${occupiedTimeout}min`);

      // Set initial zone activity state
      this.isZoneActive = isZoneActive;
      if (isZoneActive) {
        this.lastActivityTimestamp = Date.now();
      }

      // Initialize capabilities
      await this.initializeCapabilities();

      // Schedule next transition if needed
      this.evaluateAndScheduleTransition();

      // Start periodic zone change detection (check every 30 seconds)
      this.startZoneChangeDetection();

      this.log('Room state management setup complete');
    } catch (error) {
      this.error(
        `[${RoomStateErrorId.STATE_ENGINE_VALIDATION_FAILED}] Failed to setup room state management:`,
        error
      );
      throw error;
    }
  }

  /**
   * Starts periodic zone change detection.
   *
   * Checks every 30 seconds if the device has been moved to a different zone.
   * If a zone change is detected, reinitializes the device with the new zone.
   */
  private startZoneChangeDetection(): void {
    // Clear any existing interval
    if (this.zoneChangeDetectionInterval) {
      clearInterval(this.zoneChangeDetectionInterval);
    }

    // Check for zone changes every 30 seconds
    this.zoneChangeDetectionInterval = setInterval(async () => {
      try {
        const newZoneId = await this.getDeviceZone();

        if (newZoneId && newZoneId !== this.currentZoneId) {
          this.log(`Zone change detected: ${this.currentZoneId} → ${newZoneId}`);
          this.log('Reinitializing with new zone...');

          // Reinitialize with new zone
          this.teardownRoomStateManagement();
          await this.setupRoomStateManagement();
        }
      } catch (error) {
        this.error('Failed to check for zone changes:', error);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Tears down room state management.
   *
   * Clears zone polling interval and state timers.
   */
  private teardownRoomStateManagement(): void {
    try {
      // Clear zone polling interval
      if (this.zonePollingInterval) {
        clearInterval(this.zonePollingInterval);
        this.zonePollingInterval = undefined;
      }

      // Clear zone change detection interval
      if (this.zoneChangeDetectionInterval) {
        clearInterval(this.zoneChangeDetectionInterval);
        this.zoneChangeDetectionInterval = undefined;
      }

      // Clear state timer
      if (this.stateTimer) {
        clearTimeout(this.stateTimer);
        this.stateTimer = undefined;
      }

      // Clear references
      this.zone = undefined;
      this.stateEngine = undefined;
      this.lastActivityTimestamp = null;
      this.isZoneActive = false;
      this.manualOverride = false;
      this.currentZoneId = undefined;

      this.log('Room state management torn down');
    } catch (error) {
      this.error('Failed to teardown room state management:', error);
    }
  }

  /**
   * Builds the fixed 4-state configuration based on timer settings.
   *
   * Creates a standard state model:
   * - idle → extended_idle (after idleTimeout minutes, or disabled if 0)
   * - occupied → extended_occupied (after occupiedTimeout minutes, or disabled if 0)
   * - extended_idle and extended_occupied are child states for hierarchy support
   *
   * Zone activity triggers transition between idle ↔ occupied
   * Timers trigger transitions to extended states
   *
   * @param idleTimeout - Minutes before idle → extended_idle (0 = disabled)
   * @param occupiedTimeout - Minutes before occupied → extended_occupied (0 = disabled)
   * @returns State configuration array
   */
  private buildStateConfiguration(idleTimeout: number, occupiedTimeout: number): StateConfig[] {
    const states: StateConfig[] = [
      {
        id: 'idle',
        name: 'Idle',
        activeTransitions: [
          { targetState: 'occupied', afterMinutes: 0 }, // Immediate transition on activity
        ],
        inactiveTransitions:
          idleTimeout > 0
            ? [{ targetState: 'extended_idle', afterMinutes: idleTimeout }]
            : [],
      },
      {
        id: 'extended_idle',
        name: 'Extended Idle',
        parent: 'idle', // Child of idle for hierarchy
        activeTransitions: [
          { targetState: 'occupied', afterMinutes: 0 }, // Immediate transition on activity
        ],
        inactiveTransitions: [],
      },
      {
        id: 'occupied',
        name: 'Occupied',
        activeTransitions:
          occupiedTimeout > 0
            ? [{ targetState: 'extended_occupied', afterMinutes: occupiedTimeout }]
            : [],
        inactiveTransitions: [
          { targetState: 'idle', afterMinutes: 0 }, // Immediate transition on inactivity
        ],
      },
      {
        id: 'extended_occupied',
        name: 'Extended Occupied',
        parent: 'occupied', // Child of occupied for hierarchy
        activeTransitions: [],
        inactiveTransitions: [
          { targetState: 'idle', afterMinutes: 0 }, // Immediate transition on inactivity
        ],
      },
    ];

    return states;
  }

  /**
   * Sets up zone activity monitoring using polling.
   *
   * Retrieves the zone from HomeyAPI and starts polling zone.active every 5 seconds.
   * Zone update events do not fire when zone.active changes, so polling is required.
   *
   * @param zoneId - Homey zone ID to monitor
   */
  private async setupZoneMonitoring(zoneId: string): Promise<void> {
    try {
      const app = this.homey.app as WIABApp;
      const homeyApi = app.homeyApi;

      if (!homeyApi) {
        throw new Error('HomeyAPI not available');
      }

      // Get zone from HomeyAPI
      const zone = await homeyApi.zones.getZone({ id: zoneId });

      if (!zone) {
        this.error(`[${RoomStateErrorId.ZONE_NOT_FOUND}] Zone not found: ${zoneId}`);
        throw new Error(`Zone not found: ${zoneId}`);
      }

      // Cast to ExtendedHomeyAPIZone to access active property
      this.zone = zone as ExtendedHomeyAPIZone;

      this.log(`Monitoring zone: ${this.zone.name} (${zoneId})`);
      this.log(`Current zone active status: ${this.zone.active}`);

      // Track last known active state
      let lastActive = this.zone.active ?? false;

      // Start polling zone.active every 5 seconds
      this.zonePollingInterval = setInterval(() => {
        if (!this.zone) {
          this.error('Zone polling failed: zone is undefined');
          return;
        }

        const currentActive = this.zone.active ?? false;

        // Only handle changes
        if (currentActive !== lastActive) {
          this.log(`Zone activity changed: ${currentActive ? 'ACTIVE' : 'INACTIVE'}`);
          lastActive = currentActive;
          this.handleZoneActivityChange(currentActive);
        }
      }, 5000); // Poll every 5 seconds

      this.log(`Zone monitoring setup complete - polling zone.active every 5 seconds`);
    } catch (error) {
      this.error(
        `[${RoomStateErrorId.ZONE_MONITOR_SETUP_FAILED}] Failed to setup zone monitoring:`,
        error
      );
      throw error;
    }
  }

  /**
   * Handles zone activity changes.
   *
   * When zone activity changes:
   * 1. Update activity state and timestamp
   * 2. Clear existing timers
   * 3. Evaluate state transitions
   * 4. Schedule next transition if needed
   *
   * @param active - Whether the zone is currently active
   */
  private handleZoneActivityChange(active: boolean): void {
    try {
      if (this.manualOverride) {
        this.log('Manual override active, ignoring zone activity change');
        return;
      }

      this.log(`Zone activity changed: ${active ? 'ACTIVE' : 'INACTIVE'}`);

      // Update activity state
      this.isZoneActive = active;

      if (active) {
        // Zone became active - record timestamp
        this.lastActivityTimestamp = Date.now();
      }

      // Clear existing timer
      if (this.stateTimer) {
        clearTimeout(this.stateTimer);
        this.stateTimer = undefined;
      }

      // Check for immediate transitions and schedule next timer
      this.evaluateAndScheduleTransition();
    } catch (error) {
      this.error(
        `[${RoomStateErrorId.ZONE_ACTIVITY_HANDLER_FAILED}] Failed to handle zone activity change:`,
        error
      );
    }
  }

  /**
   * Evaluates current state and schedules next transition.
   *
   * Steps:
   * 1. Check if immediate transition is needed
   * 2. If so, execute transition
   * 3. Get next timed transition for current state
   * 4. Schedule timer for next transition
   */
  private evaluateAndScheduleTransition(): void {
    try {
      if (!this.stateEngine) {
        return;
      }

      const currentState = this.stateEngine.getCurrentState();
      const minutesSinceActivity = this.getMinutesSinceActivity();

      // Evaluate if transition should happen now
      const evaluation = this.stateEngine.evaluateStateTransition(
        currentState,
        this.isZoneActive,
        minutesSinceActivity
      );

      // If immediate transition needed, execute it
      if (evaluation.nextState && evaluation.timerMinutes === 0) {
        this.executeStateTransition(evaluation.nextState, evaluation.reason);
        return; // Re-evaluation will be called from executeStateTransition
      }

      // Get next timed transition
      const nextTransition = this.stateEngine.getNextTimedTransition(
        currentState,
        this.isZoneActive
      );

      if (nextTransition) {
        this.scheduleStateTransition(nextTransition.targetState, nextTransition.afterMinutes);
      }
    } catch (error) {
      this.error(
        `[${RoomStateErrorId.STATE_TRANSITION_FAILED}] Failed to evaluate and schedule transition:`,
        error
      );
    }
  }

  /**
   * Schedules a state transition after specified duration.
   *
   * @param targetState - State ID to transition to
   * @param afterMinutes - Minutes to wait before transition
   */
  private scheduleStateTransition(targetState: string, afterMinutes: number): void {
    try {
      // Clear existing timer
      if (this.stateTimer) {
        clearTimeout(this.stateTimer);
      }

      const delayMs = afterMinutes * 60 * 1000;
      this.log(`Scheduling transition to "${targetState}" in ${afterMinutes} minutes`);

      this.stateTimer = setTimeout(() => {
        this.log(`Timer fired: transitioning to "${targetState}"`);
        this.executeStateTransition(
          targetState,
          `Timer expired after ${afterMinutes} minutes`
        );
      }, delayMs);
    } catch (error) {
      this.error(
        `[${RoomStateErrorId.TIMER_MANAGEMENT_FAILED}] Failed to schedule state transition:`,
        error
      );
    }
  }

  /**
   * Executes a state transition.
   *
   * Steps:
   * 1. Update state engine
   * 2. Update device capabilities
   * 3. Trigger flow cards
   * 4. Re-evaluate for next transition
   *
   * @param newState - State ID to transition to
   * @param reason - Reason for transition (for logging)
   */
  private async executeStateTransition(newState: string, reason: string): Promise<void> {
    try {
      if (!this.stateEngine) {
        return;
      }

      const oldState = this.stateEngine.getCurrentState();

      if (oldState === newState) {
        this.log(`Already in state "${newState}", skipping transition`);
        return;
      }

      this.log(`State transition: "${oldState}" → "${newState}" (${reason})`);

      // Update state engine
      this.stateEngine.setCurrentState(newState);

      // Update capabilities
      await this.updateCapabilities(newState);

      // Trigger flow card: state changed
      await this.triggerStateChangedFlow(oldState, newState);

      // Re-evaluate for next transition
      this.evaluateAndScheduleTransition();
    } catch (error) {
      this.error(
        `[${RoomStateErrorId.STATE_TRANSITION_FAILED}] Failed to execute state transition:`,
        error
      );
    }
  }

  /**
   * Handles manual state change from flow cards.
   *
   * Activates manual override mode and sets state immediately.
   * Public method called from flow cards.
   *
   * @param stateId - State ID to transition to
   */
  public async handleManualStateChange(stateId: string): Promise<void> {
    try {
      if (!this.stateEngine) {
        return;
      }

      // Validate state exists
      const allStates = this.stateEngine.getAllStateIds();
      if (!allStates.includes(stateId)) {
        this.error(`Invalid state ID: ${stateId}`);
        return;
      }

      this.log(`Manual state change to: ${stateId}`);

      // Activate manual override
      this.manualOverride = true;

      // Clear any scheduled timers
      if (this.stateTimer) {
        clearTimeout(this.stateTimer);
        this.stateTimer = undefined;
      }

      // Execute state transition
      await this.executeStateTransition(stateId, 'Manual override');
    } catch (error) {
      this.error(
        `[${RoomStateErrorId.STATE_TRANSITION_FAILED}] Failed to handle manual state change:`,
        error
      );
    }
  }

  /**
   * Returns the device to automatic mode.
   *
   * Deactivates manual override and resumes zone-based state management.
   * Public method called from flow cards.
   */
  public async returnToAutomatic(): Promise<void> {
    try {
      this.log('Returning to automatic mode');

      this.manualOverride = false;

      // Re-evaluate state based on current zone activity
      this.evaluateAndScheduleTransition();
    } catch (error) {
      this.error('Failed to return to automatic mode:', error);
    }
  }

  /**
   * Checks if device is in specified state (with hierarchy support).
   *
   * Returns true if current state matches target state OR is a child of target state.
   * Public method called from flow condition cards.
   *
   * @param targetState - State ID to check against
   * @returns True if current state matches target (with inheritance)
   */
  public isInState(targetState: string): boolean {
    if (!this.stateEngine) {
      return false;
    }

    const currentState = this.stateEngine.getCurrentState();
    return this.stateEngine.isState(currentState, targetState);
  }

  /**
   * Checks if device is exactly in specified state (no hierarchy).
   *
   * Returns true only if current state ID exactly matches target state ID.
   * Public method called from flow condition cards.
   *
   * @param targetState - State ID to check against
   * @returns True if current state exactly matches target
   */
  public isExactlyInState(targetState: string): boolean {
    if (!this.stateEngine) {
      return false;
    }

    const currentState = this.stateEngine.getCurrentState();
    return this.stateEngine.isExactlyState(currentState, targetState);
  }

  /**
   * Checks if manual override is currently active.
   *
   * Public method called from flow condition cards.
   *
   * @returns True if manual override is active
   */
  public isManualOverride(): boolean {
    return this.manualOverride;
  }

  /**
   * Initializes device capabilities.
   *
   * Sets the initial room_state capability value to display current state.
   * Uses retry logic with automatic repair for capability migration.
   */
  private async initializeCapabilities(): Promise<void> {
    if (!this.stateEngine) {
      this.error('Cannot initialize capabilities: state engine not initialized');
      return;
    }

    const currentState = this.stateEngine.getCurrentState();
    this.log(`Initializing capabilities with state: ${currentState}`);

    // Initialize room_state capability with retry
    await this.ensureCapabilityWithRetry('room_state', currentState);

    // Initialize alarm_room_occupied capability with retry
    const occupied = this.computeOccupancyIndicator(currentState);
    await this.ensureCapabilityWithRetry('alarm_room_occupied', occupied);

    this.log(`Capabilities initialized successfully: state=${currentState}, occupied=${occupied}`);
  }

  /**
   * Ensures a capability exists and is set, with automatic retry on failure.
   *
   * Attempts to add the capability if missing, then sets its value.
   * Retries up to 3 times with exponential backoff on failure.
   * Falls back to graceful degradation if all retries fail.
   *
   * @param capability - Capability ID to ensure
   * @param value - Initial value to set
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @private
   */
  private async ensureCapabilityWithRetry(
    capability: string,
    value: unknown,
    maxRetries: number = 3
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check if capability exists
        if (!this.hasCapability(capability)) {
          this.log(`Adding missing capability: ${capability} (attempt ${attempt}/${maxRetries})`);
          await this.addCapability(capability);

          // Verify capability was added successfully
          if (!this.hasCapability(capability)) {
            throw new Error(`Capability ${capability} not added successfully`);
          }

          this.log(`Capability ${capability} added successfully`);
        }

        // Set capability value
        await this.setCapabilityValue(capability, value);
        this.log(`Capability ${capability} set to: ${value}`);
        return; // Success - exit retry loop

      } catch (error) {
        this.error(
          `Failed to ensure capability ${capability} (attempt ${attempt}/${maxRetries}):`,
          error
        );

        if (attempt < maxRetries) {
          // Exponential backoff: 100ms, 200ms, 400ms
          const delayMs = 100 * Math.pow(2, attempt - 1);
          this.log(`Retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          // All retries exhausted - log warning and continue
          this.error(
            `Failed to initialize capability ${capability} after ${maxRetries} attempts. ` +
            `Device will continue with degraded functionality.`
          );
        }
      }
    }
  }

  /**
   * Updates device capabilities after state change.
   *
   * Updates the room_state capability to display the new state.
   * Uses defensive checks and automatic repair for missing capabilities.
   *
   * @param newState - New state ID
   */
  private async updateCapabilities(newState: string): Promise<void> {
    try {
      // Update room_state capability with retry if missing
      if (!this.hasCapability('room_state')) {
        this.log('room_state capability missing during update, attempting repair');
        await this.ensureCapabilityWithRetry('room_state', newState);
      } else {
        await this.setCapabilityValue('room_state', newState);
      }

      // Update occupancy indicator alarm with retry if missing
      const occupied = this.computeOccupancyIndicator(newState);
      if (!this.hasCapability('alarm_room_occupied')) {
        this.log('alarm_room_occupied capability missing during update, attempting repair');
        await this.ensureCapabilityWithRetry('alarm_room_occupied', occupied);
      } else {
        await this.setCapabilityValue('alarm_room_occupied', occupied);
      }

      this.log(`Capabilities updated: state=${newState}, occupied=${occupied}`);
    } catch (error) {
      this.error('Failed to update capabilities:', error);
      // Don't rethrow - device should continue functioning even if capability updates fail
    }
  }

  /**
   * Computes occupancy indicator state from current room state.
   *
   * The alarm capability pulses when true, providing visual feedback
   * that the room is currently in an occupied state.
   *
   * @param stateId - Current room state ID
   * @returns True if state is occupied or extended_occupied
   * @private
   */
  private computeOccupancyIndicator(stateId: string): boolean {
    return stateId === 'occupied' || stateId === 'extended_occupied';
  }

  /**
   * Triggers state changed flow card.
   *
   * @param oldState - Previous state ID
   * @param newState - New state ID
   */
  private async triggerStateChangedFlow(oldState: string, newState: string): Promise<void> {
    try {
      const driver = this.driver;
      const stateChangedTrigger = driver.homey.flow.getDeviceTriggerCard(
        'room_state_changed'
      );

      if (stateChangedTrigger) {
        await stateChangedTrigger.trigger(
          this,
          {
            state: newState,
            previous_state: oldState,
          },
          {}
        );

        this.log(`Flow triggered: state changed to "${newState}"`);
      }
    } catch (error) {
      this.error('Failed to trigger state changed flow:', error);
    }
  }

  /**
   * Gets minutes since last zone activity.
   *
   * @returns Minutes since last activity, or 0 if no activity recorded
   */
  private getMinutesSinceActivity(): number {
    if (!this.lastActivityTimestamp) {
      return 0;
    }

    const now = Date.now();
    const milliseconds = now - this.lastActivityTimestamp;
    return milliseconds / 1000 / 60;
  }
}

module.exports = RoomStateDevice;
