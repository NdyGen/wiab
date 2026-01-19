/**
 * WIABStateEngine - Pure state machine for WIAB room state management
 *
 * Manages room state transitions based on occupancy changes and timer expirations.
 * Supports a 2-level state hierarchy where extended states are children of base states.
 * Pure TypeScript class with no Homey SDK dependencies for easy unit testing.
 *
 * State Hierarchy:
 * - occupied (parent)
 *   - extended_occupied (child of occupied)
 * - idle (parent)
 *   - extended_idle (child of idle)
 *
 * Transitions:
 * - Occupancy TRUE → occupied (resets to base state)
 * - Occupancy FALSE → idle (resets to base state)
 * - Timer expires in occupied → extended_occupied
 * - Timer expires in idle → extended_idle
 */

/**
 * Room state values matching the capability enum.
 */
export enum RoomState {
  IDLE = 'idle',
  EXTENDED_IDLE = 'extended_idle',
  OCCUPIED = 'occupied',
  EXTENDED_OCCUPIED = 'extended_occupied',
}

/**
 * Result of a state transition evaluation.
 *
 * @interface StateTransitionResult
 * @property {RoomState | null} newState - State to transition to, or null if no change
 * @property {RoomState | null} previousState - Previous state before transition
 * @property {string} reason - Explanation of transition or why no transition occurred
 * @property {number | null} scheduledTimerMinutes - Timer to schedule, or null if none
 */
export interface StateTransitionResult {
  newState: RoomState | null;
  previousState: RoomState | null;
  reason: string;
  scheduledTimerMinutes: number | null;
}

/**
 * Configuration for room state timers.
 *
 * @interface RoomStateTimerConfig
 * @property {number} idleTimeoutMinutes - Minutes before idle → extended_idle (0 = disabled)
 * @property {number} occupiedTimeoutMinutes - Minutes before occupied → extended_occupied (0 = disabled)
 */
export interface RoomStateTimerConfig {
  idleTimeoutMinutes: number;
  occupiedTimeoutMinutes: number;
}

/**
 * State hierarchy mapping - child state to parent state.
 */
const STATE_HIERARCHY: ReadonlyMap<RoomState, RoomState> = new Map([
  [RoomState.EXTENDED_OCCUPIED, RoomState.OCCUPIED],
  [RoomState.EXTENDED_IDLE, RoomState.IDLE],
]);

/**
 * WIABStateEngine - Pure state machine for room state management
 *
 * @example
 * ```typescript
 * const engine = new WIABStateEngine({ idleTimeoutMinutes: 30, occupiedTimeoutMinutes: 60 });
 *
 * // Occupancy detected
 * const result = engine.handleOccupancyChange(true);
 * if (result.newState) {
 *   console.log(`Transitioned to ${result.newState}`);
 *   if (result.scheduledTimerMinutes) {
 *     scheduleTimer(result.scheduledTimerMinutes);
 *   }
 * }
 * ```
 */
export class WIABStateEngine {
  private currentState: RoomState;
  private config: RoomStateTimerConfig;

  /**
   * Creates a new WIABStateEngine instance.
   *
   * @param {RoomStateTimerConfig} config - Timer configuration
   * @param {RoomState} initialState - Initial state (defaults to idle)
   */
  constructor(config: RoomStateTimerConfig, initialState: RoomState = RoomState.IDLE) {
    this.config = { ...config };
    this.currentState = initialState;
  }

  /**
   * Handles an occupancy change event.
   *
   * When occupancy becomes true → transitions to 'occupied' base state
   * When occupancy becomes false → transitions to 'idle' base state
   *
   * Always resets to base state (not extended) when occupancy changes.
   *
   * @param {boolean} isOccupied - Whether occupancy is now detected
   * @returns {StateTransitionResult} Transition result with optional timer to schedule
   */
  public handleOccupancyChange(isOccupied: boolean): StateTransitionResult {
    const previousState = this.currentState;
    const targetState = isOccupied ? RoomState.OCCUPIED : RoomState.IDLE;

    // Check if already in target state (or child of target)
    if (this.isInState(targetState)) {
      // Already in this state family - no transition needed
      // But if in extended state, stay there (don't reset to base on repeated signals)
      return {
        newState: null,
        previousState,
        reason: `Already in ${this.currentState} (${isOccupied ? 'occupied' : 'idle'} family)`,
        scheduledTimerMinutes: null,
      };
    }

    // Transition to new base state
    this.currentState = targetState;

    // Determine timer to schedule
    const timerMinutes = this.getTimerForState(targetState);

    return {
      newState: targetState,
      previousState,
      reason: `Occupancy changed to ${isOccupied ? 'true' : 'false'}`,
      scheduledTimerMinutes: timerMinutes,
    };
  }

  /**
   * Handles a timer expiry event.
   *
   * Transitions from base state to extended state:
   * - occupied → extended_occupied (if occupiedTimeoutMinutes > 0)
   * - idle → extended_idle (if idleTimeoutMinutes > 0)
   *
   * Does nothing if already in extended state.
   *
   * @returns {StateTransitionResult} Transition result (no timer scheduled for extended states)
   */
  public handleTimerExpiry(): StateTransitionResult {
    const previousState = this.currentState;

    switch (this.currentState) {
      case RoomState.OCCUPIED:
        if (this.config.occupiedTimeoutMinutes > 0) {
          this.currentState = RoomState.EXTENDED_OCCUPIED;
          return {
            newState: RoomState.EXTENDED_OCCUPIED,
            previousState,
            reason: `Occupied timer expired after ${this.config.occupiedTimeoutMinutes} minutes`,
            scheduledTimerMinutes: null,
          };
        }
        break;

      case RoomState.IDLE:
        if (this.config.idleTimeoutMinutes > 0) {
          this.currentState = RoomState.EXTENDED_IDLE;
          return {
            newState: RoomState.EXTENDED_IDLE,
            previousState,
            reason: `Idle timer expired after ${this.config.idleTimeoutMinutes} minutes`,
            scheduledTimerMinutes: null,
          };
        }
        break;

      case RoomState.EXTENDED_OCCUPIED:
      case RoomState.EXTENDED_IDLE:
        // Already in extended state - timer shouldn't fire
        return {
          newState: null,
          previousState,
          reason: `Already in extended state ${this.currentState}`,
          scheduledTimerMinutes: null,
        };
    }

    return {
      newState: null,
      previousState,
      reason: 'Timer disabled for current state',
      scheduledTimerMinutes: null,
    };
  }

  /**
   * Manually sets the room state (for override mode).
   *
   * @param {RoomState} state - State to set
   * @returns {StateTransitionResult} Transition result
   */
  public setManualState(state: RoomState): StateTransitionResult {
    const previousState = this.currentState;

    if (this.currentState === state) {
      return {
        newState: null,
        previousState,
        reason: `Already in state ${state}`,
        scheduledTimerMinutes: null,
      };
    }

    this.currentState = state;

    // If setting to base state, schedule timer; if extended, no timer needed
    const isBaseState = state === RoomState.OCCUPIED || state === RoomState.IDLE;
    const timerMinutes = isBaseState ? this.getTimerForState(state) : null;

    return {
      newState: state,
      previousState,
      reason: `Manual state change to ${state}`,
      scheduledTimerMinutes: timerMinutes,
    };
  }

  /**
   * Gets the current room state.
   *
   * @returns {RoomState} Current state
   */
  public getCurrentState(): RoomState {
    return this.currentState;
  }

  /**
   * Checks if current state matches target state (with hierarchy support).
   *
   * Returns true if:
   * - Current state equals target state
   * - Current state is a child of target state
   *
   * @example
   * ```typescript
   * // Current state: extended_occupied
   * engine.isInState(RoomState.OCCUPIED); // true (extended_occupied is child of occupied)
   * engine.isInState(RoomState.EXTENDED_OCCUPIED); // true (exact match)
   * engine.isInState(RoomState.IDLE); // false
   * ```
   *
   * @param {RoomState} targetState - State to check against
   * @returns {boolean} True if current state matches target (with inheritance)
   */
  public isInState(targetState: RoomState): boolean {
    if (this.currentState === targetState) {
      return true;
    }

    // Check if current state is a child of target state
    const parent = STATE_HIERARCHY.get(this.currentState);
    return parent === targetState;
  }

  /**
   * Checks if current state exactly matches target state (no hierarchy).
   *
   * @param {RoomState} targetState - State to check against
   * @returns {boolean} True only if current state exactly equals target
   */
  public isExactlyInState(targetState: RoomState): boolean {
    return this.currentState === targetState;
  }

  /**
   * Gets the state hierarchy for a given state.
   *
   * Returns array from child to parent.
   *
   * @param {RoomState} state - State to get hierarchy for
   * @returns {RoomState[]} Array of states (child first, then parent if exists)
   */
  public getStateHierarchy(state: RoomState): RoomState[] {
    const hierarchy: RoomState[] = [state];
    const parent = STATE_HIERARCHY.get(state);
    if (parent) {
      hierarchy.push(parent);
    }
    return hierarchy;
  }

  /**
   * Gets the timer duration for scheduling when entering a base state.
   *
   * @param {RoomState} state - State to get timer for
   * @returns {number | null} Timer duration in minutes, or null if disabled/not applicable
   */
  public getTimerForState(state: RoomState): number | null {
    switch (state) {
      case RoomState.OCCUPIED:
        return this.config.occupiedTimeoutMinutes > 0 ? this.config.occupiedTimeoutMinutes : null;
      case RoomState.IDLE:
        return this.config.idleTimeoutMinutes > 0 ? this.config.idleTimeoutMinutes : null;
      default:
        return null;
    }
  }

  /**
   * Updates the timer configuration.
   *
   * @param {Partial<RoomStateTimerConfig>} config - Partial configuration to merge
   */
  public updateConfig(config: Partial<RoomStateTimerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Gets the current timer configuration.
   *
   * @returns {RoomStateTimerConfig} Current configuration
   */
  public getConfig(): RoomStateTimerConfig {
    return { ...this.config };
  }

  /**
   * Gets all valid room states.
   *
   * @returns {RoomState[]} Array of all valid state values
   */
  public static getAllStates(): RoomState[] {
    return [RoomState.IDLE, RoomState.EXTENDED_IDLE, RoomState.OCCUPIED, RoomState.EXTENDED_OCCUPIED];
  }

  /**
   * Checks if a string is a valid room state.
   *
   * @param {string} value - Value to check
   * @returns {boolean} True if value is a valid RoomState
   */
  public static isValidState(value: string): value is RoomState {
    return Object.values(RoomState).includes(value as RoomState);
  }
}
