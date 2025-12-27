/**
 * Unit tests for CircuitBreakerCascadeEngine class
 *
 * Tests cover:
 * - Cascading state changes to descendants
 * - Sequential updates (not parallel)
 * - Best-effort error handling
 * - Success/failed counts in results
 * - Updating single device state
 * - Batch updates with Promise.allSettled
 * - Error handling and graceful degradation
 */

import { CircuitBreakerCascadeEngine } from '../../lib/CircuitBreakerCascadeEngine';
import { CircuitBreakerHierarchyManager } from '../../lib/CircuitBreakerHierarchyManager';
import { createMockHomey, createMockHomeyApi, createMockDevice } from '../setup';

describe('CircuitBreakerCascadeEngine', () => {
  let homey: ReturnType<typeof createMockHomey>;
  let homeyApi: ReturnType<typeof createMockHomeyApi>;
  let hierarchyManager: CircuitBreakerHierarchyManager;
  let engine: CircuitBreakerCascadeEngine;

  beforeEach(() => {
    homey = createMockHomey();
    homeyApi = createMockHomeyApi();
    hierarchyManager = new CircuitBreakerHierarchyManager(homeyApi, homey);
    engine = new CircuitBreakerCascadeEngine(homeyApi, hierarchyManager, homey);
  });

  afterEach(() => {
    homeyApi.devices._clear();
  });

  describe('cascadeStateChange', () => {
    it('should cascade state change to all descendants', async () => {
      // Arrange - Create hierarchy:
      // root
      //   -> child1
      //       -> grandchild1
      //   -> child2
      const root = createMockDevice({
        id: 'root',
        name: 'Root',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });
      const child1 = createMockDevice({
        id: 'child1',
        name: 'Child 1',
        capabilities: ['onoff'],
        capabilityValues: { onoff: true },
        settings: { parentId: 'root' },
      });
      const child2 = createMockDevice({
        id: 'child2',
        name: 'Child 2',
        capabilities: ['onoff'],
        capabilityValues: { onoff: true },
        settings: { parentId: 'root' },
      });
      const grandchild1 = createMockDevice({
        id: 'grandchild1',
        name: 'Grandchild 1',
        capabilities: ['onoff'],
        capabilityValues: { onoff: true },
        settings: { parentId: 'child1' },
      });

      root.driverId = 'wiab-circuit-breaker';
      child1.driverId = 'wiab-circuit-breaker';
      child2.driverId = 'wiab-circuit-breaker';
      grandchild1.driverId = 'wiab-circuit-breaker';

      homeyApi.devices._addDevice('root', root);
      homeyApi.devices._addDevice('child1', child1);
      homeyApi.devices._addDevice('child2', child2);
      homeyApi.devices._addDevice('grandchild1', grandchild1);

      // Act
      const result = await engine.cascadeStateChange('root', false);

      // Assert
      expect(result.success).toBe(3); // child1, child2, grandchild1
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify all descendants were updated
      expect(child1.setCapabilityValue).toHaveBeenCalledWith('onoff', false);
      expect(child2.setCapabilityValue).toHaveBeenCalledWith('onoff', false);
      expect(grandchild1.setCapabilityValue).toHaveBeenCalledWith('onoff', false);
    });

    it('should return empty result for device with no descendants', async () => {
      // Arrange
      const leaf = createMockDevice({
        id: 'leaf',
        name: 'Leaf',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });

      leaf.driverId = 'wiab-circuit-breaker';
      homeyApi.devices._addDevice('leaf', leaf);

      // Act
      const result = await engine.cascadeStateChange('leaf', false);

      // Assert
      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle partial failures gracefully', async () => {
      // Arrange
      const parent = createMockDevice({
        id: 'parent',
        name: 'Parent',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });
      const child1 = createMockDevice({
        id: 'child1',
        name: 'Child 1',
        capabilities: ['onoff'],
        settings: { parentId: 'parent' },
      });
      const child2 = createMockDevice({
        id: 'child2',
        name: 'Child 2',
        capabilities: ['onoff'],
        settings: { parentId: 'parent' },
      });

      // Make child1 fail to update
      (child1.setCapabilityValue as jest.Mock).mockRejectedValue(
        new Error('Device offline')
      );

      parent.driverId = 'wiab-circuit-breaker';
      child1.driverId = 'wiab-circuit-breaker';
      child2.driverId = 'wiab-circuit-breaker';

      homeyApi.devices._addDevice('parent', parent);
      homeyApi.devices._addDevice('child1', child1);
      homeyApi.devices._addDevice('child2', child2);

      // Act
      const result = await engine.cascadeStateChange('parent', false);

      // Assert
      expect(result.success).toBe(1); // child2 succeeded
      expect(result.failed).toBe(1); // child1 failed
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].deviceId).toBe('child1');
      expect(result.errors[0].success).toBe(false);
    });

    it('should continue updating remaining devices after error', async () => {
      // Arrange
      const parent = createMockDevice({
        id: 'parent',
        name: 'Parent',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });
      const child1 = createMockDevice({
        id: 'child1',
        name: 'Child 1',
        capabilities: ['onoff'],
        settings: { parentId: 'parent' },
      });
      const child2 = createMockDevice({
        id: 'child2',
        name: 'Child 2',
        capabilities: ['onoff'],
        settings: { parentId: 'parent' },
      });
      const child3 = createMockDevice({
        id: 'child3',
        name: 'Child 3',
        capabilities: ['onoff'],
        settings: { parentId: 'parent' },
      });

      // Make child2 fail
      (child2.setCapabilityValue as jest.Mock).mockRejectedValue(
        new Error('Device offline')
      );

      parent.driverId = 'wiab-circuit-breaker';
      child1.driverId = 'wiab-circuit-breaker';
      child2.driverId = 'wiab-circuit-breaker';
      child3.driverId = 'wiab-circuit-breaker';

      homeyApi.devices._addDevice('parent', parent);
      homeyApi.devices._addDevice('child1', child1);
      homeyApi.devices._addDevice('child2', child2);
      homeyApi.devices._addDevice('child3', child3);

      // Act
      const result = await engine.cascadeStateChange('parent', false);

      // Assert
      expect(result.success).toBe(2); // child1 and child3
      expect(result.failed).toBe(1); // child2
      expect(child1.setCapabilityValue).toHaveBeenCalled();
      expect(child3.setCapabilityValue).toHaveBeenCalled();
    });

    it('should throw on critical errors during cascade', async () => {
      // Arrange
      const parent = createMockDevice({
        id: 'parent',
        name: 'Parent',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });

      parent.driverId = 'wiab-circuit-breaker';
      homeyApi.devices._addDevice('parent', parent);

      // Mock getDescendants to throw error
      jest.spyOn(hierarchyManager, 'getDescendants').mockRejectedValue(
        new Error('Critical error')
      );

      // Act & Assert
      // The cascade engine now throws HierarchyError without logging (to avoid double logging)
      // The caller is responsible for logging the error
      await expect(engine.cascadeStateChange('parent', false)).rejects.toThrow(
        'Cascade engine failed during getDescendants'
      );
    });

    it('should propagate hierarchy manager errors with user-friendly messages', async () => {
      // Arrange
      const parent = createMockDevice({
        id: 'parent',
        name: 'Parent',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });

      parent.driverId = 'wiab-circuit-breaker';
      homeyApi.devices._addDevice('parent', parent);

      // Mock getDescendants to throw a specific error
      const technicalError = new Error('Database connection timeout');
      jest.spyOn(hierarchyManager, 'getDescendants').mockRejectedValue(technicalError);

      // Act & Assert - Verify HierarchyError is thrown with specific message
      await expect(engine.cascadeStateChange('parent', false)).rejects.toThrow(
        'Cascade engine failed during getDescendants'
      );

      // The cascade engine no longer logs the error (to avoid double logging)
      // The caller is responsible for logging the HierarchyError
    });

    it('should collect and report all errors in batch updates', async () => {
      // Arrange - Create 4 devices where 2 fail with different errors
      const parent = createMockDevice({
        id: 'parent',
        name: 'Parent',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });
      const child1 = createMockDevice({
        id: 'child1',
        name: 'Child 1',
        capabilities: ['onoff'],
        settings: { parentId: 'parent' },
      });
      const child2 = createMockDevice({
        id: 'child2',
        name: 'Child 2',
        capabilities: ['onoff'],
        settings: { parentId: 'parent' },
      });
      const child3 = createMockDevice({
        id: 'child3',
        name: 'Child 3',
        capabilities: ['onoff'],
        settings: { parentId: 'parent' },
      });
      const child4 = createMockDevice({
        id: 'child4',
        name: 'Child 4',
        capabilities: ['onoff'],
        settings: { parentId: 'parent' },
      });

      // Make child2 and child4 fail with different errors
      (child2.setCapabilityValue as jest.Mock).mockRejectedValue(
        new Error('Network timeout')
      );
      (child4.setCapabilityValue as jest.Mock).mockRejectedValue(
        new Error('Device offline')
      );

      parent.driverId = 'wiab-circuit-breaker';
      child1.driverId = 'wiab-circuit-breaker';
      child2.driverId = 'wiab-circuit-breaker';
      child3.driverId = 'wiab-circuit-breaker';
      child4.driverId = 'wiab-circuit-breaker';

      homeyApi.devices._addDevice('parent', parent);
      homeyApi.devices._addDevice('child1', child1);
      homeyApi.devices._addDevice('child2', child2);
      homeyApi.devices._addDevice('child3', child3);
      homeyApi.devices._addDevice('child4', child4);

      // Act
      const result = await engine.cascadeStateChange('parent', false);

      // Assert - Verify errors are collected and reported
      expect(result.success).toBe(2); // child1 and child3
      expect(result.failed).toBe(2); // child2 and child4
      expect(result.errors).toHaveLength(2);

      // Verify both errors are captured with details
      const errorDeviceIds = result.errors.map(e => e.deviceId);
      expect(errorDeviceIds).toContain('child2');
      expect(errorDeviceIds).toContain('child4');

      // Verify error details are preserved
      const child2Error = result.errors.find(e => e.deviceId === 'child2');
      expect(child2Error?.error?.message).toContain('Network timeout');

      const child4Error = result.errors.find(e => e.deviceId === 'child4');
      expect(child4Error?.error?.message).toContain('Device offline');

      // Verify successful devices were still updated
      expect(child1.setCapabilityValue).toHaveBeenCalledWith('onoff', false);
      expect(child3.setCapabilityValue).toHaveBeenCalledWith('onoff', false);
    });

    it('should handle cascadeStateChange when getDevices fails in hierarchy query', async () => {
      // Arrange
      const parent = createMockDevice({
        id: 'parent',
        name: 'Parent',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });

      parent.driverId = 'wiab-circuit-breaker';
      homeyApi.devices._addDevice('parent', parent);

      // Mock getDevices to fail (simulating API failure)
      (homeyApi.devices.getDevices as jest.Mock).mockRejectedValue(
        new Error('HomeyAPI unavailable')
      );

      // Act & Assert - Should throw HierarchyError
      await expect(engine.cascadeStateChange('parent', false)).rejects.toThrow(
        'Cascade engine failed during getDescendants'
      );

      // Verify error was logged
      expect(homey.error).toHaveBeenCalled();
    });

    it('should handle race conditions when devices are deleted during batch update', async () => {
      // Arrange - Create parent and 3 children
      const parent = createMockDevice({ id: 'parent', name: 'Parent', capabilities: ['onoff'], settings: { parentId: null } });
      const child1 = createMockDevice({ id: 'child1', name: 'Child 1', capabilities: ['onoff'], settings: { parentId: 'parent' } });
      const child2 = createMockDevice({ id: 'child2', name: 'Child 2', capabilities: ['onoff'], settings: { parentId: 'parent' } });
      const child3 = createMockDevice({ id: 'child3', name: 'Child 3', capabilities: ['onoff'], settings: { parentId: 'parent' } });

      parent.driverId = 'wiab-circuit-breaker';
      child1.driverId = 'wiab-circuit-breaker';
      child2.driverId = 'wiab-circuit-breaker';
      child3.driverId = 'wiab-circuit-breaker';

      homeyApi.devices._addDevice('parent', parent);
      homeyApi.devices._addDevice('child1', child1);
      homeyApi.devices._addDevice('child2', child2);
      homeyApi.devices._addDevice('child3', child3);

      // Simulate race condition: child2 is deleted mid-update
      let callCount = 0;
      (child2.setCapabilityValue as jest.Mock).mockImplementation(() => {
        callCount++;
        // Delete child2 from API on first call (simulating concurrent deletion)
        if (callCount === 1) {
          homeyApi.devices._removeDevice('child2');
        }
        return Promise.reject(new Error('Device deleted during update'));
      });

      // Act
      const result = await engine.cascadeStateChange('parent', false);

      // Assert - Should handle deletion gracefully
      expect(result.success).toBe(2); // child1 and child3
      expect(result.failed).toBe(1); // child2
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].deviceId).toBe('child2');
      expect(result.errors[0].error?.message).toContain('deleted during update');
    });

    it('should update descendants in sequential order', async () => {
      // Arrange - Create parent with 3 children to verify sequential processing
      const parent = createMockDevice({
        id: 'parent',
        name: 'Parent',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });
      const child1 = createMockDevice({
        id: 'child1',
        name: 'Child 1',
        capabilities: ['onoff'],
        settings: { parentId: 'parent' },
      });
      const child2 = createMockDevice({
        id: 'child2',
        name: 'Child 2',
        capabilities: ['onoff'],
        settings: { parentId: 'parent' },
      });
      const child3 = createMockDevice({
        id: 'child3',
        name: 'Child 3',
        capabilities: ['onoff'],
        settings: { parentId: 'parent' },
      });

      parent.driverId = 'wiab-circuit-breaker';
      child1.driverId = 'wiab-circuit-breaker';
      child2.driverId = 'wiab-circuit-breaker';
      child3.driverId = 'wiab-circuit-breaker';

      homeyApi.devices._addDevice('parent', parent);
      homeyApi.devices._addDevice('child1', child1);
      homeyApi.devices._addDevice('child2', child2);
      homeyApi.devices._addDevice('child3', child3);

      // Track call order by recording timestamps
      const callOrder: string[] = [];
      (child1.setCapabilityValue as jest.Mock).mockImplementation(async () => {
        callOrder.push('child1');
        return Promise.resolve();
      });
      (child2.setCapabilityValue as jest.Mock).mockImplementation(async () => {
        callOrder.push('child2');
        return Promise.resolve();
      });
      (child3.setCapabilityValue as jest.Mock).mockImplementation(async () => {
        callOrder.push('child3');
        return Promise.resolve();
      });

      // Act
      const result = await engine.cascadeStateChange('parent', false);

      // Assert - All devices updated successfully
      expect(result.success).toBe(3);
      expect(result.failed).toBe(0);

      // Verify sequential ordering - children should be processed in order
      expect(callOrder).toHaveLength(3);
      expect(callOrder).toEqual(['child1', 'child2', 'child3']);

      // Verify all devices were called exactly once
      expect(child1.setCapabilityValue).toHaveBeenCalledTimes(1);
      expect(child2.setCapabilityValue).toHaveBeenCalledTimes(1);
      expect(child3.setCapabilityValue).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateDeviceState', () => {
    it('should update device state successfully', async () => {
      // Arrange
      const device = createMockDevice({
        id: 'device-1',
        name: 'Device 1',
        capabilities: ['onoff'],
        capabilityValues: { onoff: true },
      });

      homeyApi.devices._addDevice('device-1', device);

      // Act
      const result = await engine.updateDeviceState('device-1', false);

      // Assert
      expect(result.success).toBe(true);
      expect(result.deviceId).toBe('device-1');
      expect(device.setCapabilityValue).toHaveBeenCalledWith('onoff', false);
    });

    it('should return error for non-existent device', async () => {
      // Act
      const result = await engine.updateDeviceState('non-existent', false);

      // Assert
      expect(result.success).toBe(false);
      expect(result.deviceId).toBe('non-existent');
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('not found');
    });

    it('should treat programming errors as device update failures (not re-throw)', async () => {
      // Arrange - Make getDevices throw TypeError (simulating programming error)
      (homeyApi.devices.getDevices as jest.Mock).mockRejectedValue(
        new TypeError('Cannot read property "id" of undefined')
      );

      // Act
      const result = await engine.updateDeviceState('device-1', false);

      // Assert - Should return failure result, NOT re-throw
      expect(result.success).toBe(false);
      expect(result.deviceId).toBe('device-1');
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Cannot read property');

      // Verify logged with CHILD_UPDATE_FAILED (not CASCADE_FAILED)
      expect(homey.error).toHaveBeenCalledWith(
        expect.stringContaining('[CIRCUIT_BREAKER_003]'),
        expect.any(TypeError)
      );
    });

    it('should throw on system-level errors (HomeyAPI unavailable)', async () => {
      // Arrange - Simulate HomeyAPI network error during getDevices
      (homeyApi.devices.getDevices as jest.Mock).mockRejectedValue(
        new Error('ECONNREFUSED: Connection refused to HomeyAPI')
      );

      // Act & Assert - Should throw instead of returning failure result
      await expect(engine.updateDeviceState('device-1', false)).rejects.toThrow(
        'Cannot update devices: HomeyAPI unavailable'
      );
    });

    it('should throw when getDevices fails', async () => {
      // Arrange - Simulate getDevices failure
      (homeyApi.devices.getDevices as jest.Mock).mockRejectedValue(
        new Error('api.devices.getDevices failed: timeout')
      );

      // Act & Assert - Should throw to abort cascade
      await expect(engine.updateDeviceState('device-1', false)).rejects.toThrow(
        'Cannot update devices: HomeyAPI unavailable'
      );
    });

    it('should set notFound flag when device does not exist', async () => {
      // Act - Try to update non-existent device
      const result = await engine.updateDeviceState('non-existent-device', false);

      // Assert - Verify notFound flag is set
      expect(result.success).toBe(false);
      expect(result.notFound).toBe(true);
      expect(result.error?.message).toContain('not found');
    });

    it('should NOT set notFound flag when device exists but update fails', async () => {
      // Arrange - Device exists but setCapabilityValue fails
      const device = createMockDevice({
        id: 'device-1',
        name: 'Device 1',
        capabilities: ['onoff'],
      });
      (device.setCapabilityValue as jest.Mock).mockRejectedValue(
        new Error('Network timeout')
      );
      device.driverId = 'wiab-circuit-breaker';
      homeyApi.devices._addDevice('device-1', device);

      // Act
      const result = await engine.updateDeviceState('device-1', false);

      // Assert - notFound should NOT be set (device exists, just failed to update)
      expect(result.success).toBe(false);
      expect(result.notFound).toBeUndefined();
      expect(result.error?.message).toContain('Network timeout');
    });

    it('should return error if device lacks setCapabilityValue', async () => {
      // Arrange
      const device = createMockDevice({
        id: 'device-1',
        name: 'Device 1',
        capabilities: ['onoff'],
      });

      // Remove setCapabilityValue method
      delete (device as unknown as Record<string, unknown>).setCapabilityValue;

      homeyApi.devices._addDevice('device-1', device);

      // Act
      const result = await engine.updateDeviceState('device-1', false);

      // Assert
      expect(result.success).toBe(false);
      expect(result.deviceId).toBe('device-1');
      expect(result.error?.message).toContain('does not support setCapabilityValue');
    });

    it('should handle setCapabilityValue errors', async () => {
      // Arrange
      const device = createMockDevice({
        id: 'device-1',
        name: 'Device 1',
        capabilities: ['onoff'],
      });

      (device.setCapabilityValue as jest.Mock).mockRejectedValue(
        new Error('Network timeout')
      );

      homeyApi.devices._addDevice('device-1', device);

      // Act
      const result = await engine.updateDeviceState('device-1', false);

      // Assert
      expect(result.success).toBe(false);
      expect(result.deviceId).toBe('device-1');
      expect(result.error).toBeDefined();
    });

    it('should handle getDevices error', async () => {
      // Arrange
      (homeyApi.devices.getDevices as jest.Mock).mockRejectedValue(
        new Error('API error')
      );

      // Act
      const result = await engine.updateDeviceState('device-1', false);

      // Assert
      expect(result.success).toBe(false);
      expect(result.deviceId).toBe('device-1');
      expect(result.error).toBeDefined();
    });
  });

  describe('sequential updates', () => {
    it('should update devices sequentially in cascadeStateChange', async () => {
      // Arrange
      const parent = createMockDevice({
        id: 'parent',
        name: 'Parent',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });
      const child1 = createMockDevice({
        id: 'child1',
        name: 'Child 1',
        capabilities: ['onoff'],
        settings: { parentId: 'parent' },
      });
      const child2 = createMockDevice({
        id: 'child2',
        name: 'Child 2',
        capabilities: ['onoff'],
        settings: { parentId: 'parent' },
      });

      parent.driverId = 'wiab-circuit-breaker';
      child1.driverId = 'wiab-circuit-breaker';
      child2.driverId = 'wiab-circuit-breaker';

      homeyApi.devices._addDevice('parent', parent);
      homeyApi.devices._addDevice('child1', child1);
      homeyApi.devices._addDevice('child2', child2);

      // Track call order
      const callOrder: string[] = [];

      (child1.setCapabilityValue as jest.Mock).mockImplementation(async () => {
        callOrder.push('child1');
      });

      (child2.setCapabilityValue as jest.Mock).mockImplementation(async () => {
        callOrder.push('child2');
      });

      // Act
      await engine.cascadeStateChange('parent', false);

      // Assert - Both should be called (order depends on descendants array order)
      expect(callOrder).toHaveLength(2);
      expect(callOrder).toContain('child1');
      expect(callOrder).toContain('child2');
    });
  });
});
