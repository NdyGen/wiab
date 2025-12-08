/**
 * Jest test setup file with comprehensive Homey SDK mocks
 *
 * This file provides factory functions and mock implementations for testing
 * the WIAB Homey app without requiring actual Homey hardware or runtime.
 * All mocks follow the Homey SDK structure to ensure tests accurately reflect
 * real-world behavior.
 */

/**
 * Creates a mock Homey instance with all necessary methods for testing
 *
 * The mock includes:
 * - Logging methods (log, error)
 * - Drivers management
 * - Basic Homey runtime simulation
 *
 * @returns A mock Homey instance suitable for testing
 */
export function createMockHomey() {
  const mockDrivers: Map<string, any> = new Map();

  return {
    log: jest.fn((...args: any[]) => {
      // Uncomment for debugging tests:
      // console.log('[MOCK HOMEY]', ...args);
    }),
    error: jest.fn((...args: any[]) => {
      // Uncomment for debugging tests:
      // console.error('[MOCK HOMEY ERROR]', ...args);
    }),
    drivers: {
      getDrivers: jest.fn(() => {
        const driversObj: { [key: string]: any } = {};
        mockDrivers.forEach((driver, name) => {
          driversObj[name] = driver;
        });
        return driversObj;
      }),
      getDriver: jest.fn((name: string) => mockDrivers.get(name)),
      _addDriver: (name: string, driver: any) => {
        mockDrivers.set(name, driver);
      },
      _clear: () => {
        mockDrivers.clear();
      },
    },
  };
}

/**
 * Creates a mock Homey device with configurable capabilities and values
 *
 * Devices can be configured with:
 * - Device ID and name
 * - List of capabilities
 * - Current capability values
 * - Settings
 *
 * @param config - Configuration options for the mock device
 * @returns A mock device instance
 */
export function createMockDevice(config: {
  id: string;
  name?: string;
  capabilities?: string[];
  capabilityValues?: { [key: string]: any };
  settings?: { [key: string]: any };
}) {
  const {
    id,
    name = `Device ${id}`,
    capabilities = [],
    capabilityValues = {},
    settings = {},
  } = config;

  const device = {
    getData: jest.fn(() => ({ id })),
    getName: jest.fn(() => name),
    getCapabilities: jest.fn(() => [...capabilities]),
    hasCapability: jest.fn((capability: string) =>
      capabilities.includes(capability)
    ),
    getCapabilityValue: jest.fn((capability: string) => {
      if (!capabilities.includes(capability)) {
        throw new Error(
          `Device ${id} does not have capability ${capability}`
        );
      }
      return capabilityValues[capability];
    }),
    setCapabilityValue: jest.fn(
      async (capability: string, value: any) => {
        if (!capabilities.includes(capability)) {
          throw new Error(
            `Device ${id} does not have capability ${capability}`
          );
        }
        capabilityValues[capability] = value;
      }
    ),
    getSetting: jest.fn((key: string) => settings[key]),
    getSettings: jest.fn(() => ({ ...settings })),
    setSettings: jest.fn(async (newSettings: { [key: string]: any }) => {
      Object.assign(settings, newSettings);
    }),
    log: jest.fn(),
    error: jest.fn(),
    _setCapabilityValue: (capability: string, value: any) => {
      capabilityValues[capability] = value;
    },
    _getCapabilityValues: () => ({ ...capabilityValues }),
  };

  return device;
}

/**
 * Creates a mock Homey driver with a collection of devices
 *
 * Drivers manage multiple devices and provide access to them through
 * standard Homey driver methods.
 *
 * @param devices - Array of mock devices managed by this driver
 * @returns A mock driver instance
 */
export function createMockDriver(devices: any[] = []) {
  return {
    getDevices: jest.fn(() => [...devices]),
    getDevice: jest.fn((deviceData: { id: string }) => {
      return devices.find((d) => d.getData().id === deviceData.id);
    }),
    _addDevice: (device: any) => {
      devices.push(device);
    },
    _removeDevice: (deviceId: string) => {
      const index = devices.findIndex((d) => d.getData().id === deviceId);
      if (index !== -1) {
        devices.splice(index, 1);
      }
    },
    _clear: () => {
      devices.length = 0;
    },
  };
}

/**
 * Creates a complete test environment with Homey instance and devices
 *
 * This is a convenience function that sets up a typical test scenario with:
 * - A Homey instance
 * - Multiple drivers with devices
 * - Pre-configured sensor devices (motion, contact)
 *
 * @returns Object containing homey instance, drivers, and devices
 */
export function createTestEnvironment() {
  const homey = createMockHomey();

  // Create motion sensors
  const motionSensor1 = createMockDevice({
    id: 'motion-1',
    name: 'Living Room Motion',
    capabilities: ['alarm_motion'],
    capabilityValues: { alarm_motion: false },
  });

  const motionSensor2 = createMockDevice({
    id: 'motion-2',
    name: 'Bedroom Motion',
    capabilities: ['alarm_motion'],
    capabilityValues: { alarm_motion: false },
  });

  // Create contact sensors
  const contactSensor1 = createMockDevice({
    id: 'contact-1',
    name: 'Front Door',
    capabilities: ['alarm_contact'],
    capabilityValues: { alarm_contact: false },
  });

  const contactSensor2 = createMockDevice({
    id: 'contact-2',
    name: 'Window',
    capabilities: ['alarm_contact'],
    capabilityValues: { alarm_contact: false },
  });

  // Create multi-capability sensor
  const multiSensor = createMockDevice({
    id: 'multi-1',
    name: 'Multi Sensor',
    capabilities: ['alarm_motion', 'alarm_contact', 'measure_temperature'],
    capabilityValues: {
      alarm_motion: false,
      alarm_contact: false,
      measure_temperature: 20,
    },
  });

  // Create drivers
  const motionDriver = createMockDriver([motionSensor1, motionSensor2]);
  const contactDriver = createMockDriver([contactSensor1, contactSensor2]);
  const multiDriver = createMockDriver([multiSensor]);

  // Register drivers with Homey
  homey.drivers._addDriver('motion-sensor', motionDriver);
  homey.drivers._addDriver('contact-sensor', contactDriver);
  homey.drivers._addDriver('multi-sensor', multiDriver);

  return {
    homey,
    drivers: {
      motionDriver,
      contactDriver,
      multiDriver,
    },
    devices: {
      motionSensor1,
      motionSensor2,
      contactSensor1,
      contactSensor2,
      multiSensor,
    },
  };
}

/**
 * Helper function to wait for async operations in tests
 *
 * Useful for waiting on timers, promises, or polling intervals.
 *
 * @param ms - Milliseconds to wait
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper function to advance timers and flush promises
 *
 * When using jest.useFakeTimers(), this helper advances time and ensures
 * all pending promises are resolved before continuing.
 *
 * @param ms - Milliseconds to advance
 */
export async function advanceTimersByTime(ms: number): Promise<void> {
  jest.advanceTimersByTime(ms);
  await Promise.resolve(); // Flush microtasks
}
