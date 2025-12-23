import { ContactSensorAggregator } from '../lib/ContactSensorAggregator';
import type { SensorConfig } from '../lib/types';

describe('ContactSensorAggregator', () => {
  const createSensorConfig = (id: string): SensorConfig => ({
    deviceId: id,
    capability: 'alarm_contact',
    deviceName: `Sensor ${id}`
  });

  describe('constructor', () => {
    it('should create aggregator with empty sensor array', () => {
      // Arrange & Act
      const aggregator = new ContactSensorAggregator([]);

      // Assert
      expect(aggregator.getSensorCount()).toBe(0);
      expect(aggregator.areAllClosed()).toBe(true);
      expect(aggregator.isAnyOpen()).toBe(false);
    });

    it('should create aggregator with multiple sensors', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2'),
        createSensorConfig('sensor3')
      ];

      // Act
      const aggregator = new ContactSensorAggregator(sensors);

      // Assert
      expect(aggregator.getSensorCount()).toBe(3);
    });

    it('should initialize with all sensors in unknown state', () => {
      // Arrange
      const sensors = [createSensorConfig('sensor1')];

      // Act
      const aggregator = new ContactSensorAggregator(sensors);

      // Assert
      expect(aggregator.getSensorState('sensor1')).toBeNull();
    });
  });

  describe('initializeFromValues', () => {
    it('should initialize sensors with provided values', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2')
      ];
      const aggregator = new ContactSensorAggregator(sensors);
      const values = new Map([
        ['sensor1', false],
        ['sensor2', true]
      ]);

      // Act
      aggregator.initializeFromValues(values);

      // Assert
      expect(aggregator.getSensorState('sensor1')).toBe(false);
      expect(aggregator.getSensorState('sensor2')).toBe(true);
    });

    it('should initialize all sensors as closed', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2')
      ];
      const aggregator = new ContactSensorAggregator(sensors);
      const values = new Map([
        ['sensor1', false],
        ['sensor2', false]
      ]);

      // Act
      aggregator.initializeFromValues(values);

      // Assert
      expect(aggregator.areAllClosed()).toBe(true);
      expect(aggregator.isAnyOpen()).toBe(false);
    });

    it('should initialize all sensors as open', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2')
      ];
      const aggregator = new ContactSensorAggregator(sensors);
      const values = new Map([
        ['sensor1', true],
        ['sensor2', true]
      ]);

      // Act
      aggregator.initializeFromValues(values);

      // Assert
      expect(aggregator.areAllClosed()).toBe(false);
      expect(aggregator.isAnyOpen()).toBe(true);
    });

    it('should handle partial initialization (some sensors missing)', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2')
      ];
      const aggregator = new ContactSensorAggregator(sensors);
      const values = new Map([
        ['sensor1', false]
        // sensor2 not provided
      ]);

      // Act
      aggregator.initializeFromValues(values);

      // Assert
      expect(aggregator.getSensorState('sensor1')).toBe(false);
      expect(aggregator.getSensorState('sensor2')).toBeNull();
    });

    it('should ignore values for sensors not in config', () => {
      // Arrange
      const sensors = [createSensorConfig('sensor1')];
      const aggregator = new ContactSensorAggregator(sensors);
      const values = new Map([
        ['sensor1', false],
        ['unknown-sensor', true]
      ]);

      // Act
      aggregator.initializeFromValues(values);

      // Assert
      expect(aggregator.getSensorState('sensor1')).toBe(false);
      expect(aggregator.getSensorState('unknown-sensor')).toBeNull();
    });

    it('should handle empty values map', () => {
      // Arrange
      const sensors = [createSensorConfig('sensor1')];
      const aggregator = new ContactSensorAggregator(sensors);
      const values = new Map();

      // Act
      aggregator.initializeFromValues(values);

      // Assert
      expect(aggregator.getSensorState('sensor1')).toBeNull();
    });
  });

  describe('updateSensorState', () => {
    it('should update sensor state from closed to open', () => {
      // Arrange
      const sensors = [createSensorConfig('sensor1')];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([['sensor1', false]]));

      // Act
      aggregator.updateSensorState('sensor1', true);

      // Assert
      expect(aggregator.getSensorState('sensor1')).toBe(true);
      expect(aggregator.isAnyOpen()).toBe(true);
    });

    it('should update sensor state from open to closed', () => {
      // Arrange
      const sensors = [createSensorConfig('sensor1')];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([['sensor1', true]]));

      // Act
      aggregator.updateSensorState('sensor1', false);

      // Assert
      expect(aggregator.getSensorState('sensor1')).toBe(false);
      expect(aggregator.isAnyOpen()).toBe(false);
    });

    it('should update multiple sensors independently', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2')
      ];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([
        ['sensor1', false],
        ['sensor2', false]
      ]));

      // Act
      aggregator.updateSensorState('sensor1', true);
      aggregator.updateSensorState('sensor2', false);

      // Assert
      expect(aggregator.getSensorState('sensor1')).toBe(true);
      expect(aggregator.getSensorState('sensor2')).toBe(false);
    });

    it('should allow updating sensor not in config', () => {
      // Arrange
      const sensors = [createSensorConfig('sensor1')];
      const aggregator = new ContactSensorAggregator(sensors);

      // Act
      aggregator.updateSensorState('unknown-sensor', true);

      // Assert
      expect(aggregator.getSensorState('unknown-sensor')).toBe(true);
    });
  });

  describe('OR-logic aggregation', () => {
    it('should return true for isAnyOpen when one sensor is open', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2')
      ];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([
        ['sensor1', true],
        ['sensor2', false]
      ]));

      // Act & Assert
      expect(aggregator.isAnyOpen()).toBe(true);
      expect(aggregator.areAllClosed()).toBe(false);
    });

    it('should return true for isAnyOpen when all sensors are open', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2')
      ];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([
        ['sensor1', true],
        ['sensor2', true]
      ]));

      // Act & Assert
      expect(aggregator.isAnyOpen()).toBe(true);
      expect(aggregator.areAllClosed()).toBe(false);
    });

    it('should return false for isAnyOpen when all sensors are closed', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2')
      ];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([
        ['sensor1', false],
        ['sensor2', false]
      ]));

      // Act & Assert
      expect(aggregator.isAnyOpen()).toBe(false);
      expect(aggregator.areAllClosed()).toBe(true);
    });

    it('should return true for areAllClosed with empty sensor array', () => {
      // Arrange
      const aggregator = new ContactSensorAggregator([]);

      // Act & Assert
      expect(aggregator.areAllClosed()).toBe(true);
      expect(aggregator.isAnyOpen()).toBe(false);
    });

    it('should detect state change after update', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2')
      ];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([
        ['sensor1', false],
        ['sensor2', false]
      ]));

      // Initial state
      expect(aggregator.areAllClosed()).toBe(true);

      // Act - open one sensor
      aggregator.updateSensorState('sensor1', true);

      // Assert
      expect(aggregator.isAnyOpen()).toBe(true);
      expect(aggregator.areAllClosed()).toBe(false);
    });
  });

  describe('getOpenSensors', () => {
    it('should return empty array when all sensors closed', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2')
      ];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([
        ['sensor1', false],
        ['sensor2', false]
      ]));

      // Act
      const openSensors = aggregator.getOpenSensors();

      // Assert
      expect(openSensors).toHaveLength(0);
    });

    it('should return open sensors only', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2'),
        createSensorConfig('sensor3')
      ];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([
        ['sensor1', true],
        ['sensor2', false],
        ['sensor3', true]
      ]));

      // Act
      const openSensors = aggregator.getOpenSensors();

      // Assert
      expect(openSensors).toHaveLength(2);
      expect(openSensors.map(s => s.deviceId)).toContain('sensor1');
      expect(openSensors.map(s => s.deviceId)).toContain('sensor3');
      expect(openSensors.map(s => s.deviceId)).not.toContain('sensor2');
    });

    it('should return all sensors when all open', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2')
      ];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([
        ['sensor1', true],
        ['sensor2', true]
      ]));

      // Act
      const openSensors = aggregator.getOpenSensors();

      // Assert
      expect(openSensors).toHaveLength(2);
    });

    it('should not include sensors with unknown state', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2')
      ];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([
        ['sensor1', true]
        // sensor2 not initialized
      ]));

      // Act
      const openSensors = aggregator.getOpenSensors();

      // Assert
      expect(openSensors).toHaveLength(1);
      expect(openSensors[0].deviceId).toBe('sensor1');
    });

    it('should return defensive copy (immutability)', () => {
      // Arrange
      const sensors = [createSensorConfig('sensor1')];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([['sensor1', true]]));

      // Act
      const openSensors1 = aggregator.getOpenSensors();
      const openSensors2 = aggregator.getOpenSensors();

      // Assert - different array instances
      expect(openSensors1).not.toBe(openSensors2);
      expect(openSensors1).toEqual(openSensors2);
    });

    it('should not allow mutation of internal state via returned array', () => {
      // Arrange
      const sensors = [createSensorConfig('sensor1')];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([['sensor1', true]]));

      // Act
      const openSensors = aggregator.getOpenSensors();
      openSensors.push(createSensorConfig('injected'));

      // Assert - internal state unchanged
      const openSensorsAfter = aggregator.getOpenSensors();
      expect(openSensorsAfter).toHaveLength(1);
      expect(openSensorsAfter[0].deviceId).toBe('sensor1');
    });
  });

  describe('getClosedSensors', () => {
    it('should return empty array when all sensors open', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2')
      ];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([
        ['sensor1', true],
        ['sensor2', true]
      ]));

      // Act
      const closedSensors = aggregator.getClosedSensors();

      // Assert
      expect(closedSensors).toHaveLength(0);
    });

    it('should return closed sensors only', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2'),
        createSensorConfig('sensor3')
      ];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([
        ['sensor1', false],
        ['sensor2', true],
        ['sensor3', false]
      ]));

      // Act
      const closedSensors = aggregator.getClosedSensors();

      // Assert
      expect(closedSensors).toHaveLength(2);
      expect(closedSensors.map(s => s.deviceId)).toContain('sensor1');
      expect(closedSensors.map(s => s.deviceId)).toContain('sensor3');
      expect(closedSensors.map(s => s.deviceId)).not.toContain('sensor2');
    });

    it('should return all sensors when all closed', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2')
      ];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([
        ['sensor1', false],
        ['sensor2', false]
      ]));

      // Act
      const closedSensors = aggregator.getClosedSensors();

      // Assert
      expect(closedSensors).toHaveLength(2);
    });

    it('should not include sensors with unknown state', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2')
      ];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([
        ['sensor1', false]
        // sensor2 not initialized
      ]));

      // Act
      const closedSensors = aggregator.getClosedSensors();

      // Assert
      expect(closedSensors).toHaveLength(1);
      expect(closedSensors[0].deviceId).toBe('sensor1');
    });

    it('should return defensive copy (immutability)', () => {
      // Arrange
      const sensors = [createSensorConfig('sensor1')];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([['sensor1', false]]));

      // Act
      const closedSensors1 = aggregator.getClosedSensors();
      const closedSensors2 = aggregator.getClosedSensors();

      // Assert - different array instances
      expect(closedSensors1).not.toBe(closedSensors2);
      expect(closedSensors1).toEqual(closedSensors2);
    });
  });

  describe('getSensorState', () => {
    it('should return null for unknown sensor', () => {
      // Arrange
      const sensors = [createSensorConfig('sensor1')];
      const aggregator = new ContactSensorAggregator(sensors);

      // Act & Assert
      expect(aggregator.getSensorState('unknown')).toBeNull();
    });

    it('should return null for uninitialized sensor', () => {
      // Arrange
      const sensors = [createSensorConfig('sensor1')];
      const aggregator = new ContactSensorAggregator(sensors);

      // Act & Assert
      expect(aggregator.getSensorState('sensor1')).toBeNull();
    });

    it('should return true for open sensor', () => {
      // Arrange
      const sensors = [createSensorConfig('sensor1')];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([['sensor1', true]]));

      // Act & Assert
      expect(aggregator.getSensorState('sensor1')).toBe(true);
    });

    it('should return false for closed sensor', () => {
      // Arrange
      const sensors = [createSensorConfig('sensor1')];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([['sensor1', false]]));

      // Act & Assert
      expect(aggregator.getSensorState('sensor1')).toBe(false);
    });

    it('should reflect updated state', () => {
      // Arrange
      const sensors = [createSensorConfig('sensor1')];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([['sensor1', false]]));

      // Act
      aggregator.updateSensorState('sensor1', true);

      // Assert
      expect(aggregator.getSensorState('sensor1')).toBe(true);
    });
  });

  describe('getSensorCount', () => {
    it('should return 0 for empty sensor array', () => {
      // Arrange
      const aggregator = new ContactSensorAggregator([]);

      // Act & Assert
      expect(aggregator.getSensorCount()).toBe(0);
    });

    it('should return correct count for multiple sensors', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2'),
        createSensorConfig('sensor3')
      ];
      const aggregator = new ContactSensorAggregator(sensors);

      // Act & Assert
      expect(aggregator.getSensorCount()).toBe(3);
    });

    it('should return same count regardless of initialization', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2')
      ];
      const aggregator = new ContactSensorAggregator(sensors);

      // Act - count before initialization
      const countBefore = aggregator.getSensorCount();

      // Initialize
      aggregator.initializeFromValues(new Map([['sensor1', true]]));

      // Act - count after initialization
      const countAfter = aggregator.getSensorCount();

      // Assert
      expect(countBefore).toBe(2);
      expect(countAfter).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty sensor array correctly', () => {
      // Arrange
      const aggregator = new ContactSensorAggregator([]);

      // Act & Assert
      expect(aggregator.getSensorCount()).toBe(0);
      expect(aggregator.areAllClosed()).toBe(true);
      expect(aggregator.isAnyOpen()).toBe(false);
      expect(aggregator.getOpenSensors()).toHaveLength(0);
      expect(aggregator.getClosedSensors()).toHaveLength(0);
    });

    it('should handle all sensors uninitialized', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2')
      ];
      const aggregator = new ContactSensorAggregator(sensors);

      // Act & Assert
      expect(aggregator.isAnyOpen()).toBe(false);
      expect(aggregator.areAllClosed()).toBe(true);
      expect(aggregator.getOpenSensors()).toHaveLength(0);
      expect(aggregator.getClosedSensors()).toHaveLength(0);
    });

    it('should handle mixed initialized and uninitialized sensors', () => {
      // Arrange
      const sensors = [
        createSensorConfig('sensor1'),
        createSensorConfig('sensor2'),
        createSensorConfig('sensor3')
      ];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([
        ['sensor1', true],
        ['sensor2', false]
        // sensor3 not initialized
      ]));

      // Act & Assert
      expect(aggregator.isAnyOpen()).toBe(true);
      expect(aggregator.getOpenSensors()).toHaveLength(1);
      expect(aggregator.getClosedSensors()).toHaveLength(1);
    });

    it('should handle rapid state changes', () => {
      // Arrange
      const sensors = [createSensorConfig('sensor1')];
      const aggregator = new ContactSensorAggregator(sensors);
      aggregator.initializeFromValues(new Map([['sensor1', false]]));

      // Act - rapid state changes
      aggregator.updateSensorState('sensor1', true);
      aggregator.updateSensorState('sensor1', false);
      aggregator.updateSensorState('sensor1', true);

      // Assert - final state should be open
      expect(aggregator.getSensorState('sensor1')).toBe(true);
      expect(aggregator.isAnyOpen()).toBe(true);
    });
  });
});
