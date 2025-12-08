/**
 * Mock for Homey SDK
 *
 * This mock replaces the actual Homey module in tests to avoid loading
 * the full Homey CLI environment.
 */

export default {
  Device: class MockDevice {
    homey: any;
    log = jest.fn();
    error = jest.fn();
    getSetting = jest.fn();
    setCapabilityValue = jest.fn();
  },
  App: class MockApp {
    homey: any;
    log = jest.fn();
    error = jest.fn();
  },
};
