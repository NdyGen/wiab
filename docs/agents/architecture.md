# WIAB Architecture Reference

## Multi-Device Architecture

The app contains **3 distinct device types**, each with unique monitoring patterns.

### 1. WIAB Device (`drivers/wiab-device/`)

**Purpose:** Virtual occupancy sensor with integrated room state tracking

**Pattern:** Event-driven sensor monitoring

**Core Logic:**
- **Trigger sensors** (motion) → activate occupancy on FALSE→TRUE edge
- **Reset sensors** (door contacts) → deactivate occupancy on FALSE→TRUE edge
- **Edge detection only** - static states are ignored
- **Priority** - reset sensors checked before trigger sensors
- **Room state tracking** - timer-based transitions:
  - idle → extended_idle
  - occupied → extended_occupied
- **Manual override mode** for room state control

**Metaphor:** Like a wasp in a box - stays active until it finds the exit.

**Initialization Behavior:**
- Read current trigger sensor values
- ANY trigger TRUE → occupancy ON
- ALL triggers FALSE → occupancy OFF
- Reset sensors IGNORED at init

**Runtime Behavior (every 2s poll):**
1. Check reset sensors for FALSE→TRUE → set occupancy OFF, exit
2. Check trigger sensors for FALSE→TRUE → set occupancy ON
3. All other states ignored (TRUE→FALSE, static states)

**Why This Design:**
- Door position is ambiguous; the ACT of opening indicates exit
- Motion sensors reliably indicate presence
- Edge detection prevents repeated triggers

### 2. Zone Seal Device (`drivers/wiab-zone-seal/`)

**Purpose:** Virtual zone integrity monitoring

**Pattern:** WebSocket-based real-time updates

**Core Logic:**
- Monitors contact sensors (doors, windows)
- State machine: SEALED, LEAKY, OPEN_DELAY, CLOSE_DELAY
- Configurable delay timers for state transitions
- **Fail-safe:** Stale sensors treated as leaky

**State Machine:**
```
SEALED → sensor opens → OPEN_DELAY (if configured) → LEAKY
LEAKY → all close → CLOSE_DELAY (if configured) → SEALED
```

**Delay Behavior:**
- `openDelaySeconds` - Grace period before zone marked leaky
- `closeDelaySeconds` - Debounce period before zone marked sealed
- Prevents false alerts from brief door openings

**Fail-Safe Logic:**
- If ALL sensors stale → treat as LEAKY (unknown state = unsafe)
- If ANY stale sensor's last value was "open" → keep LEAKY
- Better to alert unnecessarily than miss a real breach

### 3. Circuit Breaker Device (`drivers/wiab-circuit-breaker/`)

**Purpose:** Hierarchical device monitoring with battery tracking

**Pattern:** Polling + event hybrid

**Core Logic:**
- Monitors multiple devices hierarchically
- Battery state aggregation across devices
- Parent-child device relationships
- Fail-safe: Stale devices trigger warnings

## Shared Libraries

| Library | Purpose | Used By |
|---------|---------|---------|
| `SensorMonitor` | Polling engine (2s interval) with stale detection | WIAB Device, Circuit Breaker |
| `SensorStateAggregator` | Aggregates sensor states from multiple sources | All device types |
| `DeviceRegistry` | Device lookup and registration across app | All device types |
| `WIABStateEngine` | Pure room state machine (no I/O) | WIAB Device |
| `ErrorReporter` | Centralized error reporting with Sentry integration | All device types |
| `WarningManager` | User-facing warning system (displayed in Homey UI) | All device types |
| `RetryManager` | Exponential backoff retry logic | Zone Seal Device |
| `FlowCardErrorHandler` | Flow card error handling and validation | All device types |

## Key Files and Locations

```
app.ts                           # Minimal coordinator
drivers/
  wiab-device/                   # Occupancy sensor with room state
    device.ts                    # Main device implementation
    driver.ts                    # Driver configuration
  wiab-zone-seal/                # Zone integrity monitor
    device.ts                    # Main device implementation
    driver.ts                    # Driver configuration
  wiab-circuit-breaker/          # Device hierarchy monitor
    device.ts                    # Main device implementation
    driver.ts                    # Driver configuration
lib/
  types.ts                       # TypeScript interfaces and types
  SensorMonitor.ts               # Polling engine (2s interval)
  SensorStateAggregator.ts       # State aggregation logic
  DeviceRegistry.ts              # Device lookup service
  WIABStateEngine.ts             # Room state machine (pure TypeScript)
  ErrorReporter.ts               # Centralized error reporting
  WarningManager.ts              # User-facing warnings
  RetryManager.ts                # Exponential backoff retry
  FlowCardErrorHandler.ts        # Flow card error handling
.homeycompose/                   # Metadata (EDIT THESE, not app.json)
  app.json                       # App metadata
  capabilities/                  # Custom capability definitions
  flow/                          # Flow card definitions
    actions/                     # Action flow cards
    conditions/                  # Condition flow cards
    triggers/                    # Trigger flow cards
tests/                           # Jest tests
  setup.ts                       # Mock factories and test utilities
  drivers/                       # Driver-specific tests
    wiab-device/                 # WIAB device tests
    wiab-zone-seal/              # Zone seal tests
    wiab-circuit-breaker/        # Circuit breaker tests
  lib/                           # Library-specific tests
```

## State Machine Details

### WIAB Device State Machine

**States:**
- `idle` - No motion detected, short duration
- `extended_idle` - No motion detected, extended duration
- `occupied` - Motion detected, short duration
- `extended_occupied` - Motion detected, extended duration

**Transitions:**
- Trigger sensor FALSE→TRUE → `occupied`
- Reset sensor FALSE→TRUE → `idle`
- Timer expires in `idle` → `extended_idle`
- Timer expires in `occupied` → `extended_occupied`

### Zone Seal State Machine

**States:**
- `SEALED` - All contact sensors closed, zone is secure
- `LEAKY` - One or more sensors open, zone is NOT secure
- `OPEN_DELAY` - Sensor opened, waiting for delay before marking leaky
- `CLOSE_DELAY` - All sensors closed, waiting for delay before marking sealed

**Transitions:**
```
SEALED:
  - Any sensor opens → OPEN_DELAY (if openDelaySeconds > 0) OR LEAKY (if openDelaySeconds = 0)
  
OPEN_DELAY:
  - Delay expires → LEAKY
  - All sensors close → SEALED (cancels delay)
  
LEAKY:
  - All sensors close → CLOSE_DELAY (if closeDelaySeconds > 0) OR SEALED (if closeDelaySeconds = 0)
  
CLOSE_DELAY:
  - Delay expires → SEALED
  - Any sensor opens → LEAKY (cancels delay)
```

## TypeScript Interfaces

### Core Types

```typescript
interface SensorConfig {
  deviceId: string;
  deviceName?: string;
  capability: string;
  deviceClass?: string;
}

interface SensorStaleInfo {
  lastUpdated: number;  // Timestamp of last update
  isStale: boolean;     // Whether sensor is stale
  lastValue: boolean;   // Last known value
}

interface StateTransition {
  newState: string;
  reason: string;
  timestamp: number;
}
```

### Error Types

```typescript
enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

enum ErrorCategory {
  PERMANENT = 'permanent',   // No retry
  TRANSIENT = 'transient',   // Retry with backoff
  TIMEOUT = 'timeout',       // Retry with backoff
}
```

## Device Lifecycle

All devices must implement:

```typescript
class Device {
  async onInit(): Promise<void> {
    // Setup monitoring, initialize state
  }

  async onSettings(settings: {
    oldSettings: object;
    newSettings: object;
    changedKeys: string[];
  }): Promise<void> {
    // Recreate monitor on config change
  }

  async onDeleted(): Promise<void> {
    // Stop monitor, clear intervals, cleanup resources
    // CRITICAL: Always implement to prevent memory leaks
  }
}
```
