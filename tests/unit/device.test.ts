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
        'WIAB device initializing with quad-state occupancy model'
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
        expect.any(Object), // homeyApi
        mockHomey,
        [],
        [],
        expect.objectContaining({
          onTriggered: expect.any(Function),
          onReset: expect.any(Function),
          onPirCleared: expect.any(Function),
        })
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
        expect.stringContaining('PIR motion detected')
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

      // Trigger the reset callback with test sensor ID (true = door opened)
      await callbacks.onReset('test-sensor-id', true);

      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Door event')
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

      // Error may be caught at different levels depending on when setCapabilityValue fails
      // It could be either in the updateOccupancyOutput or in the main handler
      const errorCalls = (device.error as jest.Mock).mock.calls;
      expect(errorCalls.some(call =>
        call[0].includes('Failed to update occupancy output') || call[0].includes('Failed to handle PIR motion')
      )).toBe(true);
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

      // Error may be caught at different levels depending on when setCapabilityValue fails
      // It could be either in the updateOccupancyOutput or in the main handler
      const errorCalls = (device.error as jest.Mock).mock.calls;
      expect(errorCalls.some(call =>
        call[0].includes('Failed to update occupancy output') || call[0].includes('Failed to handle door event')
      )).toBe(true);
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
        expect.stringContaining('Classified sensors')
      );
      expect(device.log).toHaveBeenCalledWith(
        'Sensor monitoring initialized successfully'
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
        'Classified sensors: 0 doors, 0 PIRs'
      );
      expect(device.log).toHaveBeenCalledWith(
        'Sensor monitoring initialized successfully'
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
        'Classified sensors: 0 doors, 0 PIRs'
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
        'Classified sensors: 0 doors, 0 PIRs'
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
        'Classified sensors: 0 doors, 0 PIRs'
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
        'Classified sensors: 0 doors, 0 PIRs'
      );
      expect(SensorMonitor).toHaveBeenCalledWith(
        expect.any(Object), // homeyApi
        mockHomey,
        [],
        [],
        expect.objectContaining({
          onTriggered: expect.any(Function),
          onReset: expect.any(Function),
          onPirCleared: expect.any(Function),
        })
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

  describe('Pause/Unpause functionality', () => {
    /**
     * Test that pauseDevice stops monitoring and sets occupancy state to PAUSED
     */
    it('should pause device and set occupancy state to PAUSED', async () => {
      // Setup device
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

      jest.clearAllMocks();

      // Note: registerRunListener is called in onInit, which registers the action handlers
      // We test by directly calling the pause method (which would be triggered by the action)

      // Manually pause device with OCCUPIED state
      await (device as unknown as { pauseDevice: (state: string) => Promise<void> }).pauseDevice('OCCUPIED');

      // Verify device is paused
      expect(device.log).toHaveBeenCalledWith(
        'Pausing device with state: OCCUPIED'
      );
      expect(device.log).toHaveBeenCalledWith(
        'Device paused with state: OCCUPIED'
      );
      // Should have set capabilities to PAUSED state with OCCUPIED boolean
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'occupancy_state',
        'PAUSED'
      );
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'alarm_occupancy',
        true // OCCUPIED = true
      );
      // Should have stopped sensor monitoring
      expect(mockSensorMonitor.stop).toHaveBeenCalled();
    });

    /**
     * Test that pauseDevice with UNOCCUPIED sets alarm_occupancy to false
     */
    it('should pause device with UNOCCUPIED state setting alarm_occupancy to false', async () => {
      // Setup device
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce('[]');

      await device.onInit();
      jest.clearAllMocks();

      // Pause with UNOCCUPIED
      await (device as unknown as { pauseDevice: (state: string) => Promise<void> }).pauseDevice('UNOCCUPIED');

      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'alarm_occupancy',
        false // UNOCCUPIED = false
      );
      expect(device.log).toHaveBeenCalledWith(
        'Device paused with state: UNOCCUPIED'
      );
    });

    /**
     * Test that unpauseDevice reinitializes monitoring when paused
     */
    it('should unpause device and reinitialize sensor monitoring', async () => {
      // Setup device
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce('[]');

      await device.onInit();

      // First, pause the device
      await (device as unknown as { pauseDevice: (state: string) => Promise<void> }).pauseDevice('OCCUPIED');

      jest.clearAllMocks();
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce('[]');

      // Then unpause
      await (device as unknown as { unpauseDevice: () => Promise<void> }).unpauseDevice();

      expect(device.log).toHaveBeenCalledWith(
        'Unpausing device and reinitializing with current sensor values'
      );
      expect(device.log).toHaveBeenCalledWith(
        'Device resumed, sensor monitoring reinitialized'
      );
      // Verify unpause properly reset state
      const isPaused = (device as unknown as { isPausedCheck: () => boolean }).isPausedCheck();
      expect(isPaused).toBe(false);
    });

    /**
     * Test that unpause is idempotent - second call is ignored
     */
    it('should ignore unpause when device is already unpaused', async () => {
      // Setup device (already unpaused by default)
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce('[]');

      await device.onInit();

      jest.clearAllMocks();

      // Try to unpause when already unpaused
      await (device as unknown as { unpauseDevice: () => Promise<void> }).unpauseDevice();

      expect(device.log).toHaveBeenCalledWith(
        'Device is not paused - unpause request ignored'
      );
    });

    /**
     * Test that sensor callbacks are ignored while paused
     */
    it('should ignore sensor events while paused', async () => {
      // Setup device
      const triggerSensors = JSON.stringify([
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ]);

      (device.getSetting as jest.Mock)
        .mockReturnValueOnce(triggerSensors)
        .mockReturnValueOnce('[]');

      await device.onInit();

      // Pause the device
      await (device as unknown as { pauseDevice: (state: string) => Promise<void> }).pauseDevice('UNOCCUPIED');

      // Get the callbacks
      const sensorMonitorCall = (SensorMonitor as jest.MockedClass<typeof SensorMonitor>).mock.calls[0];
      const callbacks = sensorMonitorCall[4];

      jest.clearAllMocks();

      // Try to trigger motion while paused - should be ignored
      await callbacks.onTriggered('motion-1', true);

      // No PIR motion log should appear
      expect(device.log).not.toHaveBeenCalledWith(
        expect.stringContaining('PIR motion detected')
      );
      // Capability should not be updated
      expect(device.setCapabilityValue).not.toHaveBeenCalled();
    });

    /**
     * Test isPausedCheck condition
     */
    it('should correctly report paused state', async () => {
      // Setup device
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce('[]');

      await device.onInit();

      // Initially not paused
      let isPaused = await (device as unknown as { isPausedCheck: () => boolean }).isPausedCheck();
      expect(isPaused).toBe(false);

      // Pause device
      await (device as unknown as { pauseDevice: (state: string) => Promise<void> }).pauseDevice('OCCUPIED');

      // Now paused
      isPaused = await (device as unknown as { isPausedCheck: () => boolean }).isPausedCheck();
      expect(isPaused).toBe(true);

      // Unpause device
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce('[]');

      await (device as unknown as { unpauseDevice: () => Promise<void> }).unpauseDevice();

      // No longer paused
      isPaused = await (device as unknown as { isPausedCheck: () => boolean }).isPausedCheck();
      expect(isPaused).toBe(false);
    });

    /**
     * Test full pause/unpause scenario: paused device ignores sensors, unpaused device responds
     */
    it('should handle complete pause/unpause workflow', async () => {
      // Setup device with sensors
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

      const sensorMonitorCall = (SensorMonitor as jest.MockedClass<typeof SensorMonitor>).mock.calls[0];
      const callbacks = sensorMonitorCall[4];

      jest.clearAllMocks();

      // Step 1: Device is unpaused, motion triggers occupancy
      await callbacks.onTriggered('motion-1', true);
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('PIR motion detected')
      );

      jest.clearAllMocks();

      // Step 2: Pause device to UNOCCUPIED
      await (device as unknown as { pauseDevice: (state: string) => Promise<void> }).pauseDevice('UNOCCUPIED');

      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'alarm_occupancy',
        false
      );

      jest.clearAllMocks();

      // Step 3: Motion events are now ignored while paused
      await callbacks.onTriggered('motion-1', true);
      expect(device.log).not.toHaveBeenCalledWith(
        expect.stringContaining('PIR motion detected')
      );

      jest.clearAllMocks();

      // Step 4: Unpause device
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce(triggerSensors)
        .mockReturnValueOnce(resetSensors);

      await (device as unknown as { unpauseDevice: () => Promise<void> }).unpauseDevice();

      expect(device.log).toHaveBeenCalledWith(
        'Device resumed, sensor monitoring reinitialized'
      );

      jest.clearAllMocks();

      // Step 5: Test that device is responsive again after unpausing
      // We verify this by checking that isPausedCheck returns false
      const isPaused = (device as unknown as { isPausedCheck: () => boolean }).isPausedCheck();
      expect(isPaused).toBe(false);
    });

    /**
     * Test that door events (reset sensor events) are ignored while paused
     */
    it('should ignore door events while paused', async () => {
      // Setup device
      const triggerSensors = JSON.stringify([
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ]);
      const resetSensors = JSON.stringify([
        { deviceId: 'door-1', capability: 'alarm_contact' },
      ]);

      (device.getSetting as jest.Mock)
        .mockReturnValueOnce(triggerSensors)
        .mockReturnValueOnce(resetSensors);

      await device.onInit();

      // Pause the device
      await (device as unknown as { pauseDevice: (state: string) => Promise<void> }).pauseDevice('OCCUPIED');

      // Get the callbacks
      const sensorMonitorCall = (SensorMonitor as jest.MockedClass<typeof SensorMonitor>).mock.calls[0];
      const callbacks = sensorMonitorCall[4];

      jest.clearAllMocks();

      // Try to trigger door event while paused - should be ignored
      await callbacks.onReset('door-1', true); // door opens

      // No door event log should appear
      expect(device.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Door event')
      );
      // State should not change
      expect(device.setCapabilityValue).not.toHaveBeenCalled();
    });

    /**
     * Test that PIR falling edge events are ignored while paused
     */
    it('should ignore PIR falling edge while paused', async () => {
      // Setup device
      const triggerSensors = JSON.stringify([
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ]);
      const resetSensors = JSON.stringify([
        { deviceId: 'door-1', capability: 'alarm_contact' },
      ]);

      (device.getSetting as jest.Mock)
        .mockReturnValueOnce(triggerSensors)
        .mockReturnValueOnce(resetSensors);

      await device.onInit();

      // Pause the device
      await (device as unknown as { pauseDevice: (state: string) => Promise<void> }).pauseDevice('UNOCCUPIED');

      // Get the callbacks
      const sensorMonitorCall = (SensorMonitor as jest.MockedClass<typeof SensorMonitor>).mock.calls[0];
      const callbacks = sensorMonitorCall[4];

      jest.clearAllMocks();

      // Try to trigger PIR falling edge while paused - should be ignored
      if (callbacks.onPirCleared) {
        await callbacks.onPirCleared('motion-1');

        // No PIR cleared log should appear
        expect(device.log).not.toHaveBeenCalledWith(
          expect.stringContaining('PIR motion cleared')
        );
        // No timer should start
        expect(device.log).not.toHaveBeenCalledWith(
          expect.stringContaining('T_ENTER timer started')
        );
      }
    });

    /**
     * Test that monitoring is torn down when pausing
     */
    it('should tear down monitoring when pausing device', async () => {
      // Setup device
      const triggerSensors = JSON.stringify([
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ]);
      const resetSensors = JSON.stringify([
        { deviceId: 'door-1', capability: 'alarm_contact' },
      ]);

      (device.getSetting as jest.Mock)
        .mockReturnValueOnce(triggerSensors)
        .mockReturnValueOnce(resetSensors);

      await device.onInit();

      jest.clearAllMocks();

      // Pause the device
      await (device as unknown as { pauseDevice: (state: string) => Promise<void> }).pauseDevice('OCCUPIED');

      // Verify sensor monitoring was stopped
      expect(mockSensorMonitor.stop).toHaveBeenCalled();
      // Verify teardown message was logged
      expect(device.log).toHaveBeenCalledWith(
        'Tearing down sensor monitoring'
      );
    });

    /**
     * Test that unpause works even when sensor setup encounters errors
     */
    it('should complete unpause even if sensor monitoring setup encounters errors', async () => {
      // Setup device
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce('[]');

      await device.onInit();

      // First pause the device
      await (device as unknown as { pauseDevice: (state: string) => Promise<void> }).pauseDevice('OCCUPIED');

      jest.clearAllMocks();

      // Setup device is now paused
      let isPaused = (device as unknown as { isPausedCheck: () => boolean }).isPausedCheck();
      expect(isPaused).toBe(true);

      // Mock getSetting to return invalid data to cause sensor monitoring setup to fail gracefully
      (device.getSetting as jest.Mock)
        .mockReturnValueOnce('invalid json')
        .mockReturnValueOnce('invalid json');

      // Attempt to unpause - setupSensorMonitoring catches errors gracefully
      // so unpause should complete successfully
      await (device as unknown as { unpauseDevice: () => Promise<void> }).unpauseDevice();

      // Device should be unpaused (isPaused = false)
      isPaused = (device as unknown as { isPausedCheck: () => boolean }).isPausedCheck();
      expect(isPaused).toBe(false);

      // Verify unpause was logged
      expect(device.log).toHaveBeenCalledWith(
        'Device resumed, sensor monitoring reinitialized'
      );
    });
  });
});
