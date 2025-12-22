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
 * Extended HomeyAPIZone with event emitter methods
 */
interface ExtendedHomeyAPIZone extends HomeyAPIZone {
  active?: boolean;
  on(event: 'update', listener: (update: { active: boolean }) => void): void;
  removeListener(event: 'update', listener: (update: { active: boolean }) => void): void;
}

/**
 * Room State Manager Device
 *
 * Manages room states based on zone activity with configurable state hierarchies
 * and timer-based transitions. Monitors a Homey zone for activity and transitions
 * between user-defined states based on active/inactive timers.
 *
 * Features:
 * - Event-driven zone activity monitoring
 * - 2-level state hierarchy (parent + child)
 * - Timer-based state transitions for both active and inactive states
 * - Manual state override with indefinite duration
 * - Flow card integration for triggers, conditions, and actions
 *
 * Lifecycle:
 * 1. onInit() - Load settings, setup zone monitoring, initialize state
 * 2. onSettings() - Reconfigure when settings change
 * 3. onDeleted() - Cleanup timers and event listeners
 */
class RoomStateDevice extends Homey.Device {
  private stateEngine?: RoomStateEngine;
  private zone?: ExtendedHomeyAPIZone;
  private zoneActivityListener?: (update: { active: boolean }) => void;
  private stateTimer?: NodeJS.Timeout;
  private lastActivityTimestamp: number | null = null;
  private isZoneActive: boolean = false;
  private manualOverride: boolean = false;

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
   * When zone, states, or initial state settings change, teardown
   * existing monitoring and reinitialize with new configuration.
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
      // If critical settings changed, reinitialize
      const criticalKeys = ['zoneId', 'states', 'initialState'];
      const needsReinit = event.changedKeys.some((key) => criticalKeys.includes(key));

      if (needsReinit) {
        this.log('Critical settings changed, reinitializing...');
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
   * Allows users to manually change the current state via device controls.
   */
  private registerCapabilityListeners(): void {
    // Listener for manual state changes (if capability is added)
    this.registerCapabilityListener('measure_state', async (value: number) => {
      await this.handleManualStateChange(value);
    });
  }

  /**
   * Sets up room state management.
   *
   * Steps:
   * 1. Load and parse settings
   * 2. Validate state configuration
   * 3. Create RoomStateEngine
   * 4. Setup zone monitoring
   * 5. Initialize state and capabilities
   */
  private async setupRoomStateManagement(): Promise<void> {
    try {
      // Load settings
      const settings = this.getSettings() as RoomStateSettings;
      const zoneId = settings.zoneId;
      const statesJson = settings.states;
      const initialState = settings.initialState;

      if (!zoneId) {
        throw new Error('No zone configured');
      }

      // Parse state configuration
      const stateConfigs = this.parseStateConfiguration(statesJson);

      if (stateConfigs.length === 0) {
        throw new Error('No states configured');
      }

      // Validate initial state exists
      if (!stateConfigs.find((s) => s.id === initialState)) {
        throw new Error(`Initial state "${initialState}" not found in configuration`);
      }

      // Create state engine
      this.stateEngine = new RoomStateEngine(stateConfigs, initialState);
      this.log(`State engine created with ${stateConfigs.length} states`);

      // Setup zone monitoring
      await this.setupZoneMonitoring(zoneId);

      // Initialize capabilities
      await this.initializeCapabilities();

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
   * Tears down room state management.
   *
   * Removes zone event listener and clears timers.
   */
  private teardownRoomStateManagement(): void {
    try {
      // Remove zone event listener
      if (this.zone && this.zoneActivityListener) {
        this.zone.on('update', this.zoneActivityListener);
        this.zoneActivityListener = undefined;
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

      this.log('Room state management torn down');
    } catch (error) {
      this.error('Failed to teardown room state management:', error);
    }
  }

  /**
   * Parses and validates state configuration from JSON.
   *
   * @param statesJson - JSON string containing StateConfig array
   * @returns Parsed state configuration array
   */
  private parseStateConfiguration(statesJson: string): StateConfig[] {
    try {
      if (!statesJson || statesJson.trim() === '') {
        this.error('States JSON is empty');
        return [];
      }

      const parsed = JSON.parse(statesJson);

      if (!Array.isArray(parsed)) {
        this.error('States configuration is not an array');
        return [];
      }

      return parsed as StateConfig[];
    } catch (error) {
      this.error('Failed to parse states configuration:', error);
      return [];
    }
  }

  /**
   * Sets up zone activity monitoring using HomeyAPI events.
   *
   * Retrieves the zone from HomeyAPI and registers an event listener
   * for zone activity changes. Uses event-driven approach (not polling).
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

      // Cast to ExtendedHomeyAPIZone to access event emitter methods
      this.zone = zone as ExtendedHomeyAPIZone;

      this.log(`Monitoring zone: ${this.zone.name} (${zoneId})`);

      // Register zone activity listener
      this.zoneActivityListener = (update: { active: boolean }) => {
        this.handleZoneActivityChange(update.active);
      };

      this.zone.on('update', this.zoneActivityListener);

      // Initialize with current zone activity (if available)
      // Note: Zone active property should be checked here if available
      // For now, assume zone starts inactive
      this.isZoneActive = false;
      this.lastActivityTimestamp = null;

      this.log('Zone monitoring setup complete');
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
   * Handles manual state change from device controls or flow cards.
   *
   * Activates manual override mode and sets state immediately.
   * Public method called from flow cards.
   *
   * @param stateIdOrIndex - State ID (string) or numeric index (number)
   */
  public async handleManualStateChange(stateIdOrIndex: string | number): Promise<void> {
    try {
      if (!this.stateEngine) {
        return;
      }

      let newState: string;

      // Handle both string state ID and numeric index
      if (typeof stateIdOrIndex === 'string') {
        // State ID provided directly (from flow cards)
        newState = stateIdOrIndex;

        // Validate state exists
        const allStates = this.stateEngine.getAllStateIds();
        if (!allStates.includes(newState)) {
          this.error(`Invalid state ID: ${newState}`);
          return;
        }
      } else {
        // Numeric index provided (from capability)
        const stateIndex = stateIdOrIndex;
        const allStates = this.stateEngine.getAllStateIds();

        if (stateIndex < 0 || stateIndex >= allStates.length) {
          this.error(`Invalid state index: ${stateIndex}`);
          return;
        }

        newState = allStates[stateIndex];
      }

      this.log(`Manual state change to: ${newState}`);

      // Activate manual override
      this.manualOverride = true;

      // Clear any scheduled timers
      if (this.stateTimer) {
        clearTimeout(this.stateTimer);
        this.stateTimer = undefined;
      }

      // Execute state transition
      await this.executeStateTransition(newState, 'Manual override');
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
   * Sets up initial capability values based on current state.
   */
  private async initializeCapabilities(): Promise<void> {
    try {
      if (!this.stateEngine) {
        return;
      }

      const currentState = this.stateEngine.getCurrentState();

      // Initialize measure_state capability (if exists)
      if (this.hasCapability('measure_state')) {
        const stateIndex = this.getStateIndex(currentState);
        await this.setCapabilityValue('measure_state', stateIndex);
      }

      // Initialize alarm_state_changed (flow trigger flag)
      if (this.hasCapability('alarm_state_changed')) {
        await this.setCapabilityValue('alarm_state_changed', false);
      }

      this.log(`Capabilities initialized for state: ${currentState}`);
    } catch (error) {
      this.error(
        `[${RoomStateErrorId.CAPABILITY_UPDATE_FAILED}] Failed to initialize capabilities:`,
        error
      );
    }
  }

  /**
   * Updates device capabilities after state change.
   *
   * @param newState - New state ID
   */
  private async updateCapabilities(newState: string): Promise<void> {
    try {
      // Update measure_state (numeric state index)
      if (this.hasCapability('measure_state')) {
        const stateIndex = this.getStateIndex(newState);
        await this.setCapabilityValue('measure_state', stateIndex);
      }

      // Trigger alarm_state_changed for flow cards
      if (this.hasCapability('alarm_state_changed')) {
        await this.setCapabilityValue('alarm_state_changed', true);
        // Reset after brief delay
        setTimeout(async () => {
          await this.setCapabilityValue('alarm_state_changed', false);
        }, 1000);
      }

      this.log(`Capabilities updated for state: ${newState}`);
    } catch (error) {
      this.error(
        `[${RoomStateErrorId.CAPABILITY_UPDATE_FAILED}] Failed to update capabilities:`,
        error
      );
    }
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
   * Gets the numeric index of a state ID.
   *
   * Used for mapping state IDs to capability values.
   *
   * @param stateId - State ID
   * @returns Numeric index of state
   */
  private getStateIndex(stateId: string): number {
    if (!this.stateEngine) {
      return 0;
    }

    const allStates = this.stateEngine.getAllStateIds();
    const index = allStates.indexOf(stateId);

    return index >= 0 ? index : 0;
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
