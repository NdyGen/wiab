/**
 * Tests for WIABDevice alarm_data_stale functionality
 * Ensures stale sensor detection and data quality monitoring work correctly
 */

import WIABDevice from '../drivers/wiab-device/device';
import { WIABStateEngine } from '../lib/WIABStateEngine';
import { createMockHomey } from './setup';

describe('WIABDevice - Data Quality Monitoring', () => {
  let device: WIABDevice;
  let mockHomey: ReturnType<typeof createMockHomey>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    mockHomey = createMockHomey();

    device = new WIABDevice();
    Object.assign(device, {
      homey: mockHomey,
      driver: {
        homey: mockHomey,
      },
      getData: jest.fn().mockReturnValue({ id: 'wiab-123' }),
      getName: jest.fn().mockReturnValue('Test WIAB Device'),
      log: jest.fn(),
      error: jest.fn(),
      setCapabilityValue: jest.fn().mockResolvedValue(undefined),
      getCapabilityValue: jest.fn().mockReturnValue(false),
      hasCapability: jest.fn().mockReturnValue(true),
      addCapability: jest.fn().mockResolvedValue(undefined),
      setStoreValue: jest.fn().mockResolvedValue(undefined),
      getStoreValue: jest.fn().mockReturnValue(null),
    });

    // Initialize staleSensorMap for testing
    (device as any).staleSensorMap = new Map();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Stale Sensor Tracking', () => {
    it('should track sensor update timestamps', () => {
      // Arrange
      const sensor1Info = {
        lastUpdated: Date.now() - 10000,
        isStale: false,
        timeoutMs: 30 * 60 * 1000,
      };
      (device as any).staleSensorMap.set('pir-1', sensor1Info);

      const initialTimestamp = sensor1Info.lastUpdated;

      // Advance time
      jest.advanceTimersByTime(5000);

      // Act
      (device as any).updateStaleSensorTracking('pir-1');

      // Assert
      const updatedTimestamp = (device as any).staleSensorMap.get('pir-1').lastUpdated;
      expect(updatedTimestamp).toBeGreaterThan(initialTimestamp);
      expect((device as any).staleSensorMap.get('pir-1').isStale).toBe(false);
    });

    it('should mark sensor fresh when it reports after being stale', () => {
      // Arrange - Sensor is stale
      const sensor1Info = {
        lastUpdated: Date.now() - 40 * 60 * 1000,
        isStale: true,
        timeoutMs: 30 * 60 * 1000,
      };
      (device as any).staleSensorMap.set('pir-1', sensor1Info);

      // Act - Sensor reports new data
      (device as any).updateStaleSensorTracking('pir-1');

      // Assert
      expect((device as any).staleSensorMap.get('pir-1').isStale).toBe(false);
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Sensor became fresh: pir-1')
      );
    });

    it('should not log when fresh sensor updates', () => {
      // Arrange - Sensor is already fresh
      const sensor1Info = {
        lastUpdated: Date.now() - 10 * 60 * 1000,
        isStale: false,
        timeoutMs: 30 * 60 * 1000,
      };
      (device as any).staleSensorMap.set('pir-1', sensor1Info);

      jest.clearAllMocks();

      // Act - Sensor updates again
      (device as any).updateStaleSensorTracking('pir-1');

      // Assert - Should not log "became fresh"
      expect(device.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Sensor became fresh')
      );
    });

    it('should handle non-existent sensor gracefully', () => {
      // Act - Try to update sensor that doesn't exist
      (device as any).updateStaleSensorTracking('nonexistent-sensor');

      // Assert - Should not crash
      expect(device.log).not.toHaveBeenCalled();
    });
  });

  describe('Stale Detection Logic', () => {
    it('should detect sensor as stale after timeout', () => {
      // Arrange - Sensor last updated 31 minutes ago, timeout is 30 minutes
      const now = Date.now();
      const sensor1Info = {
        lastUpdated: now - 31 * 60 * 1000,
        isStale: false,
        timeoutMs: 30 * 60 * 1000,
      };
      (device as any).staleSensorMap.set('pir-1', sensor1Info);

      // Set system time to simulate time passing
      jest.setSystemTime(now);

      // Act
      (device as any).checkForStaleSensors();

      // Assert
      expect((device as any).staleSensorMap.get('pir-1').isStale).toBe(true);
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Sensor became stale: pir-1')
      );
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('timeout: 30min')
      );
    });

    it('should not mark sensor stale if within timeout period', () => {
      // Arrange - Sensor last updated 25 minutes ago, timeout is 30 minutes
      const now = Date.now();
      const sensor1Info = {
        lastUpdated: now - 25 * 60 * 1000,
        isStale: false,
        timeoutMs: 30 * 60 * 1000,
      };
      (device as any).staleSensorMap.set('pir-1', sensor1Info);

      jest.setSystemTime(now);

      // Act
      (device as any).checkForStaleSensors();

      // Assert
      expect((device as any).staleSensorMap.get('pir-1').isStale).toBe(false);
    });

    it('should handle multiple sensors with different timeouts', () => {
      // Arrange
      const now = Date.now();

      // PIR sensor: 31 min old, 30 min timeout - should be stale
      (device as any).staleSensorMap.set('pir-1', {
        lastUpdated: now - 31 * 60 * 1000,
        isStale: false,
        timeoutMs: 30 * 60 * 1000,
      });

      // Door sensor: 45 min old, 60 min timeout - should NOT be stale
      (device as any).staleSensorMap.set('door-1', {
        lastUpdated: now - 45 * 60 * 1000,
        isStale: false,
        timeoutMs: 60 * 60 * 1000,
      });

      jest.setSystemTime(now);

      // Act
      (device as any).checkForStaleSensors();

      // Assert
      expect((device as any).staleSensorMap.get('pir-1').isStale).toBe(true);
      expect((device as any).staleSensorMap.get('door-1').isStale).toBe(false);
    });

    it('should not log if stale state did not change', () => {
      // Arrange - Sensor is already stale
      const now = Date.now();
      (device as any).staleSensorMap.set('pir-1', {
        lastUpdated: now - 40 * 60 * 1000,
        isStale: true,
        timeoutMs: 30 * 60 * 1000,
      });

      jest.setSystemTime(now);
      jest.clearAllMocks();

      // Act - Check again
      (device as any).checkForStaleSensors();

      // Assert - Should not log "became stale" again
      expect(device.log).not.toHaveBeenCalled();
    });
  });

  describe('alarm_data_stale Capability Management', () => {
    it('should set alarm_data_stale to true when ANY sensor is stale', () => {
      // Arrange
      (device as any).staleSensorMap.set('pir-1', {
        lastUpdated: Date.now(),
        isStale: true,
        timeoutMs: 30 * 60 * 1000,
      });
      (device as any).staleSensorMap.set('door-1', {
        lastUpdated: Date.now(),
        isStale: false,
        timeoutMs: 60 * 60 * 1000,
      });

      (device.getCapabilityValue as jest.Mock).mockReturnValue(false);

      // Act
      (device as any).checkAndUpdateDataStaleCapability();

      // Assert
      expect(device.setCapabilityValue).toHaveBeenCalledWith('alarm_data_stale', true);
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Data quality warning: 1 sensor(s) are stale')
      );
    });

    it('should set alarm_data_stale to false when all sensors are fresh', () => {
      // Arrange - All sensors fresh
      (device as any).staleSensorMap.set('pir-1', {
        lastUpdated: Date.now(),
        isStale: false,
        timeoutMs: 30 * 60 * 1000,
      });
      (device as any).staleSensorMap.set('door-1', {
        lastUpdated: Date.now(),
        isStale: false,
        timeoutMs: 60 * 60 * 1000,
      });

      (device.getCapabilityValue as jest.Mock).mockReturnValue(true);

      // Act
      (device as any).checkAndUpdateDataStaleCapability();

      // Assert
      expect(device.setCapabilityValue).toHaveBeenCalledWith('alarm_data_stale', false);
      expect(device.log).toHaveBeenCalledWith(
        'All sensors are now fresh - data quality normal'
      );
    });

    it('should not update capability if value has not changed', () => {
      // Arrange - Capability already false, all sensors fresh
      (device as any).staleSensorMap.set('pir-1', {
        lastUpdated: Date.now(),
        isStale: false,
        timeoutMs: 30 * 60 * 1000,
      });

      (device.getCapabilityValue as jest.Mock).mockReturnValue(false);

      jest.clearAllMocks();

      // Act
      (device as any).checkAndUpdateDataStaleCapability();

      // Assert - Should not call setCapabilityValue
      expect(device.setCapabilityValue).not.toHaveBeenCalled();
    });

    it('should count multiple stale sensors correctly', () => {
      // Arrange - 2 out of 3 sensors stale
      (device as any).staleSensorMap.set('pir-1', {
        lastUpdated: Date.now(),
        isStale: true,
        timeoutMs: 30 * 60 * 1000,
      });
      (device as any).staleSensorMap.set('pir-2', {
        lastUpdated: Date.now(),
        isStale: true,
        timeoutMs: 30 * 60 * 1000,
      });
      (device as any).staleSensorMap.set('door-1', {
        lastUpdated: Date.now(),
        isStale: false,
        timeoutMs: 60 * 60 * 1000,
      });

      (device.getCapabilityValue as jest.Mock).mockReturnValue(false);

      // Act
      (device as any).checkAndUpdateDataStaleCapability();

      // Assert
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Data quality warning: 2 sensor(s) are stale')
      );
    });

    it('should handle capability setValue errors gracefully', () => {
      // Arrange
      (device as any).staleSensorMap.set('pir-1', {
        lastUpdated: Date.now(),
        isStale: true,
        timeoutMs: 30 * 60 * 1000,
      });

      (device.getCapabilityValue as jest.Mock).mockReturnValue(false);
      (device.setCapabilityValue as jest.Mock).mockRejectedValue(new Error('Capability error'));

      // Act - Should not throw
      (device as any).checkAndUpdateDataStaleCapability();

      // Assert
      expect(device.setCapabilityValue).toHaveBeenCalled();
    });
  });

  describe('Stale Monitoring Lifecycle', () => {
    it('should start monitoring interval', () => {
      // Arrange
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      // Act
      (device as any).startStaleMonitoring();

      // Assert
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        60 * 1000 // 60 seconds
      );
      expect(device.log).toHaveBeenCalledWith('Stale sensor monitoring started');
      expect((device as any).staleCheckInterval).toBeDefined();
    });

    it('should stop monitoring interval', () => {
      // Arrange
      (device as any).startStaleMonitoring();
      const interval = (device as any).staleCheckInterval;
      expect(interval).toBeDefined();

      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      // Act
      (device as any).stopStaleMonitoring();

      // Assert
      expect(clearIntervalSpy).toHaveBeenCalledWith(interval);
      expect(device.log).toHaveBeenCalledWith('Stale sensor monitoring stopped');
      expect((device as any).staleCheckInterval).toBeUndefined();
    });

    it('should handle stop when not started', () => {
      // Arrange - No interval running
      (device as any).staleCheckInterval = undefined;

      // Act - Should not throw
      (device as any).stopStaleMonitoring();

      // Assert
      expect(device.log).not.toHaveBeenCalledWith('Stale sensor monitoring stopped');
    });

    it('should check for stale sensors on interval', () => {
      // Arrange
      (device as any).staleSensorMap.set('pir-1', {
        lastUpdated: Date.now() - 40 * 60 * 1000,
        isStale: false,
        timeoutMs: 30 * 60 * 1000,
      });

      (device as any).startStaleMonitoring();

      jest.clearAllMocks();

      // Act - Advance time by 60 seconds (interval period)
      jest.advanceTimersByTime(60 * 1000);

      // Assert - Check was triggered
      expect((device as any).staleSensorMap.get('pir-1').isStale).toBe(true);
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Sensor became stale: pir-1')
      );
    });
  });

  describe('Stale Sensor Fail-Safe Logic', () => {
    beforeEach(() => {
      // Mock occupancy state and timer methods
      (device as any).occupancyState = 'OCCUPIED';
      (device as any).lastStableOccupancy = 'OCCUPIED';
      (device as any).isPaused = false;
      (device as any).stopEnterTimer = jest.fn();
      (device as any).stopClearTimer = jest.fn();
      (device as any).updateOccupancyOutput = jest.fn().mockResolvedValue(undefined);
    });

    it('should set occupancy to UNCERTAIN when all sensors are stale', async () => {
      // Arrange - All sensors stale
      (device as any).staleSensorMap.set('pir-1', {
        lastUpdated: Date.now() - 40 * 60 * 1000,
        isStale: true,
        timeoutMs: 30 * 60 * 1000,
      });
      (device as any).staleSensorMap.set('door-1', {
        lastUpdated: Date.now() - 70 * 60 * 1000,
        isStale: true,
        timeoutMs: 60 * 60 * 1000,
      });

      // Act
      await (device as any).evaluateStaleFailSafe();

      // Assert
      expect((device as any).occupancyState).toBe('UNKNOWN');
      expect((device as any).lastStableOccupancy).toBe('UNOCCUPIED'); // Fail-safe: default to UNOCCUPIED
      expect((device as any).stopEnterTimer).toHaveBeenCalled();
      expect((device as any).stopClearTimer).toHaveBeenCalled();
      expect((device as any).updateOccupancyOutput).toHaveBeenCalled();
      expect(device.log).toHaveBeenCalledWith(
        'Fail-safe: All sensors are stale, setting tri-state=UNKNOWN, boolean=UNOCCUPIED'
      );
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Fail-safe applied: tri-state=UNKNOWN, boolean=UNOCCUPIED')
      );
    });

    it('should not change state when some sensors are still fresh', async () => {
      // Arrange - Only one sensor stale
      (device as any).staleSensorMap.set('pir-1', {
        lastUpdated: Date.now() - 40 * 60 * 1000,
        isStale: true,
        timeoutMs: 30 * 60 * 1000,
      });
      (device as any).staleSensorMap.set('door-1', {
        lastUpdated: Date.now() - 10 * 60 * 1000,
        isStale: false,
        timeoutMs: 60 * 60 * 1000,
      });

      const initialState = (device as any).occupancyState;

      // Act
      await (device as any).evaluateStaleFailSafe();

      // Assert - State should not change
      expect((device as any).occupancyState).toBe(initialState);
      expect((device as any).stopEnterTimer).not.toHaveBeenCalled();
      expect((device as any).updateOccupancyOutput).not.toHaveBeenCalled();
      expect(device.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Fail-safe')
      );
    });

    it('should not apply fail-safe when device is paused', async () => {
      // Arrange - All sensors stale but device is paused
      (device as any).isPaused = true;
      (device as any).staleSensorMap.set('pir-1', {
        lastUpdated: Date.now() - 40 * 60 * 1000,
        isStale: true,
        timeoutMs: 30 * 60 * 1000,
      });

      const initialState = (device as any).occupancyState;

      // Act
      await (device as any).evaluateStaleFailSafe();

      // Assert - State should not change
      expect((device as any).occupancyState).toBe(initialState);
      expect((device as any).updateOccupancyOutput).not.toHaveBeenCalled();
    });

    it('should preserve stable state from UNOCCUPIED', async () => {
      // Arrange - Device was UNOCCUPIED, all sensors stale
      (device as any).occupancyState = 'UNOCCUPIED';
      (device as any).lastStableOccupancy = 'UNOCCUPIED';
      (device as any).staleSensorMap.set('pir-1', {
        lastUpdated: Date.now() - 40 * 60 * 1000,
        isStale: true,
        timeoutMs: 30 * 60 * 1000,
      });

      // Act
      await (device as any).evaluateStaleFailSafe();

      // Assert - Tri-state changes, stable state preserved
      expect((device as any).occupancyState).toBe('UNKNOWN');
      expect((device as any).lastStableOccupancy).toBe('UNOCCUPIED');
    });

    it('should handle fail-safe evaluation errors gracefully', async () => {
      // Arrange - All sensors stale, but updateOccupancyOutput fails
      (device as any).staleSensorMap.set('pir-1', {
        lastUpdated: Date.now() - 40 * 60 * 1000,
        isStale: true,
        timeoutMs: 30 * 60 * 1000,
      });
      (device as any).updateOccupancyOutput = jest.fn().mockRejectedValue(
        new Error('Update failed')
      );

      // Act - Should not throw
      await (device as any).evaluateStaleFailSafe();

      // Assert
      expect(device.error).toHaveBeenCalledWith(
        'Failed to evaluate stale fail-safe:',
        expect.any(Error)
      );
    });
  });

  describe('Integration: Stale Detection with Fail-Safe', () => {
    beforeEach(() => {
      // Setup full device state for integration test
      (device as any).occupancyState = 'OCCUPIED';
      (device as any).lastStableOccupancy = 'OCCUPIED';
      (device as any).isPaused = false;
      (device as any).stopEnterTimer = jest.fn();
      (device as any).stopClearTimer = jest.fn();
      (device as any).updateOccupancyOutput = jest.fn().mockResolvedValue(undefined);
      (device as any).checkAndUpdateDataStaleCapability = jest.fn();
    });

    it('should trigger fail-safe when sensors become stale via checkForStaleSensors', async () => {
      // Arrange - Sensors recently updated
      const now = Date.now();
      (device as any).staleSensorMap.set('pir-1', {
        lastUpdated: now - 31 * 60 * 1000,
        isStale: false,
        timeoutMs: 30 * 60 * 1000,
      });
      (device as any).staleSensorMap.set('door-1', {
        lastUpdated: now - 61 * 60 * 1000,
        isStale: false,
        timeoutMs: 60 * 60 * 1000,
      });

      jest.setSystemTime(now);

      // Act - Check for stale sensors
      (device as any).checkForStaleSensors();

      // Wait for async evaluateStaleFailSafe to complete
      await Promise.resolve();
      await Promise.resolve();

      // Assert - Both sensors became stale
      expect((device as any).staleSensorMap.get('pir-1').isStale).toBe(true);
      expect((device as any).staleSensorMap.get('door-1').isStale).toBe(true);

      // Fail-safe was triggered
      expect((device as any).occupancyState).toBe('UNKNOWN');
      expect((device as any).lastStableOccupancy).toBe('UNOCCUPIED');
      expect((device as any).updateOccupancyOutput).toHaveBeenCalled();
      expect(device.log).toHaveBeenCalledWith(
        'Fail-safe: All sensors are stale, setting tri-state=UNKNOWN, boolean=UNOCCUPIED'
      );
    });

    it('should not trigger fail-safe when only some sensors become stale', async () => {
      // Arrange - Only PIR sensor exceeds timeout
      const now = Date.now();
      (device as any).staleSensorMap.set('pir-1', {
        lastUpdated: now - 31 * 60 * 1000,
        isStale: false,
        timeoutMs: 30 * 60 * 1000,
      });
      (device as any).staleSensorMap.set('door-1', {
        lastUpdated: now - 45 * 60 * 1000,
        isStale: false,
        timeoutMs: 60 * 60 * 1000,
      });

      jest.setSystemTime(now);

      const initialState = (device as any).occupancyState;

      // Act
      (device as any).checkForStaleSensors();
      await Promise.resolve();
      await Promise.resolve();

      // Assert - PIR stale, door fresh
      expect((device as any).staleSensorMap.get('pir-1').isStale).toBe(true);
      expect((device as any).staleSensorMap.get('door-1').isStale).toBe(false);

      // Fail-safe NOT triggered (door still fresh)
      expect((device as any).occupancyState).toBe(initialState);
      expect(device.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Fail-safe')
      );
    });

    it('should set boolean output to UNOCCUPIED when all sensors become stale from OCCUPIED state', async () => {
      // Arrange - Device is OCCUPIED before sensors become stale
      (device as any).occupancyState = 'OCCUPIED';
      (device as any).lastStableOccupancy = 'OCCUPIED';

      // Sensors recently updated, but both exceeded timeout
      const now = Date.now();
      (device as any).staleSensorMap.set('pir-1', {
        lastUpdated: now - 31 * 60 * 1000,
        isStale: false,
        timeoutMs: 30 * 60 * 1000,
      });
      (device as any).staleSensorMap.set('door-1', {
        lastUpdated: now - 61 * 60 * 1000,
        isStale: false,
        timeoutMs: 60 * 60 * 1000,
      });

      jest.setSystemTime(now);

      // Act - Sensors become stale via checkForStaleSensors
      (device as any).checkForStaleSensors();

      // Wait for async evaluateStaleFailSafe to complete
      await Promise.resolve();
      await Promise.resolve();

      // Assert - Fail-safe triggered
      expect((device as any).occupancyState).toBe('UNKNOWN');
      expect((device as any).lastStableOccupancy).toBe('UNOCCUPIED');

      // Verify updateOccupancyOutput was called (which sets alarm_occupancy based on lastStableOccupancy)
      expect((device as any).updateOccupancyOutput).toHaveBeenCalled();

      // Verify logs show fail-safe behavior
      expect(device.log).toHaveBeenCalledWith(
        'Fail-safe: All sensors are stale, setting tri-state=UNKNOWN, boolean=UNOCCUPIED'
      );
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Fail-safe applied: tri-state=UNKNOWN, boolean=UNOCCUPIED')
      );
    });
  });

  describe('Stale Sensor Event Handling', () => {
    it('should ignore motion from stale PIR sensor', async () => {
      // Arrange - Setup device with stale PIR sensor
      (device as any).isPaused = false;
      (device as any).occupancyState = 'UNOCCUPIED';
      (device as any).lastStableOccupancy = 'UNOCCUPIED';
      (device as any).updateOccupancyOutput = jest.fn().mockResolvedValue(undefined);

      // PIR sensor is stale (stuck reporting motion for 31 minutes)
      const stalePirInfo = {
        lastUpdated: Date.now() - 31 * 60 * 1000,
        isStale: true,
        timeoutMs: 30 * 60 * 1000,
      };
      (device as any).staleSensorMap.set('pir-1', stalePirInfo);

      jest.clearAllMocks();

      // Act - Stale PIR reports motion
      await (device as any).handlePirMotion('pir-1');

      // Assert - Motion is ignored, occupancy remains UNOCCUPIED
      expect((device as any).occupancyState).toBe('UNOCCUPIED');
      expect((device as any).lastStableOccupancy).toBe('UNOCCUPIED');
      expect((device as any).updateOccupancyOutput).not.toHaveBeenCalled();

      // Verify log shows motion was ignored
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring event from stale sensor: pir-1 reporting motion')
      );
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('stale for 31min')
      );

      // Verify sensor tracking was updated (marked fresh now that it reported)
      expect(device.log).toHaveBeenCalledWith(
        'Sensor became fresh: pir-1 (was stale, now reporting again)'
      );
    });

    it('should ignore door event from stale door sensor', async () => {
      // Arrange - Setup device with stale door sensor
      (device as any).isPaused = false;
      (device as any).occupancyState = 'OCCUPIED';
      (device as any).lastStableOccupancy = 'OCCUPIED';
      (device as any).doorStates = new Map();
      (device as any).updateOccupancyOutput = jest.fn().mockResolvedValue(undefined);

      // Door sensor is stale
      const staleDoorInfo = {
        lastUpdated: Date.now() - 61 * 60 * 1000,
        isStale: true,
        timeoutMs: 60 * 60 * 1000,
      };
      (device as any).staleSensorMap.set('door-1', staleDoorInfo);

      jest.clearAllMocks();

      // Act - Stale door reports "open"
      await (device as any).handleDoorEvent('door-1', true);

      // Assert - Door event is ignored, state remains OCCUPIED
      expect((device as any).occupancyState).toBe('OCCUPIED');
      expect((device as any).lastStableOccupancy).toBe('OCCUPIED');
      expect((device as any).updateOccupancyOutput).not.toHaveBeenCalled();

      // Verify log shows event was ignored
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring event from stale sensor: door-1 reporting open')
      );
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('stale for 61min')
      );
    });

    it('should ignore PIR cleared event from stale sensor', async () => {
      // Arrange - Setup device waiting for PIR falling edge
      (device as any).isPaused = false;
      (device as any).waitingForPirFallingEdge = true;
      (device as any).lastDoorEventTimestamp = Date.now();
      (device as any).startEnterTimer = jest.fn();

      // PIR sensor is stale
      const stalePirInfo = {
        lastUpdated: Date.now() - 31 * 60 * 1000,
        isStale: true,
        timeoutMs: 30 * 60 * 1000,
      };
      (device as any).staleSensorMap.set('pir-1', stalePirInfo);

      jest.clearAllMocks();

      // Act - Stale PIR reports "cleared"
      await (device as any).handlePirCleared('pir-1');

      // Assert - Cleared event is ignored, flag remains set
      expect((device as any).waitingForPirFallingEdge).toBe(true);
      expect((device as any).startEnterTimer).not.toHaveBeenCalled();

      // Verify log shows event was ignored
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring event from stale sensor: pir-1 reporting motion cleared')
      );
    });

    it('should process motion from fresh PIR sensor after it becomes fresh again', async () => {
      // Arrange - PIR was stale, became fresh, now reports motion
      (device as any).isPaused = false;
      (device as any).occupancyState = 'UNOCCUPIED';
      (device as any).lastStableOccupancy = 'UNOCCUPIED';
      (device as any).doorStates = new Map([['door-1', 'CLOSED']]);
      (device as any).updateOccupancyOutput = jest.fn().mockResolvedValue(undefined);
      (device as any).updatePirTracking = jest.fn();
      (device as any).stopEnterTimer = jest.fn();
      (device as any).applyPirOccupancyLogic = jest.fn();

      // PIR is now fresh (was stale, but recently reported)
      const freshPirInfo = {
        lastUpdated: Date.now() - 1000,
        isStale: false,
        timeoutMs: 30 * 60 * 1000,
      };
      (device as any).staleSensorMap.set('pir-1', freshPirInfo);

      jest.clearAllMocks();

      // Act - Fresh PIR reports motion
      await (device as any).handlePirMotion('pir-1');

      // Assert - Motion is processed normally
      expect((device as any).updatePirTracking).toHaveBeenCalled();
      expect((device as any).stopEnterTimer).toHaveBeenCalled();
      expect((device as any).applyPirOccupancyLogic).toHaveBeenCalled();
      expect((device as any).updateOccupancyOutput).toHaveBeenCalled();

      // Verify normal PIR motion log (not ignored)
      expect(device.log).toHaveBeenCalledWith('PIR motion detected: pir-1');
      expect(device.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Ignoring motion from stale PIR sensor')
      );
    });

    it('should process door event from fresh door sensor', async () => {
      // Arrange - Door is fresh
      (device as any).isPaused = false;
      (device as any).occupancyState = 'OCCUPIED';
      (device as any).lastStableOccupancy = 'OCCUPIED';
      (device as any).doorStates = new Map();
      (device as any).updateOccupancyOutput = jest.fn().mockResolvedValue(undefined);
      (device as any).updateDoorState = jest.fn();
      (device as any).configureEnterTimer = jest.fn().mockResolvedValue(undefined);
      (device as any).configureClearTimer = jest.fn();
      (device as any).logDoorEventState = jest.fn();

      // Door is fresh
      const freshDoorInfo = {
        lastUpdated: Date.now() - 1000,
        isStale: false,
        timeoutMs: 60 * 60 * 1000,
      };
      (device as any).staleSensorMap.set('door-1', freshDoorInfo);

      jest.clearAllMocks();

      // Act - Fresh door reports "open"
      await (device as any).handleDoorEvent('door-1', true);

      // Assert - Door event is processed normally
      expect((device as any).updateDoorState).toHaveBeenCalledWith('door-1', true);
      expect((device as any).occupancyState).toBe('UNKNOWN');
      expect((device as any).configureEnterTimer).toHaveBeenCalled();
      expect((device as any).configureClearTimer).toHaveBeenCalled();
      expect((device as any).updateOccupancyOutput).toHaveBeenCalled();

      // Verify normal door event processing (not ignored)
      expect(device.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Ignoring event from stale door sensor')
      );
    });
  });

  describe('Room State Timer Initialization (Issue #176)', () => {
    /**
     * Tests for the fix to issue #176:
     * Room state timer was never scheduled on device initialization because
     * handleOccupancyChangeForRoomState() was only called when occupancy CHANGED,
     * not on initialization when previousOccupied was null.
     */

    beforeEach(() => {
      // Setup device with room state engine
      (device as any).stateEngine = {
        getCurrentState: jest.fn().mockReturnValue('idle'),
        handleOccupancyChange: jest.fn().mockReturnValue({
          newState: null,
          previousState: 'idle',
          reason: 'Already in idle family',
          scheduledTimerMinutes: 30,
        }),
        getTimerForState: jest.fn().mockReturnValue(30),
      };
      (device as any).manualOverride = false;
      (device as any).lastStableOccupancy = 'UNOCCUPIED';
      (device as any).scheduleRoomStateTimer = jest.fn();
      (device as any).executeRoomStateTransition = jest.fn().mockResolvedValue(undefined);
    });

    it('should schedule room state timer on initialization when occupancy is unoccupied', async () => {
      // Arrange
      (device as any).lastStableOccupancy = 'UNOCCUPIED';
      (device as any).stateEngine.handleOccupancyChange.mockReturnValue({
        newState: null,
        previousState: 'idle',
        reason: 'Already in idle family',
        scheduledTimerMinutes: 30,
      });

      // Act
      await (device as any).initializeRoomStateFromOccupancy();

      // Assert
      expect((device as any).stateEngine.handleOccupancyChange).toHaveBeenCalledWith(false);
      expect((device as any).scheduleRoomStateTimer).toHaveBeenCalledWith(30);
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Room state already correct (idle), scheduling timer: 30 minutes')
      );
    });

    it('should schedule room state timer on initialization when occupancy is occupied', async () => {
      // Arrange
      (device as any).lastStableOccupancy = 'OCCUPIED';
      (device as any).stateEngine.getCurrentState.mockReturnValue('occupied');
      (device as any).stateEngine.handleOccupancyChange.mockReturnValue({
        newState: null,
        previousState: 'occupied',
        reason: 'Already in occupied family',
        scheduledTimerMinutes: 60,
      });
      (device as any).stateEngine.getTimerForState.mockReturnValue(60);

      // Act
      await (device as any).initializeRoomStateFromOccupancy();

      // Assert
      expect((device as any).stateEngine.handleOccupancyChange).toHaveBeenCalledWith(true);
      expect((device as any).scheduleRoomStateTimer).toHaveBeenCalledWith(60);
    });

    it('should execute state transition when state change is needed', async () => {
      // Arrange - State engine says we need to transition
      (device as any).lastStableOccupancy = 'OCCUPIED';
      const result = {
        newState: 'occupied',
        previousState: 'idle',
        reason: 'Occupancy changed to true',
        scheduledTimerMinutes: 60,
      };
      (device as any).stateEngine.handleOccupancyChange.mockReturnValue(result);

      // Act
      await (device as any).initializeRoomStateFromOccupancy();

      // Assert
      expect((device as any).executeRoomStateTransition).toHaveBeenCalledWith(result);
      expect(device.log).toHaveBeenCalledWith('Room state initialized: idle → occupied');
    });

    it('should skip timer initialization when manual override is active', async () => {
      // Arrange
      (device as any).manualOverride = true;

      // Act
      await (device as any).initializeRoomStateFromOccupancy();

      // Assert
      expect((device as any).stateEngine.handleOccupancyChange).not.toHaveBeenCalled();
      expect((device as any).scheduleRoomStateTimer).not.toHaveBeenCalled();
      expect(device.log).toHaveBeenCalledWith(
        'Skipping room state timer initialization: manual override active'
      );
    });

    it('should skip timer initialization when state engine is not initialized', async () => {
      // Arrange
      (device as any).stateEngine = undefined;

      // Act
      await (device as any).initializeRoomStateFromOccupancy();

      // Assert
      expect((device as any).scheduleRoomStateTimer).not.toHaveBeenCalled();
    });

    it('should not schedule timer when timer is disabled (returns null)', async () => {
      // Arrange
      (device as any).stateEngine.handleOccupancyChange.mockReturnValue({
        newState: null,
        previousState: 'idle',
        reason: 'Already in idle family',
        scheduledTimerMinutes: null,
      });
      (device as any).stateEngine.getTimerForState.mockReturnValue(null);

      // Act
      await (device as any).initializeRoomStateFromOccupancy();

      // Assert
      expect((device as any).scheduleRoomStateTimer).not.toHaveBeenCalled();
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('no timer needed')
      );
    });

    it('should handle errors gracefully without throwing', async () => {
      // Arrange
      (device as any).stateEngine.handleOccupancyChange.mockImplementation(() => {
        throw new Error('State engine error');
      });

      // Act - Should not throw
      await (device as any).initializeRoomStateFromOccupancy();

      // Assert
      expect(device.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize room state from occupancy'),
        expect.any(Error)
      );
    });

    it('should use getTimerForState as fallback when scheduledTimerMinutes is null', async () => {
      // Arrange - handleOccupancyChange returns null for timer but getTimerForState has value
      (device as any).stateEngine.handleOccupancyChange.mockReturnValue({
        newState: null,
        previousState: 'occupied',
        reason: 'Already in occupied family',
        scheduledTimerMinutes: null,
      });
      (device as any).stateEngine.getCurrentState.mockReturnValue('occupied');
      (device as any).stateEngine.getTimerForState.mockReturnValue(60);

      // Act
      await (device as any).initializeRoomStateFromOccupancy();

      // Assert - Should use fallback via getTimerForState
      expect((device as any).stateEngine.getTimerForState).toHaveBeenCalledWith('occupied');
      expect((device as any).scheduleRoomStateTimer).toHaveBeenCalledWith(60);
    });
  });

  describe('setManualRoomState (Issue #184)', () => {
    beforeEach(() => {
      // Setup state engine mock
      (device as any).stateEngine = {
        getCurrentState: jest.fn().mockReturnValue('idle'),
        setManualState: jest.fn().mockReturnValue({
          newState: 'extended_idle',
          previousState: 'idle',
          reason: 'Manual state change to extended_idle',
          scheduledTimerMinutes: null,
        }),
      };
      (device as any).manualOverride = false;
      (device as any).stopRoomStateTimer = jest.fn();
      (device as any).triggerRoomStateFlowCards = jest.fn().mockResolvedValue(undefined);
    });

    it('should update room_state capability when setting manual state', async () => {
      // Act
      await (device as any).setManualRoomState('extended_idle');

      // Assert - This is the fix for Issue #184
      expect(device.setCapabilityValue).toHaveBeenCalledWith('room_state', 'extended_idle');
    });

    it('should enable manual override when setting manual state', async () => {
      // Act
      await (device as any).setManualRoomState('extended_idle');

      // Assert
      expect((device as any).manualOverride).toBe(true);
      expect(device.setStoreValue).toHaveBeenCalledWith('manualOverride', true);
    });

    it('should stop automatic timers when setting manual state', async () => {
      // Act
      await (device as any).setManualRoomState('extended_idle');

      // Assert
      expect((device as any).stopRoomStateTimer).toHaveBeenCalled();
    });

    it('should trigger flow cards when state changes', async () => {
      // Act
      await (device as any).setManualRoomState('extended_idle');

      // Assert
      expect((device as any).triggerRoomStateFlowCards).toHaveBeenCalledWith('extended_idle', 'idle');
    });

    it('should not trigger flow cards when already in target state', async () => {
      // Arrange - state engine returns null newState (already in state)
      (device as any).stateEngine.setManualState.mockReturnValue({
        newState: null,
        previousState: 'idle',
        reason: 'Already in state idle',
        scheduledTimerMinutes: null,
      });

      // Act
      await (device as any).setManualRoomState('idle');

      // Assert - Capability should still be updated even if no state change
      expect(device.setCapabilityValue).toHaveBeenCalledWith('room_state', 'idle');
      expect((device as any).triggerRoomStateFlowCards).not.toHaveBeenCalled();
    });

    it('should throw error for invalid room state', async () => {
      // Arrange - Setup WIABStateEngine.isValidState to return false
      const isValidStateSpy = jest.spyOn(WIABStateEngine, 'isValidState').mockReturnValue(false);

      // Act & Assert
      await expect((device as any).setManualRoomState('invalid_state')).rejects.toThrow(
        'Invalid room state: invalid_state'
      );

      // Cleanup
      isValidStateSpy.mockRestore();
    });

    it('should not update state when state engine is not initialized', async () => {
      // Arrange
      (device as any).stateEngine = undefined;

      // Act
      await (device as any).setManualRoomState('extended_idle');

      // Assert
      expect(device.setCapabilityValue).not.toHaveBeenCalled();
      expect(device.setStoreValue).not.toHaveBeenCalled();
    });

    it('should handle capability update errors gracefully', async () => {
      // Arrange
      (device.setCapabilityValue as jest.Mock).mockRejectedValueOnce(new Error('Capability error'));

      // Act - Should not throw
      await (device as any).setManualRoomState('extended_idle');

      // Assert - Error logged but method completes
      expect(device.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update room_state capability'),
        expect.any(Error)
      );
      // Manual override should still be set
      expect((device as any).manualOverride).toBe(true);
    });

    it('should allow reading room_state capability after manual state change', async () => {
      // Arrange - Make getCapabilityValue return whatever was set
      let storedRoomState = 'idle';
      (device.setCapabilityValue as jest.Mock).mockImplementation(
        async (capability: string, value: string) => {
          if (capability === 'room_state') {
            storedRoomState = value;
          }
        }
      );
      (device.getCapabilityValue as jest.Mock).mockImplementation((capability: string) => {
        if (capability === 'room_state') {
          return storedRoomState;
        }
        return null;
      });

      // Act
      await (device as any).setManualRoomState('extended_idle');

      // Assert - Capability value should be readable and match the set value
      expect(device.getCapabilityValue('room_state')).toBe('extended_idle');
    });
  });
});
