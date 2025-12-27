# Circuit Breaker PR Review Fixes - Implementation Plan

## Overview

This document outlines the architecture for fixing all 21 issues from PR #86 review.

**User Decisions**:
- Fix ALL issues (critical + important + code quality)
- Change error handling from "return empty arrays" to "throw errors"
- Add comprehensive test coverage for CircuitBreakerSettingsValidator (currently 0%)
- Add device lifecycle integration tests

## Architectural Changes

### 1. Error Handling Pattern Change

**From: Graceful Degradation**
```typescript
try {
  const devices = await this.homeyApi.devices.getDevices();
  return devices;
} catch (error) {
  this.logger.error('[ERROR_ID] Failed:', error);
  return [];  // Hide error, return safe default
}
```

**To: Fail-Fast with User-Friendly Messages**
```typescript
try {
  const devices = await this.homeyApi.devices.getDevices();
  return devices;
} catch (error) {
  const errorReporter = new ErrorReporter(this.logger);
  const message = errorReporter.reportAndGetMessage({
    errorId: CircuitBreakerErrorId.HIERARCHY_QUERY_FAILED,
    severity: ErrorSeverity.HIGH,
    userMessage: 'Cannot fetch circuit breakers. Please try again.',
    technicalMessage: error instanceof Error ? error.message : 'Unknown error',
  });
  throw new Error(message);
}
```

### 2. Error ID Addition

Add to `constants/errorIds.ts`:
```typescript
/** Failed to delete device and cleanup resources */
DEVICE_DELETION_FAILED = 'CIRCUIT_BREAKER_015',
```

## Implementation Tasks

### Task Group 1: Critical Error Handling + Validator Tests

**Priority**: CRITICAL
**Files**:
- `lib/CircuitBreakerHierarchyManager.ts`
- `lib/CircuitBreakerCascadeEngine.ts`
- `tests/unit/CircuitBreakerSettingsValidator.test.ts` (NEW)
- `constants/errorIds.ts`

**Changes**:

#### CircuitBreakerHierarchyManager.ts
Change 7 methods to throw instead of return empty arrays:

1. `getAllCircuitBreakers()` (lines 115-121)
   - Current: Returns [] on error
   - New: Throw with message "Cannot fetch circuit breakers. Please try again."

2. `getChildren()` (lines 158-164)
   - Current: Returns [] on error
   - New: Throw with message "Cannot fetch child circuit breakers. Please try again."

3. `getParentChain()` (lines 220-226)
   - Current: Returns [] on error
   - New: Throw with message "Cannot fetch parent hierarchy. Please try again."

4. `getDescendants()` (lines 332-339)
   - Current: Returns [] on error
   - New: Throw with message "Cannot fetch circuit breaker hierarchy. Please try again."

5. `getDeviceById()` (lines 371-377)
   - Current: Returns null on error
   - New: Throw with message "Cannot fetch circuit breaker device. Please try again."

6. `wouldCreateCycle()` (lines 275-282)
   - Current: Returns fail-safe true on error
   - New: Throw with message "Cannot validate parent assignment. Please try again."

7. Fix comment inaccuracy at line 285-287 (describes sequential iteration but code is parallel)

#### CircuitBreakerCascadeEngine.ts
1. Critical error in `cascadeStateChange()` (lines 147-152)
   - Current: Logs error, returns empty result
   - New: Throw with message "Failed to cascade state change. Please try again."

#### CircuitBreakerSettingsValidator.test.ts (NEW)
Create comprehensive test suite covering:

```typescript
describe('CircuitBreakerSettingsValidator', () => {
  describe('validateSettings', () => {
    describe('valid inputs', () => {
      it('should accept empty string as no parent')
      it('should accept valid parent ID')
      it('should accept null as no parent')
    });

    describe('invalid types', () => {
      it('should throw for non-object settings')
      it('should throw for array settings')
      it('should throw for null settings')
      it('should throw for undefined settings')
    });

    describe('parentId validation', () => {
      it('should throw for non-string parent ID')
      it('should throw for number parent ID')
      it('should throw for object parent ID')
      it('should accept empty string')
      it('should throw for whitespace-only string')
    });

    describe('cycle detection', () => {
      it('should throw when parent assignment creates cycle')
      it('should accept valid parent assignment')
      it('should handle self-reference as cycle')
    });

    describe('error messages', () => {
      it('should provide clear error for invalid settings type')
      it('should provide clear error for invalid parent ID type')
      it('should provide clear error for empty parent ID')
      it('should provide clear error for cycle detection')
    });
  });
});
```

**Test Pattern**: Follow SensorSettingsValidator.test.ts AAA pattern.

#### constants/errorIds.ts
Add new error ID:
```typescript
/** Failed to delete device and cleanup resources */
DEVICE_DELETION_FAILED = 'CIRCUIT_BREAKER_015',
```

### Task Group 2: Device Lifecycle Tests + Important Fixes

**Priority**: HIGH
**Files**:
- `tests/unit/CircuitBreakerDevice.test.ts` (NEW)
- `drivers/wiab-circuit-breaker/device.ts`
- `drivers/wiab-circuit-breaker/driver.ts`

**Changes**:

#### CircuitBreakerDevice.test.ts (NEW)
Create device lifecycle integration tests:

```typescript
describe('CircuitBreakerDevice', () => {
  describe('onInit', () => {
    it('should initialize with default state')
    it('should register capability listeners')
    it('should setup cascade engine')
    it('should throw on initialization failure')
  });

  describe('onSettings', () => {
    it('should validate new parent assignment')
    it('should throw on cycle detection')
    it('should cascade state change when parent changes')
    it('should handle empty parent (orphan)')
    it('should update hierarchy on valid parent change')
  });

  describe('onDeleted', () => {
    it('should orphan all children')
    it('should handle children with no parent gracefully')
    it('should log errors but not throw during orphaning')
    it('should use DEVICE_DELETION_FAILED error ID')
  });

  describe('onCapabilityOnoff', () => {
    it('should cascade ON state to all descendants')
    it('should cascade OFF state to all descendants')
    it('should trigger flow cards on state change')
    it('should handle cascade failures gracefully')
  });
});
```

**Test Pattern**: Follow tests/unit/device.test.ts patterns.

#### drivers/wiab-circuit-breaker/device.ts
1. Line 282: Change error ID from `DEVICE_INIT_FAILED` to `DEVICE_DELETION_FAILED`

2. Lines 274-276: Remove empty catch block, add proper logging:
```typescript
Promise.allSettled(childrenIds.map(childId =>
  this.hierarchyManager.updateDeviceSettings(childId, { parentId: '' })
))
  .then((results) => {
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      this.error(
        `[${CircuitBreakerErrorId.ORPHAN_CHILDREN_FAILED}] Failed to orphan ${failures.length} children`,
        failures
      );
    }
  });
```

3. Lines 172-178: Wrap flow card errors with user-friendly messages:
```typescript
try {
  await driver.flippedTrigger?.trigger(this, tokens);
} catch (error) {
  const errorReporter = new ErrorReporter({ log: this.log.bind(this), error: this.error.bind(this) });
  const message = errorReporter.reportAndGetMessage({
    errorId: CircuitBreakerErrorId.FLOW_CARD_TRIGGER_FAILED,
    severity: ErrorSeverity.MEDIUM,
    userMessage: 'Flow card trigger failed',
    technicalMessage: error instanceof Error ? error.message : 'Unknown error',
  });
  // Don't throw - flow cards are non-critical
  this.error(message);
}
```

4. Lines 130-136: Add user-friendly wrapper for capability updates:
```typescript
try {
  await this.setCapabilityValue('onoff', state);
} catch (error) {
  const errorReporter = new ErrorReporter({ log: this.log.bind(this), error: this.error.bind(this) });
  const message = errorReporter.reportAndGetMessage({
    errorId: CircuitBreakerErrorId.CAPABILITY_UPDATE_FAILED,
    severity: ErrorSeverity.HIGH,
    userMessage: 'Failed to update circuit breaker state',
    technicalMessage: error instanceof Error ? error.message : 'Unknown error',
  });
  throw new Error(message);
}
```

#### drivers/wiab-circuit-breaker/driver.ts
1. Line 207: Extend HomeyAPIDevice instead of double cast
```typescript
// Add to lib/types.ts:
interface HomeyAPIDevice {
  id: string;
  name: string;
  zone?: string;
  // ... other properties
}

// In driver.ts:
const device = devices[deviceId] as HomeyAPIDevice;
```

2. Lines 64-71: Add explicit `return true` to action handlers:
```typescript
this.homey.flow.getActionCard('circuit_breaker_turn_on')
  .registerRunListener(async (args: { device: Homey.Device }) => {
    await args.device.setCapabilityValue('onoff', true);
    return true;
  });
```

3. Lines 187-193: Wrap getAllCircuitBreakers error with user-friendly message:
```typescript
catch (error) {
  const errorReporter = new ErrorReporter({ log: this.log.bind(this), error: this.error.bind(this) });
  const message = errorReporter.reportAndGetMessage({
    errorId: CircuitBreakerErrorId.HIERARCHY_QUERY_FAILED,
    severity: ErrorSeverity.HIGH,
    userMessage: 'Cannot load circuit breakers for pairing. Please try again.',
    technicalMessage: error instanceof Error ? error.message : 'Unknown error',
  });
  throw new Error(message);
}
```

### Task Group 3: Code Quality Fixes

**Priority**: MEDIUM
**Files**:
- `lib/CircuitBreakerHierarchyManager.ts`
- `drivers/wiab-circuit-breaker/device.ts`
- `lib/types.ts`

**Changes**:

#### Comment Fixes (5 critical inaccuracies)

1. **CircuitBreakerHierarchyManager.ts:285-287** - Misleading comment about sequential iteration
   - Current: "Iterates sequentially through parent chain to detect cycles"
   - Fix: "Iterates through parent chain to detect cycles. Uses concurrent lookups for performance."

2. **CircuitBreakerHierarchyManager.ts:120** - Incorrect description of when empty array is returned
   - Current: Comment says returns [] on error
   - Fix: Update to say "throws on error" after changing implementation

3. **CircuitBreakerCascadeEngine.ts:60-62** - Ambiguous fire-and-forget documentation
   - Current: "Updates are fire-and-forget for performance"
   - Fix: "Updates use Promise.allSettled() to continue on individual failures while tracking results"

4. **CircuitBreakerHierarchyManager.ts:330** - Missing context about why parallel is used
   - Add: "Uses Promise.all() for parallel lookups to minimize latency when querying multiple devices"

5. **device.ts:170** - Flow card trigger comment doesn't mention error handling
   - Add: "Flow card triggers are non-critical and don't block state changes on failure"

#### Type Improvements

1. **lib/types.ts** - Add HomeyAPIDevice interface:
```typescript
export interface HomeyAPIDevice {
  id: string;
  name: string;
  zone?: string;
  driverId?: string;
  settings: Record<string, unknown>;
  capabilitiesObj: Record<string, { value: unknown; id?: string }>;
}
```

2. **drivers/wiab-circuit-breaker/driver.ts** - Use typed interface instead of `as unknown as`

#### Redundant Code Removal

1. **device.ts:274-276** - Remove redundant `.catch()` after `.then()` (already handled in Promise.allSettled)

## Verification Checklist

After implementation, verify:
- [ ] All tests pass: `npm test`
- [ ] Coverage meets 70% threshold: `npm run test:coverage`
- [ ] Lint passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Validation passes: `npm run validate`
- [ ] No empty catch blocks remain
- [ ] All error handlers throw (not return empty arrays)
- [ ] All error messages are user-friendly
- [ ] CircuitBreakerSettingsValidator has >95% coverage
- [ ] Device lifecycle tests cover all three methods
- [ ] All 5 comment inaccuracies fixed
- [ ] No `as unknown as` double casts remain

## Success Criteria

1. **Critical Issues (4)**: ✅ All resolved
   - CircuitBreakerSettingsValidator: 0% → >95% coverage
   - Wrong error ID in onDeleted: Fixed
   - Silent failures: All throw with user-friendly messages
   - Empty catch blocks: Removed or properly logged

2. **Important Issues (9)**: ✅ All resolved
   - Device lifecycle tests: Created
   - Redundant code: Removed
   - Type safety: Improved with HomeyAPIDevice interface
   - User-friendly errors: Added throughout

3. **Code Quality Issues (8)**: ✅ All resolved
   - Comment inaccuracies: All 5 fixed
   - Type design: Optional fields reduced, interfaces extended
   - Documentation: Updated to reflect new error handling

## Implementation Order

1. **Phase 1** (Critical): Agent 1 - Error handling + validator tests
2. **Phase 2** (Important): Agent 2 - Device lifecycle tests + error wrappers
3. **Phase 3** (Quality): Agent 3 - Comments, types, redundant code

All phases can run in parallel as they touch different files.
