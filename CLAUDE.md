# WIAB Development Guidelines

## Critical Rules

**MUST follow these rules. Violations are unacceptable.**

1. **No AI references** - Never mention Claude, AI, or code generation in code, comments, commits, PRs, or issues
2. **Conventional commits** - All commits/PR titles: `<type>: <lowercase imperative description>`
   - Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
   - Example: `feat: add sensor timeout configuration`
3. **All checks must pass before PR** - `npm run build && npm run lint && npm test && npm run test:coverage && npm run validate`
4. **70% test coverage minimum** - Enforced by Jest; PR will fail if coverage drops
5. **Use Homey Compose** - Edit `.homeycompose/` files, never edit generated `app.json`
6. **Clean up resources** - Always implement `onDeleted()` to stop monitors and clear intervals

---

## Quick Reference

### Commands
```bash
npm run build          # Compile TypeScript
npm run lint           # Check code style (--fix for auto-fix)
npm test               # Run tests
npm run test:coverage  # Run tests + coverage report
npm run validate       # Validate Homey app structure
homey app run          # Test locally on Homey
```

### Pre-Commit Checklist
```bash
npm run build && npm run lint && npm test && npm run test:coverage && npm run validate
```

All must pass. No exceptions.

---

## Git Workflow

### Branch Model: GitHub Flow
- **`main`** - Production-ready, protected, all PRs target here
- **`feature/*`** - Feature branches, created from main, deleted after merge

### Creating a Feature Branch

**From main worktree:**
```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

**Using worktree (for parallel development):**
```bash
git worktree add ../wiab-feature-name -b feature/your-feature-name main
cd ../wiab-feature-name
npm install
```

### Committing Changes
```bash
git add .
git commit -m "feat: description in lowercase imperative"
git push -u origin feature/your-feature-name
```

### Creating a Pull Request

**CRITICAL: Follow this exact procedure.**

1. Ensure all checks pass locally:
   ```bash
   npm run build && npm run lint && npm test && npm run test:coverage && npm run validate
   ```

2. Push branch if not already pushed:
   ```bash
   git push -u origin feature/your-feature-name
   ```

3. Create PR with `gh`:
   ```bash
   gh pr create --base main --title "feat: your feature description" --body "## Summary
   - What this PR does

   ## Test Plan
   - How to verify"
   ```

4. **PR title MUST be valid conventional commit** - CI validates this

### After PR is Merged

**Standard branch:**
```bash
git checkout main
git pull origin main
git branch -d feature/your-feature-name
```

**Worktree:**
```bash
cd /Users/andy/projects/ndygen/wiab
git worktree remove ../wiab-feature-name
git branch -d feature/your-feature-name
```

---

## Worktrees for Parallel Development

Use worktrees when multiple features need simultaneous development.

### Rules
- One branch per worktree (cannot checkout same branch twice)
- Each worktree needs its own `npm install`
- Clean up worktrees after PR merge
- Main worktree stays on `main` branch

### Commands
| Action | Command |
|--------|---------|
| Create | `git worktree add ../wiab-feature-x -b feature/x main` |
| List | `git worktree list` |
| Remove | `git worktree remove ../wiab-feature-x` |
| Prune orphans | `git worktree prune` |

### Workflow
```bash
# 1. Create worktree
git worktree add ../wiab-feature-x -b feature/x main

# 2. Setup
cd ../wiab-feature-x
npm install

# 3. Develop, commit, push
git add . && git commit -m "feat: x" && git push -u origin feature/x

# 4. Create PR
gh pr create --base main --title "feat: x" --body "..."

# 5. After merge, cleanup
cd /Users/andy/projects/ndygen/wiab
git worktree remove ../wiab-feature-x
```

### Troubleshooting
- **"branch already checked out"** → Find with `git worktree list`, use that worktree or remove it
- **Orphaned worktree** → `git worktree prune` then `rm -rf ../broken-worktree`

---

## CI/CD Pipeline

Runs on every push/PR to `main`.

### Pipeline Steps
1. Build TypeScript
2. Lint code
3. Run tests with coverage
4. Validate Homey app
5. Validate PR title (conventional commit format)

### Fixing Failures
```bash
# Check which step failed, fix locally, then:
npm run build && npm run lint && npm test && npm run validate
git add . && git commit -m "fix: resolve CI failures" && git push
```

### Release Process
Releases are tag-based:
```bash
git checkout main && git pull
git tag v1.0.4
git push origin v1.0.4
# GitHub Actions handles the rest
```

---

## Project Overview

WIAB (Wasp in a Box) creates virtual sensors by aggregating physical sensors across four device types.

### Multi-Device Architecture

The app contains **4 distinct device types**, each with unique monitoring patterns:

#### 1. WIAB Device (`drivers/wiab-device/`)
**Purpose:** Virtual occupancy sensor
**Pattern:** Polling-based (2s interval)
**Core Logic:**
- **Trigger sensors** (motion) → activate occupancy on FALSE→TRUE
- **Reset sensors** (door contacts) → deactivate occupancy on FALSE→TRUE
- Edge detection - only state changes trigger actions
- Priority - reset sensors checked before trigger sensors

**Metaphor:** Like a wasp in a box - active until it finds the exit.

#### 2. Room State Device (`drivers/wiab-room-state/`)
**Purpose:** Virtual room state tracking
**Pattern:** Event-driven via listeners
**Core Logic:**
- Aggregates multiple sensor types (motion, contact, etc.)
- State machine with multiple states
- Real-time updates via device capability listeners

#### 3. Zone Seal Device (`drivers/wiab-zone-seal/`)
**Purpose:** Virtual zone integrity monitoring
**Pattern:** WebSocket-based real-time updates
**Core Logic:**
- Monitors contact sensors (doors, windows)
- State machine: SEALED, LEAKY, OPEN_DELAY, CLOSE_DELAY
- Configurable delay timers for state transitions
- Fail-safe: stale sensors treated as leaky

#### 4. Circuit Breaker Device (`drivers/wiab-circuit-breaker/`)
**Purpose:** Hierarchical device monitoring with battery tracking
**Pattern:** Polling + event hybrid
**Core Logic:**
- Monitors multiple devices hierarchically
- Battery state aggregation
- Parent-child device relationships

### Directory Structure
```
app.ts                           # Minimal coordinator
drivers/
  wiab-device/                   # Occupancy sensor
  wiab-room-state/               # Room state tracker
  wiab-zone-seal/                # Zone integrity monitor
  wiab-circuit-breaker/          # Device hierarchy monitor
lib/
  types.ts                       # TypeScript interfaces
  SensorMonitor.ts               # Polling engine (2s interval)
  SensorStateAggregator.ts       # State aggregation
  DeviceRegistry.ts              # Device lookup
  ErrorReporter.ts               # Centralized error reporting
  WarningManager.ts              # User-facing warnings
  RetryManager.ts                # Exponential backoff retry
  FlowCardErrorHandler.ts        # Flow card error handling
.homeycompose/                   # Metadata (edit these, not app.json)
tests/                           # Jest tests
```

### Shared Libraries

Several libraries power multiple device types:

| Library | Purpose | Used By |
|---------|---------|---------|
| `SensorMonitor` | Polling engine with stale detection | WIAB, Circuit Breaker |
| `SensorStateAggregator` | Aggregates sensor states | All device types |
| `DeviceRegistry` | Device lookup across app | All device types |
| `ErrorReporter` | Sentry integration, error tracking | All device types |
| `WarningManager` | User-facing warnings | All device types |
| `RetryManager` | Exponential backoff retry | Zone Seal, Room State |
| `FlowCardErrorHandler` | Flow card error handling | All device types |

---

## Error Handling Architecture

The app uses a sophisticated error handling system.

### Components

#### ErrorReporter (`lib/ErrorReporter.ts`)
Centralized error reporting with Sentry integration:

```typescript
this.errorReporter!.reportError({
  errorId: ErrorId.SPECIFIC_ERROR,
  severity: ErrorSeverity.HIGH,
  userMessage: 'User-facing message for Homey UI',
  technicalMessage: 'Technical details for Sentry',
  context: {
    deviceId: this.getData().id,
    // Additional debugging context
  },
});
```

#### WarningManager (`lib/WarningManager.ts`)
User-facing warning system displayed in Homey UI:

```typescript
await this.warningManager!.setWarning(
  ErrorId.SPECIFIC_WARNING,
  'User-visible warning message'
);

await this.warningManager!.clearWarning(ErrorId.SPECIFIC_WARNING);
```

#### Error Classification

Errors are classified for retry logic:

- **PERMANENT** - No retry (configuration errors, invalid device IDs)
- **TRANSIENT** - Retry with backoff (network errors, temporary unavailability)
- **TIMEOUT** - Retry with backoff (request timeouts)

### Standard Error Handling Pattern

```typescript
try {
  // Operation
} catch (error) {
  this.errorReporter!.reportError({
    errorId: ErrorId.OPERATION_FAILED,
    severity: ErrorSeverity.HIGH,
    userMessage: 'Operation failed. Device may not respond.',
    technicalMessage: `Failed to execute operation: ${error instanceof Error ? error.message : 'Unknown error'}`,
    context: {
      deviceId: this.getData().id,
      operationName: 'operation',
    },
  });

  // Optional: Set user warning
  try {
    await this.warningManager!.setWarning(
      ErrorId.OPERATION_FAILED,
      'Operation failed. Check device settings.'
    );
  } catch (warningError) {
    this.error('Failed to set warning:', warningError);
  }
}
```

### Nested Try-Catch Pattern

Prevent error-on-error when setting warnings:

```typescript
} catch (error) {
  this.errorReporter!.reportError({...});

  try {
    await this.warningManager!.setWarning(...);
  } catch (warningError) {
    // Fallback: just log, don't throw
    this.error('Failed to set warning:', warningError);
  }
}
```

---

## Stale Sensor Detection

Multiple device types implement stale sensor detection for fail-safe behavior.

### Mechanism

Track when sensors last reported data:

```typescript
private staleSensorMap: Map<string, SensorStaleInfo> = new Map();

interface SensorStaleInfo {
  lastUpdate: number;      // Timestamp of last update
  isStale: boolean;        // Whether sensor is stale
  lastValue: boolean;      // Last known value
}
```

### Detection Logic

```typescript
const now = Date.now();
const staleThreshold = this.settings.staleTimeoutMinutes * 60 * 1000;

for (const sensor of this.sensors) {
  const info = this.staleSensorMap.get(sensor.deviceId);
  const timeSinceUpdate = now - info.lastUpdate;

  if (timeSinceUpdate > staleThreshold) {
    info.isStale = true;
    this.log(`Sensor ${sensor.deviceName} is stale (${Math.round(timeSinceUpdate / 60000)}min since update)`);
  }
}
```

### Fail-Safe Behavior

**CRITICAL:** When sensors become stale, treat as unsafe state:

- **Zone Seal:** All stale sensors → zone is LEAKY (not sealed)
- **WIAB:** All stale sensors → occupancy UNCERTAIN
- **Circuit Breaker:** Stale devices → warning triggered

**Rationale:** Unknown state should trigger alerts rather than false sense of security.

Example (Zone Seal):
```typescript
const nonStaleCount = this.contactSensors.filter(sensor => {
  const info = this.staleSensorMap.get(sensor.deviceId);
  return info && !info.isStale;
}).length;

if (nonStaleCount === 0) {
  // All sensors stale - FAIL-SAFE: treat as leaky
  this.log('All sensors are stale, treating zone as leaky (fail-safe)');
  const transition = this.engine.handleAnySensorOpened();
  await this.processStateTransition(transition);
  return;
}
```

---

## State Machines

### WIAB Device State Machine

**Initialization:**
- Read current trigger sensor values
- ANY trigger TRUE → occupancy ON
- ALL triggers FALSE → occupancy OFF
- Reset sensors IGNORED at init

**Runtime (every 2s poll):**
1. Check reset sensors for FALSE→TRUE → set occupancy OFF, exit
2. Check trigger sensors for FALSE→TRUE → set occupancy ON
3. All other states ignored (TRUE→FALSE, static states)

**Why This Design:**
- Door position is ambiguous; the ACT of opening indicates exit
- Motion sensors reliably indicate presence
- Edge detection prevents repeated triggers

### Zone Seal Device State Machine

**States:**
- **SEALED** - All contact sensors closed, zone is secure
- **LEAKY** - One or more sensors open, zone is not secure
- **OPEN_DELAY** - Sensor opened, waiting for delay before marking leaky
- **CLOSE_DELAY** - All sensors closed, waiting for delay before marking sealed

**Transitions:**
```
SEALED → sensor opens → OPEN_DELAY (if delay configured) → LEAKY
LEAKY → all close → CLOSE_DELAY (if delay configured) → SEALED
```

**Delay Behavior:**
- `openDelaySeconds` - Grace period before zone marked leaky
- `closeDelaySeconds` - Debounce period before zone marked sealed
- Delays prevent false alerts from brief door openings

**Fail-Safe:**
- If ALL sensors stale → treat as LEAKY (unknown state = unsafe)
- Better to alert unnecessarily than miss a real breach

---

## Coding Standards

### TypeScript
- Strict mode enabled
- Explicit types for public interfaces
- Use `unknown` over `any`
- Prefer interfaces over type aliases

### Error Handling
- Fail gracefully, never crash
- Log errors with context: `this.error(\`Failed for ${id}:\`, error)`
- Return safe defaults (empty arrays, null) on validation failure

### Naming
- Classes/Interfaces: `PascalCase`
- Methods/Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`

### Device Lifecycle
Always implement:
- `onInit()` - Setup monitoring
- `onSettings()` - Recreate monitor on config change
- `onDeleted()` - Stop monitor, clear intervals, cleanup

---

## Testing

### Philosophy
- 70% coverage minimum (enforced)
- Test business logic, not framework
- Mock Homey SDK
- AAA pattern: Arrange-Act-Assert
- Unit tests for isolated logic, integration tests for full flows

### Mock Factories (`tests/setup.ts`)

The test suite provides mock factories to simplify test setup:

```typescript
// Create mock Homey instance with all SDK methods
const mockHomey = createMockHomey();

// Create mock device with specific capabilities
const mockDevice = createMockDevice({
  id: 'device-123',
  name: 'Test Device',
  capabilities: ['alarm_motion', 'alarm_contact'],
});

// Create mock Homey API for device queries
const mockApi = createMockHomeyApi({
  devices: [mockDevice1, mockDevice2],
});
```

### Testing Patterns

#### Setup and Teardown
```typescript
describe('DeviceName', () => {
  let device: WIABZoneSealDevice;
  let mockHomey: any;

  beforeEach(() => {
    jest.useFakeTimers();  // Control time for polling tests
    mockHomey = createMockHomey();
    device = new WIABZoneSealDevice();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });
});
```

#### AAA Pattern
```typescript
it('should mark zone as leaky when sensor opens', async () => {
  // Arrange: Setup device with closed sensors
  await device.onInit();
  await device.setCapabilityValue('alarm_contact', false);

  // Act: Open sensor
  await device.setCapabilityValue('alarm_contact', true);
  await device.handleSensorUpdate();

  // Assert: Zone is leaky
  expect(device.getCapabilityValue('alarm_zone_leaky')).toBe(true);
});
```

#### Jest Fake Timers
```typescript
it('should poll sensors every 2 seconds', async () => {
  await device.onInit();

  // Fast-forward 2 seconds
  jest.advanceTimersByTime(2000);

  expect(device.handleSensorUpdate).toHaveBeenCalledTimes(1);

  // Fast-forward another 2 seconds
  jest.advanceTimersByTime(2000);

  expect(device.handleSensorUpdate).toHaveBeenCalledTimes(2);
});
```

#### Direct State Manipulation (Unit Tests)
For testing specific logic without complex setup:

```typescript
it('should treat zone as leaky when all sensors stale', async () => {
  await device.onInit();

  // Directly manipulate internal state
  const staleSensorMap = (device as any).staleSensorMap;
  staleSensorMap.get('sensor1').isStale = true;
  staleSensorMap.get('sensor2').isStale = true;

  // Test logic directly
  await (device as any).handleSensorUpdate();

  expect(device.getCapabilityValue('alarm_zone_leaky')).toBe(true);
});
```

#### Integration Style Tests
For testing full flows with timer-based detection:

```typescript
it('should detect stale sensors after timeout', async () => {
  const staleTimeoutMinutes = 30;
  await device.updateSettings({ staleTimeoutMinutes });
  await device.onInit();

  // Sensors update initially
  await device.updateSensor('sensor1', false);

  // Fast-forward past stale threshold
  jest.advanceTimersByTime((staleTimeoutMinutes + 1) * 60 * 1000);

  // Next poll should detect stale
  await device.poll();

  expect(device.log).toHaveBeenCalledWith(
    expect.stringContaining('sensor1 is stale')
  );
});
```

### What to Test
- State transitions and state machine logic
- Error handling and error reporter calls
- Edge cases (empty arrays, null, invalid input, all stale sensors)
- Callback invocations
- Fail-safe behavior
- Timer-based logic (with fake timers)

### What NOT to Test
- Homey SDK internals
- Timer precision (use `jest.useFakeTimers` to control time)
- Network calls (mock API responses)
- External dependencies (mock them)

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Memory leaks | Implement `onDeleted()`, clear intervals |
| Events unreliable | Use polling with edge detection |
| Crashes on bad JSON | Validate input, return safe defaults |
| Blocking main thread | Use async/await |
| Log spam | Log state changes and errors only |
| Hardcoded device IDs | Use settings/configuration |
| **Async setTimeout without error handling** | **CRITICAL: Always wrap setTimeout async callbacks in try-catch** |

### CRITICAL: setTimeout Anti-Pattern

**❌ BAD - Silent failures:**
```typescript
setTimeout(async () => {
  await this.updateState(targetState);  // Can throw unhandled promise rejection
}, delaySeconds * 1000);
```

**Problems:**
- Unhandled promise rejection if `updateState()` throws
- Device deletion during delay causes crash
- No error reporting to user or Sentry
- State desynchronization with no logging

**✅ GOOD - Proper error handling:**
```typescript
setTimeout(async () => {
  try {
    // Validate device still initialized
    if (!this.engine || !this.errorReporter) {
      this.log(`Timer cancelled: device deinitialized`);
      return;
    }

    this.log(`Delay timer expired, transitioning to ${targetState}`);
    await this.updateState(targetState);
  } catch (error) {
    // CRITICAL: Prevent unhandled rejection
    if (!this.errorReporter) {
      this.error(`Delayed transition failed (device likely deleted):`, error);
      return;
    }

    this.errorReporter.reportError({
      errorId: ErrorId.DELAYED_TRANSITION_FAILED,
      severity: ErrorSeverity.HIGH,
      userMessage: 'Delayed state transition failed. Device may be out of sync.',
      technicalMessage: `Failed to transition to ${targetState}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      context: {
        deviceId: this.getData().id,
        targetState,
        delaySeconds,
      },
    });
  }
}, delaySeconds * 1000);
```

**Why this matters:**
- Affects ALL delayed state transitions
- Device deletion during delay is common (user removes device, timer still fires)
- Unhandled rejections can crash the entire Homey app
- Violates "fail gracefully, never crash" principle

---

## Links

### Homey SDK
- [SDK v3 Docs](https://apps-sdk-v3.developer.homey.app/)
- [Device](https://apps-sdk-v3.developer.homey.app/Device.html) | [Driver](https://apps-sdk-v3.developer.homey.app/Driver.html) | [App](https://apps-sdk-v3.developer.homey.app/App.html)
- [Compose](https://apps.developer.homey.app/homey-compose)

### Development
- [CLI Getting Started](https://apps.developer.homey.app/the-basics/getting-started)
- [Debugging](https://apps.developer.homey.app/the-basics/debugging)
- [Publishing](https://apps.developer.homey.app/the-basics/publishing)
