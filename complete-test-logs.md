# Complete WIAB Pairing Flow Test Logs

## Test Setup
- Date: 2025-12-08
- Test Type: Automated pairing flow with Playwright
- Target Sensors:
  - Motion: ka: pir kantoor (3369c834-bcf4-48b6-86c0-72e81156eda3)
  - Contact: ka: deur sensor (d9b9f97b-b071-4951-ae44-b9aa90a386e3)

## Complete Log Timeline

### App Initialization
```
2025-12-08T20:25:39.228Z [log] [WIABApp] WIAB app initializing...
2025-12-08T20:25:39.260Z [log] [WIABApp] HomeyAPI client initialized successfully
2025-12-08T20:25:39.260Z [log] [WIABApp] WIAB app has been initialized
2025-12-08T20:25:39.263Z [log] [ManagerDrivers] [Driver:wiab-device] WIAB driver has been initialized
```

### Pairing Session Started
User initiated pairing via Playwright automation.

### Page 1: Motion Sensor Discovery (get_motion_devices)
```
2025-12-08T20:29:09.442Z [log] [ManagerDrivers] [Driver:wiab-device] Fetching motion devices for pairing UI
2025-12-08T20:29:09.442Z [log] [ManagerDrivers] [Driver:wiab-device] Found 90 total devices on Homey
```

Motion sensors discovered with alarm_motion capability:
- ka: pir kantoor (3369c834-bcf4-48b6-86c0-72e81156eda3) ✓
- ... (multiple other devices)

### Page 2: Contact Sensor Discovery (get_contact_devices)
```
2025-12-08T20:29:09.442Z [log] [ManagerDrivers] [Driver:wiab-device] Fetching contact devices for pairing UI
2025-12-08T20:29:09.442Z [log] [ManagerDrivers] [Driver:wiab-device] Found 90 total devices on Homey
```

Contact sensors discovered with alarm_contact capability (showing deprecation warnings):
```
2025-12-08T20:29:09.442Z [log] [ManagerDrivers] [Driver:wiab-device] Device ka: deur sensor (d9b9f97b-b071-4951-ae44-b9aa90a386e3) has alarm_contact capability
Device.zoneName is deprecated.
2025-12-08T20:29:09.443Z [log] [ManagerDrivers] [Driver:wiab-device] Device voordeur (d9f7d6c3-079d-4356-b8bf-0792bf78ab7a) has alarm_contact capability
Device.zoneName is deprecated.
2025-12-08T20:29:09.443Z [log] [ManagerDrivers] [Driver:wiab-device] Device raam (e2600c55-cb0a-4b5e-b6ed-3f54ebb28fd5) has alarm_contact capability
Device.zoneName is deprecated.
2025-12-08T20:29:09.443Z [log] [ManagerDrivers] [Driver:wiab-device] Device deur (ec219cac-c5e1-48a7-908e-e41852ba1a96) has alarm_contact capability
Device.zoneName is deprecated.
2025-12-08T20:29:09.443Z [log] [ManagerDrivers] [Driver:wiab-device] Device deur sensor (fefbf8fc-eb0f-4514-a640-b8d968e6cabb) has alarm_contact capability
Device.zoneName is deprecated.
2025-12-08T20:29:09.443Z [log] [ManagerDrivers] [Driver:wiab-device] Device raam (ffb625da-9352-4480-9c7c-be2c14ff04ff) has alarm_contact capability
Device.zoneName is deprecated.
2025-12-08T20:29:09.443Z [log] [ManagerDrivers] [Driver:wiab-device] Found 15 contact devices total
```

### User Selections Received
```
2025-12-08T20:29:15.416Z [log] [ManagerDrivers] [Driver:wiab-device] Reset sensors selected: [
  {
    deviceId: 'd9b9f97b-b071-4951-ae44-b9aa90a386e3',
    name: 'ka: deur sensor',
    zone: null,
    capability: 'alarm_contact'
  }
]
```

Note: Trigger sensor selection was also captured but not shown in this log excerpt.

### Device Creation (list_devices handler)
```
2025-12-08T20:29:16.589Z [log] [ManagerDrivers] [Driver:wiab-device] Creating WIAB device with selected sensors
2025-12-08T20:29:16.590Z [log] [ManagerDrivers] [Driver:wiab-device] Trigger sensors: 1, Reset sensors: 1
2025-12-08T20:29:16.590Z [log] [ManagerDrivers] [Driver:wiab-device] Returning WIAB device for pairing
```

### Device Initialization
```
2025-12-08T20:29:18.728Z [log] [ManagerDrivers] [Driver:wiab-device] [Device:33fd8106-b893-4fb2-87a7-97e1ae5e5fc7] WIAB device has been initialized
2025-12-08T20:29:18.728Z [log] [ManagerDrivers] [Driver:wiab-device] [Device:33fd8106-b893-4fb2-87a7-97e1ae5e5fc7] Setting up monitoring for 1 trigger sensors and 1 reset sensors
```

### SensorMonitor Started
```
2025-12-08T20:29:18.728Z [log] Starting SensorMonitor with polling interval: 2000 ms
2025-12-08T20:29:18.729Z [log] Monitoring trigger sensors: 1
2025-12-08T20:29:18.729Z [log] Monitoring reset sensors: 1
```

### CRITICAL: Device Structure Debug Output

**Reset Sensor (Contact):**
```
2025-12-08T20:29:18.729Z [log] [DEBUG] Device d9b9f97b-b071-4951-ae44-b9aa90a386e3 structure: {
  hasCapabilitiesObj: false,
  capabilityKeys: [],
  hasCapability: 'no',
  hasGetCapabilityValue: 'no'
}
2025-12-08T20:29:18.730Z [err] Device d9b9f97b-b071-4951-ae44-b9aa90a386e3 does not have capability: alarm_contact
```

**Trigger Sensor (Motion):**
```
2025-12-08T20:29:18.730Z [log] [DEBUG] Device 3369c834-bcf4-48b6-86c0-72e81156eda3 structure: {
  hasCapabilitiesObj: false,
  capabilityKeys: [],
  hasCapability: 'no',
  hasGetCapabilityValue: 'no'
}
2025-12-08T20:29:18.730Z [err] Device 3369c834-bcf4-48b6-86c0-72e81156eda3 does not have capability: alarm_motion
```

### Device Initialization Complete (with errors)
```
2025-12-08T20:29:18.730Z [err] Device d9b9f97b-b071-4951-ae44-b9aa90a386e3 does not have capability: alarm_contact
2025-12-08T20:29:18.730Z [err] Device 3369c834-bcf4-48b6-86c0-72e81156eda3 does not have capability: alarm_motion
2025-12-08T20:29:18.730Z [log] [ManagerDrivers] [Driver:wiab-device] [Device:33fd8106-b893-4fb2-87a7-97e1ae5e5fc7] WIAB device initialization complete
```

### Ongoing Polling Errors (every 2 seconds)
```
2025-12-08T20:29:20.736Z [err] Device d9b9f97b-b071-4951-ae44-b9aa90a386e3 does not have capability: alarm_contact
2025-12-08T20:29:20.738Z [err] Device 3369c834-bcf4-48b6-86c0-72e81156eda3 does not have capability: alarm_motion

2025-12-08T20:29:22.739Z [err] Device d9b9f97b-b071-4951-ae44-b9aa90a386e3 does not have capability: alarm_contact
2025-12-08T20:29:22.739Z [err] Device 3369c834-bcf4-48b6-86c0-72e81156eda3 does not have capability: alarm_motion

2025-12-08T20:29:24.744Z [err] Device d9b9f97b-b071-4951-ae44-b9aa90a386e3 does not have capability: alarm_contact
2025-12-08T20:29:24.746Z [err] Device 3369c834-bcf4-48b6-86c0-72e81156eda3 does not have capability: alarm_motion

2025-12-08T20:29:26.748Z [err] Device d9b9f97b-b071-4951-ae44-b9aa90a386e3 does not have capability: alarm_contact
2025-12-08T20:29:26.748Z [err] Device 3369c834-bcf4-48b6-86c0-72e81156eda3 does not have capability: alarm_motion

2025-12-08T20:29:28.754Z [err] Device d9b9f97b-b071-4951-ae44-b9aa90a386e3 does not have capability: alarm_contact
2025-12-08T20:29:28.755Z [err] Device 3369c834-bcf4-48b6-86c0-72e81156eda3 does not have capability: alarm_motion

2025-12-08T20:29:30.757Z [err] Device d9b9f97b-b071-4951-ae44-b9aa90a386e3 does not have capability: alarm_contact
2025-12-08T20:29:30.757Z [err] Device 3369c834-bcf4-48b6-86c0-72e81156eda3 does not have capability: alarm_motion
```

The pattern continues every 2 seconds (POLL_INTERVAL_MS = 2000).

## Summary

### What's Working ✓
1. App initialization
2. Driver initialization
3. Device discovery during pairing (getDevices() API)
4. User selection capture from HTML pages
5. Driver handlers receiving selections
6. Device creation with sensor configurations
7. Device initialization
8. SensorMonitor creation and startup
9. Polling mechanism running

### What's Broken ❌
1. Device lookup in SensorMonitor.getDevice()
2. Device object structure (missing capabilitiesObj)
3. Capability detection
4. Sensor state reading
5. Occupancy state changes

### Root Cause
The `HomeyAPI.devices.getDevice({ id })` method returns a device object with incomplete structure compared to `HomeyAPI.devices.getDevices()`. The device object is missing:
- `capabilitiesObj` property
- `hasCapability` method
- `getCapabilityValue` method

This causes ALL capability checks to fail during runtime monitoring, even though the same devices were successfully discovered during pairing.

## Code Locations

### Where It Works (Pairing)
File: `/Users/andy/projects/ndygen/wiab/drivers/wiab-device/driver.ts`
Lines: 64, 104
Method: `await app.homeyApi.devices.getDevices()` - Returns ALL devices with full structure

### Where It Fails (Runtime)
File: `/Users/andy/projects/ndygen/wiab/lib/SensorMonitor.ts`
Lines: 250-267
Method: `devices.getDevice({ id: deviceId })` - Returns SINGLE device with incomplete structure

## Next Steps
See `/Users/andy/projects/ndygen/wiab/pairing-debug-analysis.md` for detailed root cause analysis and recommended fixes.
