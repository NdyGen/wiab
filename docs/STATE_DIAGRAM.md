# WIAB State Machine Specification

This document provides a comprehensive specification of the WIAB (Wasp in a Box) state machine, including state diagrams, sensor semantics, state transition rules, and implementation notes.

## Overview

WIAB implements a simple two-state occupancy model that mimics the behavior of a wasp trapped in a box:
- The wasp becomes active when it detects motion (trigger sensors)
- The wasp remains active until it finds an exit (reset sensors)
- The virtual occupancy sensor reflects this trapped/active state

**Core Principle**: Door/window position indicates potential exits, but only the ACT of opening/closing them indicates someone actually exiting.

## Occupancy State Diagram

### Initialization Flow

```
┌────────────────────────────────────────────────────────┐
│                   Device Initialization                │
│                      (onInit called)                    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│         Read current trigger sensor values             │
│     (alarm_motion, alarm_presence capabilities)        │
└───────────────────────────┬────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
         ANY trigger = TRUE      ALL triggers = FALSE
                │                       │
                ▼                       ▼
    ┌─────────────────────┐ ┌─────────────────────┐
    │  Set Occupancy ON   │ │  Set Occupancy OFF  │
    │ alarm_occupancy=TRUE│ │ alarm_occupancy=FALSE│
    └──────────┬──────────┘ └──────────┬──────────┘
               │                       │
               └───────────┬───────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  Start SensorMonitor   │
              │ (Setup event listeners)│
              └────────────────────────┘
```

**Key Points:**
- Reset sensors are IGNORED during initialization
- Only current trigger sensor VALUES determine initial occupancy
- No state transitions occur during initialization
- Door/window position doesn't indicate occupancy

### Runtime Flow

```
┌─────────────────────────────────────────────────────────┐
│            SensorMonitor Event Listeners                │
│         (WebSocket $update events from HomeyAPI)        │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
         ┌───────────────────────────────┐
         │   Device Capability Update    │
         │    Event Received ($update)   │
         └───────────┬───────────────────┘
                     │
         ┌───────────┴────────────┐
         │                        │
    Reset Sensor Event     Trigger Sensor Event
    (alarm_contact)        (alarm_motion/presence)
         │                        │
         ▼                        ▼
┌─────────────────┐    ┌──────────────────────┐
│  Check if edge  │    │   Check if edge      │
│  FALSE → TRUE   │    │   FALSE → TRUE       │
└────────┬────────┘    └──────────┬───────────┘
         │                        │
    ┌────┴─────┐            ┌─────┴─────┐
    │          │            │           │
   YES        NO           YES         NO
    │          │            │           │
    ▼          ▼            ▼           ▼
┌─────────┐ ┌────┐   ┌──────────┐  ┌────┐
│Set OFF  │ │Skip│   │Set ON    │  │Skip│
│alarm_   │ │    │   │alarm_    │  │    │
│occupancy│ │    │   │occupancy │  │    │
│= FALSE  │ │    │   │= TRUE    │  │    │
└─────────┘ └────┘   └──────────┘  └────┘
     │                     │
     └──────────┬──────────┘
                │
                ▼
     ┌────────────────────┐
     │  Wait for next     │
     │  WebSocket event   │
     └────────────────────┘
```

**Key Points:**
- Event-driven: No polling, instant response to sensor state changes
- WebSocket updates: HomeyAPI pushes real-time capability changes via `$update` events
- Reset sensors have PRIORITY over trigger sensors (via callback logic)
- Only state TRANSITIONS (FALSE → TRUE) trigger actions
- Continuous TRUE state does NOT repeatedly trigger
- Edge detection prevents spurious triggers

## Sensor Semantics Table

| Sensor Type | Capability | TRUE Meaning | FALSE Meaning | Used At Init? | Used At Runtime? |
|-------------|-----------|--------------|---------------|---------------|------------------|
| **Trigger Sensors** | `alarm_motion` | Motion detected | No motion | YES (value checked) | YES (edge detected) |
| **Trigger Sensors** | `alarm_presence` | Presence detected | No presence | YES (value checked) | YES (edge detected) |
| **Reset Sensors** | `alarm_contact` | Door/window OPEN | Door/window CLOSED | NO (ignored) | YES (edge detected) |

**Important Notes:**
- **Trigger sensors** indicate current occupancy state (motion/presence)
- **Reset sensors** indicate exit opportunities (doors/windows)
- At initialization: Only trigger sensor VALUES matter
- At runtime: Only state TRANSITIONS (edges) matter

## Initial State Determination Rules

These rules apply ONLY during device initialization (`onInit`):

| Trigger Sensors Config | Current Trigger Values | Initial Occupancy State | Rationale |
|------------------------|------------------------|------------------------|-----------|
| None configured | N/A | OFF (FALSE) | No motion sensors = no way to detect occupancy |
| 1+ configured | ALL = FALSE | OFF (FALSE) | No motion detected = room is empty |
| 1+ configured | ANY = TRUE | ON (TRUE) | Motion detected = room is occupied |

**Reset Sensor Behavior at Initialization:**
- Reset sensors are COMPLETELY IGNORED during initialization
- Door position (open/closed) does NOT affect initial occupancy
- Only trigger sensor VALUES determine initial state

**Example Scenarios:**

| Scenario | Trigger1 (motion) | Trigger2 (motion) | Reset1 (door) | Initial Occupancy | Explanation |
|----------|-------------------|-------------------|---------------|-------------------|-------------|
| Initialization #1 | FALSE | FALSE | FALSE (closed) | OFF | No motion detected |
| Initialization #2 | TRUE | FALSE | FALSE (closed) | ON | Motion detected on sensor 1 |
| Initialization #3 | FALSE | FALSE | TRUE (open) | OFF | Door open ignored, no motion |
| Initialization #4 | TRUE | FALSE | TRUE (open) | ON | Door open ignored, motion detected |

## Runtime State Transitions

These rules apply during normal operation (event-driven monitoring):

| Current Occupancy | Sensor Type | Transition Detected | New Occupancy | Action Taken |
|-------------------|-------------|---------------------|---------------|--------------|
| ON (TRUE) | Reset sensor | FALSE → TRUE | OFF (FALSE) | Set alarm_occupancy = FALSE |
| OFF (FALSE) | Reset sensor | FALSE → TRUE | OFF (FALSE) | No change (already OFF) |
| ON (TRUE) | Trigger sensor | FALSE → TRUE | ON (TRUE) | No change (already ON) |
| OFF (FALSE) | Trigger sensor | FALSE → TRUE | ON (TRUE) | Set alarm_occupancy = TRUE |
| Any | Any sensor | TRUE → FALSE | No change | Falling edge ignored |
| Any | Any sensor | No transition | No change | Static state ignored |

**Priority Rules:**
1. Reset sensors have priority over trigger sensors (enforced via callback logic)
2. Both sensor types have dedicated event listeners
3. Edge detection happens immediately when WebSocket `$update` event fires
4. No polling delay - instant response to state changes

**Example Scenarios:**

| Scenario | Current Occupancy | Sensor Event | Transition | Result | Explanation |
|----------|-------------------|--------------|------------|---------|-------------|
| Motion detected | OFF | Motion sensor | FALSE → TRUE | Occupancy ON | Person enters room |
| Door opened | ON | Door contact | FALSE → TRUE | Occupancy OFF | Person exits room |
| Door closed | OFF | Door contact | TRUE → FALSE | No change | Falling edge ignored |
| Continuous motion | ON | Motion sensor | TRUE → TRUE | No change | Already occupied |
| Door already open | ON | Door contact | TRUE → TRUE | No change | Static state ignored |
| Simultaneous events | OFF | Motion + Door | Both FALSE → TRUE | Occupancy OFF | Reset priority wins |

## Edge Cases and Multi-Sensor Scenarios

### Multiple Trigger Sensors

**Behavior**: OR logic - ANY sensor detecting motion activates occupancy

| Scenario | Motion1 | Motion2 | Motion3 | Occupancy | Explanation |
|----------|---------|---------|---------|-----------|-------------|
| All inactive | FALSE | FALSE | FALSE | OFF | No motion anywhere |
| One active | TRUE | FALSE | FALSE | ON | Motion in one zone |
| Multiple active | TRUE | TRUE | FALSE | ON | Motion in multiple zones |
| All active | TRUE | TRUE | TRUE | ON | Motion everywhere |

**Implementation**: Loop continues through all trigger sensors even after first match

### Multiple Reset Sensors

**Behavior**: ANY reset sensor transition deactivates occupancy

| Scenario | Door1 | Door2 | Window1 | Occupancy | Explanation |
|----------|-------|-------|---------|-----------|-------------|
| All closed | FALSE | FALSE | FALSE | No change | No exit detected |
| One opens | FALSE → TRUE | FALSE | FALSE | OFF | Exit via door 1 |
| Multiple open | TRUE → TRUE | FALSE → TRUE | FALSE | OFF | First transition wins |

**Implementation**: Return immediately after first reset sensor transition detected

### Simultaneous Transitions

**Priority Order**: Reset sensors ALWAYS take precedence over trigger sensors

| Scenario | Reset Transition | Trigger Transition | Result | Explanation |
|----------|------------------|--------------------|---------|-------------|
| Door opens + Motion | FALSE → TRUE | FALSE → TRUE | Occupancy OFF | Reset wins |
| Door closes + Motion | TRUE → FALSE | FALSE → TRUE | Occupancy ON | Reset falling edge ignored |
| No reset + Motion | None | FALSE → TRUE | Occupancy ON | Normal trigger |

**Implementation**: Check reset sensors first, return early if transition detected

### Unreachable Sensors

**Behavior**: Graceful degradation with null checks

| Scenario | Sensor Status | Behavior | Occupancy Effect |
|----------|--------------|----------|------------------|
| Device offline | getSensorValue returns null | Skip sensor | No state change |
| Capability missing | hasCapability returns false | Log error, skip | No state change |
| Device deleted | getDevice returns null | Return null | No state change |

**Implementation**: Null checks at every sensor access point

### Race Conditions

**Mitigation**: Event-driven architecture with edge detection and state tracking

| Issue | Potential Problem | Solution |
|-------|-------------------|----------|
| Stale events | Old events arrive late | HomeyAPI WebSocket provides current state |
| Event order | Events arrive out of order | Edge detection based on last known value |
| Missed events | Event dropped by WebSocket | Device state auto-syncs via WebSocket connection |
| Duplicate events | Same event fires multiple times | Edge detection prevents repeats (lastValues map) |
| Simultaneous events | Multiple sensors trigger at once | Each sensor has independent listener with edge detection |

## Implementation Notes

### Initialization vs Runtime Differences

**Critical Distinction**: The state machine behaves DIFFERENTLY during initialization vs runtime.

#### Initialization Phase (onInit)

```typescript
async onInit(): Promise<void> {
  // Phase 1: Determine initial occupancy from CURRENT VALUES
  const triggerSensors = this.validateSensorSettings(
    this.getSetting('triggerSensors')
  );

  let initialOccupancy = false;

  for (const sensor of triggerSensors) {
    const currentValue = this.getSensorValue(sensor); // Read CURRENT value
    if (currentValue === true) {
      initialOccupancy = true;
      break; // Any TRUE sensor = occupied
    }
  }

  // Reset sensors are IGNORED here
  await this.setCapabilityValue('alarm_occupancy', initialOccupancy);

  // Phase 2: Start monitoring for TRANSITIONS
  this.setupSensorMonitoring();
}
```

**Why this design?**
- Door position doesn't indicate current occupancy
- Motion sensor VALUES reliably indicate current presence
- Reset sensors only matter when someone is ACTIVELY exiting

#### Runtime Phase (Event-Driven)

```typescript
private setupSensorListener(sensor: SensorConfig, isResetSensor: boolean): void {
  const device = this.deviceRefs.get(sensor.deviceId);

  // Create event handler for capability updates
  const handler = (capabilityUpdate: any) => {
    // Only respond to updates for the capability we're monitoring
    if (capabilityUpdate.capabilityId !== sensor.capability) {
      return;
    }

    const currentValue = capabilityUpdate.value;
    const key = this.getSensorKey(sensor);
    const lastValue = this.lastValues.get(key) ?? false;

    // Update stored value
    if (typeof currentValue === 'boolean') {
      this.lastValues.set(key, currentValue);
    }

    // Detect rising edge: FALSE → TRUE transition
    if (currentValue && !lastValue) {
      if (isResetSensor) {
        this.callbacks.onReset(); // Turn OFF occupancy
      } else {
        this.callbacks.onTriggered(); // Turn ON occupancy
      }
    }
  };

  // Register the event listener on WebSocket $update events
  device.on('$update', handler);
}
```

**Why this design?**
- Real-time response: WebSocket events trigger immediately when sensor state changes
- Prevents repeated triggers: Edge detection based on lastValues map
- Independent listeners: Each sensor has its own event handler
- Handles multiple sensors correctly: All listeners active simultaneously

### Edge Detection Algorithm

**Purpose**: Detect state changes, not static states

```typescript
// Store previous values
private lastValues: Map<string, boolean> = new Map();

// Detect rising edge
const currentValue = this.getSensorValue(sensor);
const lastValue = this.lastValues.get(sensor.deviceId) ?? false;

// Update stored value
this.lastValues.set(sensor.deviceId, currentValue ?? false);

// Trigger only on FALSE → TRUE transition
if (currentValue && !lastValue) {
  // Action!
}
```

**Why false as default?**
- Conservative approach: assume inactive until proven active
- Prevents spurious triggers on first read
- Handles null/undefined gracefully

### State Persistence

**Current Implementation**: State is NOT persisted across app restarts

```typescript
// On app restart:
async onInit(): Promise<void> {
  // State is recalculated from current sensor values
  const initialOccupancy = this.determineInitialOccupancy();
  await this.setCapabilityValue('alarm_occupancy', initialOccupancy);
}
```

**Rationale**:
- Fresh start ensures consistency with physical reality
- Eliminates stale state issues
- Simplifies debugging and testing

**Future Enhancement**: Could persist state if needed:
```typescript
const lastOccupancy = this.getStoreValue('occupancy');
if (lastOccupancy !== undefined) {
  await this.setCapabilityValue('alarm_occupancy', lastOccupancy);
}
```

### Callback Architecture

**Separation of Concerns**: SensorMonitor detects transitions, Device handles actions

```typescript
// In SensorMonitor.ts - Detection only
if (currentValue && !lastValue) {
  this.callbacks.onTriggered(); // Just notify
}

// In device.ts - Action handling
const callbacks: SensorCallbacks = {
  onTriggered: () => this.handleTriggered(),
  onReset: () => this.handleReset(),
};

private async handleTriggered(): Promise<void> {
  await this.setCapabilityValue('alarm_occupancy', true);
  this.log('Occupancy activated by trigger sensor');
}

private async handleReset(): Promise<void> {
  await this.setCapabilityValue('alarm_occupancy', false);
  this.log('Occupancy deactivated by reset sensor');
}
```

**Benefits**:
- Testable: Can mock callbacks easily
- Flexible: Can change action logic without touching detection
- Clean: Clear separation of concerns

## Testing Recommendations

### Unit Test Coverage

**Initialization Tests:**
```typescript
describe('Initial state determination', () => {
  it('should set occupancy OFF when no trigger sensors configured', async () => {
    // Test with empty trigger sensor array
  });

  it('should set occupancy OFF when all trigger sensors are FALSE', async () => {
    // Test with all motion sensors inactive
  });

  it('should set occupancy ON when any trigger sensor is TRUE', async () => {
    // Test with at least one motion sensor active
  });

  it('should ignore reset sensors during initialization', async () => {
    // Test that door position doesn't affect initial state
  });
});
```

**Runtime Transition Tests:**
```typescript
describe('Runtime state transitions', () => {
  it('should activate occupancy on trigger sensor transition', async () => {
    // Test FALSE → TRUE on motion sensor
  });

  it('should deactivate occupancy on reset sensor transition', async () => {
    // Test FALSE → TRUE on door sensor
  });

  it('should prioritize reset sensors over trigger sensors', async () => {
    // Test simultaneous transitions
  });

  it('should not trigger on falling edge', async () => {
    // Test TRUE → FALSE is ignored
  });

  it('should not trigger on static state', async () => {
    // Test TRUE → TRUE is ignored
  });
});
```

### Integration Test Scenarios

**Multi-Sensor Tests:**
- Multiple trigger sensors with different timing
- Multiple reset sensors with priority handling
- Simultaneous transitions across sensor types

**Edge Case Tests:**
- Unreachable devices (offline, deleted)
- Missing capabilities
- Null/undefined sensor values
- Rapid state changes (debouncing)

## Summary

**Key Takeaways:**

1. **Two-Phase Operation**: Initialization reads VALUES, runtime detects TRANSITIONS
2. **Reset Sensor Semantics**: Ignored at init, prioritized at runtime
3. **Edge Detection**: Only FALSE → TRUE transitions trigger actions
4. **Priority System**: Reset sensors always checked before trigger sensors
5. **Graceful Degradation**: Null checks and fallbacks throughout

**The "Wasp in a Box" Analogy:**
- Wasp enters when motion is detected (trigger sensor transition)
- Wasp remains active (occupancy stays ON)
- Wasp exits when door opens (reset sensor transition)
- Door position alone doesn't tell us if wasp is inside (reset sensors ignored at init)

This design ensures reliable, predictable occupancy detection that matches real-world behavior.
