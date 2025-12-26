# Feature Request: Circuit Breaker Device

## Summary

Add a new virtual device type called **Circuit Breaker** that enables hierarchical flow control across zones and rooms. Circuit breakers can be organized in a parent-child tree structure where state changes cascade from parent to all descendants, providing centralized automation control.

## Problem Statement / Use Case

**Primary Use Case**: Enable users to centrally control automations across multiple zones/rooms with a hierarchical override system.

### Real-World Scenarios

1. **Vacation Mode**: Single "Main Breaker" turns off all home automations. Individual room breakers remain off until vacation mode is disabled.

2. **Night Mode**: "Night Mode Breaker" turns off daytime automations (doorbell sounds, motion-activated bright lights) while keeping essential automations (security sensors, bathroom night lights) on separate breakers.

3. **Floor Control**: Multi-story home with "Floor 1 Breaker" and "Floor 2 Breaker" as children of "Main Breaker". Each floor breaker controls room breakers (Living Room, Kitchen, etc.).

4. **Guest Mode**: Temporarily disable privacy automations in guest room without affecting rest of house.

5. **Energy Saving**: "Energy Saving Master" turns off non-essential automations (decorative lighting flows, entertainment automations) while keeping climate control and security active.

### User Flow Example

```
Main Breaker (ON)
├── Floor 1 Breaker (ON)
│   ├── Living Room Breaker (ON)
│   ├── Kitchen Breaker (OFF) ← User manually disabled
│   └── Bathroom Breaker (ON)
└── Floor 2 Breaker (ON)
    ├── Bedroom Breaker (ON)
    └── Office Breaker (ON)

Action: User turns Main Breaker OFF
Result: ALL breakers turn OFF (including Kitchen which was already OFF)

Action: User turns Kitchen Breaker ON (while Main still OFF)
Result: Kitchen Breaker turns ON independently (parent state doesn't lock children)

Action: User turns Main Breaker ON
Result: ALL breakers turn ON (including Kitchen)
```

### Flow Card Usage Examples

**Example 1: Motion Sensor with Circuit Breaker**
```
WHEN motion detected in Living Room
AND Living Room Breaker is ON
THEN turn on ceiling lights
```

**Example 2: Notification on Master Disable**
```
WHEN Main Breaker turned off
THEN send notification "All home automations disabled"
```

**Example 3: Time-Based Master Control**
```
WHEN time is 22:00
THEN turn off Daytime Automations Breaker
AND turn on Night Mode Breaker
```

**Example 4: React to Any Breaker Change**
```
WHEN Floor 1 Breaker is flipped
THEN log event "Floor 1 automation state changed"
```

## Detailed Requirements

### Device Type
- **Name**: Circuit Breaker (localized: EN: "Circuit Breaker", NL: "Stroomonderbreker", DE: "Schutzschalter", NO: "Strømbryter", SV: "Strömbrytare")
- **Type**: Virtual device (no physical hardware)
- **Driver ID**: `wiab-circuit-breaker`
- **Icon**: Circuit breaker or electrical switch icon
- **Capability**: `onoff` (boolean switch)

### Hierarchy Structure

1. **Tree Model**: Each circuit breaker can have:
   - **One parent** (optional) - can be `null` for root breakers
   - **Multiple children** (zero or more)
   - **Multi-level depth** - no limit on tree depth

2. **Cycle Prevention**: Must detect and prevent circular dependencies
   - Example: A → B → C, prevent setting C's parent to A
   - Validation happens during parent assignment in settings
   - Show error: "Cannot set parent: would create circular dependency"

3. **Root Breakers**: Circuit breakers with no parent act as "main breakers"

### Cascading Behavior

1. **State Propagation**:
   - When parent turns **ON** → all descendants turn **ON**
   - When parent turns **OFF** → all descendants turn **OFF**
   - Propagation is **asynchronous** (fire-and-forget, non-blocking)

2. **Independent Control**:
   - Children can turn ON/OFF independently regardless of parent state
   - No "locking" behavior - children are not restricted by parent state

3. **Error Handling**:
   - **Best effort** - if some children fail to update, log error and continue
   - Parent's own state change always succeeds
   - Failed child updates are logged with device ID and error message

### Initial State

1. **During Pairing**:
   - If parent is assigned: inherit parent's current `onoff` state
   - If no parent (root breaker): default to **ON**

2. **After Parent Reassignment in Settings**:
   - Keep current state (do NOT sync to new parent's state)
   - Allows hierarchy reorganization without automation disruption

### Device Lifecycle

1. **Pairing Flow**:
   - **Step 1**: Introduction screen
     - Explain parent-child cascade concept
     - Show diagram or example hierarchy
     - Explain that ON = automations enabled, OFF = automations disabled
   - **Step 2**: Parent selection
     - Dropdown showing all existing circuit breakers
     - Format: `"Device Name (Zone Name)"` e.g., `"Main Breaker (Living Room)"`
     - First option: `"None"` (creates root breaker)
     - Sorted alphabetically by device name
   - **Device Naming**: Default name "Circuit Breaker" (localized)
   - **Zone Assignment**: Standard Homey zone selection (optional)

2. **Settings**:
   - **Parent Circuit Breaker**: Dropdown selector
     - Shows all circuit breakers except self and descendants (prevent cycles)
     - Option "None" to become root breaker
     - Cycle detection on save with error message if invalid
   - **Zone**: Standard Homey zone selector (inherited from Homey.Device)
   - **Device Name**: Standard Homey name field (inherited from Homey.Device)

3. **Deletion**:
   - When circuit breaker is deleted, **orphan all children**
   - Children's parent becomes `null` (they become root breakers)
   - Children continue functioning independently
   - Do NOT cascade delete to children

### Flow Cards

#### Trigger Cards

1. **"Circuit breaker turned on"**
   - Fires when device transitions from OFF → ON
   - **Tokens**: None
   - **Use case**: React to automation re-enabling

2. **"Circuit breaker turned off"**
   - Fires when device transitions from ON → OFF
   - **Tokens**: None
   - **Use case**: React to automation disabling

3. **"Circuit breaker is flipped"**
   - Fires on ANY state change (ON → OFF OR OFF → ON)
   - **Tokens**: `state` (boolean) - current state after flip
   - **Use case**: Log any state change regardless of direction

#### Condition Cards

1. **"Circuit breaker is on"**
   - Returns `true` if device's `onoff` capability is `true`
   - Returns `false` if device's `onoff` capability is `false`
   - **Note**: Only checks device's own state, does NOT walk up hierarchy
   - **Use case**: Gate automation execution behind breaker state

#### Action Cards

1. **"Turn on circuit breaker"**
   - Sets device's `onoff` to `true`
   - Cascades ON to all descendants asynchronously
   - **Use case**: Enable automations for this branch

2. **"Turn off circuit breaker"**
   - Sets device's `onoff` to `false`
   - Cascades OFF to all descendants asynchronously
   - **Use case**: Disable automations for this branch

**Note**: Standard Homey "Turn on/off" actions also work via `onoff` capability

### User Interface

1. **Device Tile**:
   - Display `onoff` capability as toggle switch/button
   - **ON state**: Green/active indicator
   - **OFF state**: Gray/inactive indicator
   - No additional text or counters on tile

2. **Settings Screen**:
   - Show parent circuit breaker name (or "None" if root)
   - Dropdown to change parent (with cycle validation)
   - Standard Homey device settings (name, zone, advanced)

### Zone Behavior

- **Zone assignment**: Standard Homey feature, no special logic
- **Zone independence**: Circuit breaker hierarchy is completely separate from zone hierarchy
- **Example**: A breaker in "Kitchen" zone can have a parent in "Living Room" zone
- **Display**: Zone shown in pairing dropdown for context only

## Acceptance Criteria

### Pairing & Setup

- [ ] User can pair new circuit breaker device
- [ ] Pairing shows introductory explanation screen
- [ ] Pairing shows parent selection dropdown with format "Device Name (Zone Name)"
- [ ] "None" option appears first in parent dropdown (creates root breaker)
- [ ] Newly paired device with parent inherits parent's current state
- [ ] Newly paired device without parent defaults to ON
- [ ] Device gets default name "Circuit Breaker" (localized)
- [ ] Zone can be assigned during or after pairing (standard Homey behavior)

### Hierarchy Management

- [ ] Settings allow changing parent circuit breaker
- [ ] Parent dropdown shows all circuit breakers except self
- [ ] Parent dropdown excludes descendants (prevents cycles)
- [ ] Attempting to create cycle shows error: "Cannot set parent: would create circular dependency"
- [ ] Cycle validation prevents save when cycle detected
- [ ] Changing parent does NOT change device's current state
- [ ] Root breaker can be assigned a parent (becomes child)
- [ ] Child breaker can have parent removed (becomes root)

### Cascading Behavior

- [ ] When parent turns ON, all descendants turn ON asynchronously
- [ ] When parent turns OFF, all descendants turn OFF asynchronously
- [ ] Cascade propagates through entire tree (grandchildren, great-grandchildren, etc.)
- [ ] Parent state change completes immediately (doesn't wait for children)
- [ ] Child can independently turn ON even when parent is OFF
- [ ] Child can independently turn OFF even when parent is ON
- [ ] If child update fails, error is logged but cascade continues to other children
- [ ] Parent's state change always succeeds regardless of child failures

### Device Lifecycle

- [ ] Deleting circuit breaker orphans all children (sets their parent to `null`)
- [ ] Orphaned children become root breakers
- [ ] Orphaned children retain their current state
- [ ] Deleting parent does NOT cascade delete to children
- [ ] Device can be deleted even if it has children

### Flow Cards - Triggers

- [ ] "Circuit breaker turned on" fires when device goes OFF → ON
- [ ] "Circuit breaker turned on" does NOT fire when already ON
- [ ] "Circuit breaker turned off" fires when device goes ON → OFF
- [ ] "Circuit breaker turned off" does NOT fire when already OFF
- [ ] "Circuit breaker is flipped" fires on any state change (ON→OFF or OFF→ON)
- [ ] "Circuit breaker is flipped" provides `state` token with new state value
- [ ] Triggers fire for both manual changes and cascaded changes

### Flow Cards - Conditions

- [ ] "Circuit breaker is on" returns `true` when `onoff` is `true`
- [ ] "Circuit breaker is on" returns `false` when `onoff` is `false`
- [ ] Condition checks only device's own state (not parent/hierarchy)

### Flow Cards - Actions

- [ ] "Turn on circuit breaker" sets device to ON
- [ ] "Turn on circuit breaker" cascades ON to all descendants
- [ ] "Turn off circuit breaker" sets device to OFF
- [ ] "Turn off circuit breaker" cascades OFF to all descendants
- [ ] Standard Homey "Turn on/off" actions work via `onoff` capability
- [ ] Action completes immediately without waiting for cascade

### UI & Display

- [ ] Device tile shows onoff toggle switch
- [ ] ON state shows as active/green indicator
- [ ] OFF state shows as inactive/gray indicator
- [ ] Settings show parent name or "None"
- [ ] Parent dropdown in settings shows zones in parentheses for context

### Error Handling

- [ ] Invalid parent assignment (cycle) shows clear error message
- [ ] Errors during child cascade are logged but don't fail parent operation
- [ ] Missing parent (deleted device) is handled gracefully (orphan behavior)
- [ ] Device continues functioning if parent becomes unavailable

## Technical Implementation Hints

### Architecture Overview

```
drivers/wiab-circuit-breaker/
├── driver.ts          # Pairing flow, flow card registration
├── device.ts          # Core device logic, cascade implementation
└── pair/
    ├── intro.html     # Step 1: Introduction screen
    └── select_parent.html  # Step 2: Parent selection
```

### Key Components

#### 1. Device Registry / Child Lookup

**Challenge**: Finding all children of a device efficiently

**Solution**: Use HomeyAPI to query all circuit breaker devices and filter by parent

```typescript
// In device.ts
private async getChildren(): Promise<CircuitBreakerDevice[]> {
  const app = this.homey.app as WIABApp;
  if (!app.homeyApi) return [];

  const devices = await app.homeyApi.devices.getDevices();
  const myId = this.getData().id;
  const children: CircuitBreakerDevice[] = [];

  for (const [deviceId, device] of Object.entries(devices)) {
    const deviceObj = device as { driverId?: string; settings?: { parentId?: string } };

    // Check if device is circuit breaker AND has this device as parent
    if (deviceObj.driverId === 'wiab:wiab-circuit-breaker' &&
        deviceObj.settings?.parentId === myId) {
      children.push(device as CircuitBreakerDevice);
    }
  }

  return children;
}
```

#### 2. Cycle Detection Algorithm

**Challenge**: Prevent circular dependencies when assigning parent

**Solution**: Walk up ancestor chain, check if new parent is already a descendant

```typescript
// In device.ts or settings validation
private async wouldCreateCycle(proposedParentId: string | null): Promise<boolean> {
  if (!proposedParentId) return false; // No parent = no cycle

  const myId = this.getData().id;
  if (proposedParentId === myId) return true; // Self-parent = cycle

  // Walk up from proposed parent, check if we encounter self
  let currentId: string | null = proposedParentId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === myId) return true; // Found self in ancestry = cycle
    if (visited.has(currentId)) return true; // Loop in ancestry = cycle

    visited.add(currentId);
    currentId = await this.getParentId(currentId);
  }

  return false;
}

private async getParentId(deviceId: string): Promise<string | null> {
  const app = this.homey.app as WIABApp;
  if (!app.homeyApi) return null;

  const devices = await app.homeyApi.devices.getDevices();
  const device = devices[deviceId];
  const deviceObj = device as { settings?: { parentId?: string } };

  return deviceObj?.settings?.parentId || null;
}
```

#### 3. Asynchronous Cascade Implementation

**Challenge**: Update all descendants without blocking parent

**Solution**: Fire-and-forget async updates with error logging

```typescript
// In device.ts
private async cascadeStateChange(newState: boolean): Promise<void> {
  try {
    const children = await this.getChildren();

    // Fire-and-forget - don't await
    this.updateChildrenAsync(children, newState);
  } catch (error) {
    this.error('Failed to initiate cascade:', error);
    // Don't throw - parent update should succeed
  }
}

private async updateChildrenAsync(children: CircuitBreakerDevice[], newState: boolean): Promise<void> {
  const updatePromises = children.map(async (child) => {
    try {
      await child.setCapabilityValue('onoff', newState);
      this.log(`Cascaded ${newState ? 'ON' : 'OFF'} to child: ${child.getName()}`);
    } catch (error) {
      // Best effort - log but continue
      this.error(`Failed to cascade to child ${child.getData().id}:`, error);
    }
  });

  // Wait for all children in parallel, but don't fail on errors
  await Promise.allSettled(updatePromises);
}

// Override onCapabilityOnoff to trigger cascade
async onCapabilityOnoff(value: boolean): Promise<void> {
  this.log(`State changing to: ${value ? 'ON' : 'OFF'}`);

  // Update own state
  await this.setCapabilityValue('onoff', value);

  // Cascade to children (async, non-blocking)
  await this.cascadeStateChange(value);

  return Promise.resolve();
}
```

#### 4. Settings Validation with Cycle Detection

**Challenge**: Validate parent assignment before saving settings

**Solution**: Hook into `onSettings` lifecycle with validation

```typescript
// In device.ts
async onSettings(event: {
  oldSettings: { parentId?: string };
  newSettings: { parentId?: string };
  changedKeys: string[];
}): Promise<void> {
  if (event.changedKeys.includes('parentId')) {
    const proposedParentId = event.newSettings.parentId || null;

    // Validate cycle
    if (await this.wouldCreateCycle(proposedParentId)) {
      throw new Error('Cannot set parent: would create circular dependency');
    }

    this.log(`Parent changed from ${event.oldSettings.parentId || 'None'} to ${proposedParentId || 'None'}`);
    // Note: Do NOT sync state to new parent (requirement)
  }
}
```

#### 5. Initial State Determination

**Challenge**: Set correct initial state during pairing based on parent

**Solution**: Check parent state in `onInit` if parent is assigned

```typescript
// In device.ts
async onInit(): Promise<void> {
  this.log('Circuit breaker initializing');

  // Register capability listener for onoff changes
  this.registerCapabilityListener('onoff', async (value: boolean) => {
    await this.onCapabilityOnoff(value);
  });

  // Check if this is first initialization (just paired)
  const settings = this.getSettings() as { parentId?: string };
  const currentState = this.getCapabilityValue('onoff');

  if (currentState === null || currentState === undefined) {
    // First initialization - set initial state
    const initialState = await this.determineInitialState(settings.parentId);
    await this.setCapabilityValue('onoff', initialState);
    this.log(`Initial state set to: ${initialState ? 'ON' : 'OFF'}`);
  }

  this.log('Circuit breaker initialized');
}

private async determineInitialState(parentId?: string): Promise<boolean> {
  if (!parentId) {
    // No parent = root breaker = default ON
    return true;
  }

  try {
    // Has parent = inherit parent's current state
    const app = this.homey.app as WIABApp;
    if (!app.homeyApi) return true;

    const devices = await app.homeyApi.devices.getDevices();
    const parent = devices[parentId];
    const parentObj = parent as { capabilitiesObj?: { onoff?: { value?: boolean } } };

    return parentObj?.capabilitiesObj?.onoff?.value ?? true;
  } catch (error) {
    this.error('Failed to get parent state, defaulting to ON:', error);
    return true;
  }
}
```

#### 6. Pairing Flow Implementation

**Challenge**: Show circuit breaker list with zones in dropdown

**Solution**: Fetch devices and zones via HomeyAPI in pairing handler

```typescript
// In driver.ts
async onPair(session: Homey.Driver.PairSession): Promise<void> {
  let selectedParentId: string | null = null;

  // Handler: Get list of available parent circuit breakers
  session.setHandler('get_circuit_breakers', async (): Promise<Array<{ id: string; name: string }>> => {
    const app = this.homey.app as WIABApp;
    if (!app.homeyApi) {
      throw new Error('System not ready. Please try again.');
    }

    const devices = await app.homeyApi.devices.getDevices();
    const breakers: Array<{ id: string; name: string }> = [
      { id: 'none', name: 'None' } // First option
    ];

    for (const [deviceId, device] of Object.entries(devices)) {
      const deviceObj = device as { driverId?: string; name?: string; zone?: string };

      if (deviceObj.driverId === 'wiab:wiab-circuit-breaker') {
        let displayName = deviceObj.name || 'Circuit Breaker';

        // Add zone name if available
        if (deviceObj.zone) {
          try {
            const zone = await app.homeyApi.zones.getZone({ id: deviceObj.zone });
            displayName = `${displayName} (${zone.name || 'Unknown Zone'})`;
          } catch (error) {
            this.log('Could not fetch zone:', error);
          }
        }

        breakers.push({ id: deviceId, name: displayName });
      }
    }

    return breakers;
  });

  // Handler: Store selected parent
  session.setHandler('parent_selected', async (data: { parentId: string }): Promise<void> => {
    selectedParentId = data.parentId === 'none' ? null : data.parentId;
    this.log('Parent selected:', selectedParentId || 'None');
  });

  // Handler: Create device
  session.setHandler('list_devices', async (): Promise<Array<{
    name: string;
    data: { id: string };
    settings: { parentId: string | null };
  }>> => {
    return [{
      name: this.homey.__('device.name'), // Localized "Circuit Breaker"
      data: { id: `circuit-breaker-${Date.now()}` },
      settings: { parentId: selectedParentId }
    }];
  });
}
```

#### 7. Flow Card Registration

**Challenge**: Register three trigger types with proper filtering

**Solution**: Use Homey flow card API with appropriate filters

```typescript
// In driver.ts
private registerFlowCards(): void {
  // Trigger: Turned ON
  const turnedOnTrigger = this.homey.flow.getDeviceTriggerCard('circuit_breaker_turned_on');

  // Trigger: Turned OFF
  const turnedOffTrigger = this.homey.flow.getDeviceTriggerCard('circuit_breaker_turned_off');

  // Trigger: Is flipped (any change)
  const flippedTrigger = this.homey.flow.getDeviceTriggerCard('circuit_breaker_flipped');

  // Condition: Is ON
  const isOnCondition = this.homey.flow.getConditionCard('circuit_breaker_is_on');
  isOnCondition.registerRunListener(async (args): Promise<boolean> => {
    const device = args.device as CircuitBreakerDevice;
    return device.getCapabilityValue('onoff') === true;
  });

  // Actions use standard onoff capability automatically
}
```

**In device.ts**, trigger flow cards on state change:

```typescript
async onCapabilityOnoff(value: boolean): Promise<void> {
  const oldValue = this.getCapabilityValue('onoff');

  // Update capability
  await this.setCapabilityValue('onoff', value);

  // Trigger specific flow card
  if (value === true && oldValue === false) {
    await this.driver.homey.flow.getDeviceTriggerCard('circuit_breaker_turned_on')
      .trigger(this, {}, {});
  } else if (value === false && oldValue === true) {
    await this.driver.homey.flow.getDeviceTriggerCard('circuit_breaker_turned_off')
      .trigger(this, {}, {});
  }

  // Trigger generic "flipped" card
  if (value !== oldValue) {
    await this.driver.homey.flow.getDeviceTriggerCard('circuit_breaker_flipped')
      .trigger(this, { state: value }, {});
  }

  // Cascade to children
  await this.cascadeStateChange(value);
}
```

### Settings Structure

```json
{
  "parentId": {
    "type": "string",
    "label": {
      "en": "Parent Circuit Breaker",
      "nl": "Bovenliggende stroomonderbreker"
    },
    "value": null,
    "hint": {
      "en": "Select a parent circuit breaker, or leave as 'None' for a root breaker"
    }
  }
}
```

**Note**: Parent dropdown must be dynamically populated (like WIAB device pairing) to show current circuit breakers and exclude invalid options.

### Data Structure

```typescript
// Device data (immutable after pairing)
interface CircuitBreakerData {
  id: string; // Unique device ID
}

// Device settings (mutable)
interface CircuitBreakerSettings {
  parentId: string | null; // Parent device ID or null for root
}
```

### Performance Considerations

1. **Large Hierarchies**: With 100+ breakers, async cascade is essential
2. **Cycle Detection**: Cache parent chain during validation to avoid repeated lookups
3. **Child Lookup**: Consider caching children list with TTL if performance issues arise
4. **Event Storms**: Multiple rapid state changes should not queue up cascades (debounce if needed)

### Error Handling Best Practices

1. **Graceful Degradation**: Device should work even if HomeyAPI is temporarily unavailable
2. **Logging**: Log all cascade operations with device IDs for debugging
3. **User Feedback**: Settings errors should show in UI, not just logs
4. **Recovery**: If parent deleted, device becomes root automatically (orphan behavior)

### Testing Considerations

1. **Unit Tests**:
   - Cycle detection algorithm with various tree structures
   - Cascade propagation logic
   - Initial state determination

2. **Integration Tests**:
   - Create hierarchy of 3+ levels, verify cascade works end-to-end
   - Delete parent, verify children orphaned correctly
   - Attempt cycle creation, verify error shown
   - Rapid state changes, verify no race conditions

3. **Edge Cases**:
   - Parent device deleted while child is pairing
   - Network failure during cascade
   - 100+ devices in hierarchy
   - Cycle involving 10+ devices
   - Rapidly toggling parent state (stress test)

### Migration Considerations

**First Release**: No migration needed (new device type)

**Future Changes**: If settings structure changes, provide migration in `onInit`:
```typescript
async onInit(): Promise<void> {
  // Migrate old settings if needed
  await this.migrateSettings();
  // ... rest of init
}
```

## Success Metrics

1. **Usability**: Users can set up 3-level hierarchy within 2 minutes
2. **Reliability**: Cascade completes successfully in >99% of operations
3. **Performance**: Cascade to 50 descendants completes within 5 seconds
4. **Error Rate**: <1% of parent assignments result in cycle detection errors (indicates good UX)

## Related Issues

- Consider integration with WIAB device for automated circuit breaker control
- Consider future enhancement: "Cascade strategy" setting (ON only, OFF only, both)
- Consider future enhancement: "Lock children" mode (children can't override parent)

## Out of Scope (Not in Initial Release)

- Multi-parent support (complexity not justified by use cases)
- Cascade bypass/override actions (keep behavior simple)
- State restoration after parent turns ON (would add complexity)
- Visual hierarchy tree in UI (can be added later if requested)
- Bulk operations (turn on/off multiple breakers at once)

---

**Labels**: `enhancement`, `new-device`, `virtual-device`
**Priority**: Medium
**Estimated Effort**: Large (2-3 weeks for experienced developer)
