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
  const mockDrivers: Map<string, MockDriver> = new Map();

  return {
    log: jest.fn((..._args: unknown[]) => {
      // Uncomment for debugging tests:
      // console.log('[MOCK HOMEY]', ...args);
    }),
    error: jest.fn((..._args: unknown[]) => {
      // Uncomment for debugging tests:
      // console.error('[MOCK HOMEY ERROR]', ...args);
    }),
    drivers: {
      getDrivers: jest.fn(() => {
        const driversObj: Record<string, MockDriver> = {};
        mockDrivers.forEach((driver, name) => {
          driversObj[name] = driver;
        });
        return driversObj;
      }),
      getDriver: jest.fn((name: string) => mockDrivers.get(name)),
      _addDriver: (name: string, driver: MockDriver) => {
        mockDrivers.set(name, driver);
      },
      _clear: () => {
        mockDrivers.clear();
      },
    },
  };
}

/**
 * Creates a mock HomeyAPI instance for device access
 *
 * The HomeyAPI mock provides access to devices through getDevices() which
 * returns device objects that auto-update via WebSocket in real implementations.
 *
 * @returns A mock HomeyAPI instance suitable for testing
 */
export function createMockHomeyApi() {
  const deviceMap: Record<string, unknown> = {};
  const zoneMap: Record<string, { id: string; name: string }> = {};

  return {
    devices: {
      getDevices: jest.fn(async () => ({ ...deviceMap })),
      getDevice: jest.fn(async (id: string) => deviceMap[id]),
      _addDevice: (id: string, device: unknown) => {
        // Devices from createMockDevice already have capabilitiesObj and event emitter functionality
        deviceMap[id] = device;
      },
      _removeDevice: (id: string) => {
        delete deviceMap[id];
      },
      _clear: () => {
        Object.keys(deviceMap).forEach(key => delete deviceMap[key]);
      },
    },
    zones: {
      getZone: jest.fn(async (params: { id: string }) => {
        return zoneMap[params.id] || { id: params.id, name: `Zone ${params.id}` };
      }),
      _addZone: (id: string, name: string) => {
        zoneMap[id] = { id, name };
      },
      _clear: () => {
        Object.keys(zoneMap).forEach(key => delete zoneMap[key]);
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
  capabilityValues?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}) {
  const {
    id,
    name = `Device ${id}`,
    capabilities = [],
    capabilityValues = {},
    settings = {},
  } = config;

  // Create capabilitiesObj structure for HomeyAPI compatibility
  const capabilitiesObj: Record<string, { value: unknown; id: string }> = {};
  capabilities.forEach((cap: string) => {
    capabilitiesObj[cap] = {
      value: capabilityValues[cap],
      id: cap,
    };
  });

  // Create event listener management
  const listeners: Map<string, ((...args: unknown[]) => void)[]> = new Map();

  const device: MockDevice = {
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
      async (capability: string, value: unknown) => {
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
    setSettings: jest.fn(async (newSettings: Record<string, unknown>) => {
      Object.assign(settings, newSettings);
    }),
    log: jest.fn(),
    error: jest.fn(),
    _setCapabilityValue: (capability: string, value: unknown) => {
      capabilityValues[capability] = value;
      // Also update capabilitiesObj when value changes
      if (capabilitiesObj[capability]) {
        capabilitiesObj[capability].value = value;
      }
    },
    _getCapabilityValues: () => ({ ...capabilityValues }),
    // HomeyAPI compatibility
    capabilitiesObj,
    // Event emitter functionality
    on: (event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)!.push(handler);
    },
    removeListener: (event: string, handler: (...args: unknown[]) => void) => {
      if (listeners.has(event)) {
        const handlers = listeners.get(event)!;
        const index = handlers.indexOf(handler);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
      }
    },
    _emit: (event: string, data: unknown) => {
      if (listeners.has(event)) {
        listeners.get(event)!.forEach((handler) => handler(data));
      }
    },
    _listeners: listeners,
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
/**
 * Mock device with minimal interface matching HomeyDevice
 */
interface MockDevice {
  getData(): { id: string };
  getName(): string;
  getCapabilities(): string[];
  hasCapability(capability: string): boolean;
  [key: string]: unknown;
}

/**
 * Mock driver interface compatible with HomeyDriver
 */
interface MockDriver {
  getDevices?(): MockDevice[];
  getDevice?(deviceData: { id: string }): MockDevice | undefined;
  [key: string]: unknown;
}

export function createMockDriver(devices: MockDevice[] = []) {
  return {
    getDevices: jest.fn(() => [...devices]),
    getDevice: jest.fn((deviceData: { id: string }) => {
      return devices.find((d) => d.getData().id === deviceData.id);
    }),
    _addDevice: (device: MockDevice) => {
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
