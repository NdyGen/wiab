/**
 * ZoneSealEngine - Pure state machine logic for zone seal management
 *
 * This class manages zone seal state transitions based on sensor aggregation and configured delay timers.
 * It implements a four-state model: SEALED, OPEN_DELAY, LEAKY, CLOSE_DELAY.
 * Pure TypeScript class with no Homey SDK dependencies for easy unit testing.
 *
 * State Transition Rules:
 * 1. Open delay: Starts on first sensor open, does NOT reset if more sensors open
 * 2. Close delay cancellation: Opening sensor during close delay cancels it AND starts open delay immediately
 * 3. Zero delays: Result in immediate state transitions
 * 4. Initial state: Set via constructor parameter, no delays
 *
 * @example
 * ```typescript
 * const config = {
 *   openDelaySeconds: 10,
 *   closeDelaySeconds: 5
 * };
 * const engine = new ZoneSealEngine(config, ZoneSealState.SEALED);
 *
 * // Sensor opens
 * const transition = engine.handleAnySensorOpened();
 * // -> { newState: OPEN_DELAY, immediate: false, delaySeconds: 10 }
 *
 * // All sensors close
 * const transition2 = engine.handleAllSensorsClosed();
 * // -> { newState: CLOSE_DELAY, immediate: false, delaySeconds: 5 }
 * ```
 */

import { ZoneSealState, type ZoneSealDelayConfig } from './types';

/**
 * Result of a state transition evaluation.
 *
 * Indicates the new state, whether the transition is immediate,
 * and the delay duration if applicable.
 *
 * @interface StateTransition
 * @property {ZoneSealState} newState - State to transition to
 * @property {boolean} immediate - Whether transition happens immediately (true) or after a delay (false)
 * @property {number} [delaySeconds] - Duration in seconds for delayed transition (undefined for immediate)
 */
export interface StateTransition {
  newState: ZoneSealState;
  immediate: boolean;
  delaySeconds?: number;
}

/**
 * ZoneSealEngine - Pure state machine for zone seal delay management
 *
 * Manages state transitions between SEALED, OPEN_DELAY, LEAKY, and CLOSE_DELAY states.
 * Provides pure transition logic without side effects - the device layer handles timer scheduling.
 *
 * State Machine Diagram:
 * ```
 * SEALED ----[sensor opens]----> OPEN_DELAY ----[delay expires]----> LEAKY
 *   ^                                |                                  |
 *   |                    [all sensors close - cancels delay]           |
 *   |                                v                                  |
 *   |                          CLOSE_DELAY <-------[all sensors close]--+
 *   |                                |
 *   +------[delay expires]-----------+
 * ```
 *
 * Critical Behavior:
 * - Opening additional sensors during OPEN_DELAY does NOT restart the delay
 * - Opening any sensor during CLOSE_DELAY CANCELS the close delay AND starts OPEN_DELAY
 * - Zero delays result in immediate transitions (immediate: true, no delaySeconds)
 *
 * @example
 * ```typescript
 * const engine = new ZoneSealEngine(
 *   { openDelaySeconds: 10, closeDelaySeconds: 5 },
 *   ZoneSealState.SEALED
 * );
 *
 * // Check current state
 * console.log(engine.getCurrentState()); // SEALED
 * console.log(engine.isSealed()); // true
 *
 * // Sensor opens
 * const t1 = engine.handleAnySensorOpened();
 * // { newState: OPEN_DELAY, immediate: false, delaySeconds: 10 }
 *
 * // Device layer schedules 10-second timer, then calls:
 * engine.setCurrentState(ZoneSealState.LEAKY);
 * ```
 */
export class ZoneSealEngine {
  private currentState: ZoneSealState;
  private config: ZoneSealDelayConfig;
  private delayDeadline: number | null = null;

  /**
   * Creates a new ZoneSealEngine instance.
   *
   * Initializes the engine with the specified configuration and initial state.
   * The delayDeadline is set to null, meaning no delay is active initially.
   * This is important for state recovery - the engine starts in a stable state
   * without any pending delays, even if initialized in a delay state.
   *
   * @param {ZoneSealDelayConfig} config - Delay configuration for state transitions
   * @param {ZoneSealState} initialState - State to start in (default: SEALED)
   * @throws {Error} If delay configuration is invalid (negative values)
   */
  constructor(config: ZoneSealDelayConfig, initialState: ZoneSealState = ZoneSealState.SEALED) {
    this.validateConfig(config);
    this.config = { ...config };
    this.currentState = initialState;
  }

  /**
   * Validates the delay configuration.
   *
   * Ensures delay values are non-negative.
   *
   * @param {ZoneSealDelayConfig} config - Configuration to validate
   * @throws {Error} If any delay value is negative
   * @private
   */
  private validateConfig(config: ZoneSealDelayConfig): void {
    if (config.openDelaySeconds < 0) {
      throw new Error(`Invalid openDelaySeconds: ${config.openDelaySeconds} (must be >= 0)`);
    }
    if (config.closeDelaySeconds < 0) {
      throw new Error(`Invalid closeDelaySeconds: ${config.closeDelaySeconds} (must be >= 0)`);
    }
  }

  /**
   * Gets the current state.
   *
   * @returns {ZoneSealState} Current state
   * @public
   */
  public getCurrentState(): ZoneSealState {
    return this.currentState;
  }

  /**
   * Sets the current state.
   *
   * Used by device layer after delay timers expire to update the state machine.
   * Clears any active delay deadline when state is updated.
   *
   * @param {ZoneSealState} state - New state to set
   * @public
   */
  public setCurrentState(state: ZoneSealState): void {
    this.currentState = state;
    this.delayDeadline = null;
  }

  /**
   * Checks if zone is currently sealed.
   *
   * Returns true only if state is exactly SEALED (not in CLOSE_DELAY).
   *
   * @returns {boolean} True if zone is sealed
   * @public
   */
  public isSealed(): boolean {
    return this.currentState === ZoneSealState.SEALED;
  }

  /**
   * Checks if zone is currently leaky.
   *
   * Returns true only if state is exactly LEAKY (not in OPEN_DELAY).
   *
   * @returns {boolean} True if zone is leaky
   * @public
   */
  public isLeaky(): boolean {
    return this.currentState === ZoneSealState.LEAKY;
  }

  /**
   * Checks if zone is in a delay state.
   *
   * Returns true if state is OPEN_DELAY or CLOSE_DELAY.
   *
   * @returns {boolean} True if zone is in a delay state
   * @public
   */
  public isInDelay(): boolean {
    return (
      this.currentState === ZoneSealState.OPEN_DELAY || this.currentState === ZoneSealState.CLOSE_DELAY
    );
  }

  /**
   * Gets the active delay deadline timestamp.
   *
   * Returns the timestamp (milliseconds since epoch) when the current delay
   * should expire, or null if no delay is active.
   *
   * @returns {number | null} Delay deadline timestamp or null
   * @public
   */
  public getActiveDelayDeadline(): number | null {
    return this.delayDeadline;
  }

  /**
   * Handles event when all sensors close.
   *
   * State Transitions:
   * - SEALED -> SEALED (no change, immediate)
   * - OPEN_DELAY -> CLOSE_DELAY (cancels open delay, starts close delay if configured, or immediate to SEALED if zero)
   * - LEAKY -> CLOSE_DELAY (starts close delay if configured, or immediate to SEALED if zero)
   * - CLOSE_DELAY -> CLOSE_DELAY (no change, delay already active)
   *
   * Critical Behavior:
   * - During OPEN_DELAY: Cancels the open delay and transitions to close delay (or sealed immediately)
   * - During CLOSE_DELAY: No change (already closing)
   * - Zero closeDelaySeconds: Immediate transition to SEALED
   *
   * @returns {StateTransition} State transition result
   * @public
   */
  public handleAllSensorsClosed(): StateTransition {
    const { closeDelaySeconds } = this.config;

    switch (this.currentState) {
      case ZoneSealState.SEALED:
        // Already sealed - no change
        return {
          newState: ZoneSealState.SEALED,
          immediate: true
        };

      case ZoneSealState.OPEN_DELAY:
        // Cancel open delay, start close delay (or immediate if zero)
        if (closeDelaySeconds === 0) {
          this.currentState = ZoneSealState.SEALED;
          this.delayDeadline = null;
          return {
            newState: ZoneSealState.SEALED,
            immediate: true
          };
        }

        this.currentState = ZoneSealState.CLOSE_DELAY;
        this.delayDeadline = Date.now() + closeDelaySeconds * 1000;
        return {
          newState: ZoneSealState.CLOSE_DELAY,
          immediate: false,
          delaySeconds: closeDelaySeconds
        };

      case ZoneSealState.LEAKY:
        // Start close delay (or immediate if zero)
        if (closeDelaySeconds === 0) {
          this.currentState = ZoneSealState.SEALED;
          this.delayDeadline = null;
          return {
            newState: ZoneSealState.SEALED,
            immediate: true
          };
        }

        this.currentState = ZoneSealState.CLOSE_DELAY;
        this.delayDeadline = Date.now() + closeDelaySeconds * 1000;
        return {
          newState: ZoneSealState.CLOSE_DELAY,
          immediate: false,
          delaySeconds: closeDelaySeconds
        };

      case ZoneSealState.CLOSE_DELAY:
        // Already in close delay - no change
        return {
          newState: ZoneSealState.CLOSE_DELAY,
          immediate: true
        };

      default:
        // Unreachable - TypeScript exhaustiveness check
        return {
          newState: this.currentState,
          immediate: true
        };
    }
  }

  /**
   * Handles event when any sensor opens.
   *
   * State Transitions:
   * - SEALED -> OPEN_DELAY (starts open delay if configured, or immediate to LEAKY if zero)
   * - OPEN_DELAY -> OPEN_DELAY (no change, delay does NOT restart)
   * - LEAKY -> LEAKY (no change, immediate)
   * - CLOSE_DELAY -> OPEN_DELAY (cancels close delay, starts open delay if configured, or immediate to LEAKY if zero)
   *
   * Critical Behavior:
   * - During OPEN_DELAY: NO change, delay does NOT restart when additional sensors open
   * - During CLOSE_DELAY: CANCELS close delay AND starts open delay (or immediate to LEAKY)
   * - Zero openDelaySeconds: Immediate transition to LEAKY
   *
   * @returns {StateTransition} State transition result
   * @public
   */
  public handleAnySensorOpened(): StateTransition {
    const { openDelaySeconds } = this.config;

    switch (this.currentState) {
      case ZoneSealState.SEALED:
        // Start open delay (or immediate if zero)
        if (openDelaySeconds === 0) {
          this.currentState = ZoneSealState.LEAKY;
          this.delayDeadline = null;
          return {
            newState: ZoneSealState.LEAKY,
            immediate: true
          };
        }

        this.currentState = ZoneSealState.OPEN_DELAY;
        this.delayDeadline = Date.now() + openDelaySeconds * 1000;
        return {
          newState: ZoneSealState.OPEN_DELAY,
          immediate: false,
          delaySeconds: openDelaySeconds
        };

      case ZoneSealState.OPEN_DELAY:
        // Already in open delay - NO change, delay does NOT restart
        return {
          newState: ZoneSealState.OPEN_DELAY,
          immediate: true
        };

      case ZoneSealState.LEAKY:
        // Already leaky - no change
        return {
          newState: ZoneSealState.LEAKY,
          immediate: true
        };

      case ZoneSealState.CLOSE_DELAY:
        // Cancel close delay, start open delay (or immediate if zero)
        if (openDelaySeconds === 0) {
          this.currentState = ZoneSealState.LEAKY;
          this.delayDeadline = null;
          return {
            newState: ZoneSealState.LEAKY,
            immediate: true
          };
        }

        this.currentState = ZoneSealState.OPEN_DELAY;
        this.delayDeadline = Date.now() + openDelaySeconds * 1000;
        return {
          newState: ZoneSealState.OPEN_DELAY,
          immediate: false,
          delaySeconds: openDelaySeconds
        };

      default:
        // Unreachable - TypeScript exhaustiveness check
        return {
          newState: this.currentState,
          immediate: true
        };
    }
  }

  /**
   * Updates the delay configuration.
   *
   * This does NOT affect any currently active delays - only future transitions.
   * Active delay deadlines remain unchanged until they expire.
   *
   * @param {ZoneSealDelayConfig} config - New delay configuration
   * @throws {Error} If delay configuration is invalid
   * @public
   */
  public updateConfig(config: ZoneSealDelayConfig): void {
    this.validateConfig(config);
    this.config = { ...config };
  }

  /**
   * Gets the current delay configuration.
   *
   * Returns a copy of the configuration to prevent external mutation.
   *
   * @returns {ZoneSealDelayConfig} Current delay configuration
   * @public
   */
  public getConfig(): ZoneSealDelayConfig {
    return { ...this.config };
  }
}
