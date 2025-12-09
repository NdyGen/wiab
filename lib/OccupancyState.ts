/**
 * Occupancy state types and constants for the tri-state occupancy model.
 *
 * This module defines the tri-state occupancy model as specified in
 * docs/wiab_multi_door_multi_pir_full.md. The model uses three internal states
 * (UNKNOWN, OCCUPIED, UNOCCUPIED) with a derived boolean output.
 */

/**
 * Internal tri-state occupancy states.
 *
 * @enum {string}
 * @property {string} UNKNOWN - Transitional state after door events, resolved by timers or PIR
 * @property {string} OCCUPIED - Room is occupied (motion detected)
 * @property {string} UNOCCUPIED - Room is empty (no motion, or timeout expired)
 */
export enum OccupancyState {
  UNKNOWN = 'UNKNOWN',
  OCCUPIED = 'OCCUPIED',
  UNOCCUPIED = 'UNOCCUPIED',
}

/**
 * Last stable occupancy state (excludes UNKNOWN).
 *
 * Used to derive the boolean `occupied` output. During UNKNOWN periods,
 * the boolean output retains the last stable state.
 *
 * @enum {string}
 * @property {string} OCCUPIED - Last stable state was occupied
 * @property {string} UNOCCUPIED - Last stable state was unoccupied
 */
export enum StableOccupancyState {
  OCCUPIED = 'OCCUPIED',
  UNOCCUPIED = 'UNOCCUPIED',
}

/**
 * Door state enumeration.
 *
 * @enum {string}
 * @property {string} OPEN - Door is open (alarm_contact = true)
 * @property {string} CLOSED - Door is closed (alarm_contact = false)
 */
export enum DoorState {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/**
 * Timer configuration constants from the specification.
 *
 * These define default values and valid ranges for the two timers
 * used in the tri-state occupancy model.
 */
export const TimerDefaults = {
  /**
   * T_ENTER: Short window after door state change to detect entry/exit.
   * Typical: 10-30 seconds.
   * Default: 20 seconds.
   */
  T_ENTER_SECONDS: 20,
  T_ENTER_MIN_SECONDS: 5,
  T_ENTER_MAX_SECONDS: 60,

  /**
   * T_CLEAR: Longer window with open doors to detect room becoming empty.
   * Typical: 300-900 seconds (5-15 minutes).
   * Default: 600 seconds (10 minutes).
   */
  T_CLEAR_SECONDS: 600,
  T_CLEAR_MIN_SECONDS: 60,
  T_CLEAR_MAX_SECONDS: 3600,
} as const;

/**
 * Tri-state occupancy configuration.
 *
 * User-configurable timer values for the occupancy model.
 *
 * @interface OccupancyConfig
 * @property {number} t_enter - T_ENTER timer duration in seconds
 * @property {number} t_clear - T_CLEAR timer duration in seconds
 */
export interface OccupancyConfig {
  t_enter: number;
  t_clear: number;
}

/**
 * Internal state machine variables.
 *
 * This interface represents the complete internal state of the occupancy model
 * as specified in section 5 of the specification document.
 *
 * @interface OccupancyStateVariables
 * @property {OccupancyState} occupancyState - Current tri-state occupancy
 * @property {StableOccupancyState} lastStableOccupancy - Last non-UNKNOWN state
 * @property {Map<string, DoorState>} doorStates - Individual door states by device ID
 * @property {number | null} lastDoorEventTimestamp - Timestamp of last door event (ms)
 * @property {boolean} pirSinceLastDoorEvent - Whether PIR occurred since last door event
 * @property {number | null} lastPirTimestamp - Timestamp of last PIR event (ms)
 */
export interface OccupancyStateVariables {
  occupancyState: OccupancyState;
  lastStableOccupancy: StableOccupancyState;
  doorStates: Map<string, DoorState>;
  lastDoorEventTimestamp: number | null;
  pirSinceLastDoorEvent: boolean;
  lastPirTimestamp: number | null;
}

/**
 * Converts tri-state occupancy to boolean output.
 *
 * Implements the mapping rule from section 6 of the specification:
 * - OCCUPIED → true
 * - UNOCCUPIED → false
 * - UNKNOWN → retain previous stable state
 *
 * @param lastStableOccupancy - The last stable (non-UNKNOWN) occupancy state
 * @returns {boolean} True if occupied, false if unoccupied
 */
export function occupancyToBoolean(
  lastStableOccupancy: StableOccupancyState
): boolean {
  return lastStableOccupancy === StableOccupancyState.OCCUPIED;
}

/**
 * Checks if all doors are closed (room is "sealed").
 *
 * Implements the derived status from section 4 of the specification:
 * all_doors_closed = (∀ door_id : door_state[door_id] == CLOSED)
 *
 * @param doorStates - Map of device IDs to door states
 * @returns {boolean} True if all doors are closed, false otherwise
 */
export function areAllDoorsClosed(doorStates: Map<string, DoorState>): boolean {
  if (doorStates.size === 0) {
    // No doors configured: treat as "sealed"
    return true;
  }

  for (const state of doorStates.values()) {
    if (state === DoorState.OPEN) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if any door is open (room is "leaky").
 *
 * Implements the derived status from section 4 of the specification:
 * any_door_open = (∃ door_id : door_state[door_id] == OPEN)
 *
 * @param doorStates - Map of device IDs to door states
 * @returns {boolean} True if at least one door is open, false otherwise
 */
export function isAnyDoorOpen(doorStates: Map<string, DoorState>): boolean {
  for (const state of doorStates.values()) {
    if (state === DoorState.OPEN) {
      return true;
    }
  }

  return false;
}
