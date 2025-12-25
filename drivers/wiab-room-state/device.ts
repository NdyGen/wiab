import Homey from 'homey';
import { RoomStateEngine } from '../../lib/RoomStateEngine';
import type { StateConfig, RoomStateSettings, HomeyAPI } from '../../lib/types';
import { validateRoomStateSettings } from '../../lib/RoomStateSettingsValidator';
import { RoomStateErrorId } from '../../constants/errorIds';
import { WarningManager } from '../../lib/WarningManager';
import { ErrorReporter } from '../../lib/ErrorReporter';
import { RetryManager } from '../../lib/RetryManager';
import { ErrorSeverity } from '../../lib/ErrorTypes';

/**
 * Interface for WIABApp with HomeyAPI
 */
interface WIABApp extends Homey.App {
  homeyApi?: HomeyAPI;
}

/**
 * Room State Manager Device
 *
 * Manages room states based on WIAB device occupancy with configurable state hierarchies
 * and timer-based transitions. Monitors a WIAB device for occupancy changes and transitions
 * between user-defined states based on active/inactive timers.
 *
 * Features:
 * - Event-driven WIAB device occupancy monitoring
 * - 2-level state hierarchy (parent + child)
 * - Timer-based state transitions for both active and inactive states
 * - Manual state override with indefinite duration
 * - Flow card integration for triggers, conditions, and actions
 *
 * Lifecycle:
 * 1. onInit() - Load settings, setup WIAB device monitoring, initialize state
 * 2. onSettings() - Reconfigure when settings change
 * 3. onDeleted() - Cleanup timers and capability listeners
 */
class RoomStateDevice extends Homey.Device {
  private stateEngine?: RoomStateEngine;
  private wiabDevice?: { id: string; name: string };
  private wiabCapabilityListener?: (() => void) | null;
  private stateTimer?: NodeJS.Timeout;
  private lastActivityTimestamp: number | null = null;
  private isWiabOccupied: boolean = false;
  private manualOverride: boolean = false;

  // Error handling utilities
  private warningManager?: WarningManager;
  private errorReporter?: ErrorReporter;
  private retryManager?: RetryManager;

  // Debug logging control
  private static readonly ENABLE_DEBUG_LOGGING = false;

  /**
   * Initializes the Room State device.
   *
   * Steps:
   * 1. Initialize error handling utilities
   * 2. Register capability listeners for manual state control
   * 3. Setup WIAB device monitoring and state engine
   *    - Loads and validates settings
   *    - Creates RoomStateEngine with state configuration
   *    - Monitors WIAB device occupancy changes
   *    - Initializes capabilities with initial state
   * 4. Clear any initialization warnings on success
   */
  async onInit(): Promise<void> {
    this.log('Room State device initializing');

    // Initialize error handling utilities FIRST
    this.warningManager = new WarningManager(this, this);
    this.errorReporter = new ErrorReporter(this);
    this.retryManager = new RetryManager(this);

    try {
      // Register capability listeners for manual state changes
      this.registerCapabilityListeners();

      // Setup WIAB device monitoring and state engine
      await this.setupRoomStateManagement();

      this.log('Room State device initialized successfully');
    } catch (error) {
      // Primary error - CRITICAL
      const err = error instanceof Error ? error : new Error(String(error));

      this.errorReporter.reportError({
        errorId: RoomStateErrorId.DEVICE_INIT_FAILED,
        severity: ErrorSeverity.CRITICAL,
        userMessage: 'Device initialization failed. Check WIAB device assignment.',
        technicalMessage: `Failed to initialize: ${err.message}\n${err.stack || 'No stack trace available'}`,
        context: { deviceId: this.getData().id },
      });

      try {
        await this.warningManager.setWarning(
          RoomStateErrorId.DEVICE_INIT_FAILED,
          'Initialization failed. Check device settings and WIAB device assignment.'
        );
      } catch (warningError) {
        // Secondary error - log at debug level, don't report separately
        // Users only care about primary initialization error
        const wErr = warningError instanceof Error ? warningError : new Error(String(warningError));
        this.log(`Note: Warning indicator update also failed: ${wErr.message}`);
      }

      // Don't throw - allow device to exist in degraded mode with visible warning
      return;
    }

    // Cleanup phase - only attempt warning clear after successful initialization
    try {
      await this.warningManager.clearWarning();
    } catch (warningError) {
      const err = warningError instanceof Error ? warningError : new Error(String(warningError));
      this.errorReporter.reportError({
        errorId: RoomStateErrorId.WARNING_CLEAR_FAILED,
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'Warning indicator update failed',
        technicalMessage: `Failed to clear warning after successful initialization: ${err.message}`,
        context: { deviceId: this.getData().id },
      });
      // Don't throw - warning clear failure shouldn't fail initialization
    }
  }

  /**
   * Handles settings changes.
   *
   * When timers change or WIAB device assignment changes, teardown
   * existing monitoring and reinitialize with new configuration.
   * This ensures the device re-evaluates WIAB device activity and sets
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

    // If WIAB device or timer settings changed, reinitialize
    const criticalKeys = ['wiabDeviceId', 'idleTimeout', 'occupiedTimeout'];
    const needsReinit = event.changedKeys.some((key) => criticalKeys.includes(key));

    if (needsReinit) {
      this.log('Timer settings changed, reinitializing...');
      this.teardownRoomStateManagement();

      try {
        await this.setupRoomStateManagement();
      } catch (error) {
        // Primary error - HIGH
        const err = error instanceof Error ? error : new Error(String(error));

        this.errorReporter?.reportError({
          errorId: RoomStateErrorId.SETTINGS_UPDATE_FAILED,
          severity: ErrorSeverity.HIGH,
          userMessage: 'Failed to apply settings. Check configuration.',
          technicalMessage: `Settings update failed: ${err.message}\n${err.stack || 'No stack trace available'}`,
          context: { deviceId: this.getData().id, changedKeys: event.changedKeys },
        });

        try {
          await this.warningManager?.setWarning(
            RoomStateErrorId.SETTINGS_UPDATE_FAILED,
            'Failed to apply settings. Check configuration and try again.'
          );
        } catch (warningError) {
          // Secondary error - log at debug level, don't report separately
          const wErr = warningError instanceof Error ? warningError : new Error(String(warningError));
          this.log(`Note: Warning indicator update also failed: ${wErr.message}`);
        }

        throw error; // Re-throw to show error in Homey settings UI
      }

      // Cleanup phase - only attempt warning clear after successful update
      try {
        await this.warningManager?.clearWarning();
      } catch (warningError) {
        const err = warningError instanceof Error ? warningError : new Error(String(warningError));
        this.errorReporter?.reportError({
          errorId: RoomStateErrorId.WARNING_CLEAR_FAILED,
          severity: ErrorSeverity.MEDIUM,
          userMessage: 'Warning indicator update failed',
          technicalMessage: `Failed to clear warning after settings update: ${err.message}`,
          context: { deviceId: this.getData().id },
        });
        // Don't throw - warning clear failure shouldn't fail settings update
      }
    }
  }

  /**
   * Cleanup when device is deleted.
   *
   * Removes WIAB device event listeners and clears all timers.
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
   * Gets the WIAB device this Room State Manager monitors.
   *
   * @returns WIAB device information
   * @throws Error if WIAB device not found or not accessible
   */
  private async getWiabDevice(): Promise<{ id: string; name: string; occupancy: boolean }> {
    let wiabDeviceId: string | undefined;

    try {
      // Validate settings first with specific error reporting
      try {
        const settings = validateRoomStateSettings(this.getSettings());
        wiabDeviceId = settings.wiabDeviceId;
      } catch (validationError) {
        const err = validationError instanceof Error ? validationError : new Error(String(validationError));

        // Report validation error specifically
        this.errorReporter?.reportError({
          errorId: RoomStateErrorId.SETTINGS_VALIDATION_FAILED,
          severity: ErrorSeverity.CRITICAL,
          userMessage: 'Device settings are invalid. Please reconfigure the device.',
          technicalMessage: `Settings validation failed: ${err.message}`,
          context: { deviceId: this.getData().id },
        });

        throw err; // Re-throw validation error
      }

      if (!wiabDeviceId) {
        throw new Error('No WIAB device ID configured in settings');
      }

      const app = this.homey.app as WIABApp;
      if (!app.homeyApi) {
        throw new Error('HomeyAPI not available');
      }

      const devices = await app.homeyApi.devices.getDevices();
      const device = devices[wiabDeviceId];

      if (!device) {
        // Count available WIAB devices for better error message
        const allDeviceIds = Object.keys(devices);
        const wiabDeviceCount = allDeviceIds.filter(id => {
          const dev = devices[id] as { driverId?: string };
          return dev.driverId?.endsWith(':wiab-device');
        }).length;

        throw new Error(
          `WIAB device not found: ${wiabDeviceId}. ` +
          `The device may have been deleted. ` +
          `Found ${wiabDeviceCount} other WIAB devices. ` +
          `Please delete this Room State Manager and create a new one.`
        );
      }

      const deviceObj = device as { name?: string; capabilitiesObj?: Record<string, { value: unknown }> };
      const name = deviceObj.name || 'Unknown WIAB Device';

      // Get current occupancy state
      const occupancy = deviceObj.capabilitiesObj?.['alarm_occupancy']?.value === true;

      this.log(`Found WIAB device: ${name} (${wiabDeviceId}), current occupancy: ${occupancy}`);

      return { id: wiabDeviceId, name, occupancy };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Only report lookup errors; validation errors are already reported by validation handler
      // Check error name instead of instanceof to avoid runtime issues
      const isValidationError = err.name === 'SettingsValidationError';
      if (!isValidationError) {
        // Determine wiabDeviceId safely (may be undefined if validation failed)
        const deviceIdForContext = wiabDeviceId || (() => {
          try {
            return (this.getSettings() as Partial<RoomStateSettings>).wiabDeviceId || 'unknown';
          } catch {
            return 'unknown';
          }
        })();

        this.errorReporter?.reportError({
          errorId: RoomStateErrorId.WIAB_DEVICE_LOOKUP_FAILED,
          severity: ErrorSeverity.CRITICAL,
          userMessage: 'Failed to find WIAB device. Check device configuration.',
          technicalMessage: `WIAB device lookup failed: ${err.message}\n${err.stack || 'No stack trace available'}`,
          context: { deviceId: this.getData().id, wiabDeviceId: deviceIdForContext },
        });
      }

      throw error;
    }
  }

  /**
   * Sets up room state management.
   *
   * Steps:
   * 1. Load and parse settings
   * 2. Validate state configuration
   * 3. Get WIAB device and check current occupancy
   * 4. Create RoomStateEngine with correct initial state
   * 5. Setup WIAB device monitoring
   * 6. Initialize capabilities
   */
  private async setupRoomStateManagement(): Promise<void> {
    try {
      // Load and validate settings
      const settings = validateRoomStateSettings(this.getSettings());
      const idleTimeout = settings.idleTimeout;
      const occupiedTimeout = settings.occupiedTimeout;

      // Get WIAB device and check current occupancy
      const wiabDevice = await this.getWiabDevice();

      this.log(`Monitoring WIAB device: ${wiabDevice.name} (${wiabDevice.id})`);

      // Build fixed 4-state configuration based on timer settings
      const stateConfigs = this.buildStateConfiguration(idleTimeout, occupiedTimeout);

      // Determine initial state based on current WIAB occupancy
      const initialState = wiabDevice.occupancy ? 'occupied' : 'idle';
      this.log(`WIAB device is currently ${wiabDevice.occupancy ? 'OCCUPIED' : 'UNOCCUPIED'}, starting in state: ${initialState}`);

      // Create state engine with correct initial state
      this.stateEngine = new RoomStateEngine(stateConfigs, initialState);
      this.log(`State engine created with timers: idle=${idleTimeout}min, occupied=${occupiedTimeout}min`);

      // Set initial activity state
      this.isWiabOccupied = wiabDevice.occupancy;
      if (wiabDevice.occupancy) {
        this.lastActivityTimestamp = Date.now();
      }

      // Setup WIAB device monitoring
      await this.setupWiabMonitoring(wiabDevice.id);

      // Initialize capabilities
      await this.initializeCapabilities();

      // Schedule next transition if needed
      this.evaluateAndScheduleTransition();

      this.log('Room state management setup complete');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      this.errorReporter?.reportError({
        errorId: RoomStateErrorId.STATE_ENGINE_VALIDATION_FAILED,
        severity: ErrorSeverity.CRITICAL,
        userMessage: 'Failed to setup room state management',
        technicalMessage: `Setup failed: ${err.message}\n${err.stack || 'No stack trace available'}`,
        context: { deviceId: this.getData().id },
      });

      throw error;
    }
  }


  /**
   * Tears down room state management.
   *
   * Clears WIAB monitoring, state timers, and resets all state variables.
   *
   * Note on capability listener cleanup:
   * The WIAB device capability listener is created via makeCapabilityInstance(),
   * which returns void and maintains the listener internally. We cannot explicitly
   * unregister the listener once registered. Clearing the setup function reference
   * prevents re-registration but does not stop the active listener. The HomeyAPI
   * manages the active listener lifecycle and will clean up when the device or
   * capability is removed from the system.
   */
  private teardownRoomStateManagement(): void {
    try {
      // Clear setup function reference (prevents re-registration only)
      // The actual listener is managed internally by HomeyAPI
      this.wiabCapabilityListener = null;
      this.wiabDevice = undefined;

      // Clear state timer
      if (this.stateTimer) {
        clearTimeout(this.stateTimer);
        this.stateTimer = undefined;
      }

      // Reset state variables to prevent stale state
      this.stateEngine = undefined;
      this.isWiabOccupied = false;
      this.lastActivityTimestamp = null;
      this.manualOverride = false;

      this.log('Room state management torn down');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Teardown failure is HIGH severity - resources may not be released
      this.errorReporter?.reportError({
        errorId: RoomStateErrorId.TEARDOWN_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'Resource cleanup may be incomplete',
        technicalMessage: `Teardown failed: ${err.message}\n${err.stack || 'No stack trace'}`,
        context: { deviceId: this.getData().id },
      });

      this.error('Error tearing down room state management:', error);
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
   * WIAB device activity triggers transition between idle ↔ occupied
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
   * Sets up WIAB device monitoring via capability listener.
   *
   * Validates device availability, stores device info, and registers a capability
   * listener for alarm_occupancy changes. The listener is immediately activated
   * and will remain active until the device is deleted.
   *
   * @param wiabDeviceId - ID of the WIAB device to monitor
   * @throws Error if device not found, not a WIAB device, or makeCapabilityInstance unavailable
   */
  private async setupWiabMonitoring(wiabDeviceId: string): Promise<void> {
    const app = this.homey.app as WIABApp;
    if (!app.homeyApi) {
      throw new Error('HomeyAPI not available');
    }

    // Get WIAB device with specific error reporting
    let device;
    try {
      const devices = await app.homeyApi.devices.getDevices();
      device = devices[wiabDeviceId];

      if (!device) {
        const err = new Error(`WIAB device not found: ${wiabDeviceId}`);
        this.errorReporter?.reportError({
          errorId: RoomStateErrorId.WIAB_DEVICE_NOT_FOUND,
          severity: ErrorSeverity.CRITICAL,
          userMessage: 'WIAB device not found. It may have been deleted.',
          technicalMessage: `WIAB device lookup failed: ${wiabDeviceId}`,
          context: { deviceId: this.getData().id, wiabDeviceId },
        });
        throw err;
      }
    } catch (error) {
      // Re-throw if already reported, otherwise report as lookup failure
      if (error instanceof Error && error.message.includes('WIAB device not found')) {
        throw error;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      this.errorReporter?.reportError({
        errorId: RoomStateErrorId.WIAB_DEVICE_LOOKUP_FAILED,
        severity: ErrorSeverity.CRITICAL,
        userMessage: 'Failed to access WIAB device',
        technicalMessage: `WIAB device lookup failed: ${err.message}\n${err.stack || 'No stack trace available'}`,
        context: { deviceId: this.getData().id, wiabDeviceId },
      });
      throw error;
    }

    const deviceObj = device as { name?: string; makeCapabilityInstance?: (capabilityId: string, callback: (value: boolean) => void) => void };

    this.log(`Setting up monitoring for WIAB device: ${deviceObj.name || wiabDeviceId}`);

    // Store device info
    this.wiabDevice = {
      id: wiabDeviceId,
      name: deviceObj.name || 'Unknown WIAB Device',
    };

    // Set up capability listener for alarm_occupancy changes
    if (!deviceObj.makeCapabilityInstance) {
      // makeCapabilityInstance unavailable - this is a critical error
      throw new Error('makeCapabilityInstance not available on WIAB device - cannot monitor occupancy changes');
    }

    this.wiabCapabilityListener = () => {
      deviceObj.makeCapabilityInstance?.('alarm_occupancy', (value: boolean) => {
        this.log(`WIAB occupancy changed: ${value ? 'OCCUPIED' : 'UNOCCUPIED'}`);
        this.handleOccupancyChange(value);
      });
    };

    this.wiabCapabilityListener();

    this.log(`WIAB device monitoring setup complete`);
  }

  /**
   * Handles WIAB device occupancy changes.
   *
   * @param occupied - Whether WIAB device shows occupied (true) or unoccupied (false)
   */
  private handleOccupancyChange(occupied: boolean): void {
    // Ignore if manual override is active
    if (this.manualOverride) {
      this.log('Manual override active - ignoring WIAB occupancy change');
      return;
    }

    // Update activity state
    this.isWiabOccupied = occupied;

    if (occupied) {
      this.lastActivityTimestamp = Date.now();
    }

    // Clear any existing timer before evaluating new transition
    if (this.stateTimer) {
      clearTimeout(this.stateTimer);
      this.stateTimer = undefined;
    }

    // Evaluate state transition
    this.evaluateAndScheduleTransition();
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
        this.isWiabOccupied,
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
        this.isWiabOccupied
      );

      if (nextTransition) {
        this.scheduleStateTransition(nextTransition.targetState, nextTransition.afterMinutes);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      this.errorReporter?.reportError({
        errorId: RoomStateErrorId.STATE_TRANSITION_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'State transition evaluation failed',
        technicalMessage: `Failed to evaluate and schedule transition: ${err.message}\n${err.stack || 'No stack trace'}`,
        context: {
          deviceId: this.getData().id,
          currentState: this.stateEngine?.getCurrentState(),
          isZoneActive: this.isWiabOccupied,
        },
      });

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
      const err = error instanceof Error ? error : new Error(String(error));

      this.errorReporter?.reportError({
        errorId: RoomStateErrorId.STATE_TRANSITION_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'Failed to schedule state transition',
        technicalMessage: `Failed to schedule transition to "${targetState}" in ${afterMinutes} minutes: ${err.message}\n${err.stack || 'No stack trace'}`,
        context: {
          deviceId: this.getData().id,
          targetState,
          afterMinutes,
        },
      });

      this.error(
        `[${RoomStateErrorId.STATE_TRANSITION_FAILED}] Failed to schedule state transition:`,
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
      const err = error instanceof Error ? error : new Error(String(error));

      this.errorReporter?.reportError({
        errorId: RoomStateErrorId.STATE_TRANSITION_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'State transition execution failed',
        technicalMessage: `Failed to execute transition from "${this.stateEngine?.getCurrentState()}" to "${newState}": ${err.message}\n${err.stack || 'No stack trace'}`,
        context: {
          deviceId: this.getData().id,
          oldState: this.stateEngine?.getCurrentState(),
          newState,
          reason,
        },
      });

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
      const err = error instanceof Error ? error : new Error(String(error));

      this.errorReporter?.reportError({
        errorId: RoomStateErrorId.STATE_TRANSITION_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'Failed to change state manually',
        technicalMessage: `handleManualStateChange failed for state "${stateId}": ${err.message}\n${err.stack || 'No stack trace'}`,
        context: { deviceId: this.getData().id, targetState: stateId },
      });

      this.error(
        `[${RoomStateErrorId.STATE_TRANSITION_FAILED}] Failed to handle manual state change:`,
        error
      );
      throw error; // Re-throw so flow card fails properly
    }
  }

  /**
   * Returns the device to automatic mode.
   *
   * Deactivates manual override and resumes WIAB device-based state management.
   * Public method called from flow cards.
   */
  public async returnToAutomatic(): Promise<void> {
    try {
      this.log('Returning to automatic mode');

      this.manualOverride = false;

      // Re-evaluate state based on current WIAB device activity
      this.evaluateAndScheduleTransition();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      this.errorReporter?.reportError({
        errorId: RoomStateErrorId.AUTOMATIC_MODE_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'Failed to return to automatic mode',
        technicalMessage: `returnToAutomatic failed: ${err.message}\n${err.stack || 'No stack trace'}`,
        context: { deviceId: this.getData().id },
      });

      this.error('Failed to return to automatic mode:', error);
      throw error; // Re-throw so flow card fails properly
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
   * Uses RetryManager for exponential backoff retry orchestration.
   * Sets device warning if all retries fail.
   *
   * @param capability - Capability ID to ensure
   * @param value - Initial value to set
   * @private
   */
  private async ensureCapabilityWithRetry(
    capability: string,
    value: unknown
  ): Promise<void> {
    if (!this.retryManager) {
      this.error('RetryManager not initialized, skipping capability setup');
      return;
    }

    const result = await this.retryManager.retryWithBackoff<void>(
      async () => {
        // Check if capability exists
        if (!this.hasCapability(capability)) {
          this.log(`Adding missing capability: ${capability}`);
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
      },
      `Ensure capability ${capability}`,
      {
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
      }
    );

    if (!result.success) {
      // All retries exhausted - set warning and continue with degraded functionality
      this.errorReporter?.reportError({
        errorId: RoomStateErrorId.CAPABILITY_UPDATE_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: `Capability ${capability} unavailable`,
        technicalMessage: `Failed to initialize capability after ${result.attempts} attempts: ${result.error instanceof Error ? result.error.message : 'Unknown error'}`,
        context: { deviceId: this.getData().id, capability, attempts: result.attempts },
      });

      try {
        await this.warningManager?.setWarning(
          RoomStateErrorId.CAPABILITY_UPDATE_FAILED,
          `Capability ${capability} unavailable. Device may have reduced functionality.`
        );
      } catch (warningError) {
        this.error('Failed to set warning for capability update failure:', warningError);
      }
    }
  }

  /**
   * Updates device capabilities after state change.
   *
   * Updates the room_state capability to display the new state.
   * Uses defensive checks and automatic repair for missing capabilities.
   * Tracks failures and propagates errors if critical capabilities fail.
   *
   * @param newState - New state ID
   */
  private async updateCapabilities(newState: string): Promise<void> {
    let roomStateSuccess = false;
    let occupiedSuccess = false;

    // Update room_state capability with retry if missing
    try {
      if (!this.hasCapability('room_state')) {
        this.log('room_state capability missing during update, attempting repair');
        await this.ensureCapabilityWithRetry('room_state', newState);
      } else {
        await this.setCapabilityValue('room_state', newState);
      }
      roomStateSuccess = true;
    } catch (error) {
      this.errorReporter?.reportError({
        errorId: RoomStateErrorId.CAPABILITY_UPDATE_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'Room state display unavailable',
        technicalMessage: `Failed to update room_state capability: ${error instanceof Error ? error.message : 'Unknown error'}`,
        context: { deviceId: this.getData().id, capability: 'room_state', newState },
      });
    }

    // Update occupancy indicator alarm with retry if missing
    try {
      const occupied = this.computeOccupancyIndicator(newState);
      if (!this.hasCapability('alarm_room_occupied')) {
        this.log('alarm_room_occupied capability missing during update, attempting repair');
        await this.ensureCapabilityWithRetry('alarm_room_occupied', occupied);
      } else {
        await this.setCapabilityValue('alarm_room_occupied', occupied);
      }
      occupiedSuccess = true;
    } catch (error) {
      this.errorReporter?.reportError({
        errorId: RoomStateErrorId.CAPABILITY_UPDATE_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'Occupancy indicator unavailable',
        technicalMessage: `Failed to update alarm_room_occupied capability: ${error instanceof Error ? error.message : 'Unknown error'}`,
        context: { deviceId: this.getData().id, capability: 'alarm_room_occupied' },
      });
    }

    // If BOTH critical capabilities failed, this is a critical issue
    if (!roomStateSuccess && !occupiedSuccess) {
      const error = new Error('All critical capabilities failed to update');
      this.errorReporter?.reportError({
        errorId: RoomStateErrorId.CAPABILITY_UPDATE_FAILED,
        severity: ErrorSeverity.CRITICAL,
        userMessage: 'Device display unavailable',
        technicalMessage: 'Failed to update all critical capabilities',
        context: { deviceId: this.getData().id, newState },
      });
      throw error; // Propagate critical failure
    }

    if (roomStateSuccess && occupiedSuccess) {
      this.log(`Capabilities updated successfully: state=${newState}`);
    } else {
      this.log(`Capabilities partially updated: room_state=${roomStateSuccess}, occupied=${occupiedSuccess}`);
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
      const err = error instanceof Error ? error : new Error(String(error));

      this.errorReporter?.reportError({
        errorId: RoomStateErrorId.FLOW_TRIGGER_FAILED,
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'Flow card trigger failed',
        technicalMessage: `Failed to trigger room_state_changed flow: ${err.message}\n${err.stack || 'No stack trace available'}`,
        context: { deviceId: this.getData().id, oldState, newState },
      });

      this.error('Failed to trigger state changed flow:', error);
    }
  }

  /**
   * Gets minutes since last WIAB device activity.
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

export default RoomStateDevice;
module.exports = RoomStateDevice;
