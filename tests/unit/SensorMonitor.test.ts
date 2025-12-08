/**
 * Unit tests for SensorMonitor class
 *
 * Tests cover:
 * - Initialization and lifecycle (start/stop)
 * - Trigger sensor activation (false → true) calls onTriggered
 * - Reset sensor activation (false → true) calls onReset
 * - Reset sensor priority over trigger sensors
 * - Graceful handling of missing devices
 * - No callback on false → false (no state change)
 * - Proper cleanup on stop()
 */

import { SensorMonitor } from '../../lib/SensorMonitor';
import { SensorConfig, SensorCallbacks } from '../../lib/types';
import {
  createMockHomey,
  createMockDevice,
  createMockDriver,
} from '../setup';

describe('SensorMonitor', () => {
  let homey: any;
  let onTriggered: jest.Mock;
  let onReset: jest.Mock;
  let callbacks: SensorCallbacks;

  beforeEach(() => {
    jest.useFakeTimers();
    homey = createMockHomey();
    onTriggered = jest.fn();
    onReset = jest.fn();
    callbacks = { onTriggered, onReset };
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Lifecycle management', () => {
    /**
     * Test that SensorMonitor can be started and initializes polling
     */
    it('should start monitoring and initialize polling', () => {
      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];
      const monitor = new SensorMonitor(
        homey,
        triggerSensors,
        [],
        callbacks
      );

      monitor.start();

      expect(homey.log).toHaveBeenCalledWith(
        'Starting SensorMonitor with polling interval:',
        2000,
        'ms'
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
    it('should not start monitoring twice', () => {
      const monitor = new SensorMonitor(homey, [], [], callbacks);

      monitor.start();
      const firstCallCount = homey.log.mock.calls.length;

      monitor.start();

      expect(homey.log).toHaveBeenCalledWith(
        'SensorMonitor already running'
      );
      expect(homey.log.mock.calls.length).toBeGreaterThan(firstCallCount);
    });

    /**
     * Test that stopping monitor cleans up resources properly
     */
    it('should stop monitoring and cleanup resources', () => {
      const monitor = new SensorMonitor(homey, [], [], callbacks);

      monitor.start();
      monitor.stop();

      expect(homey.log).toHaveBeenCalledWith('SensorMonitor stopped');

      // Verify timers are cleared
      const timerCount = jest.getTimerCount();
      expect(timerCount).toBe(0);
    });

    /**
     * Test that stopping an already stopped monitor is safe
     */
    it('should handle stop() when not running', () => {
      const monitor = new SensorMonitor(homey, [], [], callbacks);

      // Should not throw or log when stopping a non-running monitor
      expect(() => monitor.stop()).not.toThrow();
    });
  });

  describe('Trigger sensor detection', () => {
    /**
     * Test that trigger sensor activation (false → true) calls onTriggered
     */
    it('should call onTriggered when trigger sensor changes from false to true', () => {
      // Setup device
      const device = createMockDevice({
        id: 'motion-1',
        name: 'Motion Sensor',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: false },
      });

      const driver = createMockDriver([device]);
      homey.drivers._addDriver('motion-driver', driver);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homey,
        triggerSensors,
        [],
        callbacks
      );
      monitor.start();

      // Initial poll establishes baseline (false)
      jest.advanceTimersByTime(0);
      expect(onTriggered).not.toHaveBeenCalled();

      // Change sensor value to true
      device._setCapabilityValue('alarm_motion', true);

      // Next poll detects change
      jest.advanceTimersByTime(2000);

      expect(onTriggered).toHaveBeenCalledTimes(1);
      expect(homey.log).toHaveBeenCalledWith(
        expect.stringContaining('Trigger sensor activated')
      );
    });

    /**
     * Test that trigger sensor staying false does not trigger callback
     */
    it('should not call onTriggered when sensor remains false', () => {
      const device = createMockDevice({
        id: 'motion-1',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: false },
      });

      const driver = createMockDriver([device]);
      homey.drivers._addDriver('motion-driver', driver);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homey,
        triggerSensors,
        [],
        callbacks
      );
      monitor.start();

      // Multiple polls with sensor staying false
      jest.advanceTimersByTime(2000);
      jest.advanceTimersByTime(2000);
      jest.advanceTimersByTime(2000);

      expect(onTriggered).not.toHaveBeenCalled();
    });

    /**
     * Test that multiple trigger sensors are all monitored
     */
    it('should monitor multiple trigger sensors', () => {
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

      const driver = createMockDriver([device1, device2]);
      homey.drivers._addDriver('motion-driver', driver);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
        { deviceId: 'motion-2', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homey,
        triggerSensors,
        [],
        callbacks
      );
      monitor.start();

      // Initial poll
      jest.advanceTimersByTime(0);

      // Trigger first sensor
      device1._setCapabilityValue('alarm_motion', true);
      jest.advanceTimersByTime(2000);

      expect(onTriggered).toHaveBeenCalledTimes(1);

      // Trigger second sensor
      device2._setCapabilityValue('alarm_motion', true);
      jest.advanceTimersByTime(2000);

      expect(onTriggered).toHaveBeenCalledTimes(2);
    });
  });

  describe('Reset sensor detection', () => {
    /**
     * Test that reset sensor activation (false → true) calls onReset
     */
    it('should call onReset when reset sensor changes from false to true', () => {
      const device = createMockDevice({
        id: 'contact-1',
        name: 'Door Sensor',
        capabilities: ['alarm_contact'],
        capabilityValues: { alarm_contact: false },
      });

      const driver = createMockDriver([device]);
      homey.drivers._addDriver('contact-driver', driver);

      const resetSensors: SensorConfig[] = [
        { deviceId: 'contact-1', capability: 'alarm_contact' },
      ];

      const monitor = new SensorMonitor(homey, [], resetSensors, callbacks);
      monitor.start();

      // Initial poll
      jest.advanceTimersByTime(0);

      // Change sensor value to true
      device._setCapabilityValue('alarm_contact', true);
      jest.advanceTimersByTime(2000);

      expect(onReset).toHaveBeenCalledTimes(1);
      expect(homey.log).toHaveBeenCalledWith(
        expect.stringContaining('Reset sensor triggered')
      );
    });

    /**
     * Test that reset sensor takes precedence over trigger sensor
     * When both sensors trigger, only onReset should be called
     */
    it('should prioritize reset sensor over trigger sensor', () => {
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

      const driver = createMockDriver([triggerDevice, resetDevice]);
      homey.drivers._addDriver('sensor-driver', driver);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];
      const resetSensors: SensorConfig[] = [
        { deviceId: 'contact-1', capability: 'alarm_contact' },
      ];

      const monitor = new SensorMonitor(
        homey,
        triggerSensors,
        resetSensors,
        callbacks
      );
      monitor.start();

      // Initial poll
      jest.advanceTimersByTime(0);

      // Trigger both sensors simultaneously
      triggerDevice._setCapabilityValue('alarm_motion', true);
      resetDevice._setCapabilityValue('alarm_contact', true);
      jest.advanceTimersByTime(2000);

      // Only onReset should be called (reset has priority)
      expect(onReset).toHaveBeenCalledTimes(1);
      expect(onTriggered).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    /**
     * Test graceful handling of missing devices
     */
    it('should handle missing devices gracefully', () => {
      // No driver registered, device will not be found
      const triggerSensors: SensorConfig[] = [
        { deviceId: 'non-existent', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homey,
        triggerSensors,
        [],
        callbacks
      );
      monitor.start();

      // Should not throw, just log error
      expect(() => {
        jest.advanceTimersByTime(0);
        jest.advanceTimersByTime(2000);
      }).not.toThrow();

      expect(homey.error).toHaveBeenCalledWith(
        expect.stringContaining('Device not found: non-existent')
      );
      expect(onTriggered).not.toHaveBeenCalled();
    });

    /**
     * Test handling of device missing required capability
     */
    it('should handle device without required capability', () => {
      const device = createMockDevice({
        id: 'device-1',
        capabilities: ['measure_temperature'], // Missing alarm_motion
        capabilityValues: { measure_temperature: 20 },
      });

      const driver = createMockDriver([device]);
      homey.drivers._addDriver('driver', driver);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'device-1', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homey,
        triggerSensors,
        [],
        callbacks
      );
      monitor.start();

      // Should not throw
      expect(() => {
        jest.advanceTimersByTime(0);
        jest.advanceTimersByTime(2000);
      }).not.toThrow();

      expect(homey.error).toHaveBeenCalledWith(
        expect.stringContaining('does not have capability: alarm_motion')
      );
      expect(onTriggered).not.toHaveBeenCalled();
    });

    /**
     * Test that errors during polling don't crash the monitor
     */
    it('should continue monitoring after poll error', () => {
      const device = createMockDevice({
        id: 'device-1',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: false },
      });

      // Make getCapabilityValue throw on first call
      let callCount = 0;
      device.getCapabilityValue.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Simulated device error');
        }
        return true; // Return true on subsequent calls
      });

      const driver = createMockDriver([device]);
      homey.drivers._addDriver('driver', driver);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'device-1', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homey,
        triggerSensors,
        [],
        callbacks
      );
      monitor.start();

      // First poll - should handle error
      jest.advanceTimersByTime(0);
      expect(homey.error).toHaveBeenCalledWith(
        expect.stringContaining('Error reading sensor'),
        expect.any(Error)
      );

      // Second poll - should work normally
      jest.advanceTimersByTime(2000);
      expect(onTriggered).toHaveBeenCalledTimes(1);
    });
  });

  describe('State change detection', () => {
    /**
     * Test that true → true does not trigger callback
     */
    it('should not trigger on true to true transition', () => {
      const device = createMockDevice({
        id: 'motion-1',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true }, // Start as true
      });

      const driver = createMockDriver([device]);
      homey.drivers._addDriver('driver', driver);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homey,
        triggerSensors,
        [],
        callbacks
      );
      monitor.start();

      // Initial poll establishes baseline (true)
      jest.advanceTimersByTime(0);

      // Device stays true
      jest.advanceTimersByTime(2000);

      // Should not trigger (no change from true to true)
      expect(onTriggered).not.toHaveBeenCalled();
    });

    /**
     * Test that true → false does not trigger callback
     */
    it('should not trigger on true to false transition', () => {
      const device = createMockDevice({
        id: 'motion-1',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: true }, // Start as true
      });

      const driver = createMockDriver([device]);
      homey.drivers._addDriver('driver', driver);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homey,
        triggerSensors,
        [],
        callbacks
      );
      monitor.start();

      // Initial poll establishes baseline (true)
      jest.advanceTimersByTime(0);

      // Change to false
      device._setCapabilityValue('alarm_motion', false);
      jest.advanceTimersByTime(2000);

      // Should not trigger (only false → true triggers)
      expect(onTriggered).not.toHaveBeenCalled();
    });

    /**
     * Test multiple rising edge detections
     */
    it('should detect multiple false to true transitions', () => {
      const device = createMockDevice({
        id: 'motion-1',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: false },
      });

      const driver = createMockDriver([device]);
      homey.drivers._addDriver('driver', driver);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homey,
        triggerSensors,
        [],
        callbacks
      );
      monitor.start();

      // Initial state: false
      jest.advanceTimersByTime(0);

      // First transition: false → true
      device._setCapabilityValue('alarm_motion', true);
      jest.advanceTimersByTime(2000);
      expect(onTriggered).toHaveBeenCalledTimes(1);

      // Transition: true → false (no callback)
      device._setCapabilityValue('alarm_motion', false);
      jest.advanceTimersByTime(2000);
      expect(onTriggered).toHaveBeenCalledTimes(1);

      // Second transition: false → true
      device._setCapabilityValue('alarm_motion', true);
      jest.advanceTimersByTime(2000);
      expect(onTriggered).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cleanup', () => {
    /**
     * Test that stop() properly cleans up all resources
     */
    it('should cleanup all resources on stop', () => {
      const device = createMockDevice({
        id: 'motion-1',
        capabilities: ['alarm_motion'],
        capabilityValues: { alarm_motion: false },
      });

      const driver = createMockDriver([device]);
      homey.drivers._addDriver('driver', driver);

      const triggerSensors: SensorConfig[] = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ];

      const monitor = new SensorMonitor(
        homey,
        triggerSensors,
        [],
        callbacks
      );
      monitor.start();

      // Verify monitoring is active
      expect(jest.getTimerCount()).toBeGreaterThan(0);

      // Stop monitoring
      monitor.stop();

      // Verify cleanup
      expect(jest.getTimerCount()).toBe(0);

      // Change sensor value after stop
      device._setCapabilityValue('alarm_motion', true);
      jest.advanceTimersByTime(10000);

      // Callback should not be called after stop
      expect(onTriggered).not.toHaveBeenCalled();
    });
  });
});
