# WIAB Development Guidelines for AI Agents

This document provides comprehensive guidance for AI agents working on the Wasp in a Box (WIAB) Homey app. It covers architecture, best practices, coding standards, and common patterns specific to this project.

## Project Overview

WIAB (Wasp in a Box) is a Homey app that creates virtual occupancy sensors by aggregating input from multiple physical sensors. The app monitors configured trigger sensors (e.g., motion detectors) to activate occupancy and reset sensors (e.g., door contacts) to deactivate occupancy.

**Core Concept**: Like a wasp trapped in a box that remains active until it finds an exit, the virtual sensor remains active after detecting motion until a specific "exit" condition (reset sensor) is triggered.

## Architecture

### High-Level Structure

The app follows a clean, layered architecture with clear separation of concerns:

```
/Users/andy/projects/ndygen/wiab/
├── app.ts                          # Application coordinator (minimal logic)
├── drivers/
│   └── wiab-device/
│       ├── driver.ts               # Driver implementation (pairing logic)
│       └── device.ts               # Device implementation (business logic)
├── lib/
│   ├── types.ts                    # TypeScript interfaces and type definitions
│   ├── SensorMonitor.ts            # Polling-based sensor monitoring engine
│   └── DeviceRegistry.ts           # Device discovery and lookup utilities
├── .homeycompose/
│   ├── app.json                    # App metadata and configuration
│   └── drivers/
│       └── wiab-device/
│           ├── driver.compose.json         # Driver metadata
│           └── driver.settings.compose.json # Device settings UI
└── tests/
    └── setup.ts                    # Test environment configuration
```

### Design Patterns

**1. Coordinator Pattern**
- `WIABApp` acts as a minimal coordinator with no business logic
- All functionality is delegated to drivers and devices
- This keeps the app class simple and testable

**2. Observer Pattern (via Polling)**
- `SensorMonitor` polls sensors at regular intervals
- Detects state changes and notifies callbacks
- Avoids unreliable event-based approaches

**3. Dependency Injection**
- `SensorMonitor` receives Homey instance, configs, and callbacks via constructor
- Enables easy mocking and testing
- Decouples components

**4. Lifecycle Management**
- Clear initialization (`onInit`), reconfiguration (`onSettings`), and cleanup (`onDeleted`)
- Resources are properly created and destroyed
- Prevents memory leaks and orphaned listeners

## Technology Stack

### Core Technologies
- **Homey SDK**: Version 3.0.0 (SDK3)
- **TypeScript**: Version 5.x with strict mode enabled
- **Node.js**: Version 20.x (LTS)

### Development Tools
- **Jest**: Version 29.x for unit testing
- **ts-jest**: TypeScript Jest transformer
- **ESLint**: TypeScript-aware linting
- **Homey CLI**: For app validation and deployment

### Key Dependencies
```json
{
  "dependencies": {
    "homey": "^3.0.0"
  },
  "devDependencies": {
    "@types/homey": "npm:homey-apps-sdk-v3-types@^0.3.12",
    "@types/jest": "^29.5.0",
    "typescript": "^5.0.0",
    "jest": "^29.5.0"
  }
}
```

## Code Organization

### File Structure Best Practices

1. **Always use Homey Compose**
   - Keep metadata in `.homeycompose/` directory
   - Run `homey app build` to generate final `app.json`
   - Never edit generated files directly

2. **TypeScript Files**
   - Main application logic in `app.ts`
   - Driver logic in `drivers/{driver-name}/driver.ts`
   - Device logic in `drivers/{driver-name}/device.ts`
   - Shared utilities in `lib/`
   - Type definitions in `lib/types.ts`

3. **Test Files**
   - Place tests in `tests/` directory
   - Name test files as `*.test.ts`
   - Group tests by component being tested

## Best Practices for Homey App Development

### 1. Always Use Homey Compose

**Why**: Compose separates metadata from code, making the app easier to maintain and validate.

**How**:
```bash
# Edit files in .homeycompose/
vim .homeycompose/app.json
vim .homeycompose/drivers/wiab-device/driver.compose.json

# Build the final app.json
homey app build
```

**Never** edit the generated `app.json` directly - changes will be overwritten.

### 2. TypeScript Strict Mode

**Why**: Catches errors at compile time, improves code quality, enables better IDE support.

**Configuration** (`tsconfig.json`):
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2020",
    "module": "commonjs",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

**Rules**:
- Always declare types explicitly for public interfaces
- Use `unknown` instead of `any` when type is uncertain
- Avoid type assertions (`as`) unless absolutely necessary
- Prefer interfaces over type aliases for object shapes

### 3. Polling vs Events Trade-offs

**Decision**: WIAB uses polling instead of events.

**Rationale**:
- **Reliability**: Polling guarantees state is checked regularly
- **Consistency**: Works with all device types regardless of event support
- **Simplicity**: Easier to test and debug
- **No race conditions**: State is always current, no stale event issues

**Implementation** (`SensorMonitor.ts`):
```typescript
// Poll every 2 seconds
private readonly POLL_INTERVAL_MS = 2000;

// Edge detection: only trigger on false -> true transitions
if (currentValue && !lastValue) {
  this.callbacks.onTriggered();
}
```

**When to use events instead**:
- Real-time requirements under 1 second
- High-frequency sensors (>1Hz)
- Battery-powered devices (to reduce wake-ups)

### 4. Error Handling Patterns

**Philosophy**: Fail gracefully, log comprehensively, never crash the app.

**Pattern 1: Validation with Fallback**
```typescript
private validateSensorSettings(jsonString: string): SensorConfig[] {
  try {
    if (!jsonString || jsonString.trim() === '') {
      return [];
    }

    const parsed = JSON.parse(jsonString);

    if (!Array.isArray(parsed)) {
      this.error('Sensor settings is not an array:', parsed);
      return [];
    }

    return parsed as SensorConfig[];
  } catch (error) {
    this.error('Failed to parse sensor settings JSON:', error);
    return []; // Forgiving: return empty array instead of crashing
  }
}
```

**Pattern 2: Try-Catch with Logging**
```typescript
private async handleTriggered(): Promise<void> {
  try {
    await this.setCapabilityValue('alarm_occupancy', true);
  } catch (error) {
    this.error('Failed to set occupancy alarm:', error);
    // Don't throw - log and continue
  }
}
```

**Pattern 3: Null Checks with Early Return**
```typescript
private getSensorValue(sensor: SensorConfig): boolean | null {
  try {
    const device = this.getDevice(sensor.deviceId);

    if (!device) {
      return null; // Graceful degradation
    }

    if (!device.hasCapability(sensor.capability)) {
      this.error(`Device ${sensor.deviceId} does not have capability: ${sensor.capability}`);
      return null;
    }

    const value = device.getCapabilityValue(sensor.capability);
    return typeof value === 'boolean' ? value : false;
  } catch (error) {
    this.error(`Error reading sensor ${sensor.deviceId}:`, error);
    return null;
  }
}
```

### 5. Settings JSON Validation

**Requirement**: Validate all user-provided JSON to prevent crashes.

**Implementation**:
1. Always provide default values
2. Validate JSON structure
3. Check expected types
4. Return safe defaults on error
5. Log validation failures for debugging

**Example**:
```typescript
// In driver.settings.compose.json
{
  "id": "triggerSensors",
  "type": "textarea",
  "value": "[]"  // Safe default
}

// In device.ts
const triggerSensorsJson = this.getSetting('triggerSensors') as string;
const triggerSensors = this.validateSensorSettings(triggerSensorsJson);
```

## Testing Guidelines

### Test Philosophy

**Goals**:
- 70%+ code coverage (enforced by Jest config)
- Test business logic, not framework
- Mock external dependencies
- Fast, reliable, isolated tests

### Jest Configuration

Location: `/Users/andy/projects/ndygen/wiab/jest.config.js`

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'lib/**/*.ts',
    'drivers/**/*.ts',
    'app.ts',
    '!**/*.d.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
};
```

### Mocking the Homey SDK

**Pattern**: Create mock objects that match Homey SDK interfaces.

**Example**:
```typescript
// tests/setup.ts or test file
const mockHomey = {
  log: jest.fn(),
  error: jest.fn(),
  drivers: {
    getDrivers: jest.fn(() => ({}))
  }
};

const mockDevice = {
  getData: jest.fn(() => ({ id: 'test-device-id' })),
  hasCapability: jest.fn(() => true),
  getCapabilityValue: jest.fn(() => false)
};
```

### Test Structure (AAA Pattern)

**Arrange-Act-Assert**: Every test follows this structure.

```typescript
describe('SensorMonitor', () => {
  describe('start', () => {
    it('should initialize last values for all sensors', () => {
      // Arrange
      const mockHomey = createMockHomey();
      const triggerSensors = [{ deviceId: 'test-1', capability: 'alarm_motion' }];
      const resetSensors = [];
      const callbacks = { onTriggered: jest.fn(), onReset: jest.fn() };
      const monitor = new SensorMonitor(mockHomey, triggerSensors, resetSensors, callbacks);

      // Act
      monitor.start();

      // Assert
      expect(mockHomey.log).toHaveBeenCalledWith(
        expect.stringContaining('Starting SensorMonitor')
      );
    });
  });
});
```

### What to Test

**Do Test**:
- Business logic (state transitions, calculations)
- Error handling (invalid input, null checks)
- Edge cases (empty arrays, null values)
- Callback invocations
- State management

**Don't Test**:
- Homey SDK internals
- External device behavior
- Timer precision (use jest.useFakeTimers)
- Network calls (mock them)

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- SensorMonitor.test.ts
```

## Common Patterns

### 1. Device Lifecycle Management

**Pattern**: Always implement the full lifecycle.

```typescript
class WIABDevice extends Homey.Device {
  private sensorMonitor?: SensorMonitor;

  // 1. Initialization
  async onInit(): Promise<void> {
    this.log('Device initialized');
    await this.setupSensorMonitoring();
  }

  // 2. Settings changes
  async onSettings(event: SettingsEvent): Promise<void> {
    if (event.changedKeys.includes('triggerSensors')) {
      this.teardownSensorMonitoring();
      await this.setupSensorMonitoring();
    }
  }

  // 3. Cleanup
  async onDeleted(): Promise<void> {
    this.log('Device deleted');
    this.teardownSensorMonitoring();
  }
}
```

### 2. Sensor Monitoring Setup/Teardown

**Pattern**: Centralize setup and teardown logic.

```typescript
private async setupSensorMonitoring(): Promise<void> {
  try {
    // Parse settings
    const triggerSensors = this.validateSensorSettings(
      this.getSetting('triggerSensors')
    );
    const resetSensors = this.validateSensorSettings(
      this.getSetting('resetSensors')
    );

    // Create callbacks
    const callbacks: SensorCallbacks = {
      onTriggered: () => this.handleTriggered(),
      onReset: () => this.handleReset(),
    };

    // Create and start monitor
    this.sensorMonitor = new SensorMonitor(
      this.homey,
      triggerSensors,
      resetSensors,
      callbacks
    );
    this.sensorMonitor.start();
  } catch (error) {
    this.error('Failed to setup sensor monitoring:', error);
  }
}

private teardownSensorMonitoring(): void {
  if (this.sensorMonitor) {
    this.sensorMonitor.stop();
    this.sensorMonitor = undefined;
  }
}
```

### 3. JSON Settings Parsing

**Pattern**: Forgiving validation with safe defaults.

```typescript
private validateSensorSettings(jsonString: string): SensorConfig[] {
  try {
    // Handle empty/null input
    if (!jsonString || jsonString.trim() === '') {
      return [];
    }

    // Parse JSON
    const parsed = JSON.parse(jsonString);

    // Validate structure
    if (!Array.isArray(parsed)) {
      this.error('Settings is not an array');
      return [];
    }

    // Return typed result
    return parsed as SensorConfig[];
  } catch (error) {
    this.error('Failed to parse JSON:', error);
    return [];
  }
}
```

### 4. Edge Detection (State Change Detection)

**Pattern**: Track last values and detect transitions.

```typescript
private lastValues: Map<string, boolean> = new Map();

private poll(): void {
  for (const sensor of this.triggerSensors) {
    const currentValue = this.getSensorValue(sensor);
    const lastValue = this.lastValues.get(sensor.deviceId) ?? false;

    // Update stored value
    if (currentValue !== null) {
      this.lastValues.set(sensor.deviceId, currentValue);
    }

    // Detect rising edge: false -> true
    if (currentValue && !lastValue) {
      this.callbacks.onTriggered();
    }
  }
}
```

### 5. Priority-Based Sensor Handling

**Pattern**: Check reset sensors before trigger sensors.

```typescript
private poll(): void {
  // Priority 1: Reset sensors (take precedence)
  for (const sensor of this.resetSensors) {
    if (this.detectEdge(sensor)) {
      this.callbacks.onReset();
      return; // Exit immediately
    }
  }

  // Priority 2: Trigger sensors (only if no reset)
  for (const sensor of this.triggerSensors) {
    if (this.detectEdge(sensor)) {
      this.callbacks.onTriggered();
      // Continue checking other triggers
    }
  }
}
```

## Code Style Guidelines

### TypeScript Interfaces

**Always define interfaces for**:
- Public API contracts
- Configuration objects
- Callback function signatures
- Data transfer objects

**Example**:
```typescript
export interface SensorConfig {
  deviceId: string;
  capability: string;
  deviceName?: string;
}

export interface SensorCallbacks {
  onTriggered: () => void;
  onReset: () => void;
}
```

### Documentation

**Javadoc-style comments for all public methods**:

```typescript
/**
 * Starts the sensor monitoring process.
 *
 * Initializes the polling interval and begins monitoring all configured sensors.
 * This method should be called after the SensorMonitor is constructed and ready to operate.
 *
 * @public
 * @returns {void}
 */
public start(): void {
  // Implementation
}
```

**Class-level documentation**:
```typescript
/**
 * SensorMonitor - Polling-based sensor state monitoring
 *
 * This class monitors configured sensors by polling their state at regular intervals
 * and triggers callbacks when state changes are detected. It implements a priority
 * system where reset sensors are checked before trigger sensors.
 *
 * @example
 * ```typescript
 * const monitor = new SensorMonitor(
 *   homey,
 *   [{ deviceId: 'motion1', capability: 'alarm_motion' }],
 *   [{ deviceId: 'door1', capability: 'alarm_contact' }],
 *   {
 *     onTriggered: () => console.log('Motion detected!'),
 *     onReset: () => console.log('Door opened!')
 *   }
 * );
 * monitor.start();
 * ```
 */
export class SensorMonitor {
  // Implementation
}
```

### Error Handling

**Log errors with context**:
```typescript
this.error(`Failed to read sensor ${sensor.deviceId}:`, error);
```

**Provide meaningful error messages**:
```typescript
if (!device.hasCapability(sensor.capability)) {
  this.error(
    `Device ${sensor.deviceId} does not have capability: ${sensor.capability}`
  );
  return null;
}
```

### Naming Conventions

- **Classes**: PascalCase (`WIABDevice`, `SensorMonitor`)
- **Interfaces**: PascalCase (`SensorConfig`, `SensorCallbacks`)
- **Methods**: camelCase (`onInit`, `setupSensorMonitoring`)
- **Private methods**: camelCase with `private` modifier
- **Constants**: UPPER_SNAKE_CASE (`POLL_INTERVAL_MS`)
- **Variables**: camelCase (`triggerSensors`, `lastValue`)

## Development Workflow

### Build Process

```bash
# 1. Install dependencies
npm install

# 2. Build TypeScript
npm run build

# 3. Run tests
npm test

# 4. Check coverage
npm run test:coverage

# 5. Lint code
npm run lint

# 6. Validate Homey app structure
npm run validate
```

### Pre-Commit Checklist

Before committing code:

1. All tests pass: `npm test`
2. Coverage meets threshold (70%): `npm run test:coverage`
3. No linting errors: `npm run lint`
4. TypeScript compiles: `npm run build`
5. Homey validation passes: `npm run validate`
6. Code is documented (public methods have Javadoc)
7. Error handling is implemented
8. Logging statements are present for key events

### Git Workflow

**IMPORTANT: Never include references to Claude, AI assistants, or code generation tools in commits or source files.**

```bash
# 1. Compile TypeScript before committing
npm run build

# 2. Run full test suite
npm test

# 3. Stage changes
git add .

# 4. Commit with descriptive message (no AI/Claude references)
git commit -m "feat: add sensor priority handling"

# 5. Push to remote
git push
```

**Commit Message Guidelines:**
- Focus on what changed and why
- Do not mention AI tools, Claude, or automated generation
- Keep commits professional and concise
- Use conventional commit format: feat, fix, docs, refactor, test, chore

### Homey App Deployment

```bash
# 1. Ensure all tests pass
npm test

# 2. Build the app
npm run build

# 3. Validate app structure
homey app validate

# 4. Run the app locally (for testing)
homey app run

# 5. Publish to Homey App Store (production)
homey app publish
```

## Important Implementation Details

### Polling Configuration

- **Interval**: 2000ms (2 seconds)
- **Rationale**: Balance between responsiveness and resource usage
- **Tuning**: Can be adjusted in `SensorMonitor.POLL_INTERVAL_MS`

### Sensor Priority System

1. **Reset sensors**: Always checked first
2. **Trigger sensors**: Only checked if no reset sensor triggered
3. **Rationale**: Ensures "exit" conditions take precedence over "entry" conditions

### State Transition Detection

- **Edge detection**: Only trigger on `false -> true` transitions
- **No repeated triggers**: Same state doesn't trigger multiple times
- **Reset on opposite edge**: `true -> false` transitions reset internal state

### Memory Management

- **Cleanup**: Always call `stop()` in `onDeleted()`
- **Clear intervals**: `clearInterval()` when stopping monitoring
- **Clear maps**: `lastValues.clear()` when stopping monitoring
- **Avoid leaks**: Set `sensorMonitor = undefined` after cleanup

## Links to Homey Documentation

### Official Homey Resources
- **Homey Apps SDK v3**: https://apps-sdk-v3.developer.homey.app/
- **Homey Developer Portal**: https://developer.athom.com/
- **Homey CLI Documentation**: https://apps.developer.homey.app/the-basics/getting-started
- **Homey Community Forum**: https://community.homey.app/

### Key SDK References
- **Device Class**: https://apps-sdk-v3.developer.homey.app/Device.html
- **Driver Class**: https://apps-sdk-v3.developer.homey.app/Driver.html
- **App Class**: https://apps-sdk-v3.developer.homey.app/App.html
- **Capabilities**: https://apps-sdk-v3.developer.homey.app/tutorial-Capabilities.html

### Homey Compose
- **Compose Documentation**: https://apps.developer.homey.app/homey-compose
- **App JSON Schema**: https://apps.developer.homey.app/the-basics/app-json
- **Driver Compose**: https://apps.developer.homey.app/the-basics/drivers

### Testing and Development
- **App Debugging**: https://apps.developer.homey.app/the-basics/debugging
- **App Validation**: https://apps.developer.homey.app/the-basics/publishing

## Common Pitfalls and Solutions

### Pitfall 1: Not Cleaning Up Resources
**Problem**: Memory leaks, orphaned listeners
**Solution**: Always implement proper cleanup in `onDeleted()`

### Pitfall 2: Assuming Events Work Reliably
**Problem**: Missing state changes, delayed updates
**Solution**: Use polling with edge detection instead

### Pitfall 3: Not Validating User Input
**Problem**: App crashes on invalid JSON
**Solution**: Always validate and provide safe defaults

### Pitfall 4: Blocking the Main Thread
**Problem**: App becomes unresponsive
**Solution**: Use async/await, avoid synchronous loops

### Pitfall 5: Over-Logging
**Problem**: Log spam makes debugging difficult
**Solution**: Log state changes and errors only, not every poll

### Pitfall 6: Not Testing Edge Cases
**Problem**: App fails in production with unexpected input
**Solution**: Test with empty arrays, null values, invalid IDs

### Pitfall 7: Hardcoding Device IDs
**Problem**: App doesn't work for other users
**Solution**: Always use configuration/settings for device IDs

## Advanced Topics

### Performance Optimization

1. **Reduce Polling Frequency**: Increase `POLL_INTERVAL_MS` if latency isn't critical
2. **Batch Operations**: Group multiple sensor reads in single iteration
3. **Cache Device Lookups**: Store device references instead of searching every poll
4. **Lazy Initialization**: Only create monitor when sensors are configured

### Future Enhancements

Potential improvements for future versions:

1. **Timeout Feature**: Auto-reset occupancy after X minutes of no activity
2. **Event-Based Fallback**: Try events first, fall back to polling
3. **Advanced Logging**: Structured logging with log levels
4. **Health Monitoring**: Report sensor availability and reliability
5. **Configuration Validation**: UI-based device picker instead of JSON
6. **Multi-Zone Support**: Multiple virtual sensors per WIAB device

## Summary

This document provides the foundation for developing and maintaining the WIAB Homey app. Key principles:

1. **Simplicity**: Keep code clean, readable, and maintainable
2. **Reliability**: Prefer polling over events, validate all input
3. **Testability**: Write tests for business logic, mock external dependencies
4. **Documentation**: Document public interfaces, explain complex logic
5. **Error Handling**: Fail gracefully, log comprehensively, never crash

When in doubt, refer to this document and the Homey SDK documentation. Always prioritize code quality, test coverage, and user experience.
