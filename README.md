# Wasp in a Box (WIAB)

## Device Types

WIAB offers four device types, each solving different automation challenges:

### 1. **WIAB Device** - Persistent Occupancy Detection
Creates virtual occupancy sensors that maintain room occupancy even when people sit still. Combines motion sensors (entry detection) with door contacts (exit detection) to track actual room occupancy, not just movement.

**Best for**: Offices, living rooms, bedrooms - anywhere people spend time sitting still.

### 2. **Circuit Breaker** - Flow Control & Safety Switches
Acts as a software circuit breaker that can turn off downstream devices when triggered. Supports hierarchical parent-child relationships for cascading state changes across multiple devices.

**Best for**: Safety shutoffs, master control switches, conditional device enablement.

### 3. **Room State Manager** - Extended Occupancy States
Tracks extended occupancy patterns by monitoring WIAB devices and adding time-based state transitions (e.g., "extended_idle" after 30 minutes of inactivity).

**Best for**: Advanced lighting scenes, progressive comfort adjustments, activity-based automation.

### 4. **Zone Seal Monitor** - Entry Point Tracking
Monitors multiple door/window contacts to determine if a zone is "sealed" (all openings closed) or "leaky" (any opening open). Supports configurable delay timers to prevent false triggers.

**Best for**: Security zones, climate control zones, pest control automation.

---

## The Problem (WIAB Device)

Motion sensors detect movement, not occupancy. When you're sitting still reading, working at a desk, or sleeping, motion sensors timeout and trigger automations incorrectly - lights turn off, heating shuts down, security activates.

## The Solution

WIAB combines motion sensors (entry detection) with door contacts (exit detection) to track actual room occupancy:
- **Motion detected** → Room becomes occupied
- **Room stays occupied** → Even when sitting perfectly still for hours
- **Door opens** → Room becomes unoccupied (exit detected)

This state-based approach provides true occupancy detection, not just motion detection.

## Use Cases

Perfect for:
- **Offices**: Keep lights/heating on while working at your desk
- **Living rooms**: Maintain comfort while reading or watching TV
- **Bedrooms**: Proper occupancy state during sleep
- **Any space**: Where people spend time sitting still

## Features

- Create virtual occupancy sensors that aggregate multiple physical sensors
- Quad-state occupancy model (UNKNOWN, OCCUPIED, UNOCCUPIED, PAUSED) with intelligent state transitions
- Configure trigger sensors (motion detectors, presence sensors) that activate occupancy
- Configure reset sensors (door/window contacts) that deactivate occupancy
- Automatic sensor classification based on capability names
- Works with any Homey device that has boolean capabilities (alarms, contacts, motion, etc.)
- Real-time monitoring using capability listeners for instant response to sensor changes
- Configurable T_ENTER timer (5-60s) for entry/exit detection window
- Configurable T_CLEAR timer (60-3600s) for auto-vacate timeout with open doors
- Manual control via action cards: **Set occupancy state** and **Resume monitoring**
- Check device pause status with **Is paused** condition card
- Easy integration with Homey flows
- Support for both local and cloud Homey platforms

## Installation

1. Open the Homey App Store on your Homey device or in the Homey mobile app
2. Search for "Wasp in a Box" or "WIAB"
3. Click "Install" to add the app to your Homey
4. The app will be installed and ready to configure

---

## WIAB Device Configuration

> **Note**: This section focuses on configuring the WIAB Device. Circuit Breaker, Room State Manager, and Zone Seal Monitor have their own configuration screens during pairing. For detailed documentation on those device types, see their respective pairing flows in the Homey app.

### Adding a WIAB Device

1. Go to "Devices" in your Homey app
2. Click the "+" button to add a new device
3. Select "Wasp in a Box" from the app list
4. Choose "WIAB Device"
5. Give your virtual occupancy sensor a meaningful name (e.g., "Living Room Occupancy")
6. Click "Add Device"

### Configuring Trigger Sensors

Trigger sensors (motion/presence sensors) activate the occupancy state when they detect activity. These sensors are automatically classified as "PIR sensors" based on their capability names.

1. Open your WIAB device settings
2. Find the "Trigger Sensors" field
3. Enter a JSON array of sensor configurations (typically configured during pairing)

**Format:**
```json
[
  {"deviceId": "device-id-1", "capability": "alarm_motion"},
  {"deviceId": "device-id-2", "capability": "alarm_presence"},
  {"deviceId": "device-id-3", "capability": "alarm_motion"}
]
```

**Example:**
```json
[
  {"deviceId": "6a7b8c9d-1234-5678-90ab-cdef12345678", "capability": "alarm_motion", "deviceName": "Living Room Motion"},
  {"deviceId": "9d8e7f6g-4321-8765-09ba-fedc87654321", "capability": "alarm_motion", "deviceName": "Kitchen Motion"}
]
```

**Note:** The `deviceName` field is optional but recommended for easier debugging in logs.

### Configuring Reset Sensors

Reset sensors (door/window contacts) deactivate the occupancy state when triggered. These sensors are automatically classified as "door sensors" based on their capability names.

1. Open your WIAB device settings
2. Find the "Reset Sensors" field
3. Enter a JSON array of sensor configurations (typically configured during pairing)

**Format:**
```json
[
  {"deviceId": "device-id-4", "capability": "alarm_contact"},
  {"deviceId": "device-id-5", "capability": "alarm_door"}
]
```

**Example:**
```json
[
  {"deviceId": "1a2b3c4d-9876-5432-10ab-cdef98765432", "capability": "alarm_contact", "deviceName": "Front Door"}
]
```

### Configuring Timer Settings

WIAB uses two configurable timers to implement intelligent occupancy detection:

1. Open your WIAB device settings
2. Find the "Tri-State Timer Settings" group
3. Configure the timers based on your needs

**T_ENTER Timer (Entry/Exit Detection Window)**
- **Range**: 5-60 seconds
- **Default**: 20 seconds
- **Purpose**: Short window after door events to detect entry or exit via motion sensors
- **Typical Use**: 10-30 seconds depending on room size and door-to-motion-sensor distance

**T_CLEAR Timer (Auto-Vacate Timeout)**
- **Range**: 60-3600 seconds (1-60 minutes)
- **Default**: 600 seconds (10 minutes)
- **Purpose**: Longer window to detect room becoming empty when doors are open and no motion detected
- **Typical Use**: 300-900 seconds (5-15 minutes) depending on room usage patterns

### Finding Device IDs

There are several ways to find device IDs in Homey:

#### Method 1: Using Homey Developer Tools
1. Enable Developer Mode in Homey settings
2. Go to https://developer.athom.com
3. Log in with your Homey account
4. Select your Homey
5. Navigate to "Devices" to see all device IDs

#### Method 2: Using Homey Web App
1. Open the Homey web app (https://my.homey.app)
2. Right-click on a device and select "Inspect" or "Inspect Element"
3. Look for the device ID in the HTML data attributes
4. The ID is typically in the format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

#### Method 3: Using Device Settings
1. Open any device in the Homey mobile app
2. Go to device settings (gear icon)
3. Look for "Advanced Settings" or "Technical Information"
4. The device ID should be displayed there (on some devices)

### Supported Capabilities

WIAB automatically classifies sensors based on their capability names:

**PIR/Motion Sensors (Trigger Sensors):**
- `alarm_motion` - Motion sensors (most common)
- `alarm_presence` - Presence detection sensors
- Any motion/presence-related boolean capability

**Door/Contact Sensors (Reset Sensors):**
- `alarm_contact` - Door/window contacts (most common)
- `alarm_door` - Door sensors
- `alarm_window` - Window sensors
- Any contact-related boolean capability

**How Classification Works:**
WIAB analyzes the capability name to determine the sensor type. Motion/presence capabilities are treated as trigger sensors, while contact/door/window capabilities are treated as reset sensors. This automatic classification happens during sensor monitoring setup.

## Usage in Flows

### When Card
- **Occupancy turned on**: Triggers when occupancy state transitions to OCCUPIED
- **Occupancy turned off**: Triggers when occupancy state transitions to UNOCCUPIED

### And Card
- **Occupancy is on**: Checks if occupancy is currently OCCUPIED
- **Occupancy is off**: Checks if occupancy is currently UNOCCUPIED

### Device Capabilities
WIAB devices expose two capabilities for use in flows:
- **`alarm_occupancy`** (boolean): Simple ON/OFF occupancy state for flow compatibility
- **`occupancy_state`** (enum): Quad-state value (UNKNOWN, OCCUPIED, UNOCCUPIED, PAUSED) for advanced logic

### Then Card (Action Cards)
WIAB provides two action cards for manual occupancy control:

**Set Occupancy State** - Pauses the device and sets it to a specific occupancy state
- Pauses automatic sensor monitoring
- Sets `occupancy_state` to OCCUPIED or UNOCCUPIED
- Sets `alarm_occupancy` to true or false
- Useful for nighttime routines or temporary overrides
- Example: Pause at night to prevent pet motion from triggering lights

**Resume Monitoring** - Resumes automatic sensor monitoring
- Stops paused mode
- Reinitializes occupancy state based on current sensor values
- Sensor listeners restart automatically
- Returns device to normal operation

### Condition Card
**Is Paused** - Check if the device is currently in paused mode
- Returns true if device is paused, false otherwise
- Use in flows to check pause status before taking action

### Example Flow 1: Turn on lights when occupancy detected
```
WHEN: WIAB Device occupancy turned on
THEN: Turn on Living Room Lights
```

### Example Flow 2: Turn off lights when room is vacant
```
WHEN: WIAB Device occupancy turned off
THEN: Turn off Living Room Lights
```

### Example Flow 3: Smart heating control
```
WHEN: WIAB Device occupancy turned on
AND: Temperature is below 20°C
THEN: Set thermostat to 21°C
```

### Example Flow 4: Nighttime routine with pause
```
WHEN: I say "goodnight"
THEN: Set WIAB device to Unoccupied
AND: Turn off all lights
AND: Set thermostat to 18°C
```
(Device pauses; sensor motion from pets won't trigger lights)

### Example Flow 5: Morning resume
```
WHEN: Time is 7:00 AM
THEN: Resume WIAB device monitoring
AND: Enable all automations
```
(Device returns to normal monitoring mode)

## Troubleshooting

### Occupancy doesn't activate
- Verify that device IDs are correct (check for typos)
- Ensure the JSON format is valid (use a JSON validator)
- Check that the capability names match your sensors (use `alarm_motion`, not `motion`)
- Review logs in the Homey Developer Tools for error messages

### Occupancy doesn't reset
- Confirm reset sensors are configured correctly
- Verify reset sensor capabilities are triggering (test the physical sensors)
- Check that device IDs for reset sensors are different from trigger sensors
- Reset sensors have priority over trigger sensors by design

### Invalid JSON error
- Ensure you're using double quotes (`"`) not single quotes (`'`)
- Verify all brackets are properly closed: `[` must have matching `]`
- Check for missing commas between objects
- Use an online JSON validator to check your configuration
- Example of valid JSON: `[{"deviceId": "abc", "capability": "alarm_motion"}]`

### Device not found errors
- Verify the device still exists in your Homey
- Check that the device ID hasn't changed (can happen after device re-pairing)
- Ensure the device driver is still installed and functioning

### Sensor doesn't have capability error
- Verify the capability name is spelled correctly
- Check the device actually supports that capability (in device settings)
- Common mistake: using `motion` instead of `alarm_motion`

## Known Limitations

- **Motion-based only**: The app detects occupancy through motion/presence sensors. It cannot detect stationary presence (e.g., a person sitting still without moving).
- **Requires visible motion**: For rooms where occupancy needs to be detected without motion (e.g., reading quietly), motion sensors alone are insufficient.
- **Door/window sensors are exit indicators**: Door contacts indicate someone may exit, not whether the room is actually occupied. Occupancy is confirmed only when combined with motion sensors.
- **Sensor availability required**: All configured sensors must be reachable and responsive. Offline or unavailable devices are skipped, potentially affecting detection accuracy.
- **Capability listener dependency**: Occupancy detection relies on real-time capability updates from the Homey HomeyAPI. If devices don't support capability listeners, detection may be delayed.
- **Multiple sensor configuration needed**: The app works best with multiple sensors (trigger + reset). Single-sensor setups may not provide reliable occupancy detection.
- **Timer-dependent**: Accurate occupancy detection depends on correctly configured T_ENTER and T_CLEAR timers. Poor timer settings can lead to false positives or negatives.
- **Reset sensor ambiguity**: Opening a door indicates possible exit but not actual room vacancy. Closing the door without motion is interpreted as exit, even if the room is still occupied.

## Homey Compatibility

- **Minimum Firmware Version**: Homey firmware >=12.2.0
- **Supported Platforms**: Local Homey and Cloud Homey (both supported equally)
- **SDK Version**: Homey SDK v3
- **Device Support**: Works with any Homey device exposing boolean alarm capabilities

## How It Works

WIAB implements an event-driven quad-state occupancy model using real-time capability listeners for sensor monitoring:

### Monitoring Architecture
1. **Event-Driven**: Uses capability listeners for instant sensor state notifications (real-time, no polling)
2. **Real-Time Response**: Sensor changes trigger callbacks immediately via `makeCapabilityInstance()`
3. **Edge Detection**: Only responds to FALSE → TRUE transitions (sensor activation events)
4. **Priority System**: Reset sensors (doors) are checked before trigger sensors (motion)

### Quad-State Occupancy Model
The device maintains four occupancy states:

- **UNKNOWN**: Transitional state during timer windows
- **OCCUPIED**: Room is occupied (alarm_occupancy = true)
- **UNOCCUPIED**: Room is empty (alarm_occupancy = false)
- **PAUSED**: Device is paused, sensors are ignored (manual override)

### State Transitions

**Initialization (Device Startup)**:
- Reads CURRENT VALUES of trigger sensors
- If ANY trigger sensor is TRUE → Set occupancy OCCUPIED
- If ALL trigger sensors are FALSE → Set occupancy UNOCCUPIED
- Reset sensors are IGNORED during initialization

**Runtime (Event-Driven)**:
- **Door Events**: Opening/closing doors triggers state evaluation
  - Starts T_ENTER timer (short window to detect entry/exit via motion)
  - Starts T_CLEAR timer if doors remain open (longer window to detect vacancy)
- **Motion Events**: Motion detection affects occupancy based on context
  - Motion during T_ENTER window indicates entry/exit
  - Motion resets T_CLEAR timer (room still occupied)
- **Timer Expiry**: Timers control state transitions when no definitive events occur

### Why This Design?
- **Door position doesn't indicate occupancy**: An open door doesn't mean the room is empty
- **Motion indicates current presence**: Active motion reliably shows someone is present
- **Timer windows handle ambiguity**: T_ENTER and T_CLEAR provide intelligent grace periods

## Technical Details

- **Monitoring Method**: Real-time event-driven using capability listeners (no polling)
- **Sensor Detection**: Edge-based (detects FALSE → TRUE transitions)
- **Priority System**: Reset sensors (doors) checked before trigger sensors (motion)
- **State Model**: Quad-state (UNKNOWN, OCCUPIED, UNOCCUPIED, PAUSED)
- **Timers**:
  - T_ENTER: 5-60 seconds (default 20s) - Window after door events to detect entry/exit
  - T_CLEAR: 60-3600 seconds (default 600s) - Timeout to mark room empty when doors open
- **SDK Version**: Homey SDK v3
- **Compatibility**: Homey firmware >=12.2.0
- **Platform Support**: Both local and cloud Homey
- **Capability Listeners**: Uses `makeCapabilityInstance()` for real-time updates (not WebSocket polling)
- **Dependencies**:
  - homey: ^3.0.0
  - homey-api: ^3.14.22

## License

MIT License

Copyright (c) 2024 Andy van Dongen

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Author

Andy van Dongen
- Email: andy@dongen.net
- GitHub: https://github.com/NdyGen

## Links

- GitHub Repository: https://github.com/NdyGen/wiab
- Report Issues: https://github.com/NdyGen/wiab/issues
- Homey Community: https://community.homey.app

## Support

If you encounter issues or have questions:

1. Check the Troubleshooting section above
2. Review the GitHub Issues page for similar problems
3. Open a new issue on GitHub with detailed information:
   - Homey firmware version
   - WIAB app version
   - Device configuration (anonymized device IDs)
   - Relevant log entries from Homey Developer Tools
   - Steps to reproduce the issue

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues on GitHub.

## Changelog

### Version 1.0.0
**Initial Release - Virtual Occupancy Sensor with Manual Control**

**Core Features:**
- Virtual occupancy sensor combining multiple physical sensors
- Quad-state occupancy model (UNKNOWN, OCCUPIED, UNOCCUPIED, PAUSED)
- Real-time event-driven monitoring using capability listeners
- Configurable T_ENTER and T_CLEAR timers for intelligent state transitions
- Automatic sensor classification based on capability names
- JSON-based sensor configuration for trigger (motion/presence) and reset (door/window) sensors
- Support for multiple sensors per type with priority-based conflict resolution

**Action Cards:**
- SET STATE action: Pauses device and sets occupancy state to OCCUPIED or UNOCCUPIED
- UNPAUSE action: Resumes automatic sensor monitoring with state reinitialization

**Condition Cards:**
- IS PAUSED condition: Check if device is currently in paused mode

**Flow Integration:**
- When card: Triggers on occupancy state changes
- And card: Checks current occupancy state
- Full flow compatibility with Homey automation engine

**Technical:**
- Comprehensive error handling and validation
- Real-time state updates with edge detection
- Support for both local and cloud Homey platforms
- Homey SDK v3 compatible
- Requires Homey firmware >=12.2.0
