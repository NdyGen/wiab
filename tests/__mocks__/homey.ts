/**
 * Mock for Homey SDK
 *
 * This mock replaces the actual Homey module in tests to avoid loading
 * the full Homey CLI environment.
 */

type MockHomey = Record<string, unknown>;

export default {
  Device: class MockDevice {
    homey: MockHomey = {};
    log = jest.fn();
    error = jest.fn();
    getSetting = jest.fn();
    setCapabilityValue = jest.fn();
    hasCapability = jest.fn();
    addCapability = jest.fn();
  },
  Driver: class MockDriver {
    homey: MockHomey = {};
    log = jest.fn();
    error = jest.fn();
  },
  App: class MockApp {
    homey: MockHomey = {};
    log = jest.fn();
    error = jest.fn();
  },
};
