# Testing Guidelines

## Test Coverage Requirements

### Minimum Standards
- **70% coverage minimum** - Enforced by Jest; PR will fail if coverage drops
- Run coverage check: `npm run test:coverage`
- Coverage report: `coverage/lcov-report/index.html`

### Focus Areas
- State transitions and state machine logic
- Error handling and error reporter calls
- Edge cases (empty arrays, null, invalid input, all stale sensors)
- Fail-safe behavior
- Timer-based logic (with fake timers)
- Callback invocations

### What NOT to Test
- Homey SDK internals
- Timer precision (use `jest.useFakeTimers` to control time)
- Network calls (mock API responses)
- External dependencies (mock them)

## Testing Patterns

### Setup and Teardown

```typescript
describe('WIABZoneSealDevice', () => {
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

### AAA Pattern (Arrange-Act-Assert)

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

### Jest Fake Timers

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

### Direct State Manipulation (Unit Tests)

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

### Integration Tests for Timeout-Based Detection

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

### Testing Fail-Safe Behavior

```typescript
describe('Fail-safe behavior', () => {
  it('should stay leaky when stale sensor was last open', async () => {
    // Arrange: Open sensor, then make it stale
    const callback = capabilityCallbacks.get('sensor1')!;
    callback(true);  // Open
    await Promise.resolve();
    
    // Make sensor stale
    const staleSensorMap = (device as any).staleSensorMap;
    staleSensorMap.get('sensor1').isStale = true;

    // Act: Trigger state update
    await (device as any).handleSensorUpdate();

    // Assert: Zone remains leaky (fail-safe)
    expect((device as any).engine.getCurrentState()).toBe('leaky');
    expect(device.log).toHaveBeenCalledWith(
      expect.stringContaining('stale sensor(s) were open')
    );
  });

  it('should treat all-stale as leaky', async () => {
    // Arrange: Mark all sensors as stale
    const staleSensorMap = (device as any).staleSensorMap;
    for (const [deviceId, info] of staleSensorMap.entries()) {
      info.isStale = true;
    }

    // Act: Trigger state update
    await (device as any).handleSensorUpdate();

    // Assert: Zone is leaky (fail-safe)
    expect((device as any).engine.getCurrentState()).toBe('leaky');
    expect(device.log).toHaveBeenCalledWith(
      expect.stringContaining('All sensors are stale')
    );
  });
});
```

### Testing Error Handling

```typescript
it('should report error when sensor update fails', async () => {
  // Arrange: Setup device with error reporter spy
  const errorReporterSpy = jest.spyOn(device.errorReporter!, 'reportError');
  
  // Mock a failure
  jest.spyOn(device as any, 'updateState').mockRejectedValue(
    new Error('Update failed')
  );

  // Act: Trigger operation that will fail
  await device.handleSensorUpdate();

  // Assert: Error was reported
  expect(errorReporterSpy).toHaveBeenCalledWith({
    errorId: expect.any(String),
    severity: ErrorSeverity.HIGH,
    userMessage: expect.stringContaining('failed'),
    technicalMessage: expect.stringContaining('Update failed'),
    context: expect.objectContaining({
      deviceId: expect.any(String),
    }),
  });
});
```

### Testing State Transitions

```typescript
it('should transition through delay states correctly', async () => {
  // Arrange: Setup with 5 second open delay
  await device.updateSettings({ openDelaySeconds: 5 });
  await device.onInit();

  // Start in SEALED state
  expect((device as any).engine.getCurrentState()).toBe('sealed');

  // Act: Open sensor
  const callback = capabilityCallbacks.get('sensor1')!;
  callback(true);
  await Promise.resolve();

  // Assert: In OPEN_DELAY state
  expect((device as any).engine.getCurrentState()).toBe('open_delay');

  // Act: Fast-forward past delay
  jest.advanceTimersByTime(5000);
  await Promise.resolve();

  // Assert: Transitioned to LEAKY
  expect((device as any).engine.getCurrentState()).toBe('leaky');
});
```

## Mock Factories

Use the provided mock factories in `tests/setup.ts`:

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

## Test Organization

```typescript
describe('DeviceName', () => {
  describe('Initialization', () => {
    it('should initialize with correct default state', async () => {
      // Test init
    });
  });

  describe('Sensor Updates', () => {
    it('should handle sensor opening', async () => {
      // Test sensor logic
    });
  });

  describe('Stale Detection', () => {
    it('should detect stale sensors', async () => {
      // Test stale detection
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully', async () => {
      // Test error handling
    });
  });
});
```

## Coverage Commands

```bash
# Run tests with coverage
npm run test:coverage

# View coverage report in browser
open coverage/lcov-report/index.html

# Check coverage threshold (must be ≥70%)
npm run test:coverage -- --coverage --coverageThreshold='{"global":{"branches":70,"functions":70,"lines":70,"statements":70}}'
```

## Common Test Scenarios

### Testing Edge Cases

```typescript
describe('Edge cases', () => {
  it('should handle empty sensor array', async () => {
    await device.updateSettings({ contactSensors: [] });
    await device.onInit();
    // Should not crash
    expect(device.getCapabilityValue('alarm_zone_leaky')).toBeDefined();
  });

  it('should handle null sensor value', async () => {
    const callback = capabilityCallbacks.get('sensor1')!;
    callback(null as any);
    // Should not crash
    await Promise.resolve();
  });

  it('should handle invalid device ID', async () => {
    await device.updateSettings({
      contactSensors: [{ deviceId: 'invalid-id', capability: 'alarm_contact' }]
    });
    await device.onInit();
    // Should log error but not crash
    expect(device.error).toHaveBeenCalled();
  });
});
```

### Testing Callbacks

```typescript
it('should invoke callback on state change', async () => {
  const callback = jest.fn();
  device.registerStateChangeCallback(callback);

  // Trigger state change
  await device.handleSensorUpdate();

  expect(callback).toHaveBeenCalledWith({
    oldState: 'sealed',
    newState: 'leaky',
    timestamp: expect.any(Number),
  });
});
```

## Test Naming Convention

```typescript
// Good test names:
it('should mark zone as leaky when sensor opens')
it('should apply fail-safe when all sensors stale')
it('should transition to SEALED after close delay expires')
it('should report error when device not found')

// Bad test names:
it('works')
it('test sensor')
it('should do something')
```

Use descriptive names that explain:
1. **Initial condition** (when, given)
2. **Action** (what happens)
3. **Expected outcome** (should result in)
