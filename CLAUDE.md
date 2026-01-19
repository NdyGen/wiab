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
7. **Use /wiab-dev for all coding tasks** - The `/wiab-dev` command enforces all guidelines and prevents anti-patterns

---

## Development Workflow

### Default Agent for Coding Tasks

**CRITICAL: Always use the `/wiab-dev` command for all coding tasks.**

The `/wiab-dev` custom command is the specialized WIAB development agent that:
- Internalizes all 500+ lines of CLAUDE.md guidelines
- Prevents anti-patterns proactively (setTimeout errors, missing coverage, etc.)
- Enforces error handling patterns (ErrorReporter + WarningManager)
- Enforces fail-safe behavior for stale sensor detection
- Maintains 70% test coverage requirement
- Validates conventional commit format
- Runs all checks before completion

**Usage:**
```bash
/wiab-dev add battery monitoring to circuit breaker
/wiab-dev fix stale sensor detection in zone seal
/wiab-dev refactor error handling in room state device
/wiab-dev add integration tests for delayed state transitions
```

**When NOT to use /wiab-dev:**
- Pure research/exploration tasks (use search/read tools directly)
- Git operations (use git commands directly)
- Documentation-only changes (edit directly)

**For all other coding tasks, use /wiab-dev.**

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

### Branch Protection Rules

**The `main` branch is protected with the following rules:**

| Rule | Enforced | Effect |
|------|----------|--------|
| Require pull request before merging | ✅ Yes | Cannot push directly to main |
| Require status checks to pass | ✅ Yes | CI must pass (build, lint, test, coverage, validate) |
| Require branches to be up to date | ✅ Yes | Must merge latest main before PR merge |
| Require conversation resolution | ✅ Yes | All PR comments must be resolved |
| Do not allow bypassing | ✅ Yes | Administrators cannot override these rules |
| Require approvals | ❌ No | Solo developer can merge own PRs |

**What this means:**
- ❌ **Direct pushes to main are blocked** - All changes must go through PRs
- ❌ **Cannot bypass CI checks** - All tests, linting, coverage must pass
- ❌ **Cannot force push or delete main** - Branch is fully protected
- ✅ **Can merge own PRs** - No external approval needed for solo development
- ✅ **Branch protection applies to everyone** - Including repository administrators

**If you try to push directly to main:**
```bash
git push origin main
# Error: GH006: Protected branch update failed for refs/heads/main.
# Required status check "build" is expected.
```

Always use feature branches and PRs, even for small fixes.

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

WIAB (Wasp in a Box) creates virtual sensors by aggregating physical sensors across three device types.

### Multi-Device Architecture

The app contains **3 distinct device types**, each with unique monitoring patterns:

#### 1. WIAB Device (`drivers/wiab-device/`)
**Purpose:** Virtual occupancy sensor with integrated room state tracking
**Pattern:** Event-driven sensor monitoring
**Core Logic:**
- **Trigger sensors** (motion) → activate occupancy on FALSE→TRUE
- **Reset sensors** (door contacts) → deactivate occupancy on FALSE→TRUE
- Edge detection - only state changes trigger actions
- Priority - reset sensors checked before trigger sensors
- **Room state tracking** - timer-based transitions (idle → extended_idle, occupied → extended_occupied)
- Manual override mode for room state control

**Metaphor:** Like a wasp in a box - active until it finds the exit.

#### 2. Zone Seal Device (`drivers/wiab-zone-seal/`)
**Purpose:** Virtual zone integrity monitoring
**Pattern:** WebSocket-based real-time updates
**Core Logic:**
- Monitors contact sensors (doors, windows)
- State machine: SEALED, LEAKY, OPEN_DELAY, CLOSE_DELAY
- Configurable delay timers for state transitions
- Fail-safe: stale sensors treated as leaky

#### 3. Circuit Breaker Device (`drivers/wiab-circuit-breaker/`)
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
  wiab-device/                   # Occupancy sensor with room state
  wiab-zone-seal/                # Zone integrity monitor
  wiab-circuit-breaker/          # Device hierarchy monitor
lib/
  types.ts                       # TypeScript interfaces
  SensorMonitor.ts               # Polling engine (2s interval)
  SensorStateAggregator.ts       # State aggregation
  DeviceRegistry.ts              # Device lookup
  WIABStateEngine.ts             # Room state machine (pure TypeScript)
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
| `WIABStateEngine` | Pure room state machine | WIAB |
| `ErrorReporter` | Sentry integration, error tracking | All device types |
| `WarningManager` | User-facing warnings | All device types |
| `RetryManager` | Exponential backoff retry | Zone Seal |
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

- **Zone Seal:** Stale sensors with last value "open" → zone is LEAKY (not sealed)
- **WIAB:** All stale sensors → tri-state UNKNOWN, boolean UNOCCUPIED (fail-safe)
- **Circuit Breaker:** Stale devices → warning triggered

**Rationale:** Unknown state should trigger alerts rather than false sense of security.

**Priority Order for Fail-Safe Checks:**

When evaluating state with potentially stale data, check fail-safe conditions in this order:

1. **Check individual stale sensor last values FIRST** (highest priority)
2. Check if all sensors are stale
3. Evaluate non-stale sensors normally

Example (Zone Seal with Issue #109 fix):
```typescript
// PRIORITY 1: Check if ANY stale sensor's last value was "open"
const staleSensorsOpen = this.contactSensors.filter((sensor) => {
  const info = this.staleSensorMap.get(sensor.deviceId);
  if (!info || !info.isStale) return false;

  const lastValue = this.aggregator?.getSensorState(sensor.deviceId);
  return lastValue === true;  // Last known value was "open"
});

if (staleSensorsOpen.length > 0) {
  // Fail-safe: Stale sensor was open → keep zone leaky
  const sensorNames = staleSensorsOpen.map(s => s.deviceName || s.deviceId).join(', ');
  this.log(`Fail-safe: ${staleSensorsOpen.length} stale sensor(s) were open (${sensorNames}), treating zone as leaky`);
  const transition = this.engine.handleAnySensorOpened();
  await this.processStateTransition(transition);
  return;
}

// PRIORITY 2: Check if all sensors are stale
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

// PRIORITY 3: Normal evaluation of non-stale sensors
const allClosed = this.areNonStaleSensorsClosed();
const anyOpen = this.isAnyNonStaleSensorOpen();
// ... continue with normal logic
```

**Key Principle:** Stale sensors with last value indicating "unsafe" state (open, motion, etc.) must prevent the system from reporting a "safe" state (sealed, unoccupied, etc.), even if other fresh sensors indicate safety.

### Immediate Re-evaluation on Staleness

**CRITICAL:** When sensors become stale, trigger immediate state re-evaluation:

```typescript
private checkForStaleSensors(): void {
  const now = Date.now();
  let hasChanges = false;

  for (const sensor of this.contactSensors) {
    const info = this.staleSensorMap.get(sensor.deviceId);
    if (!info) continue;

    const timeSinceUpdate = now - info.lastUpdated;
    const shouldBeStale = timeSinceUpdate > this.staleTimeoutMs;

    if (shouldBeStale && !info.isStale) {
      info.isStale = true;
      hasChanges = true;

      // Enhanced logging for production debugging
      const currentValue = this.aggregator?.getSensorState(sensor.deviceId);
      this.log(`Sensor became stale: ${sensor.deviceName || sensor.deviceId} (last value: ${currentValue}, stale for: ${Math.round(timeSinceUpdate / 60000)}min)`);

      void this.triggerSensorBecameStale(sensor.deviceName || sensor.deviceId, sensor.deviceId);
    }
  }

  if (hasChanges) {
    this.checkForStaleStateChanged();

    // CRITICAL: Trigger immediate re-evaluation
    // Don't wait for next sensor event to apply fail-safe
    void this.handleSensorUpdate();
  }
}
```

**Why:** Waiting for the next sensor event to apply fail-safe behavior could leave the device in an incorrect state for extended periods.

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

### Async Fire-and-Forget Pattern

When calling async methods that should execute independently without blocking the caller, use the `void` keyword to explicitly mark them as fire-and-forget.

**When to use fire-and-forget (`void asyncMethod()`):**
- Event handlers and callbacks (sensor updates, listeners)
- Background operations that don't affect control flow
- Operations where the caller doesn't need to wait for completion
- Non-critical operations that have their own error handling

**When to use `await asyncMethod()`:**
- Initialization sequences where order matters
- Critical path operations where errors must propagate
- Operations whose results are needed for subsequent logic
- State updates that must complete before continuing

**Examples:**

```typescript
// ✅ GOOD - Fire-and-forget for event handler
private registerDeviceListener(device: HomeyAPIDevice, sensor: SensorConfig): void {
  const handler = (value: boolean) => {
    this.updateStaleSensorTracking(sensor.deviceId);
    this.aggregator?.updateSensorState(sensor.deviceId, value);

    // Fire-and-forget: event handler doesn't need to wait
    void this.handleSensorUpdate();
  };

  device.makeCapabilityInstance(sensor.capability, handler);
}

// ✅ GOOD - Fire-and-forget for background operation
private checkForStaleSensors(): void {
  if (hasChanges) {
    this.checkForStaleStateChanged();

    // Trigger re-evaluation without blocking stale check
    void this.handleSensorUpdate();
  }
}

// ✅ GOOD - Await for initialization (order matters)
async onInit(): Promise<void> {
  this.initializeErrorHandling();

  try {
    await this.loadSensorConfiguration();  // Must complete first
    await this.initializeState();          // Depends on config
    await this.setupMonitoring();          // Depends on state
  } catch (error) {
    await this.handleInitializationError(error);
  }
}

// ❌ BAD - Missing void (causes unhandled promise warnings)
private registerListener(): void {
  const handler = (value: boolean) => {
    this.handleUpdate();  // Should be: void this.handleUpdate()
  };
}

// ❌ BAD - Using await when fire-and-forget is appropriate
private checkSensors(): void {
  if (hasChanges) {
    await this.handleUpdate();  // Blocks unnecessarily, changes return type
  }
}
```

**Why this matters:**
- Prevents "floating promise" warnings from linters
- Makes intent explicit (fire-and-forget vs. sequential)
- Avoids blocking operations unnecessarily
- Documents async control flow for maintainers

**Key Principle:** Use `void` for async calls that should execute independently; use `await` when order, results, or error propagation matter.

### Production Debugging Logging

When logging state decisions, include context that helps diagnose issues in production:

**Good - Actionable Logs:**
```typescript
// Shows WHY decision was made and what data led to it
this.log(`Sensor update: allClosed=${allClosed}, anyOpen=${anyOpen} (evaluating ${nonStaleSensorCount}/${this.contactSensors.length} non-stale sensors)`);

this.log(`Fail-safe: ${staleSensorsOpen.length} stale sensor(s) were open (${sensorNames}), treating zone as leaky`);

this.log(`Sensor became stale: ${sensorName} (last value: ${currentValue}, stale for: ${duration}min)`);
```

**Bad - Vague Logs:**
```typescript
this.log('Sensor update');  // No context
this.log('Zone is leaky');  // Doesn't explain why
this.log('Sensor stale');   // Which sensor? For how long?
```

**Pattern:** Include counts, names, durations, and reasoning in logs to make production debugging possible without code access.

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

#### Integration Tests for Timeout-Based Detection

For testing stale detection via actual timeouts (not just direct state manipulation):

```typescript
it('should detect stale sensor via timeout and apply fail-safe', async () => {
  // Arrange - Setup device with 30-minute stale timeout
  await setupDeviceWithSensors(30);

  // Open sensor (window opens)
  const callback = capabilityCallbacks.get('sensor1')!;
  callback(true);
  await Promise.resolve();

  // Verify zone is LEAKY
  expect((device as any).engine.getCurrentState()).toBe('leaky');

  jest.clearAllMocks();

  // Act - Advance time by 31 minutes (past stale threshold)
  jest.setSystemTime(Date.now() + 31 * 60 * 1000);
  jest.advanceTimersByTime(60000);  // Trigger stale check interval
  await Promise.resolve();

  // Assert - Sensor marked stale, zone remains LEAKY (fail-safe)
  const staleSensorMap = (device as any).staleSensorMap;
  expect(staleSensorMap.get('sensor1').isStale).toBe(true);
  expect((device as any).engine.getCurrentState()).toBe('leaky');
  expect(device.log).toHaveBeenCalledWith(
    expect.stringContaining('stale sensor(s) were open')
  );
  expect(device.log).toHaveBeenCalledWith(
    expect.stringContaining('treating zone as leaky')
  );
});
```

**Key Techniques:**
- Use `jest.setSystemTime()` to advance system clock for timeout detection
- Use `jest.advanceTimersByTime()` to trigger interval-based checks
- Combine both for integration testing of time-based behavior
- Clear mocks before time advancement to isolate timeout-triggered logs

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
