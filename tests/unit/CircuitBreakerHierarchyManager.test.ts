/**
 * Unit tests for CircuitBreakerHierarchyManager class
 *
 * Tests cover:
 * - Getting all circuit breaker devices
 * - Getting children by parent ID
 * - Getting parent chain
 * - Cycle detection (self-parent, direct cycles, deep cycles)
 * - Getting descendants
 * - Getting device by ID
 * - Error handling and graceful degradation
 */

import { CircuitBreakerHierarchyManager } from '../../lib/CircuitBreakerHierarchyManager';
import { createMockHomey, createMockHomeyApi, createMockDevice } from '../setup';

describe('CircuitBreakerHierarchyManager', () => {
  let homey: ReturnType<typeof createMockHomey>;
  let homeyApi: ReturnType<typeof createMockHomeyApi>;
  let manager: CircuitBreakerHierarchyManager;

  beforeEach(() => {
    homey = createMockHomey();
    homeyApi = createMockHomeyApi();
    manager = new CircuitBreakerHierarchyManager(homeyApi, homey);
  });

  afterEach(() => {
    homeyApi.devices._clear();
  });

  describe('getAllCircuitBreakers', () => {
    it('should return all circuit breaker devices', async () => {
      // Arrange
      const cb1 = createMockDevice({
        id: 'cb-1',
        name: 'CB 1',
        capabilities: ['onoff'],
      });
      const cb2 = createMockDevice({
        id: 'cb-2',
        name: 'CB 2',
        capabilities: ['onoff'],
      });

      // Add driverId to identify as circuit breaker
      (cb1 as any).driverId = 'wiab-circuit-breaker';
      (cb2 as any).driverId = 'wiab-circuit-breaker';

      homeyApi.devices._addDevice('cb-1', cb1);
      homeyApi.devices._addDevice('cb-2', cb2);

      // Act
      const devices = await manager.getAllCircuitBreakers();

      // Assert
      expect(devices).toHaveLength(2);
      expect(devices[0].id).toBe('cb-1');
      expect(devices[1].id).toBe('cb-2');
    });

    it('should filter out non-circuit-breaker devices', async () => {
      // Arrange
      const cb = createMockDevice({
        id: 'cb-1',
        name: 'CB 1',
        capabilities: ['onoff'],
      });
      const other = createMockDevice({
        id: 'other-1',
        name: 'Other Device',
        capabilities: ['onoff'],
      });

      (cb as any).driverId = 'wiab-circuit-breaker';
      (other as any).driverId = 'other-driver';

      homeyApi.devices._addDevice('cb-1', cb);
      homeyApi.devices._addDevice('other-1', other);

      // Act
      const devices = await manager.getAllCircuitBreakers();

      // Assert
      expect(devices).toHaveLength(1);
      expect(devices[0].id).toBe('cb-1');
    });

    it('should return empty array on error', async () => {
      // Arrange
      (homeyApi.devices.getDevices as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      // Act
      const devices = await manager.getAllCircuitBreakers();

      // Assert
      expect(devices).toEqual([]);
      expect(homey.error).toHaveBeenCalled();
    });
  });

  describe('getChildren', () => {
    it('should return all children of a parent', async () => {
      // Arrange
      const parent = createMockDevice({
        id: 'parent-1',
        name: 'Parent',
        capabilities: ['onoff'],
      });
      const child1 = createMockDevice({
        id: 'child-1',
        name: 'Child 1',
        capabilities: ['onoff'],
      });
      const child2 = createMockDevice({
        id: 'child-2',
        name: 'Child 2',
        capabilities: ['onoff'],
      });

      (parent as any).driverId = 'wiab-circuit-breaker';
      (parent as any).settings = { parentId: null };
      (child1 as any).driverId = 'wiab-circuit-breaker';
      (child1 as any).settings = { parentId: 'parent-1' };
      (child2 as any).driverId = 'wiab-circuit-breaker';
      (child2 as any).settings = { parentId: 'parent-1' };

      homeyApi.devices._addDevice('parent-1', parent);
      homeyApi.devices._addDevice('child-1', child1);
      homeyApi.devices._addDevice('child-2', child2);

      // Act
      const children = await manager.getChildren('parent-1');

      // Assert
      expect(children).toHaveLength(2);
      expect(children).toContain('child-1');
      expect(children).toContain('child-2');
    });

    it('should return empty array for device with no children', async () => {
      // Arrange
      const device = createMockDevice({
        id: 'cb-1',
        name: 'CB 1',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });

      (device as any).driverId = 'wiab-circuit-breaker';
      homeyApi.devices._addDevice('cb-1', device);

      // Act
      const children = await manager.getChildren('cb-1');

      // Assert
      expect(children).toEqual([]);
    });

    it('should return empty array on error', async () => {
      // Arrange
      (homeyApi.devices.getDevices as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      // Act
      const children = await manager.getChildren('parent-1');

      // Assert
      expect(children).toEqual([]);
      expect(homey.error).toHaveBeenCalled();
    });
  });

  describe('getParentChain', () => {
    it('should return parent chain from child to root', async () => {
      // Arrange - Create hierarchy: root -> middle -> child
      const root = createMockDevice({
        id: 'root',
        name: 'Root',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });
      const middle = createMockDevice({
        id: 'middle',
        name: 'Middle',
        capabilities: ['onoff'],
        settings: { parentId: 'root' },
      });
      const child = createMockDevice({
        id: 'child',
        name: 'Child',
        capabilities: ['onoff'],
        settings: { parentId: 'middle' },
      });

      (root as any).driverId = 'wiab-circuit-breaker';
      (middle as any).driverId = 'wiab-circuit-breaker';
      (child as any).driverId = 'wiab-circuit-breaker';

      homeyApi.devices._addDevice('root', root);
      homeyApi.devices._addDevice('middle', middle);
      homeyApi.devices._addDevice('child', child);

      // Act
      const chain = await manager.getParentChain('child');

      // Assert
      expect(chain).toEqual(['middle', 'root']);
    });

    it('should return empty array for root device', async () => {
      // Arrange
      const root = createMockDevice({
        id: 'root',
        name: 'Root',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });

      (root as any).driverId = 'wiab-circuit-breaker';
      homeyApi.devices._addDevice('root', root);

      // Act
      const chain = await manager.getParentChain('root');

      // Assert
      expect(chain).toEqual([]);
    });

    it('should detect and stop at cycle in parent chain', async () => {
      // Arrange - Create cycle: a -> b -> c -> a
      const a = createMockDevice({
        id: 'a',
        name: 'A',
        capabilities: ['onoff'],
        settings: { parentId: 'c' },
      });
      const b = createMockDevice({
        id: 'b',
        name: 'B',
        capabilities: ['onoff'],
        settings: { parentId: 'a' },
      });
      const c = createMockDevice({
        id: 'c',
        name: 'C',
        capabilities: ['onoff'],
        settings: { parentId: 'b' },
      });

      (a as any).driverId = 'wiab-circuit-breaker';
      (b as any).driverId = 'wiab-circuit-breaker';
      (c as any).driverId = 'wiab-circuit-breaker';

      homeyApi.devices._addDevice('a', a);
      homeyApi.devices._addDevice('b', b);
      homeyApi.devices._addDevice('c', c);

      // Act
      const chain = await manager.getParentChain('c');

      // Assert - Should stop when cycle detected
      expect(chain.length).toBeLessThan(4); // Would be infinite without cycle detection
      expect(homey.error).toHaveBeenCalledWith(
        expect.stringContaining('Cycle detected'),
        expect.anything()
      );
    });

    it('should return empty array on error', async () => {
      // Arrange
      (homeyApi.devices.getDevices as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      // Act
      const chain = await manager.getParentChain('device-1');

      // Assert
      expect(chain).toEqual([]);
      expect(homey.error).toHaveBeenCalled();
    });
  });

  describe('wouldCreateCycle', () => {
    it('should detect self-parent cycle', async () => {
      // Arrange
      const device = createMockDevice({
        id: 'cb-1',
        name: 'CB 1',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });

      (device as any).driverId = 'wiab-circuit-breaker';
      homeyApi.devices._addDevice('cb-1', device);

      // Act
      const wouldCycle = await manager.wouldCreateCycle('cb-1', 'cb-1');

      // Assert
      expect(wouldCycle).toBe(true);
    });

    it('should detect direct cycle (A -> B -> A)', async () => {
      // Arrange
      const a = createMockDevice({
        id: 'a',
        name: 'A',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });
      const b = createMockDevice({
        id: 'b',
        name: 'B',
        capabilities: ['onoff'],
        settings: { parentId: 'a' },
      });

      (a as any).driverId = 'wiab-circuit-breaker';
      (b as any).driverId = 'wiab-circuit-breaker';

      homeyApi.devices._addDevice('a', a);
      homeyApi.devices._addDevice('b', b);

      // Act - Try to set 'a' as parent of 'b' (which would create cycle)
      const wouldCycle = await manager.wouldCreateCycle('a', 'b');

      // Assert
      expect(wouldCycle).toBe(true);
    });

    it('should detect deep cycle (A -> B -> C -> A)', async () => {
      // Arrange - Create hierarchy: a -> b -> c
      const a = createMockDevice({
        id: 'a',
        name: 'A',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });
      const b = createMockDevice({
        id: 'b',
        name: 'B',
        capabilities: ['onoff'],
        settings: { parentId: 'a' },
      });
      const c = createMockDevice({
        id: 'c',
        name: 'C',
        capabilities: ['onoff'],
        settings: { parentId: 'b' },
      });

      (a as any).driverId = 'wiab-circuit-breaker';
      (b as any).driverId = 'wiab-circuit-breaker';
      (c as any).driverId = 'wiab-circuit-breaker';

      homeyApi.devices._addDevice('a', a);
      homeyApi.devices._addDevice('b', b);
      homeyApi.devices._addDevice('c', c);

      // Act - Try to set 'c' as parent of 'a' (would create cycle)
      const wouldCycle = await manager.wouldCreateCycle('a', 'c');

      // Assert
      expect(wouldCycle).toBe(true);
    });

    it('should allow valid parent assignment (no cycle)', async () => {
      // Arrange
      const parent = createMockDevice({
        id: 'parent',
        name: 'Parent',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });
      const child = createMockDevice({
        id: 'child',
        name: 'Child',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });

      (parent as any).driverId = 'wiab-circuit-breaker';
      (child as any).driverId = 'wiab-circuit-breaker';

      homeyApi.devices._addDevice('parent', parent);
      homeyApi.devices._addDevice('child', child);

      // Act - Try to set 'parent' as parent of 'child' (valid)
      const wouldCycle = await manager.wouldCreateCycle('child', 'parent');

      // Assert
      expect(wouldCycle).toBe(false);
    });

    it('should return true on error (fail-safe)', async () => {
      // Arrange
      (homeyApi.devices.getDevices as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      // Act
      const wouldCycle = await manager.wouldCreateCycle('device-1', 'device-2');

      // Assert - Fail-safe: treat as would create cycle
      expect(wouldCycle).toBe(true);
      expect(homey.error).toHaveBeenCalled();
    });
  });

  describe('getDescendants', () => {
    it('should return all descendants (children, grandchildren, etc)', async () => {
      // Arrange - Create hierarchy:
      // root
      //   -> child1
      //       -> grandchild1
      //       -> grandchild2
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
        settings: { parentId: 'root' },
      });
      const child2 = createMockDevice({
        id: 'child2',
        name: 'Child 2',
        capabilities: ['onoff'],
        settings: { parentId: 'root' },
      });
      const grandchild1 = createMockDevice({
        id: 'grandchild1',
        name: 'Grandchild 1',
        capabilities: ['onoff'],
        settings: { parentId: 'child1' },
      });
      const grandchild2 = createMockDevice({
        id: 'grandchild2',
        name: 'Grandchild 2',
        capabilities: ['onoff'],
        settings: { parentId: 'child1' },
      });

      (root as any).driverId = 'wiab-circuit-breaker';
      (child1 as any).driverId = 'wiab-circuit-breaker';
      (child2 as any).driverId = 'wiab-circuit-breaker';
      (grandchild1 as any).driverId = 'wiab-circuit-breaker';
      (grandchild2 as any).driverId = 'wiab-circuit-breaker';

      homeyApi.devices._addDevice('root', root);
      homeyApi.devices._addDevice('child1', child1);
      homeyApi.devices._addDevice('child2', child2);
      homeyApi.devices._addDevice('grandchild1', grandchild1);
      homeyApi.devices._addDevice('grandchild2', grandchild2);

      // Act
      const descendants = await manager.getDescendants('root');

      // Assert
      expect(descendants).toHaveLength(4);
      expect(descendants).toContain('child1');
      expect(descendants).toContain('child2');
      expect(descendants).toContain('grandchild1');
      expect(descendants).toContain('grandchild2');
    });

    it('should return empty array for leaf device', async () => {
      // Arrange
      const leaf = createMockDevice({
        id: 'leaf',
        name: 'Leaf',
        capabilities: ['onoff'],
        settings: { parentId: 'parent' },
      });

      (leaf as any).driverId = 'wiab-circuit-breaker';
      homeyApi.devices._addDevice('leaf', leaf);

      // Act
      const descendants = await manager.getDescendants('leaf');

      // Assert
      expect(descendants).toEqual([]);
    });

    it('should handle cycles gracefully with visited tracking', async () => {
      // Arrange - Create cycle: a -> b -> a
      // (This shouldn't happen in practice but tests defensive code)
      const a = createMockDevice({
        id: 'a',
        name: 'A',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });
      const b = createMockDevice({
        id: 'b',
        name: 'B',
        capabilities: ['onoff'],
        settings: { parentId: 'a' },
      });

      // Manually create invalid cycle in settings
      (a as any).settings = { parentId: 'b' };

      (a as any).driverId = 'wiab-circuit-breaker';
      (b as any).driverId = 'wiab-circuit-breaker';

      homeyApi.devices._addDevice('a', a);
      homeyApi.devices._addDevice('b', b);

      // Act
      const descendants = await manager.getDescendants('a');

      // Assert - Should not hang or stack overflow
      expect(descendants.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty array on error', async () => {
      // Arrange
      (homeyApi.devices.getDevices as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      // Act
      const descendants = await manager.getDescendants('device-1');

      // Assert
      expect(descendants).toEqual([]);
      expect(homey.error).toHaveBeenCalled();
    });
  });

  describe('getDeviceById', () => {
    it('should return device by ID', async () => {
      // Arrange
      const device = createMockDevice({
        id: 'cb-1',
        name: 'CB 1',
        capabilities: ['onoff'],
        settings: { parentId: null },
      });

      (device as any).driverId = 'wiab-circuit-breaker';
      homeyApi.devices._addDevice('cb-1', device);

      // Act
      const result = await manager.getDeviceById('cb-1');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.id).toBe('cb-1');
      expect(result?.name).toBe('CB 1');
    });

    it('should return null for non-existent device', async () => {
      // Act
      const result = await manager.getDeviceById('non-existent');

      // Assert
      expect(result).toBeNull();
    });

    it('should return null for non-circuit-breaker device', async () => {
      // Arrange
      const device = createMockDevice({
        id: 'other-1',
        name: 'Other Device',
        capabilities: ['onoff'],
      });

      (device as any).driverId = 'other-driver';
      homeyApi.devices._addDevice('other-1', device);

      // Act
      const result = await manager.getDeviceById('other-1');

      // Assert
      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      // Arrange
      (homeyApi.devices.getDevices as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      // Act
      const result = await manager.getDeviceById('device-1');

      // Assert
      expect(result).toBeNull();
      expect(homey.error).toHaveBeenCalled();
    });
  });
});
