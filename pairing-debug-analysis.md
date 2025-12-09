# WIAB Pairing Flow Debug Analysis

## Test Execution Summary

Date: 2025-12-08T20:29
Test: Complete WIAB device pairing with sensor selection

### Sensors Selected
- **Trigger Sensor**: ka: pir kantoor (3369c834-bcf4-48b6-86c0-72e81156eda3) - Motion sensor
- **Reset Sensor**: ka: deur sensor (d9b9f97b-b071-4951-ae44-b9aa90a386e3) - Contact sensor

## Critical Debug Output

### 1. Pairing Flow - SUCCESS ✓

The pairing flow worked correctly:

```
2025-12-08T20:29:15.416Z [log] [ManagerDrivers] [Driver:wiab-device] Reset sensors selected: [
  {
    deviceId: 'd9b9f97b-b071-4951-ae44-b9aa90a386e3',
    name: 'ka: deur sensor',
    zone: null,
    capability: 'alarm_contact'
  }
]
2025-12-08T20:29:16.589Z [log] [ManagerDrivers] [Driver:wiab-device] Creating WIAB device with selected sensors
2025-12-08T20:29:16.590Z [log] [ManagerDrivers] [Driver:wiab-device] Trigger sensors: 1, Reset sensors: 1
2025-12-08T20:29:16.590Z [log] [ManagerDrivers] [Driver:wiab-device] Returning WIAB device for pairing
```

**Analysis**:
- HTML pages correctly captured user selections
- Driver handlers received the selections properly
- Device was created with correct sensor configurations
- Settings were stored as JSON strings

### 2. Device Initialization - SUCCESS ✓

The device initialized correctly:

```
2025-12-08T20:29:18.728Z [log] [ManagerDrivers] [Driver:wiab-device] [Device:33fd8106-b893-4fb2-87a7-97e1ae5e5fc7] WIAB device has been initialized
2025-12-08T20:29:18.728Z [log] [ManagerDrivers] [Driver:wiab-device] [Device:33fd8106-b893-4fb2-87a7-97e1ae5e5fc7] Setting up monitoring for 1 trigger sensors and 1 reset sensors
2025-12-08T20:29:18.728Z [log] Starting SensorMonitor with polling interval: 2000 ms
2025-12-08T20:29:18.729Z [log] Monitoring trigger sensors: 1
2025-12-08T20:29:18.729Z [log] Monitoring reset sensors: 1
```

**Analysis**:
- Device initialization completed
- Sensor configurations parsed correctly from settings
- SensorMonitor created and started successfully

### 3. ROOT CAUSE IDENTIFIED - Device Structure Problem ❌

**CRITICAL DEBUG OUTPUT**:

```
2025-12-08T20:29:18.729Z [log] [DEBUG] Device d9b9f97b-b071-4951-ae44-b9aa90a386e3 structure: {
  hasCapabilitiesObj: false,
  capabilityKeys: [],
  hasCapability: 'no',
  hasGetCapabilityValue: 'no'
}
2025-12-08T20:29:18.730Z [err] Device d9b9f97b-b071-4951-ae44-b9aa90a386e3 does not have capability: alarm_contact

2025-12-08T20:29:18.730Z [log] [DEBUG] Device 3369c834-bcf4-48b6-86c0-72e81156eda3 structure: {
  hasCapabilitiesObj: false,
  capabilityKeys: [],
  hasCapability: 'no',
  hasGetCapabilityValue: 'no'
}
2025-12-08T20:29:18.730Z [err] Device 3369c834-bcf4-48b6-86c0-72e81156eda3 does not have capability: alarm_motion
```

## Root Cause Analysis

### Problem
The device object returned by `HomeyAPI.devices.getDevice({ id: deviceId })` in `SensorMonitor.getDevice()` does NOT have the expected structure:

**Expected** (based on pairing flow):
```javascript
{
  capabilitiesObj: {
    alarm_motion: { value: true/false },
    alarm_contact: { value: true/false }
  }
}
```

**Actual** (in SensorMonitor):
```javascript
{
  // No capabilitiesObj property
  // No hasCapability method
  // No getCapabilityValue method
}
```

### Comparison: Pairing vs Runtime

#### During Pairing (WORKS) ✓
Location: `/Users/andy/projects/ndygen/wiab/drivers/wiab-device/driver.ts` lines 64-82

```typescript
const devices = await app.homeyApi.devices.getDevices();  // Gets ALL devices
for (const [deviceId, device] of Object.entries<any>(devices)) {
  const capabilityNames = Object.keys(device.capabilitiesObj || {});
  if (capabilityNames.includes('alarm_motion')) {
    // SUCCESS: capabilitiesObj exists and has capabilities
  }
}
```

#### During Runtime (FAILS) ❌
Location: `/Users/andy/projects/ndygen/wiab/lib/SensorMonitor.ts` lines 250-267

```typescript
const devices = this.homeyApi.devices;
return devices.getDevice({ id: deviceId });  // Gets SINGLE device by ID
```

### The Bug

The HomeyAPI has two different methods:
1. **`devices.getDevices()`** - Returns ALL devices with full structure including `capabilitiesObj`
2. **`devices.getDevice({ id })`** - Returns SINGLE device but structure is INCOMPLETE/DIFFERENT

When `SensorMonitor.getDevice()` calls `devices.getDevice({ id: deviceId })`, it returns a device object that:
- Does NOT have `capabilitiesObj` property
- Does NOT have `hasCapability` method
- Does NOT have `getCapabilityValue` method

This causes the capability detection to fail even though the devices exist and have the capabilities.

## Solution Required

The `SensorMonitor.getDevice()` method needs to be changed from:

```typescript
// BROKEN: Returns incomplete device object
return devices.getDevice({ id: deviceId });
```

To either:

### Option 1: Cache devices from getDevices()
```typescript
// In constructor or start()
const allDevices = await this.homeyApi.devices.getDevices();
this.deviceCache = allDevices;

// In getDevice()
return this.deviceCache[deviceId] || null;
```

### Option 2: Fetch all devices on each poll (less efficient)
```typescript
private async getDevice(deviceId: string): Promise<any | null> {
  try {
    const devices = await this.homeyApi.devices.getDevices();
    return devices[deviceId] || null;
  } catch (error) {
    return null;
  }
}
```

### Option 3: Use event listeners instead of polling
Use HomeyAPI's device event system instead of polling (requires major refactor).

## Impact

**Severity**: CRITICAL
**Scope**: ALL sensor monitoring is non-functional
**User Impact**: Virtual occupancy sensor never activates/deactivates

The WIAB device will:
- Pair successfully ✓
- Initialize successfully ✓
- Start monitoring ✓
- BUT never detect sensor state changes ❌

## Recommended Fix

Implement **Option 1** (device caching):

1. Fetch all devices once during `SensorMonitor.start()`
2. Cache them in a Map/object
3. Use cached devices for capability checks
4. Optionally: refresh cache periodically or on device added/removed events

This provides:
- Best performance (no repeated API calls)
- Correct device structure with capabilitiesObj
- Reliability (uses same API method as pairing flow)

## Additional Notes

### During Pairing - Device Discovery Works
The driver correctly discovers devices during pairing:

```
2025-12-08T20:29:09.443Z [log] [ManagerDrivers] [Driver:wiab-device] Found 15 contact devices total
```

All 15 devices were found with correct capabilities using `getDevices()`.

### Polling Continues Despite Errors
The SensorMonitor continues polling every 2 seconds, but always fails:

```
2025-12-08T20:29:20.736Z [err] Device d9b9f97b-b071-4951-ae44-b9aa90a386e3 does not have capability: alarm_contact
2025-12-08T20:29:22.739Z [err] Device d9b9f97b-b071-4951-ae44-b9aa90a386e3 does not have capability: alarm_contact
2025-12-08T20:29:24.744Z [err] Device d9b9f97b-b071-4951-ae44-b9aa90a386e3 does not have capability: alarm_contact
```

This creates log spam and wastes CPU cycles.

## Files Requiring Changes

1. `/Users/andy/projects/ndygen/wiab/lib/SensorMonitor.ts`
   - Add device caching in constructor or start()
   - Modify getDevice() to use cached devices
   - Make start() async if fetching devices

2. `/Users/andy/projects/ndygen/wiab/drivers/wiab-device/device.ts`
   - Update setupSensorMonitoring() to await async start() if needed

## Test Validation

After implementing the fix:
1. Re-run the pairing flow
2. Verify device structure debug logs show:
   ```
   hasCapabilitiesObj: true,
   capabilityKeys: ['alarm_contact', ...],
   ```
3. Trigger the physical motion sensor and verify occupancy activates
4. Open the physical door sensor and verify occupancy resets
5. Check logs for successful state change detection
