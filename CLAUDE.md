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

## State Machine Architecture

WIAB uses a simple two-state occupancy model. See `docs/STATE_DIAGRAM.md` for complete state diagrams.

**Key Principles:**
1. **Initialization**: Occupancy determined by current trigger sensor values only
2. **Runtime**: Occupancy changes based on sensor transitions (FALSE → TRUE)
3. **Reset sensors**: Only affect state during runtime transitions, ignored at initialization

**Rationale:**
- Door position doesn't indicate occupancy
- Only the ACT of opening a door indicates exit
- Motion sensors indicate current presence reliably

**State Transitions:**
- **Trigger sensors** (motion/presence): FALSE → TRUE activates occupancy
- **Reset sensors** (door/window contacts): FALSE → TRUE deactivates occupancy
- **Priority**: Reset sensors are always checked before trigger sensors
- **Edge detection**: Only state changes trigger actions, not static states

**Initialization Behavior:**
```typescript
// At device initialization (onInit):
// - Read CURRENT VALUES of trigger sensors
// - If ANY trigger sensor is TRUE → Set occupancy ON
// - If ALL trigger sensors are FALSE → Set occupancy OFF
// - Reset sensors are COMPLETELY IGNORED during initialization
```

**Runtime Behavior:**
```typescript
// During polling (every 2 seconds):
// 1. Check reset sensors for FALSE → TRUE transitions (priority)
// 2. If reset transition detected → Set occupancy OFF and exit
// 3. Check trigger sensors for FALSE → TRUE transitions
// 4. If trigger transition detected → Set occupancy ON
// 5. All other states (TRUE → FALSE, static states) are ignored
```

**Why This Design?**
- Door/window position is ambiguous (open door ≠ room empty)
- The ACT of opening a door is unambiguous (someone just exited)
- Motion sensors reliably indicate current presence
- Edge detection prevents repeated triggers from same sensor

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

### Quick Start for Single Feature

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

### Parallel Development with Multiple Agents

For AI agents working on multiple features simultaneously, **use git worktrees** to avoid branch conflicts and enable true parallel development.

See [Parallel Development with Git Worktrees](#parallel-development-with-git-worktrees) section below for complete instructions and examples.

### Pre-Commit Checklist

Before committing code, run these checks locally to ensure code quality:

```bash
# 1. Build TypeScript
npm run build

# 2. Run linter
npm run lint

# 3. Run all tests
npm test

# 4. Verify coverage meets 70% threshold
npm run test:coverage

# 5. Validate Homey app
npm run validate
```

**Pre-commit checklist:**

1. ✅ TypeScript compiles without errors (`npm run build`)
2. ✅ All tests pass (`npm test`)
3. ✅ Test coverage meets 70% threshold (`npm run test:coverage` - Jest enforces this)
4. ✅ No linting errors (`npm run lint`)
5. ✅ Homey app validation passes (`npm run validate`)
6. ✅ Code is documented (public methods have Javadoc)
7. ✅ Error handling is implemented
8. ✅ Logging statements are present for key events
9. ✅ No references to Claude, AI tools, or code generation in code, comments, or commit messages

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

### Gitflow Branching Model

WIAB uses Gitflow for structured development and release management. This ensures stable production code and organized feature development.

**Permanent Branches:**
- **`main`** - Production-ready code. Always deployable. Protected with required reviews and status checks.
- **`develop`** - Integration branch for features. Default PR target for new functionality. Also protected.

**Temporary Branches:**
- **`feature/*`** - New features or enhancements (e.g., `feature/sensor-timeout`, `feature/pairing-improvements`)
- **`release/*`** - Release preparation (e.g., `release/1.1.0`). Created from develop, merged to main and back to develop.
- **`hotfix/*`** - Critical production fixes (e.g., `hotfix/1.0.1`). Created from main, merged to main and back to develop.

**Branch Naming Convention:**
- Use lowercase, hyphenated names
- Be descriptive: `feature/sensor-timeout` not `feature/fix`
- Reference issues if applicable: `feature/sensor-timeout-#42`

**PR Target Rules:**
- **New features/enhancements**: Create PR targeting `develop`
- **Hotfixes**: Create PR targeting `main` (will be merged back to develop automatically)
- **Releases**: Create PR targeting `main`

**Using Slash Commands (Recommended):**
```bash
# Start a new feature branch
/git:start-feature sensor-timeout

# Work on your feature
git add .
git commit -m "feat: add sensor timeout configuration"

# Finish feature (creates PR to develop)
/git:finish-feature sensor-timeout

# Start a release
/git:start-release 1.1.0

# Finish release (merges to main and develop, creates tag)
/git:finish-release 1.1.0

# Start a hotfix
/git:start-hotfix 1.0.1

# Finish hotfix (merges to main and develop, creates tag)
/git:finish-hotfix 1.0.1
```

**Manual Approach:**
```bash
# Create and checkout feature branch from develop
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name

# Make changes, commit, push
git add .
git commit -m "feat: your feature description"
git push -u origin feature/your-feature-name

# Create PR on GitHub targeting develop
```

### Squash Merge Strategy

WIAB uses **squash merging** for PRs. This means:
- All commits on your feature branch are combined into a single commit
- The **PR title becomes the commit message** on the target branch (develop/main)
- This commit appears in the main git log, release notes, and changelogs

**Why Squash Merging?**
- Clean, linear history on main/develop branches
- Each PR becomes one logical commit
- Easier to understand project history
- Enables automated changelog generation from PR titles

**CRITICAL: PR Titles Must Be Valid**

Since PR titles become commit messages, they **must** follow conventional commit format and will be automatically validated by GitHub Actions.

**Format:**
```
<type>(<scope>): <subject>
```

**Valid Examples:**
```
feat: add sensor timeout configuration
fix: resolve occupancy state race condition
docs(readme): update installation instructions
refactor(sensors): extract validation logic
test: add edge cases for door sensor events
chore(deps): update homey sdk to 3.1.0
```

**Invalid Examples:**
```
feat: Added sensor timeout              # Past tense - must be imperative
fix: Resolve occupancy state            # Capitalized subject - must be lowercase
Update README                            # Missing type prefix
Feature/sensor timeout                   # Not conventional format
WIP: experimental changes                # Not a valid commit type
```

**Validation Rules:**
- ✅ Must start with valid type: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
- ✅ Subject must start with **lowercase** letter
- ✅ Subject must use **imperative mood** ("add" not "added")
- ✅ Scope is optional but recommended for clarity
- ✅ No period at end of subject line
- ❌ No mentions of Claude, AI tools, or code generation

**Automated Validation:**
GitHub Actions automatically validates your PR title when:
- PR is opened
- PR title is edited
- New commits are pushed

If validation fails, you'll see a clear error message. Simply edit the PR title to fix it.

### Branch Protection Rules

**`main` Branch Protection:**
- Requires PR with ≥1 approval before merging
- Requires all status checks to pass (build, test, lint, validate, PR title validation)
- Requires branch to be up to date with base branch before merging
- Requires all conversations to be resolved
- No direct pushes allowed (must use PRs)
- Linear history preferred

**`develop` Branch Protection:**
- Requires PR with ≥1 approval before merging
- Requires all status checks to pass (build, test, lint, validate, PR title validation)
- Requires branch to be up to date with base branch before merging
- No force pushes allowed

These rules ensure code quality and prevent accidental direct commits to protected branches.

### Pull Request Process

**Before Creating PR:**
1. Ensure all local checks pass:
   - `npm run build` (no TypeScript errors)
   - `npm test` (all tests pass)
   - `npm run test:coverage` (≥70% coverage)
   - `npm run lint` (no linting errors)
   - `npm run validate` (Homey validation passes)
2. Branch is up to date with target branch
3. Branch name follows convention (feature/*, hotfix/*, release/*)
4. No references to Claude or AI tools in code/comments

**Creating the PR:**
1. Push your branch to GitHub
2. Create PR using GitHub UI or `/git:finish-feature` command
3. **Ensure PR title follows conventional commit format** - it will be validated
4. Fill out the PR template completely
5. Link related issues using `Closes #123` or `Related to #456`
6. Add screenshots/videos for UI changes if applicable
7. Assign yourself as assignee
8. Add appropriate labels (bug, feature, documentation, etc.)

**During Review:**
- CI checks must pass (enforced by branch protection)
- At least 1 approval required (enforced by branch protection)
- Address review feedback promptly
- All conversations must be resolved (enforced by branch protection)

**After Merge:**
- Your branch is automatically deleted
- Pull latest changes: `git pull origin develop` (or main)
- Delete local branch: `git branch -d feature/your-feature-name`
- Continue with next feature!

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

### CI/CD Pipeline

WIAB uses GitHub Actions to automatically run quality checks on every push and PR. The pipeline ensures code meets quality standards before merging.

**Pipeline Stages:**

1. **Checkout** - Get the code
2. **Setup Node.js** - Install Node 20.x with npm cache
3. **Install Dependencies** - `npm ci` (clean install)
4. **Build TypeScript** - Compile to JavaScript (`npm run build`)
5. **Lint Code** - Check style and best practices (`npm run lint`)
6. **Run Tests with Coverage** - Execute all tests and generate coverage reports (`npm run test:coverage`)
7. **Check Coverage Threshold** - Verify 70% coverage is met (Jest enforces this)
8. **Validate Homey App** - Verify app structure and metadata (`npm run validate`)
9. **Status Check** - Aggregate all checks for PR merge decision

**When Pipeline Runs:**
- On every push to `main` or `develop` branches
- On every pull request to `main` or `develop` branches

**What Causes Pipeline Failures:**

Your PR will fail the pipeline if:
- ❌ TypeScript compilation fails (`npm run build`)
- ❌ Any test fails (`npm test`)
- ❌ Coverage drops below 70% threshold (`npm run test:coverage`)
- ❌ Linting errors found (`npm run lint`)
- ❌ Homey validation fails (`npm run validate`)
- ❌ PR title doesn't follow conventional commit format

**Fixing Pipeline Failures:**

```bash
# 1. Pull latest changes
git pull origin develop

# 2. Fix the issues locally (see error messages)
# - Fix TypeScript errors: check npm run build output
# - Fix test failures: check npm test output
# - Fix coverage: add missing tests or remove untested code
# - Fix linting: run npm run lint -- --fix for auto-fixes
# - Fix validation: check homey app validate output

# 3. Re-run checks locally to verify
npm run build
npm run lint
npm test
npm run test:coverage
npm run validate

# 4. Commit and push fixes
git add .
git commit -m "fix: resolve CI pipeline failures"
git push

# 5. Pipeline will automatically re-run
```

**Coverage Threshold (70%):**

The project enforces 70% code coverage minimum:
- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

If coverage drops below 70%, the pipeline fails. To improve coverage:
- Add unit tests for new code
- Test edge cases (empty arrays, null values, invalid IDs)
- Mock external dependencies (Homey SDK)
- Focus tests on business logic, not framework

Check coverage locally before pushing:
```bash
npm run test:coverage
# Opens coverage/index.html in browser to see what's not covered
```

### Parallel Development with Git Worktrees

Git worktrees enable multiple AI agents to work simultaneously on different features without interfering with each other. Each worktree is an independent working directory with its own branch, allowing true parallel development.

**Why Worktrees for Parallel Development?**
- ✅ Each agent works in isolation without checking out branches
- ✅ No branch conflicts - different worktrees can use different branches
- ✅ Faster context switching - agents don't need to wait for `git checkout` to complete
- ✅ Simultaneous feature development - multiple features in progress at once
- ✅ Cleaner workflow - no accidental commits to wrong branches
- ✅ Easy coordination - agents can reference specific worktree locations

**Worktree Basics:**

A worktree is simply another directory in your repository with a different branch checked out:

```
project/
├── .git/                    # Shared git database
├── src/
├── tests/
└── .git/worktrees/         # Worktree directories
    ├── feature-sensor-timeout/
    └── feature-pairing-improvements/
```

All worktrees share the same `.git` directory, so commits, merges, and history are synchronized.

**Creating a Worktree for a New Feature:**

```bash
# 1. Create a new worktree with a feature branch
git worktree add ../wiab-feature-sensor-timeout -b feature/sensor-timeout develop

# This creates:
# - A new directory: ../wiab-feature-sensor-timeout
# - A new feature branch: feature/sensor-timeout (based on develop)
# - Ready for development immediately
```

**Working in a Worktree:**

```bash
# 1. Navigate to the worktree
cd ../wiab-feature-sensor-timeout

# 2. Install dependencies (only needed once per worktree)
npm install

# 3. Run checks
npm run build
npm test
npm run test:coverage

# 4. Make changes and commit normally
git add .
git commit -m "feat: add sensor timeout configuration"

# 5. Push when ready
git push -u origin feature/sensor-timeout

# 6. Create PR on GitHub
```

**Listing Active Worktrees:**

```bash
# See all worktrees in the repository
git worktree list

# Output example:
# /Users/andy/projects/ndygen/wiab (develop)
# /Users/andy/projects/ndygen/wiab-feature-sensor-timeout (feature/sensor-timeout)
# /Users/andy/projects/ndygen/wiab-feature-pairing (feature/pairing-improvements)
```

**Removing a Worktree (Cleanup):**

```bash
# After your PR is merged, clean up the worktree

# 1. Navigate away from the worktree
cd /Users/andy/projects/ndygen/wiab

# 2. Remove the worktree
git worktree remove ../wiab-feature-sensor-timeout

# Or with force if branch hasn't been merged:
git worktree remove --force ../wiab-feature-sensor-timeout

# 3. Delete the directory (if not already deleted)
rm -rf ../wiab-feature-sensor-timeout
```

**Worktree for Pull Requests:**

When multiple agents need to work on PRs to the same branch (e.g., both reviewing/testing PRs to `develop`):

```bash
# Agent 1 working on feature
git worktree add ../wiab-feature-a -b feature/timeout develop
cd ../wiab-feature-a

# Agent 2 working on different feature (in another terminal)
git worktree add ../wiab-feature-b -b feature/pairing develop
cd ../wiab-feature-b

# Each agent works independently without interfering
```

**Worktree for Testing Multiple Branches:**

Testing a feature against the main branch before creating a PR:

```bash
# 1. Create worktree with feature branch
git worktree add ../wiab-test-feature -b feature/my-feature develop

# 2. Create another worktree with main branch for comparison
git worktree add ../wiab-test-main main

# 3. Run tests on both branches
cd ../wiab-test-feature && npm test
cd ../wiab-test-main && npm test

# 4. Compare results between worktrees
```

**Worktree with Slash Commands:**

For streamlined workflow with slash commands:

```bash
# 1. Create worktree for new feature
git worktree add ../wiab-feature-timeout -b feature/sensor-timeout develop

# 2. Navigate to worktree
cd ../wiab-feature-timeout

# 3. Start feature work (now worktrees know about this branch)
/git:start-feature sensor-timeout

# 4. Make changes, run tests, commit
git add .
git commit -m "feat: add sensor timeout"

# 5. Finish feature (creates PR from worktree)
/git:finish-feature sensor-timeout

# 6. After PR merges, clean up
cd /Users/andy/projects/ndygen/wiab
git worktree remove ../wiab-feature-timeout
```

**Important Worktree Rules:**

1. ✅ **One branch per worktree** - A branch can only be checked out in one worktree at a time
2. ✅ **Share .git directory** - All worktrees share the same git database
3. ✅ **Independent node_modules** - Each worktree needs its own npm dependencies
4. ✅ **Independent build artifacts** - Each worktree has its own build output
5. ✅ **Clean up after merging** - Remove worktrees when features are complete

**Common Worktree Patterns:**

**Pattern 1: Dedicated Main Worktree**
```bash
# Keep main worktree for develop/main branches only
/Users/andy/projects/ndygen/wiab/  # develop (main worktree)
../wiab-feature-1/                  # feature/timeout
../wiab-feature-2/                  # feature/pairing
../wiab-hotfix-1/                   # hotfix/bug-fix
```

**Pattern 2: Temporary Test Worktrees**
```bash
# Create test worktrees, delete after testing
git worktree add ../wiab-test-integration -b test/integration-check develop
cd ../wiab-test-integration
npm test
# ... test results ...
cd /path/to/main
git worktree remove ../wiab-test-integration
```

**Pattern 3: Parallel Agent Workflow**
```bash
# Agent 1
git worktree add ../wiab-agent1 -b feature/agent1-work develop
cd ../wiab-agent1
# ... work on feature 1 ...

# Agent 2 (in different terminal/context)
git worktree add ../wiab-agent2 -b feature/agent2-work develop
cd ../wiab-agent2
# ... work on feature 2 simultaneously ...

# Both agents commit/push independently
# Both agents can create PRs simultaneously
# No conflicts or interference
```

**Troubleshooting Worktrees:**

**Problem: "fatal: 'feature/timeout' is already checked out"**
```bash
# Solution: The branch is already in another worktree
git worktree list  # Find which worktree has it

# Either:
# 1. Use that worktree
# 2. Remove the other worktree first
# 3. Use a different branch name
```

**Problem: "fatal: cannot remove /path/to/worktree: Main working tree cannot be removed"**
```bash
# Solution: You're trying to remove the main worktree
# Navigate away first, then remove other worktrees
cd /path/to/main/worktree
git worktree remove /path/to/other/worktree
```

**Problem: Worktree is broken/orphaned**
```bash
# Solution: Prune broken worktrees
git worktree prune

# If still broken:
git worktree list  # Find the bad one
git worktree remove --force ../broken-worktree
rm -rf ../broken-worktree
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

## Important: AI Tool References Policy

**CRITICAL REQUIREMENT: Do not reference Claude, AI assistants, or code generation tools in any project files, comments, pull requests, or git commits.**

This applies to:
- ❌ Source code comments
- ❌ Documentation files
- ❌ PR descriptions or titles
- ❌ Commit messages
- ❌ Issue descriptions
- ❌ Test files

**Why?** This ensures professionalism, maintains project integrity, and keeps focus on the work itself rather than the tools used.

**Examples of what NOT to do:**
```typescript
// ❌ DON'T: Generated with Claude AI
// ❌ DON'T: AI-assisted implementation
// ❌ DON'T: Created by Claude Code
const monitor = new SensorMonitor(...);
```

**Examples of what TO do:**
```typescript
// ✅ DO: Clear, descriptive, professional comments
// Initializes sensor monitoring with priority-based event handling
const monitor = new SensorMonitor(...);
```

**Commit Messages:**
```bash
# ✅ Good - describe the change
git commit -m "feat: add sensor timeout configuration"

# ❌ Bad - references AI tools
git commit -m "feat: add sensor timeout (generated with Claude)"
```

**PR Descriptions:**
```markdown
# ✅ Good - focus on the feature
## Description
This PR implements sensor timeout configuration...

# ❌ Bad - mentions AI tools
## Description
I had Claude help me implement sensor timeout configuration...
```

## Summary

This document provides the foundation for developing and maintaining the WIAB Homey app. Key principles:

1. **Simplicity**: Keep code clean, readable, and maintainable
2. **Reliability**: Prefer polling over events, validate all input
3. **Testability**: Write tests for business logic, mock external dependencies
4. **Documentation**: Document public interfaces, explain complex logic
5. **Error Handling**: Fail gracefully, log comprehensively, never crash
6. **Professionalism**: No references to AI tools, keep focus on the work itself
7. **Parallel Development**: Use git worktrees for simultaneous feature development by multiple agents

### Key Capabilities for AI Agents:

- **Single Feature Development**: Follow standard Gitflow workflow with feature branches
- **Parallel Feature Development**: Use git worktrees to work on multiple features simultaneously without interference
- **Professional Standards**: Conventional commits, comprehensive testing, proper documentation
- **Quality Assurance**: Automated CI/CD pipeline with branch protection and validation
- **Organized Workflow**: Gitflow structure with clear release and hotfix procedures

When in doubt, refer to this document and the Homey SDK documentation. Always prioritize code quality, test coverage, and user experience.
