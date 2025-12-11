/**
 * Unit tests for WIABDevice class
 *
 * Tests cover:
 * - onInit sets up sensor monitoring
 * - onSettings recreates sensor monitor when sensor configuration changes
 * - onSettings does not recreate monitor for non-sensor setting changes
 * - onDeleted cleans up properly
 * - handleTriggered sets alarm_occupancy to true
 * - handleReset sets alarm_occupancy to false
 * - validateSensorSettings handles various JSON formats
 * - Error handling in all scenarios
 */

import WIABDevice from '../../drivers/wiab-device/device';
import { SensorMonitor } from '../../lib/SensorMonitor';
import { createMockHomey, createMockHomeyApi } from '../setup';

// Mock SensorMonitor to control its behavior in tests
jest.mock('../../lib/SensorMonitor');

describe('WIABDevice', () => {
  let device: InstanceType<typeof WIABDevice>;
  let mockHomey: ReturnType<typeof createMockHomey>;
  let mockSensorMonitor: jest.Mocked<SensorMonitor>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock Homey
    mockHomey = createMockHomey();

    // Create mock SensorMonitor instance
    mockSensorMonitor = {
      start: jest.fn(),
      stop: jest.fn(),
    } as unknown as jest.Mocked<SensorMonitor>;

    // Make SensorMonitor constructor return our mock
    (SensorMonitor as jest.MockedClass<typeof SensorMonitor>).mockImplementation(
      () => mockSensorMonitor
    );

    // Create device instance with mocked homey
    device = new WIABDevice();
    (device as unknown as { homey: ReturnType<typeof createMockHomey> }).homey = mockHomey;

    // Setup mock app with homeyApi for device to use
    const mockHomeyApi = createMockHomeyApi();
    const mockApp = {
      homeyApi: mockHomeyApi,
    };
    (device as unknown as { homey: { app: unknown } }).homey.app = mockApp;

    // Mock device methods
    device.log = jest.fn();
    device.error = jest.fn();
    device.getSetting = jest.fn();
    device.setCapabilityValue = jest.fn().mockResolvedValue(undefined);
    device.hasCapability = jest.fn(() => true);
    device.addCapability = jest.fn().mockResolvedValue(undefined);
  });

  describe('onInit', () => {
    /**
     * Test that onInit sets up sensor monitoring with valid configuration
     */
    it('should initialize and setup sensor monitoring', async () => {
      const triggerSensors = JSON.stringify([
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ]);
      const resetSensors = JSON.stringify([
        { deviceId: 'contact-1', capability: 'alarm_contact' },
      ]);

      (device.getSetting as jest.Mock)
        .mockReturnValueOnce(triggerSensors)
        .mockReturnValueOnce(resetSensors);

      await device.onInit();

      expect(device.log).toHaveBeenCalledWith(
        'WIAB device initializing with tri-state occupancy model'
      );
      expect(device.log).toHaveBeenCalledWith(
        'WIAB device initialization complete'
      );
      expect(SensorMonitor).toHaveBeenCalledWith(
        expect.any(Object), // homeyApi
        mockHomey, // logger
        [{ deviceId: 'motion-1', capability: 'alarm_motion' }],
        [{ deviceId: 'contact-1', capability: 'alarm_contact' }],
        expect.objectContaining({
          onTriggered: expect.any(Function),
          onReset: expect.any(Function),
          onPirCleared: expect.any(Function),
        })
      );
      expect(mockSensorMonitor.start).toHaveBeenCalled();
    });

    /**
     * Test that onInit handles empty sensor configuration
     */
    it('should handle empty sensor configuration', async () => {
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('')
        .mockReturnValueOnce('');

      await device.onInit();

      expect(device.log).toHaveBeenCalledWith(
        'Classified sensors: 0 doors, 0 PIRs'
      );
      expect(SensorMonitor).toHaveBeenCalledWith(
        mockHomey,
        [],
        [],
        expect.any(Object)
      );
      expect(mockSensorMonitor.start).toHaveBeenCalled();
    });

    /**
     * Test that onInit handles invalid JSON gracefully
     */
    it('should handle invalid JSON in sensor settings', async () => {
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('invalid json')
        .mockReturnValueOnce('[]');

      await device.onInit();

      // Should not throw, just log error and continue with empty array
      expect(device.error).toHaveBeenCalledWith(
        'Failed to parse sensor settings JSON:',
        expect.any(Error)
      );
      expect(device.log).toHaveBeenCalledWith(
        'WIAB device initialization complete'
      );
    });

    /**
     * Test that onInit continues even if sensor setup fails
     */
    it('should handle sensor monitoring setup failure gracefully', async () => {
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce('[]');

      mockSensorMonitor.start.mockImplementation(() => {
        throw new Error('Failed to start monitoring');
      });

      await device.onInit();

      expect(device.error).toHaveBeenCalledWith(
        'Failed to setup sensor monitoring:',
        expect.any(Error)
      );
      // Device should still complete initialization
      expect(device.log).toHaveBeenCalledWith(
        'WIAB device initialization complete'
      );
    });
  });

  describe('onSettings', () => {
    /**
     * Test that sensor configuration changes trigger monitor recreation
     */
    it('should recreate sensor monitor when triggerSensors change', async () => {
      // Setup initial monitor
      const triggerSensors = JSON.stringify([
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ]);

      (device.getSetting as jest.Mock)
        .mockReturnValueOnce(triggerSensors)
        .mockReturnValueOnce('[]');

      await device.onInit();

      // Clear mocks from initialization
      jest.clearAllMocks();

      // Update settings
      const newTriggerSensors = JSON.stringify([
        { deviceId: 'motion-2', capability: 'alarm_motion' },
      ]);

      (device.getSetting as jest.Mock)
        .mockReturnValueOnce(newTriggerSensors)
        .mockReturnValueOnce('[]');

      await device.onSettings({
        oldSettings: { triggerSensors },
        newSettings: { triggerSensors: newTriggerSensors },
        changedKeys: ['triggerSensors'],
      });

      expect(device.log).toHaveBeenCalledWith(
        'WIAB device settings changed:', ['triggerSensors']
      );
      expect(device.log).toHaveBeenCalledWith(
        'Sensor configuration changed, reinitializing monitoring'
      );
      expect(mockSensorMonitor.stop).toHaveBeenCalled();
      expect(SensorMonitor).toHaveBeenCalledTimes(1);
      expect(mockSensorMonitor.start).toHaveBeenCalled();
    });

    /**
     * Test that reset sensor configuration changes trigger monitor recreation
     */
    it('should recreate sensor monitor when resetSensors change', async () => {
      // Setup initial monitor
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce('[]');

      await device.onInit();

      // Clear mocks
      jest.clearAllMocks();

      // Update reset sensors
      const newResetSensors = JSON.stringify([
        { deviceId: 'contact-1', capability: 'alarm_contact' },
      ]);

      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce(newResetSensors);

      await device.onSettings({
        oldSettings: { resetSensors: '[]' },
        newSettings: { resetSensors: newResetSensors },
        changedKeys: ['resetSensors'],
      });

      expect(device.log).toHaveBeenCalledWith(
        'Sensor configuration changed, reinitializing monitoring'
      );
      expect(mockSensorMonitor.stop).toHaveBeenCalled();
    });

    /**
     * Test that non-sensor setting changes do not recreate monitor
     */
    it('should not recreate monitor for non-sensor setting changes', async () => {
      // Setup initial monitor
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce('[]');

      await device.onInit();

      // Clear mocks
      jest.clearAllMocks();

      // Update non-sensor setting
      await device.onSettings({
        oldSettings: { timeout: 30 },
        newSettings: { timeout: 60 },
        changedKeys: ['timeout'],
      });

      expect(device.log).toHaveBeenCalledWith(
        'WIAB device settings changed:', ['timeout']
      );
      // Should not log sensor reconfiguration
      expect(device.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Sensor configuration changed')
      );
      expect(mockSensorMonitor.stop).not.toHaveBeenCalled();
    });

    /**
     * Test that changing both sensor and non-sensor settings recreates monitor
     */
    it('should recreate monitor when sensor settings are among changed keys', async () => {
      // Setup initial monitor
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce('[]');

      await device.onInit();

      // Clear mocks
      jest.clearAllMocks();

      // Update multiple settings including sensors
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce('[]');

      await device.onSettings({
        oldSettings: { timeout: 30, triggerSensors: '[]' },
        newSettings: { timeout: 60, triggerSensors: '[]' },
        changedKeys: ['timeout', 'triggerSensors'],
      });

      expect(mockSensorMonitor.stop).toHaveBeenCalled();
    });
  });

  describe('onDeleted', () => {
    /**
     * Test that onDeleted cleans up sensor monitoring
     */
    it('should cleanup sensor monitoring on delete', async () => {
      // Setup device
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce('[]');

      await device.onInit();

      // Delete device
      await device.onDeleted();

      expect(device.log).toHaveBeenCalledWith('WIAB device deleted, cleaning up resources');
      expect(device.log).toHaveBeenCalledWith(
        'Tearing down sensor monitoring'
      );
      expect(mockSensorMonitor.stop).toHaveBeenCalled();
    });

    /**
     * Test that onDeleted handles case when no monitor exists
     */
    it('should handle delete when no monitor exists', async () => {
      // Don't initialize device, just delete
      await device.onDeleted();

      expect(device.log).toHaveBeenCalledWith('WIAB device deleted, cleaning up resources');
      // Should not throw error
      expect(mockSensorMonitor.stop).not.toHaveBeenCalled();
    });
  });

  describe('Sensor callbacks', () => {
    /**
     * Test that handleTriggered sets alarm_occupancy to true
     */
    it('should set alarm_occupancy to true when triggered', async () => {
      // Setup device
      const triggerSensors = JSON.stringify([
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ]);

      (device.getSetting as jest.Mock)
        .mockReturnValueOnce(triggerSensors)
        .mockReturnValueOnce('[]');

      await device.onInit();

      // Get the callbacks passed to SensorMonitor
      // Constructor signature: (homeyApi, logger, triggerSensors, resetSensors, callbacks)
      const sensorMonitorCall = (SensorMonitor as jest.MockedClass<typeof SensorMonitor>).mock.calls[0];
      const callbacks = sensorMonitorCall[4];

      // Trigger the callback with test sensor ID
      await callbacks.onTriggered('test-sensor-id', true);

      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Trigger sensor activated - checking entry timer state')
      );
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'alarm_occupancy',
        true
      );
    });

    /**
     * Test that handleReset sets alarm_occupancy to false
     */
    it('should set alarm_occupancy to false when reset', async () => {
      // Setup device
      const resetSensors = JSON.stringify([
        { deviceId: 'contact-1', capability: 'alarm_contact' },
      ]);

      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce(resetSensors);

      await device.onInit();

      // Get the callbacks
      const sensorMonitorCall = (SensorMonitor as jest.MockedClass<typeof SensorMonitor>).mock.calls[0];
      const callbacks = sensorMonitorCall[4];

      // Trigger the reset callback with test sensor ID
      await callbacks.onReset('test-sensor-id', true);

      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Reset sensor activated - handling based on current occupancy state')
      );
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'alarm_occupancy',
        false
      );
    });

    /**
     * Test error handling when setting capability value fails
     */
    it('should handle capability value error in handleTriggered', async () => {
      // Setup device
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce('[]');

      // Make setCapabilityValue fail
      (device.setCapabilityValue as jest.Mock).mockRejectedValue(
        new Error('Capability error')
      );

      await device.onInit();

      // Get and trigger callback
      const sensorMonitorCall = (SensorMonitor as jest.MockedClass<typeof SensorMonitor>).mock.calls[0];
      const callbacks = sensorMonitorCall[4];

      await callbacks.onTriggered('test-sensor-id', true);

      expect(device.error).toHaveBeenCalledWith(
        'Failed to handle trigger:',
        expect.any(Error)
      );
    });

    /**
     * Test error handling in handleReset
     */
    it('should handle capability value error in handleReset', async () => {
      // Setup device
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce('[]');

      // Make setCapabilityValue fail
      (device.setCapabilityValue as jest.Mock).mockRejectedValue(
        new Error('Capability error')
      );

      await device.onInit();

      // Get and trigger callback
      const sensorMonitorCall = (SensorMonitor as jest.MockedClass<typeof SensorMonitor>).mock.calls[0];
      const callbacks = sensorMonitorCall[4];

      await callbacks.onReset('test-sensor-id', true);

      expect(device.error).toHaveBeenCalledWith(
        'Failed to handle reset:',
        expect.any(Error)
      );
    });
  });

  describe('validateSensorSettings', () => {
    /**
     * Test parsing valid JSON array
     */
    it('should parse valid JSON sensor configuration', async () => {
      const validJson = JSON.stringify([
        { deviceId: 'device-1', capability: 'alarm_motion' },
        { deviceId: 'device-2', capability: 'alarm_contact' },
      ]);

      (device.getSetting as jest.Mock)
        .mockReturnValueOnce(validJson)
        .mockReturnValueOnce('[]');

      await device.onInit();

      expect(device.log).toHaveBeenCalledWith(
        'Setting up monitoring for 2 trigger sensors and 0 reset sensors'
      );
    });

    /**
     * Test handling null or empty string
     */
    it('should handle null and empty string gracefully', async () => {
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce(null)
        .mockReturnValueOnce('');

      await device.onInit();

      expect(device.log).toHaveBeenCalledWith(
        'Setting up monitoring for 0 trigger sensors and 0 reset sensors'
      );
    });

    /**
     * Test handling invalid JSON
     */
    it('should handle invalid JSON gracefully', async () => {
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('invalid json {')
        .mockReturnValueOnce('[]');

      await device.onInit();

      expect(device.error).toHaveBeenCalledWith(
        'Failed to parse sensor settings JSON:',
        expect.any(Error)
      );
      expect(device.log).toHaveBeenCalledWith(
        'Setting up monitoring for 0 trigger sensors and 0 reset sensors'
      );
    });

    /**
     * Test handling non-array JSON
     */
    it('should handle non-array JSON gracefully', async () => {
      const nonArrayJson = JSON.stringify({
        deviceId: 'device-1',
        capability: 'alarm_motion',
      });

      (device.getSetting as jest.Mock)
        .mockReturnValueOnce(nonArrayJson)
        .mockReturnValueOnce('[]');

      await device.onInit();

      expect(device.error).toHaveBeenCalledWith(
        'Sensor settings is not an array:',
        expect.any(Object)
      );
      expect(device.log).toHaveBeenCalledWith(
        'Setting up monitoring for 0 trigger sensors and 0 reset sensors'
      );
    });

    /**
     * Test handling whitespace-only string
     */
    it('should handle whitespace-only string', async () => {
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('   ')
        .mockReturnValueOnce('[]');

      await device.onInit();

      expect(device.log).toHaveBeenCalledWith(
        'Setting up monitoring for 0 trigger sensors and 0 reset sensors'
      );
    });

    /**
     * Test handling empty array
     */
    it('should handle empty array correctly', async () => {
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce('[]');

      await device.onInit();

      expect(device.log).toHaveBeenCalledWith(
        'Setting up monitoring for 0 trigger sensors and 0 reset sensors'
      );
      expect(SensorMonitor).toHaveBeenCalledWith(
        mockHomey,
        [],
        [],
        expect.any(Object)
      );
    });
  });

  describe('Integration scenarios', () => {
    /**
     * Test full lifecycle: init, trigger, reset, delete
     */
    it('should handle full device lifecycle correctly', async () => {
      // Initialize
      const triggerSensors = JSON.stringify([
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ]);
      const resetSensors = JSON.stringify([
        { deviceId: 'contact-1', capability: 'alarm_contact' },
      ]);

      (device.getSetting as jest.Mock)
        .mockReturnValueOnce(triggerSensors)
        .mockReturnValueOnce(resetSensors);

      await device.onInit();

      expect(mockSensorMonitor.start).toHaveBeenCalledTimes(1);

      // Get callbacks
      const sensorMonitorCall = (SensorMonitor as jest.MockedClass<typeof SensorMonitor>).mock.calls[0];
      const callbacks = sensorMonitorCall[4];

      // Trigger sensor
      await callbacks.onTriggered('test-sensor-id', true);
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'alarm_occupancy',
        true
      );

      // Reset sensor
      await callbacks.onReset('test-sensor-id', true);
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'alarm_occupancy',
        false
      );

      // Delete
      await device.onDeleted();
      expect(mockSensorMonitor.stop).toHaveBeenCalledTimes(1);
    });

    /**
     * Test settings change during operation
     */
    it('should handle settings change during operation', async () => {
      // Initialize with one sensor
      const initialTriggerSensors = JSON.stringify([
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ]);

      (device.getSetting as jest.Mock)
        .mockReturnValueOnce(initialTriggerSensors)
        .mockReturnValueOnce('[]');

      await device.onInit();

      const initialSensorMonitor = mockSensorMonitor;

      // Change settings to add more sensors
      const newTriggerSensors = JSON.stringify([
        { deviceId: 'motion-1', capability: 'alarm_motion' },
        { deviceId: 'motion-2', capability: 'alarm_motion' },
      ]);

      (device.getSetting as jest.Mock)
        .mockReturnValueOnce(newTriggerSensors)
        .mockReturnValueOnce('[]');

      await device.onSettings({
        oldSettings: { triggerSensors: initialTriggerSensors },
        newSettings: { triggerSensors: newTriggerSensors },
        changedKeys: ['triggerSensors'],
      });

      // Old monitor should be stopped
      expect(initialSensorMonitor.stop).toHaveBeenCalled();

      // New monitor should be created and started
      expect(SensorMonitor).toHaveBeenCalledTimes(2);
      expect(mockSensorMonitor.start).toHaveBeenCalledTimes(2);
    });
  });

  describe('Multi-PIR T_ENTER Logic', () => {
    /**
     * Test scenario: Single PIR, all active - should wait for falling edge
     *
     * Bedroom scenario: Person in bed (PIR active), door opens
     * Expected: Wait for PIR falling edge before starting T_ENTER
     */
    it('should wait for PIR falling edge when single PIR is active', async () => {
      // Setup: Single PIR, currently active
      const triggerSensors = JSON.stringify([
        { deviceId: 'pir-1', capability: 'alarm_motion' },
      ]);
      const resetSensors = JSON.stringify([
        { deviceId: 'door-1', capability: 'alarm_contact' },
      ]);

      (device.getSetting as jest.Mock)
        .mockReturnValueOnce(triggerSensors)
        .mockReturnValueOnce(resetSensors);

      await device.onInit();

      // Mock HomeyAPI to show PIR is active (TRUE)
      const mockHomeyApi = createMockHomeyApi();
      const mockPirDevice = {
        capabilitiesObj: {
          alarm_motion: { value: true },
        },
      };
      (mockHomeyApi.devices as Record<string, unknown>)['pir-1'] = mockPirDevice;
      (device as unknown as { homey: { app: { homeyApi: unknown } } }).homey.app.homeyApi = mockHomeyApi;

      // Simulate door event (reset sensor activation)
      const sensorMonitorCalls = (SensorMonitor as jest.MockedClass<typeof SensorMonitor>).mock.calls;
      const lastCall = sensorMonitorCalls[sensorMonitorCalls.length - 1];
      const callbacks = lastCall[4];

      jest.clearAllMocks();

      // Trigger door event (reset sensor)
      await callbacks.onReset('door-1', true);

      // Verify: T_ENTER timer should NOT be started yet
      // (it would only be started after onPirCleared is called)
      expect(device.log).toHaveBeenCalledWith(
        'Door event: all PIRs active - waiting for PIR falling edge to start T_ENTER'
      );
    });

    /**
     * Test scenario: Multiple PIRs with one inactive - should start T_ENTER immediately
     *
     * Multi-room scenario: Person exits bathroom (bathroom PIR FALSE),
     * living room PIR active (TRUE), bathroom door opens
     * Expected: Start T_ENTER immediately (can detect return through living room PIR)
     */
    it('should start T_ENTER immediately when any PIR is inactive', async () => {
      // Setup: Two PIRs
      const triggerSensors = JSON.stringify([
        { deviceId: 'pir-bathroom', capability: 'alarm_motion' },
        { deviceId: 'pir-living', capability: 'alarm_motion' },
      ]);
      const resetSensors = JSON.stringify([
        { deviceId: 'door-bathroom', capability: 'alarm_contact' },
      ]);

      (device.getSetting as jest.Mock)
        .mockReturnValueOnce(triggerSensors)
        .mockReturnValueOnce(resetSensors);

      await device.onInit();

      // Mock HomeyAPI with multi-PIR setup:
      // - Bathroom PIR is INACTIVE (person just left)
      // - Living room PIR is ACTIVE (person might still be there)
      const mockHomeyApi = createMockHomeyApi();
      (mockHomeyApi.devices as Record<string, unknown>)['pir-bathroom'] = {
        capabilitiesObj: {
          alarm_motion: { value: false }, // Inactive!
        },
      };
      (mockHomeyApi.devices as Record<string, unknown>)['pir-living'] = {
        capabilitiesObj: {
          alarm_motion: { value: true }, // Active
        },
      };
      (device as unknown as { homey: { app: { homeyApi: unknown } } }).homey.app.homeyApi = mockHomeyApi;

      // Get callbacks from the most recent SensorMonitor call
      const sensorMonitorCalls = (SensorMonitor as jest.MockedClass<typeof SensorMonitor>).mock.calls;
      const lastCall = sensorMonitorCalls[sensorMonitorCalls.length - 1];
      const callbacks = lastCall[4];

      jest.clearAllMocks();

      // Simulate door event on bathroom
      await callbacks.onReset('door-bathroom', true);

      // Verify: Should log that at least one PIR is inactive and start T_ENTER immediately
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('at least one PIR inactive - starting T_ENTER immediately')
      );
    });

    /**
     * Test scenario: PIR falling edge triggers T_ENTER start
     *
     * Bedroom scenario: Person in bed leaves (PIR falls from TRUE to FALSE)
     * Expected: handlePirCleared starts T_ENTER timer
     */
    it('should start T_ENTER when PIR falling edge detected after door event', async () => {
      // Setup
      const triggerSensors = JSON.stringify([
        { deviceId: 'pir-1', capability: 'alarm_motion' },
      ]);
      const resetSensors = JSON.stringify([
        { deviceId: 'door-1', capability: 'alarm_contact' },
      ]);

      (device.getSetting as jest.Mock)
        .mockReturnValueOnce(triggerSensors)
        .mockReturnValueOnce(resetSensors);

      await device.onInit();

      // Setup mock HomeyAPI with active PIR
      const mockHomeyApi = createMockHomeyApi();
      (mockHomeyApi.devices as Record<string, unknown>)['pir-1'] = {
        capabilitiesObj: {
          alarm_motion: { value: true },
        },
      };
      (device as unknown as { homey: { app: { homeyApi: unknown } } }).homey.app.homeyApi = mockHomeyApi;

      // Get callbacks from the most recent SensorMonitor call
      const sensorMonitorCalls = (SensorMonitor as jest.MockedClass<typeof SensorMonitor>).mock.calls;
      const lastCall = sensorMonitorCalls[sensorMonitorCalls.length - 1];
      const callbacks = lastCall[4];

      jest.clearAllMocks();

      // Step 1: Door opens with active PIR
      await callbacks.onReset('door-1', true);

      expect(device.log).toHaveBeenCalledWith(
        'Door event: all PIRs active - waiting for PIR falling edge to start T_ENTER'
      );

      jest.clearAllMocks();

      // Step 2: PIR clears (falling edge)
      if (callbacks.onPirCleared) {
        await callbacks.onPirCleared('pir-1');
      }

      // Verify T_ENTER started
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('PIR cleared after door event - T_ENTER timer started')
      );
    });

    /**
     * Test scenario: PIR motion during T_ENTER window cancels the timer
     *
     * Person exits, PIR clears (T_ENTER starts), then returns and PIR triggers again
     * Expected: T_ENTER timer stops, occupancy stays OCCUPIED
     */
    it('should cancel T_ENTER timer when PIR motion detected', async () => {
      // Setup
      const triggerSensors = JSON.stringify([
        { deviceId: 'pir-1', capability: 'alarm_motion' },
      ]);
      const resetSensors = JSON.stringify([
        { deviceId: 'door-1', capability: 'alarm_contact' },
      ]);

      (device.getSetting as jest.Mock)
        .mockReturnValueOnce(triggerSensors)
        .mockReturnValueOnce(resetSensors);

      await device.onInit();

      // Setup mock HomeyAPI
      const mockHomeyApi = createMockHomeyApi();
      (mockHomeyApi.devices as Record<string, unknown>)['pir-1'] = {
        capabilitiesObj: {
          alarm_motion: { value: true },
        },
      };
      (device as unknown as { homey: { app: { homeyApi: unknown } } }).homey.app.homeyApi = mockHomeyApi;

      // Get callbacks from the most recent SensorMonitor call
      const sensorMonitorCalls = (SensorMonitor as jest.MockedClass<typeof SensorMonitor>).mock.calls;
      const lastCall = sensorMonitorCalls[sensorMonitorCalls.length - 1];
      const callbacks = lastCall[4];

      jest.clearAllMocks();

      // Step 1: Door opens
      await callbacks.onReset('door-1', true);
      jest.clearAllMocks();

      // Step 2: PIR clears (T_ENTER starts)
      if (callbacks.onPirCleared) {
        await callbacks.onPirCleared('pir-1');
      }
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('PIR cleared after door event')
      );
      jest.clearAllMocks();

      // Step 3: PIR motion detected again (person returns)
      await callbacks.onTriggered('pir-1', true);

      // Verify T_ENTER timer was stopped
      expect(device.log).toHaveBeenCalledWith(
        'PIR motion detected: pir-1'
      );
      // The handlePirMotion should have called stopEnterTimer()
      // and cleared waitingForPirFallingEdge flag
    });
  });
});
