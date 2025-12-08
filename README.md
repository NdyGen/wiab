# Wasp in a Box (WIAB)

A Homey app that creates virtual occupancy sensors based on physical sensor triggers. Perfect for creating sophisticated presence detection systems by combining multiple sensors into a single, intelligent occupancy indicator.

## What is "Wasp in a Box"?

The "Wasp in a Box" concept is inspired by the behavior of wasps trapped in a container - they remain active and buzzing until they escape. Similarly, this app creates a virtual occupancy sensor that activates when motion or other triggers are detected, and only resets when specific "exit" conditions are met (like opening a door).

This approach provides more reliable presence detection than individual motion sensors, which may timeout prematurely in rooms where people remain still for extended periods.

## Features

- Create virtual occupancy sensors that aggregate multiple physical sensors
- Configure trigger sensors (motion detectors, buttons, etc.) that activate occupancy
- Configure reset sensors (door contacts, exit buttons, etc.) that deactivate occupancy
- Works with any Homey device that has boolean capabilities (alarms, contacts, motion, etc.)
- Reliable polling-based monitoring that works with all device types
- Real-time updates based on sensor state changes
- Easy integration with Homey flows
- Support for both local and cloud Homey platforms

## Installation

1. Open the Homey App Store on your Homey device or in the Homey mobile app
2. Search for "Wasp in a Box" or "WIAB"
3. Click "Install" to add the app to your Homey
4. The app will be installed and ready to configure

## Configuration

### Adding a WIAB Device

1. Go to "Devices" in your Homey app
2. Click the "+" button to add a new device
3. Select "Wasp in a Box" from the app list
4. Choose "WIAB Device"
5. Give your virtual occupancy sensor a meaningful name (e.g., "Living Room Occupancy")
6. Click "Add Device"

### Configuring Trigger Sensors

Trigger sensors activate the occupancy state when they detect activity.

1. Open your WIAB device settings
2. Find the "Trigger Sensors" field
3. Enter a JSON array of sensor configurations

**Format:**
```json
[
  {"deviceId": "device-id-1", "capability": "alarm_motion"},
  {"deviceId": "device-id-2", "capability": "alarm_motion"},
  {"deviceId": "device-id-3", "capability": "alarm_contact"}
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

Reset sensors deactivate the occupancy state when triggered (e.g., when someone exits).

1. Open your WIAB device settings
2. Find the "Reset Sensors" field
3. Enter a JSON array of sensor configurations

**Format:**
```json
[
  {"deviceId": "device-id-4", "capability": "alarm_contact"},
  {"deviceId": "device-id-5", "capability": "alarm_motion"}
]
```

**Example:**
```json
[
  {"deviceId": "1a2b3c4d-9876-5432-10ab-cdef98765432", "capability": "alarm_contact", "deviceName": "Front Door"}
]
```

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

WIAB works with any boolean capability, including:

- `alarm_motion` - Motion sensors
- `alarm_contact` - Door/window contacts
- `alarm_generic` - Generic alarm sensors
- `button` - Physical buttons
- `sensor_motion` - Alternative motion sensor capability
- Any other boolean capability that indicates sensor state

## Usage in Flows

### When Card
- **Occupancy turned on**: Triggers when any trigger sensor activates
- **Occupancy turned off**: Triggers when any reset sensor activates

### And Card
- **Occupancy is on**: Checks if occupancy is currently active
- **Occupancy is off**: Checks if occupancy is currently inactive

### Then Card
Not applicable - WIAB devices respond to other sensors and don't have controllable actions.

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

## How It Works

1. WIAB polls all configured sensors every 2 seconds
2. When a trigger sensor changes from `false` to `true`, occupancy is activated
3. When a reset sensor changes from `false` to `true`, occupancy is deactivated
4. Reset sensors have priority - if both trigger and reset sensors activate simultaneously, reset takes precedence
5. The virtual sensor updates the `alarm_occupancy` capability, which can be used in flows

## Technical Details

- Polling interval: 2000ms (2 seconds)
- Sensor detection: Edge-based (detects transitions from false to true)
- Priority system: Reset sensors are checked before trigger sensors
- Compatibility: Homey firmware 5.0.0 or higher
- Platform support: Both local and cloud Homey

## License

MIT License

Copyright (c) 2024 Andy van Dongen

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Author

Andy van Dongen
- Email: andy@ndygen.com
- GitHub: https://github.com/andyvandongen

## Links

- GitHub Repository: https://github.com/andyvandongen/wiab
- Report Issues: https://github.com/andyvandongen/wiab/issues
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
- Initial release
- Virtual occupancy sensor with trigger and reset capabilities
- Polling-based sensor monitoring
- JSON-based sensor configuration
- Support for multiple sensor types
- Comprehensive error handling and logging
