/**
 * RoomStateEngine - Core state machine logic for room state management
 *
 * This class manages room state transitions based on zone activity and configured timers.
 * It handles state hierarchy validation, transition evaluation, and timer management.
 * Pure TypeScript class with no Homey SDK dependencies for easy unit testing.
 */

import type { StateConfig, StateTransition } from './types';

/**
 * Result of a state transition evaluation.
 *
 * @interface StateEvaluationResult
 * @property {string | null} nextState - State to transition to, or null if no transition
 * @property {string} reason - Explanation of why this transition occurred
 * @property {number} [timerMinutes] - Duration in minutes for scheduled transition
 */
export interface StateEvaluationResult {
  nextState: string | null;
  reason: string;
  timerMinutes?: number;
}

/**
 * Validation result for state configuration.
 *
 * @interface ValidationResult
 * @property {boolean} valid - Whether the configuration is valid
 * @property {string[]} errors - List of validation error messages
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * RoomStateEngine - Pure state machine logic for room states
 *
 * Manages state transitions, hierarchy validation, and timer-based state progression.
 * Supports 2-level state hierarchy (parent + child only).
 *
 * @example
 * ```typescript
 * const engine = new RoomStateEngine(stateConfigs, 'unoccupied');
 * const result = engine.evaluateStateTransition('occupied', true, 15);
 * if (result.nextState) {
 *   console.log(`Transition to ${result.nextState}: ${result.reason}`);
 * }
 * ```
 */
export class RoomStateEngine {
  private currentState: string;
  private readonly states: Map<string, StateConfig>;
  private readonly stateHierarchy: Map<string, string>; // child -> parent
  private lastActivityTimestamp: number | null = null;

  /**
   * Creates a new RoomStateEngine instance.
   *
   * @param {StateConfig[]} stateConfigs - Array of state configurations
   * @param {string} initialState - State ID to start in
   * @throws {Error} If state configuration is invalid
   */
  constructor(stateConfigs: StateConfig[], initialState: string) {
    this.states = new Map();
    this.stateHierarchy = new Map();

    // Build state maps
    for (const config of stateConfigs) {
      this.states.set(config.id, config);
      if (config.parent) {
        this.stateHierarchy.set(config.id, config.parent);
      }
    }

    // Validate configuration
    const validation = this.validateConfiguration();
    if (!validation.valid) {
      throw new Error(`Invalid state configuration: ${validation.errors.join(', ')}`);
    }

    // Validate initial state exists
    if (!this.states.has(initialState)) {
      throw new Error(`Initial state "${initialState}" does not exist in configuration`);
    }

    this.currentState = initialState;
  }

  /**
   * Validates the state configuration.
   *
   * Checks for:
   * - Duplicate state IDs
   * - Circular parent-child relationships
   * - Maximum hierarchy depth of 2 levels
   * - Valid parent references
   * - Valid transition targets
   *
   * @returns {ValidationResult} Validation result with error messages
   */
  public validateConfiguration(): ValidationResult {
    const errors: string[] = [];

    // Check for at least one state
    if (this.states.size === 0) {
      errors.push('At least one state must be defined');
      return { valid: false, errors };
    }

    // Check for circular dependencies
    for (const [childId] of this.stateHierarchy.entries()) {
      const visited = new Set<string>();
      let current: string | undefined = childId;

      while (current) {
        if (visited.has(current)) {
          errors.push(`Circular dependency detected in state hierarchy: ${childId}`);
          break;
        }
        visited.add(current);
        current = this.stateHierarchy.get(current);
      }
    }

    // Check maximum depth (2 levels: root + child)
    for (const [stateId] of this.states) {
      const depth = this.getStateDepth(stateId);
      if (depth > 1) {
        errors.push(`State "${stateId}" exceeds maximum depth of 2 levels (depth: ${depth + 1})`);
      }
    }

    // Check parent references exist
    for (const [childId, parentId] of this.stateHierarchy.entries()) {
      if (!this.states.has(parentId)) {
        errors.push(`State "${childId}" references non-existent parent "${parentId}"`);
      }
    }

    // Check transition targets exist
    for (const [stateId, config] of this.states) {
      for (const transition of [...config.activeTransitions, ...config.inactiveTransitions]) {
        if (!this.states.has(transition.targetState)) {
          errors.push(
            `State "${stateId}" has transition to non-existent state "${transition.targetState}"`
          );
        }
        if (transition.afterMinutes < 0) {
          errors.push(
            `State "${stateId}" has invalid transition duration: ${transition.afterMinutes} minutes`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Gets the depth of a state in the hierarchy.
   *
   * @param {string} stateId - State ID to check
   * @returns {number} Depth (0 for root states, 1 for children)
   * @private
   */
  private getStateDepth(stateId: string): number {
    let depth = 0;
    let current: string = stateId;
    const visited = new Set<string>();

    while (this.stateHierarchy.has(current)) {
      // Detect circular dependencies to prevent infinite loop
      if (visited.has(current)) {
        return depth; // Return current depth if cycle detected
      }
      visited.add(current);

      depth++;
      const parent = this.stateHierarchy.get(current);
      if (!parent) break;
      current = parent;
    }

    return depth;
  }

  /**
   * Evaluates whether a state transition should occur.
   *
   * Based on current state, zone activity, and time since last activity,
   * determines if a transition should happen and to which state.
   *
   * @param {string} currentStateId - Current state ID
   * @param {boolean} zoneActive - Whether the zone is currently active
   * @param {number} minutesSinceActivity - Minutes since last zone activity
   * @returns {StateEvaluationResult} Transition evaluation result
   */
  public evaluateStateTransition(
    currentStateId: string,
    zoneActive: boolean,
    minutesSinceActivity: number
  ): StateEvaluationResult {
    const stateConfig = this.states.get(currentStateId);

    if (!stateConfig) {
      return {
        nextState: null,
        reason: `Current state "${currentStateId}" not found in configuration`
      };
    }

    // Check active transitions if zone is active
    if (zoneActive) {
      for (const transition of stateConfig.activeTransitions) {
        if (minutesSinceActivity >= transition.afterMinutes) {
          return {
            nextState: transition.targetState,
            reason: `Zone active for ${minutesSinceActivity} minutes, transitioning after ${transition.afterMinutes} minutes`,
            timerMinutes: transition.afterMinutes
          };
        }
      }
    } else {
      // Check inactive transitions if zone is inactive
      for (const transition of stateConfig.inactiveTransitions) {
        if (minutesSinceActivity >= transition.afterMinutes) {
          return {
            nextState: transition.targetState,
            reason: `Zone inactive for ${minutesSinceActivity} minutes, transitioning after ${transition.afterMinutes} minutes`,
            timerMinutes: transition.afterMinutes
          };
        }
      }
    }

    return {
      nextState: null,
      reason: 'No matching transition found for current conditions'
    };
  }

  /**
   * Gets the next timed transition for the current state.
   *
   * Returns the earliest scheduled transition based on zone activity.
   *
   * @param {string} currentStateId - Current state ID
   * @param {boolean} zoneActive - Whether the zone is currently active
   * @returns {{ targetState: string; afterMinutes: number } | null} Next transition or null
   */
  public getNextTimedTransition(
    currentStateId: string,
    zoneActive: boolean
  ): { targetState: string; afterMinutes: number } | null {
    const stateConfig = this.states.get(currentStateId);

    if (!stateConfig) {
      return null;
    }

    const transitions = zoneActive ? stateConfig.activeTransitions : stateConfig.inactiveTransitions;

    if (transitions.length === 0) {
      return null;
    }

    // Find earliest transition (lowest afterMinutes)
    let earliest: StateTransition | null = null;

    for (const transition of transitions) {
      if (!earliest || transition.afterMinutes < earliest.afterMinutes) {
        earliest = transition;
      }
    }

    return earliest
      ? {
          targetState: earliest.targetState,
          afterMinutes: earliest.afterMinutes
        }
      : null;
  }

  /**
   * Gets the state hierarchy for a given state.
   *
   * Returns array of state IDs from child to parent (e.g., ['working', 'occupied']).
   *
   * @param {string} stateId - State ID to get hierarchy for
   * @returns {string[]} Array of state IDs in hierarchy (child to parent)
   */
  public getStateHierarchy(stateId: string): string[] {
    const hierarchy: string[] = [stateId];
    let current = stateId;

    while (this.stateHierarchy.has(current)) {
      const parent = this.stateHierarchy.get(current)!;
      hierarchy.push(parent);
      current = parent;
    }

    return hierarchy;
  }

  /**
   * Checks if current state matches target state (with hierarchy).
   *
   * Returns true if current state is target state or a child of target state.
   *
   * @param {string} currentStateId - Current state ID
   * @param {string} targetStateId - Target state ID to check against
   * @returns {boolean} True if current state matches target (with inheritance)
   */
  public isState(currentStateId: string, targetStateId: string): boolean {
    const hierarchy = this.getStateHierarchy(currentStateId);
    return hierarchy.includes(targetStateId);
  }

  /**
   * Checks if current state exactly matches target state (no hierarchy).
   *
   * Returns true only if current state ID equals target state ID.
   *
   * @param {string} currentStateId - Current state ID
   * @param {string} targetStateId - Target state ID to check against
   * @returns {boolean} True if current state exactly matches target
   */
  public isExactlyState(currentStateId: string, targetStateId: string): boolean {
    return currentStateId === targetStateId;
  }

  /**
   * Gets the current state ID.
   *
   * @returns {string} Current state ID
   */
  public getCurrentState(): string {
    return this.currentState;
  }

  /**
   * Sets the current state.
   *
   * @param {string} stateId - New state ID
   * @throws {Error} If state does not exist
   */
  public setCurrentState(stateId: string): void {
    if (!this.states.has(stateId)) {
      throw new Error(`Cannot set state to non-existent state: ${stateId}`);
    }
    this.currentState = stateId;
  }

  /**
   * Gets a state configuration by ID.
   *
   * @param {string} stateId - State ID to retrieve
   * @returns {StateConfig | undefined} State configuration or undefined if not found
   */
  public getStateConfig(stateId: string): StateConfig | undefined {
    return this.states.get(stateId);
  }

  /**
   * Gets all state IDs.
   *
   * @returns {string[]} Array of all state IDs
   */
  public getAllStateIds(): string[] {
    return Array.from(this.states.keys());
  }

  /**
   * Updates the last activity timestamp.
   *
   * @param {number} timestamp - Timestamp in milliseconds
   */
  public updateActivity(timestamp: number): void {
    this.lastActivityTimestamp = timestamp;
  }

  /**
   * Gets minutes since last activity.
   *
   * @returns {number} Minutes since last activity, or 0 if no activity recorded
   */
  public getMinutesSinceActivity(): number {
    if (!this.lastActivityTimestamp) {
      return 0;
    }
    return (Date.now() - this.lastActivityTimestamp) / 1000 / 60;
  }
}
