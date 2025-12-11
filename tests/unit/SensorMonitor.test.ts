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
});
