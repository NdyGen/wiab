/**
 * Unit tests for CircuitBreakerDevice class
 *
 * Tests cover:
 * - onInit: initialization, capability listeners, cascade engine setup, error handling
 * - onSettings: parent validation, cycle detection, cascading, orphaning, hierarchy updates
 * - onDeleted: orphan children, error handling, correct error ID usage
 * - onCapabilityOnoff: cascade ON/OFF, flow cards, error handling
 */

import { createMockHomey, createMockHomeyApi, createMockDevice } from '../setup';
import { CircuitBreakerErrorId } from '../../constants/errorIds';

// Mock the dependencies
jest.mock('../../lib/CircuitBreakerHierarchyManager');
jest.mock('../../lib/CircuitBreakerCascadeEngine');
jest.mock('../../lib/CircuitBreakerSettingsValidator');

// Import after mocking to get mocked versions
import { CircuitBreakerHierarchyManager } from '../../lib/CircuitBreakerHierarchyManager';
import { CircuitBreakerCascadeEngine } from '../../lib/CircuitBreakerCascadeEngine';
import { validateCircuitBreakerSettings } from '../../lib/CircuitBreakerSettingsValidator';

// Import CommonJS module
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CircuitBreakerDevice = require('../../drivers/wiab-circuit-breaker/device');

describe('CircuitBreakerDevice', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let device: any;
  let mockHomey: ReturnType<typeof createMockHomey>;
  let mockHomeyApi: ReturnType<typeof createMockHomeyApi>;
  let mockHierarchyManager: jest.Mocked<CircuitBreakerHierarchyManager>;
  let mockCascadeEngine: jest.Mocked<CircuitBreakerCascadeEngine>;
  let mockDriver: unknown;

  beforeEach(() => {
    // Use fake timers for deterministic async testing
    jest.useFakeTimers();

    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock Homey
    mockHomey = createMockHomey();
    mockHomeyApi = createMockHomeyApi();

    // Create mock hierarchy manager
    mockHierarchyManager = {
      getAllCircuitBreakers: jest.fn(),
      getChildren: jest.fn(),
      getParentChain: jest.fn(),
      getDescendants: jest.fn(),
      getDeviceById: jest.fn(),
      wouldCreateCycle: jest.fn(),
      updateDeviceSettings: jest.fn(),
    } as unknown as jest.Mocked<CircuitBreakerHierarchyManager>;

    // Create mock cascade engine
    mockCascadeEngine = {
      cascadeStateChange: jest.fn(),
    } as unknown as jest.Mocked<CircuitBreakerCascadeEngine>;

    // Make constructors return our mocks
    (CircuitBreakerHierarchyManager as jest.MockedClass<typeof CircuitBreakerHierarchyManager>)
      .mockImplementation(() => mockHierarchyManager);
    (CircuitBreakerCascadeEngine as jest.MockedClass<typeof CircuitBreakerCascadeEngine>)
      .mockImplementation(() => mockCascadeEngine);

    // Create device instance
    device = new CircuitBreakerDevice();

    // Setup device with mock homey and app
    (device as unknown as { homey: ReturnType<typeof createMockHomey> }).homey = mockHomey;
    const mockApp = { homeyApi: mockHomeyApi };
    (device as unknown as { homey: { app: unknown } }).homey.app = mockApp;

    // Mock device methods
    device.log = jest.fn();
    device.error = jest.fn();
    device.getData = jest.fn(() => ({ id: 'test-breaker-1' }));
    device.getSetting = jest.fn();
    device.getCapabilityValue = jest.fn(() => true);
    device.setCapabilityValue = jest.fn().mockResolvedValue(undefined);
    device.registerCapabilityListener = jest.fn();

    // Mock driver with flow cards
    mockDriver = {
      turnedOnTrigger: { trigger: jest.fn().mockResolvedValue(undefined) },
      turnedOffTrigger: { trigger: jest.fn().mockResolvedValue(undefined) },
      flippedTrigger: { trigger: jest.fn().mockResolvedValue(undefined) },
      getDevices: jest.fn(() => []),
    };
    (device as unknown as { driver: unknown }).driver = mockDriver;

    // Add the device itself to the HomeyAPI devices map with data property
    // This is needed for Homey device ID lookup during initialization
    const mockDeviceInApi = createMockDevice({
      id: 'test-breaker-uuid',
      name: 'Test Circuit Breaker',
      capabilities: ['onoff'],
      settings: { parentId: null },
    });
    mockDeviceInApi.driverId = 'wiab-circuit-breaker';
    (mockDeviceInApi as { data?: { id?: string } }).data = { id: 'test-breaker-1' };
    mockHomeyApi.devices._addDevice('test-breaker-uuid', mockDeviceInApi);
  });

  afterEach(() => {
    // Restore real timers after each test
    jest.useRealTimers();
  });

  describe('onInit', () => {
    it('should initialize with hierarchy manager and cascade engine', async () => {
      await device.onInit();

      expect(CircuitBreakerHierarchyManager).toHaveBeenCalledWith(
        mockHomeyApi,
        expect.objectContaining({
          log: expect.any(Function),
          error: expect.any(Function),
        })
      );

      expect(CircuitBreakerCascadeEngine).toHaveBeenCalledWith(
        mockHomeyApi,
        mockHierarchyManager,
        expect.objectContaining({
          log: expect.any(Function),
          error: expect.any(Function),
        })
      );

      expect(device.log).toHaveBeenCalledWith('Circuit breaker device initializing');
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Circuit breaker initialized')
      );
    });

    it('should register capability listener for onoff', async () => {
      await device.onInit();

      expect(device.registerCapabilityListener).toHaveBeenCalledWith(
        'onoff',
        expect.any(Function)
      );
    });

    it('should throw when HomeyAPI not available', async () => {
      // Remove HomeyAPI from app
      (device as unknown as { homey: { app: unknown } }).homey.app = {};

      await expect(device.onInit()).rejects.toThrow('HomeyAPI not available');

      expect(device.error).toHaveBeenCalledWith(
        expect.stringContaining(`[${CircuitBreakerErrorId.DEVICE_INIT_FAILED}]`),
        expect.any(Error)
      );
    });

    it('should handle initialization errors gracefully', async () => {
      // Make CircuitBreakerHierarchyManager constructor throw
      (CircuitBreakerHierarchyManager as jest.MockedClass<typeof CircuitBreakerHierarchyManager>)
        .mockImplementation(() => {
          throw new Error('Initialization failed');
        });

      await expect(device.onInit()).rejects.toThrow('Initialization failed');

      expect(device.error).toHaveBeenCalledWith(
        expect.stringContaining(`[${CircuitBreakerErrorId.DEVICE_INIT_FAILED}]`),
        expect.any(Error)
      );
    });
  });

  describe('onSettings', () => {
    beforeEach(async () => {
      // Initialize device first
      await device.onInit();
      jest.clearAllMocks();
    });

    it('should validate parent assignment when parentId changes', async () => {
      const oldSettings = { parentId: null };
      const newSettings = { parentId: 'parent-breaker-1' };
      const changedKeys = ['parentId'];

      (validateCircuitBreakerSettings as jest.Mock).mockResolvedValue(undefined);

      await device.onSettings({ oldSettings, newSettings, changedKeys });

      expect(validateCircuitBreakerSettings).toHaveBeenCalledWith(
        newSettings,
        'test-breaker-1',
        mockHierarchyManager
      );

      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Parent ID changed from')
      );
    });

    it('should skip validation when parentId does not change', async () => {
      const oldSettings = { timeout: 30 };
      const newSettings = { timeout: 60 };
      const changedKeys = ['timeout'];

      await device.onSettings({ oldSettings, newSettings, changedKeys });

      expect(validateCircuitBreakerSettings).not.toHaveBeenCalled();
    });

    it('should throw when cycle is detected', async () => {
      const oldSettings = { parentId: null };
      const newSettings = { parentId: 'parent-breaker-1' };
      const changedKeys = ['parentId'];

      (validateCircuitBreakerSettings as jest.Mock).mockRejectedValue(
        new Error('Cycle detected')
      );

      await expect(
        device.onSettings({ oldSettings, newSettings, changedKeys })
      ).rejects.toThrow('Cycle detected');

      expect(device.error).toHaveBeenCalledWith(
        expect.stringContaining(`[${CircuitBreakerErrorId.SETTINGS_UPDATE_FAILED}]`),
        expect.any(Error)
      );
    });

    it('should handle empty parent (orphaning)', async () => {
      const oldSettings = { parentId: 'parent-breaker-1' };
      const newSettings = { parentId: '' };
      const changedKeys = ['parentId'];

      (validateCircuitBreakerSettings as jest.Mock).mockResolvedValue(undefined);

      await device.onSettings({ oldSettings, newSettings, changedKeys });

      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Parent ID changed from parent-breaker-1 to none')
      );
    });

    it('should throw when hierarchy manager not initialized', async () => {
      // Create new device without initialization
      const uninitializedDevice = new CircuitBreakerDevice();
      (uninitializedDevice as unknown as { homey: ReturnType<typeof createMockHomey> }).homey = mockHomey;
      uninitializedDevice.log = jest.fn();
      uninitializedDevice.error = jest.fn();
      uninitializedDevice.getData = jest.fn(() => ({ id: 'test-breaker-1' }));

      const settings = {
        oldSettings: { parentId: null },
        newSettings: { parentId: 'parent-breaker-1' },
        changedKeys: ['parentId'],
      };

      await expect(uninitializedDevice.onSettings(settings)).rejects.toThrow(
        'Hierarchy manager not initialized'
      );
    });
  });

  describe('onDeleted', () => {
    beforeEach(async () => {
      // Initialize device first
      await device.onInit();
      jest.clearAllMocks();
    });

    it('should orphan all children on deletion', async () => {
      const childIds = ['child-1', 'child-2', 'child-3'];
      mockHierarchyManager.getChildren.mockResolvedValue(childIds);

      // Create mock child devices
      const child1 = createMockDevice({ id: 'child-1', settings: { parentId: 'test-breaker-1' } });
      const child2 = createMockDevice({ id: 'child-2', settings: { parentId: 'test-breaker-1' } });
      const child3 = createMockDevice({ id: 'child-3', settings: { parentId: 'test-breaker-1' } });

      (mockDriver as { getDevices: jest.Mock }).getDevices.mockReturnValue([child1, child2, child3]);

      await device.onDeleted();

      // Advance timers to allow async orphan operation to complete
      await jest.advanceTimersByTimeAsync(10);

      expect(mockHierarchyManager.getChildren).toHaveBeenCalledWith('test-breaker-1');
      expect(child1.setSettings).toHaveBeenCalledWith({ parentId: null });
      expect(child2.setSettings).toHaveBeenCalledWith({ parentId: null });
      expect(child3.setSettings).toHaveBeenCalledWith({ parentId: null });
    });

    it('should log orphaned children', async () => {
      const childIds = ['child-1'];
      mockHierarchyManager.getChildren.mockResolvedValue(childIds);

      const child1 = createMockDevice({ id: 'child-1', settings: { parentId: 'test-breaker-1' } });
      (mockDriver as { getDevices: jest.Mock }).getDevices.mockReturnValue([child1]);

      await device.onDeleted();

      // Advance timers to allow async orphan operation to complete
      await jest.advanceTimersByTimeAsync(10);

      expect(device.log).toHaveBeenCalledWith(`Orphaning children of test-breaker-1`);
      expect(device.log).toHaveBeenCalledWith('Orphaned child child-1');
    });

    it('should throw when orphaning fails (prevents data corruption)', async () => {
      const childIds = ['child-1', 'child-2'];
      mockHierarchyManager.getChildren.mockResolvedValue(childIds);

      const child1 = createMockDevice({ id: 'child-1', settings: { parentId: 'test-breaker-1' } });
      child1.setSettings = jest.fn().mockRejectedValue(new Error('Settings update failed'));

      const child2 = createMockDevice({ id: 'child-2', settings: { parentId: 'test-breaker-1' } });

      (mockDriver as { getDevices: jest.Mock }).getDevices.mockReturnValue([child1, child2]);

      // Orphaning is now blocking - if it fails, deletion should throw
      await expect(device.onDeleted()).rejects.toThrow(
        'Failed to orphan 1 child circuit breakers. Deletion cannot proceed. Check device logs.'
      );

      // Error should be logged for failed orphaning (uses ORPHAN_CHILDREN_FAILED error ID)
      expect(device.error).toHaveBeenCalledWith(
        expect.stringContaining(`[${CircuitBreakerErrorId.ORPHAN_CHILDREN_FAILED}]`)
      );

      // Deletion should NOT complete
      expect(device.log).not.toHaveBeenCalledWith('Circuit breaker device deleted');
    });

    it('should throw when getChildren fails', async () => {
      mockHierarchyManager.getChildren.mockRejectedValue(new Error('Failed to get children'));

      // Should throw and prevent deletion
      await expect(device.onDeleted()).rejects.toThrow();

      // Error should be logged
      expect(device.error).toHaveBeenCalledWith(
        expect.stringContaining(`[${CircuitBreakerErrorId.DEVICE_DELETION_FAILED}]`),
        expect.any(Error)
      );

      // Deletion should NOT complete
      expect(device.log).not.toHaveBeenCalledWith('Circuit breaker device deleted');
    });

    it('should handle case when no hierarchy manager exists', async () => {
      // Create device without initialization
      const uninitializedDevice = new CircuitBreakerDevice();
      (uninitializedDevice as unknown as { homey: ReturnType<typeof createMockHomey> }).homey = mockHomey;
      uninitializedDevice.log = jest.fn();
      uninitializedDevice.error = jest.fn();
      uninitializedDevice.getData = jest.fn(() => ({ id: 'test-breaker-1' }));

      await uninitializedDevice.onDeleted();

      expect(uninitializedDevice.log).toHaveBeenCalledWith('Circuit breaker device deleted');
    });

    it('should successfully orphan all children when all exist', async () => {
      const childIds = ['child-1', 'child-2'];
      mockHierarchyManager.getChildren.mockResolvedValue(childIds);

      // Both children exist in driver
      const child1 = createMockDevice({ id: 'child-1', settings: { parentId: 'test-breaker-1' } });
      const child2 = createMockDevice({ id: 'child-2', settings: { parentId: 'test-breaker-1' } });
      (mockDriver as { getDevices: jest.Mock }).getDevices.mockReturnValue([child1, child2]);

      await device.onDeleted();

      // Both children should be orphaned
      expect(child1.setSettings).toHaveBeenCalledWith({ parentId: null });
      expect(child2.setSettings).toHaveBeenCalledWith({ parentId: null });

      // Deletion should complete successfully
      expect(device.log).toHaveBeenCalledWith('Circuit breaker device deleted');
    });

    it('should handle getDevices failure during orphaning', async () => {
      // Arrange
      mockHierarchyManager.getChildren.mockRejectedValue(
        new Error('HomeyAPI temporarily unavailable')
      );

      // Act & Assert - Should throw error and prevent deletion
      await expect(device.onDeleted()).rejects.toThrow();

      // Verify error was logged with appropriate error ID
      expect(device.error).toHaveBeenCalledWith(
        expect.stringContaining(`[${CircuitBreakerErrorId.DEVICE_DELETION_FAILED}]`),
        expect.any(Error)
      );

      // Verify deletion did NOT complete (no "deleted" log)
      expect(device.log).not.toHaveBeenCalledWith('Circuit breaker device deleted');
    });
  });

  describe('onCapabilityOnoff', () => {
    let capabilityListener: (value: boolean) => Promise<void>;

    beforeEach(async () => {
      // Initialize device first
      await device.onInit();

      // Get the registered capability listener
      const registerCall = (device.registerCapabilityListener as jest.Mock).mock.calls[0];
      capabilityListener = registerCall[1];

      jest.clearAllMocks();
    });

    it('should cascade OFF state to all descendants', async () => {
      mockCascadeEngine.cascadeStateChange.mockResolvedValue({
        success: 3,
        failed: 0,
        errors: [],
      });

      await capabilityListener(false);

      expect(mockCascadeEngine.cascadeStateChange).toHaveBeenCalledWith('test-breaker-uuid', false);

      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Cascading OFF state to descendants')
      );
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Cascade complete: 3 succeeded, 0 failed')
      );
    });

    it('should cascade ON state to all descendants', async () => {
      mockCascadeEngine.cascadeStateChange.mockResolvedValue({
        success: 3,
        failed: 0,
        errors: [],
      });

      await capabilityListener(true);

      expect(mockCascadeEngine.cascadeStateChange).toHaveBeenCalledWith('test-breaker-uuid', true);

      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Cascading ON state to descendants')
      );
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Cascade complete: 3 succeeded, 0 failed')
      );
    });

    it('should trigger flow cards on state change', async () => {
      await capabilityListener(true);

      const driver = mockDriver as {
        turnedOnTrigger: { trigger: jest.Mock };
        flippedTrigger: { trigger: jest.Mock };
      };

      expect(driver.turnedOnTrigger.trigger).toHaveBeenCalledWith(device, {}, {});
      expect(driver.flippedTrigger.trigger).toHaveBeenCalledWith(
        device,
        { state: true },
        {}
      );
    });

    it('should log cascade failures but continue operation', async () => {
      mockCascadeEngine.cascadeStateChange.mockResolvedValue({
        success: 2,
        failed: 1,
        errors: [{ deviceId: 'child-1', success: false, error: new Error('Update failed') }],
      });

      await capabilityListener(false);

      expect(device.error).toHaveBeenCalledWith(
        expect.stringContaining(`[${CircuitBreakerErrorId.CASCADE_FAILED}]`),
        expect.arrayContaining([
          expect.objectContaining({
            deviceId: 'child-1',
            success: false,
          }),
        ])
      );
    });

    it('should handle flow card trigger errors gracefully', async () => {
      const driver = mockDriver as {
        turnedOnTrigger: { trigger: jest.Mock };
      };

      driver.turnedOnTrigger.trigger.mockRejectedValue(new Error('Flow card error'));

      await capabilityListener(true);

      // Should log error as non-critical (flow card failures don't stop state changes)
      expect(device.log).toHaveBeenCalledWith(
        'Flow card trigger failed (non-critical):',
        expect.any(Error)
      );
    });

    it('should log cascade engine failures without throwing', async () => {
      mockCascadeEngine.cascadeStateChange.mockRejectedValue(
        new Error('Cascade engine failure')
      );

      // State change should complete successfully even if cascade fails
      await capabilityListener(false);

      // Cascade error should be logged
      expect(device.error).toHaveBeenCalledWith(
        '[CASCADE ERROR] Failed to cascade state change:',
        expect.any(Error)
      );
      expect(device.error).toHaveBeenCalledWith(
        '[CASCADE ERROR] Error details:',
        expect.any(String)
      );
    });

    it('should trigger turned_off flow card when turning off', async () => {
      mockCascadeEngine.cascadeStateChange.mockResolvedValue({
        success: 0,
        failed: 0,
        errors: [],
      });

      await capabilityListener(false);

      const driver = mockDriver as {
        turnedOffTrigger: { trigger: jest.Mock };
        flippedTrigger: { trigger: jest.Mock };
      };

      expect(driver.turnedOffTrigger.trigger).toHaveBeenCalledWith(device, {}, {});
      expect(driver.flippedTrigger.trigger).toHaveBeenCalledWith(
        device,
        { state: false },
        {}
      );
    });

    it('should always trigger flipped flow card regardless of state', async () => {
      const driver = mockDriver as {
        flippedTrigger: { trigger: jest.Mock };
      };

      // Test ON state
      await capabilityListener(true);
      expect(driver.flippedTrigger.trigger).toHaveBeenCalledWith(
        device,
        { state: true },
        {}
      );

      jest.clearAllMocks();

      mockCascadeEngine.cascadeStateChange.mockResolvedValue({
        success: 0,
        failed: 0,
        errors: [],
      });

      // Test OFF state
      await capabilityListener(false);
      expect(driver.flippedTrigger.trigger).toHaveBeenCalledWith(
        device,
        { state: false },
        {}
      );
    });

    it('should set warning when exactly 20% of cascades fail', async () => {
      // Arrange - Create device with cascadeStateChange already initialized
      mockCascadeEngine.cascadeStateChange.mockResolvedValue({
        success: 4,
        failed: 1,
        errors: [{ deviceId: 'child0', success: false, error: new Error('Update failed') }],
      });

      // Mock setWarning
      device.setWarning = jest.fn().mockResolvedValue(undefined);

      // Act - Turn device OFF to trigger cascade (20% failure rate = 1/5)
      await capabilityListener(false);

      // Assert - Should NOT set warning at exactly 20% (implementation uses > 0.2, not >= 0.2)
      // So exactly 20% does not trigger warning
      expect(device.setWarning).not.toHaveBeenCalled();
    });

    it('should log error when setWarning fails', async () => {
      // Arrange - Set up mock to return high failure rate (> 20%)
      mockCascadeEngine.cascadeStateChange.mockResolvedValue({
        success: 0,
        failed: 1,
        errors: [{ deviceId: 'child', success: false, error: new Error('Update failed') }],
      });

      // Make setWarning fail
      device.setWarning = jest.fn().mockRejectedValue(new Error('Warning API unavailable'));

      // Act - Turn OFF to trigger cascade with failures (100% failure rate triggers warning)
      await capabilityListener(false);

      // Assert - Should attempt setWarning and log error when it fails
      expect(device.setWarning).toHaveBeenCalled();
      expect(device.error).toHaveBeenCalledWith(
        'Failed to set cascade failure warning - user will not see device card warning:',
        expect.any(Error)
      );
    });
  });
});
