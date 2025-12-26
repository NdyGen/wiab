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

      // Wait for async orphan operation
      await new Promise((resolve) => setTimeout(resolve, 10));

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

      // Wait for async orphan operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(device.log).toHaveBeenCalledWith(`Orphaning children of test-breaker-1`);
      expect(device.log).toHaveBeenCalledWith('Orphaned child child-1');
    });

    it('should handle orphaning errors without failing deletion', async () => {
      const childIds = ['child-1', 'child-2'];
      mockHierarchyManager.getChildren.mockResolvedValue(childIds);

      const child1 = createMockDevice({ id: 'child-1', settings: { parentId: 'test-breaker-1' } });
      child1.setSettings = jest.fn().mockRejectedValue(new Error('Settings update failed'));

      const child2 = createMockDevice({ id: 'child-2', settings: { parentId: 'test-breaker-1' } });

      (mockDriver as { getDevices: jest.Mock }).getDevices.mockReturnValue([child1, child2]);

      await device.onDeleted();

      // Wait for async orphan operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Deletion should complete despite errors
      expect(device.log).toHaveBeenCalledWith('Circuit breaker device deleted');

      // Error should be logged for failed child
      expect(device.error).toHaveBeenCalledWith(
        expect.stringContaining(`[${CircuitBreakerErrorId.ORPHAN_CHILDREN_FAILED}]`),
        expect.any(Error)
      );
    });

    it('should use DEVICE_DELETION_FAILED error ID for deletion errors', async () => {
      mockHierarchyManager.getChildren.mockRejectedValue(new Error('Failed to get children'));

      await device.onDeleted();

      expect(device.error).toHaveBeenCalledWith(
        expect.stringContaining(`[${CircuitBreakerErrorId.DEVICE_DELETION_FAILED}]`),
        expect.any(Error)
      );
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

    it('should handle case when child device not found in driver', async () => {
      const childIds = ['child-1', 'child-2'];
      mockHierarchyManager.getChildren.mockResolvedValue(childIds);

      // Only child-2 exists in driver
      const child2 = createMockDevice({ id: 'child-2', settings: { parentId: 'test-breaker-1' } });
      (mockDriver as { getDevices: jest.Mock }).getDevices.mockReturnValue([child2]);

      await device.onDeleted();

      // Wait for async orphan operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should only attempt to orphan child-2
      expect(child2.setSettings).toHaveBeenCalledWith({ parentId: null });
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

      expect(mockCascadeEngine.cascadeStateChange).toHaveBeenCalledWith('test-breaker-1', false);

      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Cascading OFF state to descendants')
      );
      expect(device.log).toHaveBeenCalledWith(
        expect.stringContaining('Cascade complete: 3 succeeded, 0 failed')
      );
    });

    it('should NOT cascade when turning ON', async () => {
      await capabilityListener(true);

      expect(mockCascadeEngine.cascadeStateChange).not.toHaveBeenCalled();
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

      // Should log error but not throw
      expect(device.error).toHaveBeenCalledWith(
        expect.stringContaining('Flow card trigger failed')
      );
    });

    it('should throw when cascade engine fails', async () => {
      mockCascadeEngine.cascadeStateChange.mockRejectedValue(
        new Error('Cascade engine failure')
      );

      await expect(
        (device as unknown as { onCapabilityOnoff: (value: boolean) => Promise<void> }).onCapabilityOnoff(false)
      ).rejects.toThrow();

      expect(device.error).toHaveBeenCalled();
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
  });
});
