# Code Patterns and Anti-Patterns

## Error Handling Patterns

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

  // Optional: Set user warning (use nested try-catch)
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

  // Nested try-catch for warning
  try {
    await this.warningManager!.setWarning(...);
  } catch (warningError) {
    // Fallback: just log, don't throw
    this.error('Failed to set warning:', warningError);
  }
}
```

### Error Classification

```typescript
enum ErrorCategory {
  PERMANENT = 'permanent',   // No retry (config errors, invalid IDs)
  TRANSIENT = 'transient',   // Retry with backoff (network errors)
  TIMEOUT = 'timeout',       // Retry with backoff (request timeouts)
}
```

## Stale Sensor Detection (CRITICAL Pattern)

### Fail-Safe Priority Order

When evaluating state with potentially stale data, check in this order:

**1. Check individual stale sensor last values FIRST (highest priority)**
- If ANY stale sensor's last value was "unsafe" (open, motion, etc.) → FAIL-SAFE
- Example: Stale sensor was "open" → zone stays LEAKY

**2. Check if all sensors are stale**
- If yes → FAIL-SAFE (treat as unsafe)

**3. Evaluate non-stale sensors normally**

### Example Implementation

```typescript
private async handleSensorUpdate(): Promise<void> {
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
}
```

### Immediate Re-evaluation on Staleness

**CRITICAL:** When sensors become stale, trigger immediate state re-evaluation.

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

**Why:** Waiting for the next sensor event could leave the device in an incorrect state for extended periods.

**Key Principle:** Stale sensors with last value indicating "unsafe" state must prevent the system from reporting a "safe" state, even if other fresh sensors indicate safety.

## CRITICAL Anti-Pattern: setTimeout Without Error Handling

### ❌ BAD - Silent Failures

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

### ✅ GOOD - Proper Error Handling

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
- Device deletion during delay is common
- Unhandled rejections can crash the entire Homey app
- Violates "fail gracefully, never crash" principle

## Async Fire-and-Forget Pattern

### When to Use `void asyncMethod()`

Use fire-and-forget when:
- Event handlers and callbacks (sensor updates, listeners)
- Background operations that don't affect control flow
- Operations where the caller doesn't need to wait for completion
- Non-critical operations with their own error handling

### When to Use `await asyncMethod()`

Use await when:
- Initialization sequences where order matters
- Critical path operations where errors must propagate
- Operations whose results are needed for subsequent logic
- State updates that must complete before continuing

### Examples

**✅ GOOD - Fire-and-forget for event handler:**

```typescript
private registerDeviceListener(device: HomeyAPIDevice, sensor: SensorConfig): void {
  const handler = (value: boolean) => {
    this.updateStaleSensorTracking(sensor.deviceId);
    this.aggregator?.updateSensorState(sensor.deviceId, value);

    // Fire-and-forget: event handler doesn't need to wait
    void this.handleSensorUpdate();
  };

  device.makeCapabilityInstance(sensor.capability, handler);
}
```

**✅ GOOD - Fire-and-forget for background operation:**

```typescript
private checkForStaleSensors(): void {
  if (hasChanges) {
    this.checkForStaleStateChanged();

    // Trigger re-evaluation without blocking stale check
    void this.handleSensorUpdate();
  }
}
```

**✅ GOOD - Await for initialization (order matters):**

```typescript
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
```

**❌ BAD - Missing void (causes warnings):**

```typescript
private registerListener(): void {
  const handler = (value: boolean) => {
    this.handleUpdate();  // Should be: void this.handleUpdate()
  };
}
```

**❌ BAD - Using await when fire-and-forget is appropriate:**

```typescript
private checkSensors(): void {
  if (hasChanges) {
    await this.handleUpdate();  // Blocks unnecessarily, changes return type
  }
}
```

## Production Debugging Logging

### Good - Actionable Logs

Include context that helps diagnose issues in production:

```typescript
// Shows WHY decision was made and what data led to it
this.log(`Sensor update: allClosed=${allClosed}, anyOpen=${anyOpen} (evaluating ${nonStaleSensorCount}/${this.contactSensors.length} non-stale sensors)`);

this.log(`Fail-safe: ${staleSensorsOpen.length} stale sensor(s) were open (${sensorNames}), treating zone as leaky`);

this.log(`Sensor became stale: ${sensorName} (last value: ${currentValue}, stale for: ${duration}min)`);

this.log(`State transition: ${oldState} → ${newState} (reason: ${reason})`);
```

### Bad - Vague Logs

```typescript
this.log('Sensor update');         // No context
this.log('Zone is leaky');         // Doesn't explain why
this.log('Sensor stale');          // Which sensor? For how long?
this.log('State changed');         // From what to what? Why?
```

### Pattern

Include in your logs:
- **Counts** - How many items affected
- **Names** - Which specific items (device names, sensor IDs)
- **Durations** - How long something took or waited
- **Reasoning** - Why a decision was made
- **Values** - Current state, previous state, threshold values

This makes production debugging possible without code access.

## TypeScript Standards

### Coding Style

```typescript
// Use strict mode
"strict": true

// Explicit types for public interfaces
public async updateSensor(deviceId: string, value: boolean): Promise<void>

// Use 'unknown' over 'any'
catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
}

// Prefer interfaces over type aliases
interface SensorConfig {
  deviceId: string;
  capability: string;
}
```

### Naming Conventions

```typescript
// Classes and Interfaces: PascalCase
class SensorMonitor {}
interface SensorConfig {}

// Methods and Variables: camelCase
private sensorMonitor: SensorMonitor;
async updateSensorState(): Promise<void>

// Constants: UPPER_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3;
const STALE_TIMEOUT_MS = 30 * 60 * 1000;
```

### Error Handling Standard

```typescript
// Always fail gracefully
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  this.error('Operation failed:', error);
  return null;  // Safe default
}

// Log errors with context
this.error(`Failed to update sensor ${deviceId}:`, error);

// Return safe defaults on validation failure
if (!config || !config.sensors || config.sensors.length === 0) {
  this.log('No sensors configured, returning empty array');
  return [];
}
```
