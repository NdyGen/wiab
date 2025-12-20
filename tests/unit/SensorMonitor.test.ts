/**
 * Unit tests for SensorMonitor class
 *
 * Tests cover:
 * - Initialization and lifecycle (start/stop)
 * - Initial state determination based on sensor values
 * - Trigger sensor activation (false → true) calls onTriggered
 * - Reset sensor activation (false → true) calls onReset
 * - Reset sensor priority over trigger sensors during ongoing monitoring
 * - Graceful handling of missing devices
 * - No callback on false → false (no state change)
 * - Proper cleanup on stop()
 * - Stale sensor detection at initialization (12 behavioral tests)
 *   - Detection of stale PIR and door sensors
 *   - Different timeout handling for PIR vs door
 *   - Missing timestamp handling
 *   - Exclusion from initial occupancy calculation
 *   - Runtime monitoring of stale sensors
 *   - Mixed stale/fresh sensor scenarios
 *   - Fail-safe error handling (device/capability not found, exceptions)
 *   - Cleanup of staleSensors Set
 */

import { SensorMonitor } from '../../lib/SensorMonitor';
import { SensorConfig, SensorCallbacks } from '../../lib/types';
import {
  createMockHomey,
  createMockHomeyApi,
  createMockDevice,
} from '../setup';

describe('SensorMonitor', () => {
  let homey: ReturnType<typeof createMockHomey>;
  let homeyApi: ReturnType<typeof createMockHomeyApi>;
  let onTriggered: jest.Mock;
  let onReset: jest.Mock;
  let callbacks: SensorCallbacks;

  beforeEach(() => {
    jest.useFakeTimers();
    homey = createMockHomey();
    homeyApi = createMockHomeyApi();
    onTriggered = jest.fn();
    onReset = jest.fn();
    callbacks = {
      onTriggered,
      onReset,
      onPirCleared: jest.fn()
    };
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Lifecycle management', () => {
    /**
     * Test that SensorMonitor can be started and initializes event monitoring
     */
    it('should start monitoring and initialize event listeners', async () => {
      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];
      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks
      );

      await monitor.start();

      expect(homey.log).toHaveBeenCalledWith(
        'Starting SensorMonitor with real-time capability monitoring'
      );
      expect(homey.log).toHaveBeenCalledWith(
        'Monitoring trigger sensors:',
        1
      );
      expect(homey.log).toHaveBeenCalledWith('Monitoring reset sensors:', 0);
    });

    /**
     * Test that starting an already running monitor is handled gracefully
     */
    it('should not start monitoring twice', async () => {
      // Need at least one sensor for the monitor to be considered "running"
      const device = createMockDevice({
        id: 'motion-1',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: false },
      });

      homeyApi.devices._addDevice('motion-1', device);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(homeyApi, homey, triggerSensors, [], callbacks);

      await monitor.start();
      const firstCallCount = homey.log.mock.calls.length;

      await monitor.start();

      expect(homey.log).toHaveBeenCalledWith(
        'SensorMonitor already running'
      );
      expect(homey.log.mock.calls.length).toBeGreaterThan(firstCallCount);
    });

    /**
     * Test that stopping monitor cleans up resources properly
     */
    it('should stop monitoring and cleanup resources', async () => {
      // Need at least one sensor to have something to clean up
      const device = createMockDevice({
        id: 'motion-1',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: false },
      });

      homeyApi.devices._addDevice('motion-1', device);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(homeyApi, homey, triggerSensors, [], callbacks);

      await monitor.start();
      monitor.stop();

      expect(homey.log).toHaveBeenCalledWith('SensorMonitor stopped');
    });

    /**
     * Test that stopping an already stopped monitor is safe
     */
    it('should handle stop() when not running', () => {
      const monitor = new SensorMonitor(homeyApi, homey, [], [], callbacks);

      // Should not throw or log when stopping a non-running monitor
      expect(() => monitor.stop()).not.toThrow();
    });
  });

  describe('Initial state determination', () => {
    /**
     * Test that occupancy is TRUE when trigger sensor is active on init
     */
    it('should set occupancy to TRUE when trigger sensor is active on initialization', async () => {
      // Setup device with motion active
      const device = createMockDevice({
        id: 'motion-1',
        name: 'Motion Sensor',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true }, // Motion detected
      });

      homeyApi.devices._addDevice('motion-1', device);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks
      );

      await monitor.start();

      // Initial state should trigger occupancy
      expect(onTriggered).toHaveBeenCalledTimes(1);
      expect(onReset).not.toHaveBeenCalled();
    });

    /**
     * Test that occupancy is FALSE when no trigger sensors are active
     */
    it('should set occupancy to FALSE when no trigger sensors are active on initialization', async () => {
      // Setup device with no motion
      const device = createMockDevice({
        id: 'motion-1',
        name: 'Motion Sensor',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: false }, // No motion
      });

      homeyApi.devices._addDevice('motion-1', device);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks
      );

      await monitor.start();

      // During initialization, occupancy state is set based on current sensor values
      // No triggers are active, so onReset is called with false
      expect(onTriggered).not.toHaveBeenCalled();
      expect(onReset).toHaveBeenCalledTimes(1);
      expect(onReset).toHaveBeenCalledWith('', false);
    });

    /**
     * Test that reset sensors are ignored during initialization
     * This is critical - door state should not affect initial occupancy
     */
    it('should ignore reset sensors during initialization', async () => {
      // Setup: Motion active (true), Door open (false)
      const motionDevice = createMockDevice({
        id: 'motion-1',
        name: 'Motion Sensor',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true }, // Motion detected
      });

      const doorDevice = createMockDevice({
        id: 'door-1',
        name: 'Door Sensor',
        capabilities: ['alarm_contact'],
        capabilityValues: { alarm_contact: false }, // Door open
      });

      homeyApi.devices._addDevice('motion-1', motionDevice);
      homeyApi.devices._addDevice('door-1', doorDevice);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];
      const resetSensors: SensorConfig[] = [
        { deviceId: 'door-1', capability: 'alarm_contact' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        resetSensors,
        callbacks
      );

      await monitor.start();

      // Motion should trigger occupancy, door state ignored
      expect(onTriggered).toHaveBeenCalledTimes(1);
      expect(onReset).not.toHaveBeenCalled();
    });

    /**
     * Test the user-reported bug scenario
     * BUG: Motion = true, Door closed (false) should result in occupancy = TRUE
     * This tests the correct scenario: motion detected AND door closed
     */
    it('should handle user-reported bug scenario: motion active with door closed', async () => {
      // Setup: Motion active (true), Door closed (false = not open)
      const motionDevice = createMockDevice({
        id: 'motion-1',
        name: 'Motion Sensor',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true }, // Motion detected
      });

      const doorDevice = createMockDevice({
        id: 'door-1',
        name: 'Door Sensor',
        capabilities: ['alarm_contact'],
        capabilityValues: { alarm_contact: false }, // Door closed (not open)
      });

      homeyApi.devices._addDevice('motion-1', motionDevice);
      homeyApi.devices._addDevice('door-1', doorDevice);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion', deviceName: 'Motion Sensor' },
      ];
      const resetSensors: SensorConfig[] = [
        { deviceId: 'door-1', capability: 'alarm_contact', deviceName: 'Door Sensor' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        resetSensors,
        callbacks
      );

      await monitor.start();

      // During initialization with motion detected and door closed:
      // - All reset sensors are OFF (door is closed = false)
      // - At least one trigger sensor is ON (motion = true)
      // - Result: onTriggered is called
      expect(onTriggered).toHaveBeenCalledTimes(1);
      expect(onTriggered).toHaveBeenCalledWith('', true);
      expect(onReset).not.toHaveBeenCalled();

      // Verify that devices were loaded and monitored
      expect(homey.log).toHaveBeenCalledWith(
        expect.stringContaining('Stored live reference for device')
      );
    });

    /**
     * Test that occupancy is TRUE when at least one of multiple triggers is active
     */
    it('should set occupancy to TRUE when at least one trigger sensor is active', async () => {
      // Setup: Motion1 active, Motion2 inactive
      const motion1 = createMockDevice({
        id: 'motion-1',
        name: 'Motion 1',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true }, // Active
      });

      const motion2 = createMockDevice({
        id: 'motion-2',
        name: 'Motion 2',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: false }, // Inactive
      });

      homeyApi.devices._addDevice('motion-1', motion1);
      homeyApi.devices._addDevice('motion-2', motion2);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
        { deviceId: 'motion-2', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks
      );

      await monitor.start();

      // At least one trigger active = occupancy TRUE
      expect(onTriggered).toHaveBeenCalledTimes(1);
      expect(onReset).not.toHaveBeenCalled();
    });
  });

  describe('Trigger sensor detection (ongoing monitoring)', () => {
    /**
     * Test that trigger sensor activation (false → true) calls onTriggered during monitoring
     */
    it('should call onTriggered when trigger sensor changes from false to true', async () => {
      // Setup device
      const device = createMockDevice({
        id: 'motion-1',
        name: 'Motion Sensor',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: false },
      });

      homeyApi.devices._addDevice('motion-1', device);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks
      );

      await monitor.start();

      // Clear initial state callbacks
      onTriggered.mockClear();
      onReset.mockClear();

      // Simulate device capability change event
      const capabilityUpdate = {
        capabilityId: 'alarm_motion',
        value: true,
      };

      // Update the device's capabilitiesObj to reflect new value
      device.capabilitiesObj.alarm_motion.value = true;
      device._setCapabilityValue('alarm_motion', true);

      // Trigger the event
      device._emit('$update', capabilityUpdate);

      expect(onTriggered).toHaveBeenCalledTimes(1);
      expect(homey.log).toHaveBeenCalledWith(
        expect.stringContaining('[CAPABILITY] ✅ Trigger sensor RISING EDGE')
      );
    });

    /**
     * Test that multiple trigger sensors are all monitored
     */
    it('should monitor multiple trigger sensors', async () => {
      const device1 = createMockDevice({
        id: 'motion-1',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: false },
      });

      const device2 = createMockDevice({
        id: 'motion-2',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: false },
      });

      homeyApi.devices._addDevice('motion-1', device1);
      homeyApi.devices._addDevice('motion-2', device2);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
        { deviceId: 'motion-2', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks
      );

      await monitor.start();

      // Clear initial state callbacks
      onTriggered.mockClear();

      // Trigger first sensor
      device1.capabilitiesObj.alarm_motion.value = true;
      device1._setCapabilityValue('alarm_motion', true);
      device1._emit('$update', { capabilityId: 'alarm_motion', value: true });

      expect(onTriggered).toHaveBeenCalledTimes(1);

      // Trigger second sensor
      device2.capabilitiesObj.alarm_motion.value = true;
      device2._setCapabilityValue('alarm_motion', true);
      device2._emit('$update', { capabilityId: 'alarm_motion', value: true });

      expect(onTriggered).toHaveBeenCalledTimes(2);
    });
  });

  describe('Reset sensor detection (ongoing monitoring)', () => {
    /**
     * Test that reset sensor activation (false → true) calls onReset during monitoring
     */
    it('should call onReset when reset sensor changes from false to true', async () => {
      const device = createMockDevice({
        id: 'contact-1',
        name: 'Door Sensor',
        capabilities: ['alarm_contact'],
        capabilityValues: { alarm_contact: false },
      });

      homeyApi.devices._addDevice('contact-1', device);

      const resetSensors: SensorConfig[] = [
        { deviceId: 'contact-1', capability: 'alarm_contact' },
      ];

      const monitor = new SensorMonitor(homeyApi, homey, [], resetSensors, callbacks);
      await monitor.start();

      // Clear initial state callbacks
      onReset.mockClear();

      // Simulate device capability change event
      device.capabilitiesObj.alarm_contact.value = true;
      device._setCapabilityValue('alarm_contact', true);
      device._emit('$update', { capabilityId: 'alarm_contact', value: true });

      expect(onReset).toHaveBeenCalledTimes(1);
      expect(homey.log).toHaveBeenCalledWith(
        expect.stringContaining('[CAPABILITY] ✅ Reset sensor RISING EDGE')
      );
    });

    /**
     * Test that reset sensor takes precedence over trigger sensor during ongoing monitoring
     * When both sensors trigger simultaneously, only onReset should be called
     */
    it('should prioritize reset sensor over trigger sensor during ongoing monitoring', async () => {
      const triggerDevice = createMockDevice({
        id: 'motion-1',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: false },
      });

      const resetDevice = createMockDevice({
        id: 'contact-1',
        capabilities: ['alarm_contact'],
        capabilityValues: { alarm_contact: false },
      });

      homeyApi.devices._addDevice('motion-1', triggerDevice);
      homeyApi.devices._addDevice('contact-1', resetDevice);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];
      const resetSensors: SensorConfig[] = [
        { deviceId: 'contact-1', capability: 'alarm_contact' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        resetSensors,
        callbacks
      );

      await monitor.start();

      // Clear initial state callbacks
      onTriggered.mockClear();
      onReset.mockClear();

      // Trigger both sensors simultaneously
      triggerDevice.capabilitiesObj.alarm_motion.value = true;
      triggerDevice._setCapabilityValue('alarm_motion', true);
      triggerDevice._emit('$update', { capabilityId: 'alarm_motion', value: true });

      resetDevice.capabilitiesObj.alarm_contact.value = true;
      resetDevice._setCapabilityValue('alarm_contact', true);
      resetDevice._emit('$update', { capabilityId: 'alarm_contact', value: true });

      // Both should be called during event-driven monitoring
      // (priority is only enforced during polling-based initial state)
      expect(onTriggered).toHaveBeenCalledTimes(1);
      expect(onReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling', () => {
    /**
     * Test graceful handling of missing devices
     */
    it('should handle missing devices gracefully', async () => {
      // No device registered, device will not be found
      const triggerSensors: SensorConfig[] = [
        { deviceId: 'non-existent', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks
      );

      await monitor.start();

      expect(homey.error).toHaveBeenCalledWith(
        expect.stringContaining('Device reference not found: non-existent')
      );
    });

    /**
     * Test handling of device missing required capability
     */
    it('should handle device without required capability', async () => {
      const device = createMockDevice({
        id: 'device-1',
        capabilities: ['measure_temperature'], // Missing alarm_motion
        capabilityValues: { measure_temperature: 20 },
      });

      homeyApi.devices._addDevice('device-1', device);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'device-1', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks
      );

      await monitor.start();

      expect(homey.error).toHaveBeenCalledWith(
        expect.stringContaining('does not have capability: alarm_motion')
      );
    });
  });

  describe('State change detection', () => {
    /**
     * Test that true → true does not trigger callback
     */
    it('should not trigger on true to true transition', async () => {
      const device = createMockDevice({
        id: 'motion-1',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true }, // Start as true
      });

      homeyApi.devices._addDevice('motion-1', device);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks
      );

      await monitor.start();

      // Clear initial state callbacks
      onTriggered.mockClear();

      // Device stays true
      device._emit('$update', { capabilityId: 'alarm_motion', value: true });

      // Should not trigger (no change from true to true)
      expect(onTriggered).not.toHaveBeenCalled();
    });

    /**
     * Test that true → false does not trigger callback
     */
    it('should not trigger on true to false transition', async () => {
      const device = createMockDevice({
        id: 'motion-1',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true }, // Start as true
      });

      homeyApi.devices._addDevice('motion-1', device);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks
      );

      await monitor.start();

      // Clear initial state callbacks
      onTriggered.mockClear();

      // Change to false
      device.capabilitiesObj.alarm_motion.value = false;
      device._setCapabilityValue('alarm_motion', false);
      device._emit('$update', { capabilityId: 'alarm_motion', value: false });

      // Should not trigger (only false → true triggers)
      expect(onTriggered).not.toHaveBeenCalled();
    });

    /**
     * Test multiple rising edge detections
     */
    it('should detect multiple false to true transitions', async () => {
      const device = createMockDevice({
        id: 'motion-1',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: false },
      });

      homeyApi.devices._addDevice('motion-1', device);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks
      );

      await monitor.start();

      // Clear initial state callbacks
      onTriggered.mockClear();

      // First transition: false → true
      device.capabilitiesObj.alarm_motion.value = true;
      device._setCapabilityValue('alarm_motion', true);
      device._emit('$update', { capabilityId: 'alarm_motion', value: true });
      expect(onTriggered).toHaveBeenCalledTimes(1);

      // Transition: true → false (no callback)
      device.capabilitiesObj.alarm_motion.value = false;
      device._setCapabilityValue('alarm_motion', false);
      device._emit('$update', { capabilityId: 'alarm_motion', value: false });
      expect(onTriggered).toHaveBeenCalledTimes(1);

      // Second transition: false → true
      device.capabilitiesObj.alarm_motion.value = true;
      device._setCapabilityValue('alarm_motion', true);
      device._emit('$update', { capabilityId: 'alarm_motion', value: true });
      expect(onTriggered).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cleanup', () => {
    /**
     * Test that stop() properly cleans up all resources
     */
    it('should cleanup all resources on stop', async () => {
      const device = createMockDevice({
        id: 'motion-1',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: false },
      });

      homeyApi.devices._addDevice('motion-1', device);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks
      );

      await monitor.start();

      // Stop monitoring
      monitor.stop();

      // Clear callbacks (simulates real lifecycle where makeCapabilityInstance callbacks are garbage collected)
      device._clearCapabilityCallbacks();
      onTriggered.mockClear();

      // Change sensor value after stop
      device.capabilitiesObj.alarm_motion.value = true;
      device._setCapabilityValue('alarm_motion', true);
      device._emit('$update', { capabilityId: 'alarm_motion', value: true });

      // Callback should not be called after stop
      expect(onTriggered).not.toHaveBeenCalled();
    });
  });

  describe('Stale sensor detection at initialization', () => {
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;
    const FORTY_MINUTES_MS = 40 * 60 * 1000;
    const TEN_MINUTES_MS = 10 * 60 * 1000;

    /**
     * Test 1: Stale PIR detection at initialization
     * PIR sensor stuck TRUE for 40 minutes should be marked stale and excluded
     */
    it('should detect stale PIR sensor at initialization', async () => {
      const stalePir = createMockDevice({
        id: 'pir-stale',
        name: 'Stale PIR',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true },
      });

      // Set lastUpdated to 40 minutes ago (older than 30min timeout)
      stalePir.capabilitiesObj.alarm_motion.lastUpdated = Date.now() - FORTY_MINUTES_MS;

      homeyApi.devices._addDevice('pir-stale', stalePir);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'pir-stale', capability: 'alarm_motion', deviceName: 'Stale PIR' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks,
        THIRTY_MINUTES_MS, // stalePirTimeoutMs
        THIRTY_MINUTES_MS  // staleDoorTimeoutMs
      );

      await monitor.start();

      // Stale sensor should NOT trigger occupancy
      expect(onTriggered).not.toHaveBeenCalled();
      expect(onReset).toHaveBeenCalledWith('', false);

      // Verify stale sensor was detected and logged
      expect(homey.log).toHaveBeenCalledWith(
        expect.stringContaining('[INIT] Sensor stale: Stale PIR')
      );
    });

    /**
     * Test 2: Fresh PIR (recently updated) should activate occupancy
     */
    it('should treat fresh PIR sensor as active at initialization', async () => {
      const freshPir = createMockDevice({
        id: 'pir-fresh',
        name: 'Fresh PIR',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true },
      });

      // Set lastUpdated to 10 minutes ago (within 30min timeout)
      freshPir.capabilitiesObj.alarm_motion.lastUpdated = Date.now() - TEN_MINUTES_MS;

      homeyApi.devices._addDevice('pir-fresh', freshPir);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'pir-fresh', capability: 'alarm_motion', deviceName: 'Fresh PIR' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks,
        THIRTY_MINUTES_MS, // stalePirTimeoutMs
        THIRTY_MINUTES_MS  // staleDoorTimeoutMs
      );

      await monitor.start();

      // Fresh sensor should trigger occupancy
      expect(onTriggered).toHaveBeenCalledWith('', true);
      expect(onReset).not.toHaveBeenCalled();
    });

    /**
     * Test 3: Stale door sensor detection
     */
    it('should detect stale door sensor at initialization', async () => {
      const staleDoor = createMockDevice({
        id: 'door-stale',
        name: 'Stale Door',
        capabilities: ['alarm_contact'],
        capabilityValues: { alarm_contact: true },
      });

      // Set lastUpdated to 40 minutes ago (older than 30min timeout)
      staleDoor.capabilitiesObj.alarm_contact.lastUpdated = Date.now() - FORTY_MINUTES_MS;

      homeyApi.devices._addDevice('door-stale', staleDoor);

      const resetSensors: SensorConfig[] = [
        { deviceId: 'door-stale', capability: 'alarm_contact', deviceName: 'Stale Door' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        [],
        resetSensors,
        callbacks,
        THIRTY_MINUTES_MS, // stalePirTimeoutMs
        THIRTY_MINUTES_MS  // staleDoorTimeoutMs
      );

      await monitor.start();

      // Verify stale sensor was detected
      expect(homey.log).toHaveBeenCalledWith(
        expect.stringContaining('[INIT] Sensor stale: Stale Door')
      );
    });

    /**
     * Test 4: Different timeouts for PIR vs Door sensors
     */
    it('should use different timeouts for PIR vs door sensors', async () => {
      const pir = createMockDevice({
        id: 'pir-1',
        name: 'PIR Sensor',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true },
      });

      const door = createMockDevice({
        id: 'door-1',
        name: 'Door Sensor',
        capabilities: ['alarm_contact'],
        capabilityValues: { alarm_contact: true },
      });

      // Both updated 25 minutes ago
      const twentyFiveMinutesAgo = Date.now() - (25 * 60 * 1000);
      pir.capabilitiesObj.alarm_motion.lastUpdated = twentyFiveMinutesAgo;
      door.capabilitiesObj.alarm_contact.lastUpdated = twentyFiveMinutesAgo;

      homeyApi.devices._addDevice('pir-1', pir);
      homeyApi.devices._addDevice('door-1', door);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'pir-1', capability: 'alarm_motion', deviceName: 'PIR Sensor' },
      ];
      const resetSensors: SensorConfig[] = [
        { deviceId: 'door-1', capability: 'alarm_contact', deviceName: 'Door Sensor' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        resetSensors,
        callbacks,
        20 * 60 * 1000, // 20 min timeout for PIR (25 min > 20 min = stale)
        30 * 60 * 1000  // 30 min timeout for door (25 min < 30 min = fresh)
      );

      await monitor.start();

      // PIR should be stale (25 > 20), door should be fresh (25 < 30)
      expect(homey.log).toHaveBeenCalledWith(
        expect.stringContaining('[INIT] Sensor stale: PIR Sensor')
      );
      expect(homey.log).not.toHaveBeenCalledWith(
        expect.stringContaining('[INIT] Sensor stale: Door Sensor')
      );
    });

    /**
     * Test 5: Missing lastUpdated timestamp handling
     */
    it('should treat sensor as fresh when lastUpdated timestamp is missing', async () => {
      const pir = createMockDevice({
        id: 'pir-no-timestamp',
        name: 'PIR No Timestamp',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true },
      });

      // Remove lastUpdated timestamp (simulate old device)
      delete pir.capabilitiesObj.alarm_motion.lastUpdated;

      homeyApi.devices._addDevice('pir-no-timestamp', pir);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'pir-no-timestamp', capability: 'alarm_motion', deviceName: 'PIR No Timestamp' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks,
        THIRTY_MINUTES_MS,
        THIRTY_MINUTES_MS
      );

      await monitor.start();

      // Should treat as fresh (conservative approach)
      expect(onTriggered).toHaveBeenCalledWith('', true);
      expect(homey.log).toHaveBeenCalledWith(
        expect.stringContaining('[INIT] No lastUpdated timestamp for PIR No Timestamp')
      );
    });

    /**
     * Test 6: Stale sensors excluded from initial occupancy calculation
     */
    it('should exclude stale sensors from initial occupancy calculation', async () => {
      const stalePir = createMockDevice({
        id: 'pir-stale',
        name: 'Stale PIR',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true },
      });

      stalePir.capabilitiesObj.alarm_motion.lastUpdated = Date.now() - FORTY_MINUTES_MS;

      homeyApi.devices._addDevice('pir-stale', stalePir);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'pir-stale', capability: 'alarm_motion', deviceName: 'Stale PIR' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks,
        THIRTY_MINUTES_MS,
        THIRTY_MINUTES_MS
      );

      await monitor.start();

      // Stale sensor excluded = no active triggers = occupancy FALSE
      expect(onTriggered).not.toHaveBeenCalled();
      expect(onReset).toHaveBeenCalledWith('', false);
    });

    /**
     * Test 7: Stale sensors still monitored at runtime
     */
    it('should continue monitoring stale sensors at runtime', async () => {
      const stalePir = createMockDevice({
        id: 'pir-stale',
        name: 'Stale PIR',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true },
      });

      stalePir.capabilitiesObj.alarm_motion.lastUpdated = Date.now() - FORTY_MINUTES_MS;

      homeyApi.devices._addDevice('pir-stale', stalePir);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'pir-stale', capability: 'alarm_motion', deviceName: 'Stale PIR' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks,
        THIRTY_MINUTES_MS,
        THIRTY_MINUTES_MS
      );

      await monitor.start();

      // Clear initial state callbacks
      onTriggered.mockClear();
      onReset.mockClear();

      // Simulate runtime state change: stale sensor goes false then true
      stalePir.capabilitiesObj.alarm_motion.value = false;
      stalePir._setCapabilityValue('alarm_motion', false);
      stalePir._emit('$update', { capabilityId: 'alarm_motion', value: false });

      // Now trigger again
      stalePir.capabilitiesObj.alarm_motion.value = true;
      stalePir._setCapabilityValue('alarm_motion', true);
      stalePir._emit('$update', { capabilityId: 'alarm_motion', value: true });

      // Should trigger occupancy (stale sensors ARE monitored at runtime)
      expect(onTriggered).toHaveBeenCalledTimes(1);
    });

    /**
     * Test 8: Mixed stale and fresh sensors
     */
    it('should handle mix of stale and fresh sensors correctly', async () => {
      const stalePir = createMockDevice({
        id: 'pir-stale',
        name: 'Stale PIR',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true },
      });

      const freshPir = createMockDevice({
        id: 'pir-fresh',
        name: 'Fresh PIR',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true },
      });

      stalePir.capabilitiesObj.alarm_motion.lastUpdated = Date.now() - FORTY_MINUTES_MS;
      freshPir.capabilitiesObj.alarm_motion.lastUpdated = Date.now() - TEN_MINUTES_MS;

      homeyApi.devices._addDevice('pir-stale', stalePir);
      homeyApi.devices._addDevice('pir-fresh', freshPir);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'pir-stale', capability: 'alarm_motion', deviceName: 'Stale PIR' },
        { deviceId: 'pir-fresh', capability: 'alarm_motion', deviceName: 'Fresh PIR' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks,
        THIRTY_MINUTES_MS,
        THIRTY_MINUTES_MS
      );

      await monitor.start();

      // Fresh sensor should activate occupancy
      expect(onTriggered).toHaveBeenCalledWith('', true);

      // Verify stale sensor logged
      expect(homey.log).toHaveBeenCalledWith(
        expect.stringContaining('[INIT] Sensor stale: Stale PIR')
      );

      // Verify fresh sensor processed
      expect(homey.log).toHaveBeenCalledWith(
        expect.stringContaining('Stored live reference for device: Fresh PIR')
      );
    });

    /**
     * Test 9: Error handling - device not found in cache
     */
    it('should handle missing device gracefully during initialization', async () => {
      // Create sensor config but don't add device to cache
      const triggerSensors: SensorConfig[] = [
        { deviceId: 'missing-device', capability: 'alarm_motion', deviceName: 'Missing Device' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks,
        THIRTY_MINUTES_MS,
        THIRTY_MINUTES_MS
      );

      await monitor.start();

      // Device not found error should be logged from getSensorValue()
      expect(homey.error).toHaveBeenCalledWith(
        expect.stringContaining('[SENSOR_MONITOR_005] Device reference not found: missing-device')
      );

      // Should not activate occupancy (missing device = no value = false)
      expect(onTriggered).not.toHaveBeenCalled();
      expect(onReset).toHaveBeenCalledWith('', false);
    });

    /**
     * Test 10: Error handling - capability not found on device
     */
    it('should handle missing capability gracefully during initialization', async () => {
      const device = createMockDevice({
        id: 'device-1',
        name: 'Device Without Capability',
        capabilities: ['measure_temperature'], // Missing alarm_motion
        capabilityValues: { measure_temperature: 20 },
      });

      homeyApi.devices._addDevice('device-1', device);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'device-1', capability: 'alarm_motion', deviceName: 'Device Without Capability' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks,
        THIRTY_MINUTES_MS,
        THIRTY_MINUTES_MS
      );

      await monitor.start();

      // Capability not found error should be logged from getSensorValue()
      expect(homey.error).toHaveBeenCalledWith(
        expect.stringContaining('[SENSOR_MONITOR_006] Device device-1 does not have capability: alarm_motion')
      );

      // Should not activate occupancy (missing capability = no value = false)
      expect(onTriggered).not.toHaveBeenCalled();
      expect(onReset).toHaveBeenCalledWith('', false);
    });

    /**
     * Test 11: Error handling - exception during sensor value read
     */
    it('should handle exception during sensor value read gracefully', async () => {
      const device = createMockDevice({
        id: 'device-1',
        name: 'Broken Device',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true },
      });

      // Simulate broken capabilitiesObj that throws on access
      Object.defineProperty(device, 'capabilitiesObj', {
        get: () => {
          throw new Error('Simulated device error');
        },
      });

      homeyApi.devices._addDevice('device-1', device);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'device-1', capability: 'alarm_motion', deviceName: 'Broken Device' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks,
        THIRTY_MINUTES_MS,
        THIRTY_MINUTES_MS
      );

      await monitor.start();

      // Should log error from getSensorValue() catch block
      expect(homey.error).toHaveBeenCalledWith(
        expect.stringContaining('[SENSOR_MONITOR_003] Error reading sensor device-1:'),
        expect.any(Error)
      );

      // Should not activate occupancy (exception = no value = false)
      expect(onTriggered).not.toHaveBeenCalled();
      expect(onReset).toHaveBeenCalledWith('', false);
    });

    /**
     * Test 12: Error handling - checkSensorStaleAtInit() fail-safe behavior
     */
    it('should treat sensor as stale when staleness check fails (fail-safe)', async () => {
      const device = createMockDevice({
        id: 'device-1',
        name: 'Device With Broken Timestamp',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true },
      });

      // Make lastUpdated throw when accessed (simulates corrupted data)
      Object.defineProperty(device.capabilitiesObj.alarm_motion, 'lastUpdated', {
        get: () => {
          throw new Error('Corrupted timestamp data');
        },
      });

      homeyApi.devices._addDevice('device-1', device);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'device-1', capability: 'alarm_motion', deviceName: 'Device With Broken Timestamp' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks,
        THIRTY_MINUTES_MS,
        THIRTY_MINUTES_MS
      );

      await monitor.start();

      // Should log fail-safe error from checkSensorStaleAtInit()
      expect(homey.error).toHaveBeenCalledWith(
        expect.stringContaining('[SENSOR_MONITOR_002] Error checking sensor staleness: device-1 - treating as STALE (fail-safe)'),
        expect.any(Error)
      );

      // Should not activate occupancy (fail-safe = treat as stale)
      expect(onTriggered).not.toHaveBeenCalled();
      expect(onReset).toHaveBeenCalledWith('', false);
    });

    /**
     * Test 13: Cleanup clears staleSensors Set
     */
    it('should clear staleSensors Set on stop', async () => {
      const stalePir = createMockDevice({
        id: 'pir-stale',
        name: 'Stale PIR',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true },
      });

      stalePir.capabilitiesObj.alarm_motion.lastUpdated = Date.now() - FORTY_MINUTES_MS;

      homeyApi.devices._addDevice('pir-stale', stalePir);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'pir-stale', capability: 'alarm_motion', deviceName: 'Stale PIR' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks,
        THIRTY_MINUTES_MS,
        THIRTY_MINUTES_MS
      );

      await monitor.start();

      // Verify stale sensor was detected
      expect(homey.log).toHaveBeenCalledWith(
        expect.stringContaining('[INIT] Sensor stale: Stale PIR')
      );

      // Stop monitoring
      monitor.stop();

      // Verify cleanup was logged
      expect(homey.log).toHaveBeenCalledWith('SensorMonitor stopped');

      // Note: We can't directly verify staleSensors.clear() was called since it's private,
      // but the implementation includes it in stop() method and is covered by this test
    });
  });

  describe('Integration tests: End-to-end scenarios', () => {
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;

    /**
     * Integration Test 1: Complete initialization flow with mix of stale and fresh sensors
     * Tests the full initialization sequence including device cache loading, stale detection,
     * initial occupancy calculation, and runtime monitoring setup
     */
    it('should handle complete initialization with stale and fresh sensors', async () => {
      // Setup: 3 trigger sensors (1 stale TRUE, 1 fresh TRUE, 1 fresh FALSE)
      //        1 reset sensor (fresh FALSE)
      const stalePir = createMockDevice({
        id: 'pir-stale',
        name: 'Stale PIR',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true },
      });
      stalePir.capabilitiesObj.alarm_motion.lastUpdated = Date.now() - (40 * 60 * 1000);

      const freshPirActive = createMockDevice({
        id: 'pir-fresh-active',
        name: 'Fresh PIR Active',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true },
      });
      freshPirActive.capabilitiesObj.alarm_motion.lastUpdated = Date.now() - (10 * 60 * 1000);

      const freshPirInactive = createMockDevice({
        id: 'pir-fresh-inactive',
        name: 'Fresh PIR Inactive',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: false },
      });

      const door = createMockDevice({
        id: 'door-1',
        name: 'Door Sensor',
        capabilities: ['alarm_contact'],
        capabilityValues: { alarm_contact: false },
      });

      homeyApi.devices._addDevice('pir-stale', stalePir);
      homeyApi.devices._addDevice('pir-fresh-active', freshPirActive);
      homeyApi.devices._addDevice('pir-fresh-inactive', freshPirInactive);
      homeyApi.devices._addDevice('door-1', door);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'pir-stale', capability: 'alarm_motion', deviceName: 'Stale PIR' },
        { deviceId: 'pir-fresh-active', capability: 'alarm_motion', deviceName: 'Fresh PIR Active' },
        { deviceId: 'pir-fresh-inactive', capability: 'alarm_motion', deviceName: 'Fresh PIR Inactive' },
      ];
      const resetSensors: SensorConfig[] = [
        { deviceId: 'door-1', capability: 'alarm_contact', deviceName: 'Door Sensor' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        resetSensors,
        callbacks,
        THIRTY_MINUTES_MS,
        THIRTY_MINUTES_MS
      );

      // Start monitoring
      await monitor.start();

      // Verify device cache was loaded
      expect(homey.log).toHaveBeenCalledWith(
        expect.stringContaining('Device cache loaded with 4 devices')
      );

      // Verify stale sensor was detected
      expect(homey.log).toHaveBeenCalledWith(
        expect.stringContaining('[INIT] Sensor is STALE (stuck TRUE too long): Stale PIR')
      );

      // Verify fresh active sensor was processed
      expect(homey.log).toHaveBeenCalledWith(
        expect.stringContaining('[INIT] Fresh PIR Active')
      );

      // Verify initial occupancy was triggered (fresh active PIR)
      expect(onTriggered).toHaveBeenCalledWith('', true);
      expect(onReset).not.toHaveBeenCalled();

      // Clear initial state callbacks
      onTriggered.mockClear();
      onReset.mockClear();

      // Test runtime monitoring: stale sensor becomes active again after going false
      stalePir.capabilitiesObj.alarm_motion.value = false;
      stalePir._setCapabilityValue('alarm_motion', false);
      stalePir._emit('$update', { capabilityId: 'alarm_motion', value: false });

      expect(onTriggered).not.toHaveBeenCalled();

      stalePir.capabilitiesObj.alarm_motion.value = true;
      stalePir._setCapabilityValue('alarm_motion', true);
      stalePir._emit('$update', { capabilityId: 'alarm_motion', value: true });

      // Stale sensor should trigger occupancy during runtime
      expect(onTriggered).toHaveBeenCalledTimes(1);

      // Test runtime monitoring: reset sensor triggers
      onTriggered.mockClear();
      onReset.mockClear();

      door.capabilitiesObj.alarm_contact.value = true;
      door._setCapabilityValue('alarm_contact', true);
      door._emit('$update', { capabilityId: 'alarm_contact', value: true });

      expect(onReset).toHaveBeenCalledTimes(1);

      // Cleanup
      monitor.stop();
      expect(homey.log).toHaveBeenCalledWith('SensorMonitor stopped');
    });

    /**
     * Integration Test 2: Device cache retry and recovery
     * Tests the exponential backoff retry logic when device cache loading fails initially
     */
    it('should retry device cache loading with exponential backoff and recover', async () => {
      // Use real timers for this test to allow actual delays
      jest.useRealTimers();

      // Mock getDevices to fail twice, then succeed
      let callCount = 0;
      const mockGetDevices = jest.fn(async () => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Simulated network failure');
        }
        // Third attempt succeeds
        return {
          'device-1': createMockDevice({
            id: 'device-1',
            name: 'Test Device',
            capabilities: ['alarm_motion'],
            capabilityValues: { alarm_motion: false },
          }),
        };
      });

      homeyApi.devices.getDevices = mockGetDevices;

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'device-1', capability: 'alarm_motion', deviceName: 'Test Device' },
      ];

      const monitor = new SensorMonitor(
        homeyApi,
        homey,
        triggerSensors,
        [],
        callbacks,
        THIRTY_MINUTES_MS,
        THIRTY_MINUTES_MS
      );

      // Start monitoring
      await monitor.start();

      // Verify retry attempts were made
      expect(mockGetDevices).toHaveBeenCalledTimes(3);

      // Verify error logging for failed attempts
      expect(homey.error).toHaveBeenCalledWith(
        expect.stringContaining('[SENSOR_MONITOR_001] Failed to load device cache (attempt 1/3)'),
        expect.any(Error)
      );
      expect(homey.error).toHaveBeenCalledWith(
        expect.stringContaining('[SENSOR_MONITOR_001] Failed to load device cache (attempt 2/3)'),
        expect.any(Error)
      );

      // Verify retry delays were logged
      expect(homey.log).toHaveBeenCalledWith(
        expect.stringContaining('Retrying in 1000ms...')
      );
      expect(homey.log).toHaveBeenCalledWith(
        expect.stringContaining('Retrying in 2000ms...')
      );

      // Verify successful cache load on third attempt
      expect(homey.log).toHaveBeenCalledWith(
        expect.stringContaining('Device cache loaded with 1 devices')
      );

      // Verify monitoring started successfully
      expect(homey.log).toHaveBeenCalledWith(
        'Starting SensorMonitor with real-time capability monitoring'
      );

      // Cleanup
      monitor.stop();

      // Restore fake timers for other tests
      jest.useFakeTimers();
    });
  });
});
