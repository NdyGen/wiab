import { ZoneSealEngine } from '../lib/ZoneSealEngine';
import { ZoneSealState, type ZoneSealDelayConfig } from '../lib/types';

describe('ZoneSealEngine', () => {
  const defaultConfig: ZoneSealDelayConfig = {
    openDelaySeconds: 10,
    closeDelaySeconds: 5
  };

  const zeroDelayConfig: ZoneSealDelayConfig = {
    openDelaySeconds: 0,
    closeDelaySeconds: 0
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create engine with default SEALED state', () => {
      // Arrange & Act
      const engine = new ZoneSealEngine(defaultConfig);

      // Assert
      expect(engine.getCurrentState()).toBe(ZoneSealState.SEALED);
      expect(engine.isSealed()).toBe(true);
      expect(engine.isLeaky()).toBe(false);
      expect(engine.isInDelay()).toBe(false);
    });

    it('should create engine with specified initial state', () => {
      // Arrange & Act
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.LEAKY);

      // Assert
      expect(engine.getCurrentState()).toBe(ZoneSealState.LEAKY);
      expect(engine.isLeaky()).toBe(true);
      expect(engine.isSealed()).toBe(false);
    });

    it('should create engine with OPEN_DELAY state', () => {
      // Arrange & Act
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.OPEN_DELAY);

      // Assert
      expect(engine.getCurrentState()).toBe(ZoneSealState.OPEN_DELAY);
      expect(engine.isInDelay()).toBe(true);
    });

    it('should create engine with CLOSE_DELAY state', () => {
      // Arrange & Act
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.CLOSE_DELAY);

      // Assert
      expect(engine.getCurrentState()).toBe(ZoneSealState.CLOSE_DELAY);
      expect(engine.isInDelay()).toBe(true);
    });

    it('should throw error for negative openDelaySeconds', () => {
      // Arrange
      const invalidConfig = {
        openDelaySeconds: -1,
        closeDelaySeconds: 5
      };

      // Act & Assert
      expect(() => new ZoneSealEngine(invalidConfig)).toThrow('Invalid openDelaySeconds');
    });

    it('should throw error for negative closeDelaySeconds', () => {
      // Arrange
      const invalidConfig = {
        openDelaySeconds: 10,
        closeDelaySeconds: -5
      };

      // Act & Assert
      expect(() => new ZoneSealEngine(invalidConfig)).toThrow('Invalid closeDelaySeconds');
    });

    it('should accept zero delay values', () => {
      // Arrange & Act
      const engine = new ZoneSealEngine(zeroDelayConfig);

      // Assert
      expect(engine.getCurrentState()).toBe(ZoneSealState.SEALED);
    });

    it('should create defensive copy of config', () => {
      // Arrange
      const config = { openDelaySeconds: 10, closeDelaySeconds: 5 };

      // Act
      const engine = new ZoneSealEngine(config);
      config.openDelaySeconds = 999; // Mutate original

      // Assert
      expect(engine.getConfig().openDelaySeconds).toBe(10);
    });
  });

  describe('handleAnySensorOpened - from SEALED state', () => {
    it('should transition to OPEN_DELAY with delay', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);

      // Act
      const transition = engine.handleAnySensorOpened();

      // Assert
      expect(transition.newState).toBe(ZoneSealState.LEAKY); // Target state after delay
      expect(transition.immediate).toBe(false);
      expect(transition.delaySeconds).toBe(10);
      expect(engine.getCurrentState()).toBe(ZoneSealState.OPEN_DELAY);
    });

    it('should transition immediately to LEAKY with zero delay', () => {
      // Arrange
      const engine = new ZoneSealEngine(zeroDelayConfig, ZoneSealState.SEALED);

      // Act
      const transition = engine.handleAnySensorOpened();

      // Assert
      expect(transition.newState).toBe(ZoneSealState.LEAKY);
      expect(transition.immediate).toBe(true);
      expect(transition.delaySeconds).toBeUndefined();
      expect(engine.getCurrentState()).toBe(ZoneSealState.LEAKY);
    });

    it('should set delay deadline when transitioning to OPEN_DELAY', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);
      const beforeTime = Date.now();

      // Act
      engine.handleAnySensorOpened();
      const deadline = engine.getActiveDelayDeadline();

      // Assert
      expect(deadline).not.toBeNull();
      expect(deadline).toBeGreaterThanOrEqual(beforeTime + 10000);
    });
  });

  describe('handleAnySensorOpened - from OPEN_DELAY state', () => {
    it('should NOT restart delay when additional sensor opens', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);
      engine.handleAnySensorOpened();
      const firstDeadline = engine.getActiveDelayDeadline();

      // Advance time slightly
      jest.advanceTimersByTime(2000);

      // Act - another sensor opens
      const transition = engine.handleAnySensorOpened();

      // Assert
      expect(transition.newState).toBe(ZoneSealState.OPEN_DELAY);
      expect(transition.immediate).toBe(true); // No change
      expect(engine.getCurrentState()).toBe(ZoneSealState.OPEN_DELAY);
      expect(engine.getActiveDelayDeadline()).toBe(firstDeadline); // Deadline unchanged
    });

    it('should remain in OPEN_DELAY state', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.OPEN_DELAY);

      // Act
      const transition = engine.handleAnySensorOpened();

      // Assert
      expect(transition.newState).toBe(ZoneSealState.OPEN_DELAY);
      expect(transition.immediate).toBe(true);
      expect(engine.getCurrentState()).toBe(ZoneSealState.OPEN_DELAY);
    });
  });

  describe('handleAnySensorOpened - from LEAKY state', () => {
    it('should remain in LEAKY state', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.LEAKY);

      // Act
      const transition = engine.handleAnySensorOpened();

      // Assert
      expect(transition.newState).toBe(ZoneSealState.LEAKY);
      expect(transition.immediate).toBe(true);
      expect(engine.getCurrentState()).toBe(ZoneSealState.LEAKY);
    });
  });

  describe('handleAnySensorOpened - from CLOSE_DELAY state', () => {
    it('should cancel close delay and start open delay', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.CLOSE_DELAY);

      // Act
      const transition = engine.handleAnySensorOpened();

      // Assert
      expect(transition.newState).toBe(ZoneSealState.LEAKY); // Target state after delay
      expect(transition.immediate).toBe(false);
      expect(transition.delaySeconds).toBe(10);
      expect(engine.getCurrentState()).toBe(ZoneSealState.OPEN_DELAY);
    });

    it('should transition immediately to LEAKY with zero open delay', () => {
      // Arrange
      const engine = new ZoneSealEngine(zeroDelayConfig, ZoneSealState.CLOSE_DELAY);

      // Act
      const transition = engine.handleAnySensorOpened();

      // Assert
      expect(transition.newState).toBe(ZoneSealState.LEAKY);
      expect(transition.immediate).toBe(true);
      expect(transition.delaySeconds).toBeUndefined();
      expect(engine.getCurrentState()).toBe(ZoneSealState.LEAKY);
    });

    it('should update delay deadline when cancelling close delay', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.CLOSE_DELAY);
      const beforeTime = Date.now();

      // Act
      engine.handleAnySensorOpened();
      const deadline = engine.getActiveDelayDeadline();

      // Assert
      expect(deadline).not.toBeNull();
      expect(deadline).toBeGreaterThanOrEqual(beforeTime + 10000);
    });
  });

  describe('handleAllSensorsClosed - from SEALED state', () => {
    it('should remain in SEALED state', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);

      // Act
      const transition = engine.handleAllSensorsClosed();

      // Assert
      expect(transition.newState).toBe(ZoneSealState.SEALED);
      expect(transition.immediate).toBe(true);
      expect(engine.getCurrentState()).toBe(ZoneSealState.SEALED);
    });
  });

  describe('handleAllSensorsClosed - from OPEN_DELAY state', () => {
    it('should cancel open delay and start close delay', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.OPEN_DELAY);

      // Act
      const transition = engine.handleAllSensorsClosed();

      // Assert
      expect(transition.newState).toBe(ZoneSealState.SEALED); // Target state after delay
      expect(transition.immediate).toBe(false);
      expect(transition.delaySeconds).toBe(5);
      expect(engine.getCurrentState()).toBe(ZoneSealState.CLOSE_DELAY);
    });

    it('should transition immediately to SEALED with zero close delay', () => {
      // Arrange
      const engine = new ZoneSealEngine(zeroDelayConfig, ZoneSealState.OPEN_DELAY);

      // Act
      const transition = engine.handleAllSensorsClosed();

      // Assert
      expect(transition.newState).toBe(ZoneSealState.SEALED);
      expect(transition.immediate).toBe(true);
      expect(transition.delaySeconds).toBeUndefined();
      expect(engine.getCurrentState()).toBe(ZoneSealState.SEALED);
    });

    it('should clear delay deadline when transitioning immediately to SEALED', () => {
      // Arrange
      const engine = new ZoneSealEngine(zeroDelayConfig, ZoneSealState.OPEN_DELAY);

      // Act
      engine.handleAllSensorsClosed();

      // Assert
      expect(engine.getActiveDelayDeadline()).toBeNull();
    });
  });

  describe('handleAllSensorsClosed - from LEAKY state', () => {
    it('should transition to CLOSE_DELAY with delay', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.LEAKY);

      // Act
      const transition = engine.handleAllSensorsClosed();

      // Assert
      expect(transition.newState).toBe(ZoneSealState.SEALED); // Target state after delay
      expect(transition.immediate).toBe(false);
      expect(transition.delaySeconds).toBe(5);
      expect(engine.getCurrentState()).toBe(ZoneSealState.CLOSE_DELAY);
    });

    it('should transition immediately to SEALED with zero delay', () => {
      // Arrange
      const engine = new ZoneSealEngine(zeroDelayConfig, ZoneSealState.LEAKY);

      // Act
      const transition = engine.handleAllSensorsClosed();

      // Assert
      expect(transition.newState).toBe(ZoneSealState.SEALED);
      expect(transition.immediate).toBe(true);
      expect(transition.delaySeconds).toBeUndefined();
      expect(engine.getCurrentState()).toBe(ZoneSealState.SEALED);
    });

    it('should set delay deadline when transitioning to CLOSE_DELAY', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.LEAKY);
      const beforeTime = Date.now();

      // Act
      engine.handleAllSensorsClosed();
      const deadline = engine.getActiveDelayDeadline();

      // Assert
      expect(deadline).not.toBeNull();
      expect(deadline).toBeGreaterThanOrEqual(beforeTime + 5000);
    });
  });

  describe('handleAllSensorsClosed - from CLOSE_DELAY state', () => {
    it('should remain in CLOSE_DELAY state', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.CLOSE_DELAY);

      // Act
      const transition = engine.handleAllSensorsClosed();

      // Assert
      expect(transition.newState).toBe(ZoneSealState.CLOSE_DELAY);
      expect(transition.immediate).toBe(true);
      expect(engine.getCurrentState()).toBe(ZoneSealState.CLOSE_DELAY);
    });
  });

  describe('setCurrentState', () => {
    it('should update current state', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);

      // Act
      engine.setCurrentState(ZoneSealState.LEAKY);

      // Assert
      expect(engine.getCurrentState()).toBe(ZoneSealState.LEAKY);
    });

    it('should clear delay deadline when setting state', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);
      engine.handleAnySensorOpened(); // Sets deadline

      // Act
      engine.setCurrentState(ZoneSealState.LEAKY);

      // Assert
      expect(engine.getActiveDelayDeadline()).toBeNull();
    });

    it('should allow setting to OPEN_DELAY state', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);

      // Act
      engine.setCurrentState(ZoneSealState.OPEN_DELAY);

      // Assert
      expect(engine.getCurrentState()).toBe(ZoneSealState.OPEN_DELAY);
      expect(engine.isInDelay()).toBe(true);
    });

    it('should allow setting to CLOSE_DELAY state', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.LEAKY);

      // Act
      engine.setCurrentState(ZoneSealState.CLOSE_DELAY);

      // Assert
      expect(engine.getCurrentState()).toBe(ZoneSealState.CLOSE_DELAY);
      expect(engine.isInDelay()).toBe(true);
    });
  });

  describe('state query methods', () => {
    it('should correctly identify SEALED state', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);

      // Act & Assert
      expect(engine.isSealed()).toBe(true);
      expect(engine.isLeaky()).toBe(false);
      expect(engine.isInDelay()).toBe(false);
    });

    it('should correctly identify LEAKY state', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.LEAKY);

      // Act & Assert
      expect(engine.isSealed()).toBe(false);
      expect(engine.isLeaky()).toBe(true);
      expect(engine.isInDelay()).toBe(false);
    });

    it('should correctly identify OPEN_DELAY state', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.OPEN_DELAY);

      // Act & Assert
      expect(engine.isSealed()).toBe(false);
      expect(engine.isLeaky()).toBe(false);
      expect(engine.isInDelay()).toBe(true);
    });

    it('should correctly identify CLOSE_DELAY state', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.CLOSE_DELAY);

      // Act & Assert
      expect(engine.isSealed()).toBe(false);
      expect(engine.isLeaky()).toBe(false);
      expect(engine.isInDelay()).toBe(true);
    });
  });

  describe('getActiveDelayDeadline', () => {
    it('should return null when no delay is active', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);

      // Act & Assert
      expect(engine.getActiveDelayDeadline()).toBeNull();
    });

    it('should return deadline when in OPEN_DELAY', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);
      const beforeTime = Date.now();

      // Act
      engine.handleAnySensorOpened();
      const deadline = engine.getActiveDelayDeadline();

      // Assert
      expect(deadline).not.toBeNull();
      expect(deadline).toBeGreaterThanOrEqual(beforeTime + 10000);
    });

    it('should return deadline when in CLOSE_DELAY', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.LEAKY);
      const beforeTime = Date.now();

      // Act
      engine.handleAllSensorsClosed();
      const deadline = engine.getActiveDelayDeadline();

      // Assert
      expect(deadline).not.toBeNull();
      expect(deadline).toBeGreaterThanOrEqual(beforeTime + 5000);
    });

    it('should clear deadline when state is set directly', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);
      engine.handleAnySensorOpened(); // Sets deadline

      // Act
      engine.setCurrentState(ZoneSealState.LEAKY);

      // Assert
      expect(engine.getActiveDelayDeadline()).toBeNull();
    });
  });

  describe('updateConfig', () => {
    it('should update delay configuration', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);
      const newConfig = { openDelaySeconds: 20, closeDelaySeconds: 10 };

      // Act
      engine.updateConfig(newConfig);

      // Assert
      const config = engine.getConfig();
      expect(config.openDelaySeconds).toBe(20);
      expect(config.closeDelaySeconds).toBe(10);
    });

    it('should validate new configuration', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);
      const invalidConfig = { openDelaySeconds: -1, closeDelaySeconds: 5 };

      // Act & Assert
      expect(() => engine.updateConfig(invalidConfig)).toThrow('Invalid openDelaySeconds');
    });

    it('should not affect active delay deadline', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);
      engine.handleAnySensorOpened(); // Sets deadline with 10s
      const originalDeadline = engine.getActiveDelayDeadline();

      // Act - update config to different delay
      engine.updateConfig({ openDelaySeconds: 20, closeDelaySeconds: 10 });

      // Assert - deadline unchanged
      expect(engine.getActiveDelayDeadline()).toBe(originalDeadline);
    });

    it('should create defensive copy of updated config', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);
      const newConfig = { openDelaySeconds: 20, closeDelaySeconds: 10 };

      // Act
      engine.updateConfig(newConfig);
      newConfig.openDelaySeconds = 999; // Mutate

      // Assert
      expect(engine.getConfig().openDelaySeconds).toBe(20);
    });

    it('should accept zero delays', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);

      // Act
      engine.updateConfig(zeroDelayConfig);

      // Assert
      const config = engine.getConfig();
      expect(config.openDelaySeconds).toBe(0);
      expect(config.closeDelaySeconds).toBe(0);
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);

      // Act
      const config = engine.getConfig();

      // Assert
      expect(config.openDelaySeconds).toBe(10);
      expect(config.closeDelaySeconds).toBe(5);
    });

    it('should return defensive copy', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);

      // Act
      const config1 = engine.getConfig();
      const config2 = engine.getConfig();

      // Assert - different objects
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });

    it('should not allow mutation of internal config', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);

      // Act
      const config = engine.getConfig();
      config.openDelaySeconds = 999;

      // Assert - internal config unchanged
      expect(engine.getConfig().openDelaySeconds).toBe(10);
    });
  });

  describe('complete state transition flows', () => {
    it('should handle complete open transition flow', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);

      // Act - sensor opens
      const t1 = engine.handleAnySensorOpened();
      expect(t1.newState).toBe(ZoneSealState.LEAKY); // Target state after delay

      // Device layer would schedule timer and call setCurrentState after delay
      engine.setCurrentState(ZoneSealState.LEAKY);

      // Assert - final state
      expect(engine.isLeaky()).toBe(true);
    });

    it('should handle complete close transition flow', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.LEAKY);

      // Act - all sensors close
      const t1 = engine.handleAllSensorsClosed();
      expect(t1.newState).toBe(ZoneSealState.SEALED); // Target state after delay

      // Device layer would schedule timer and call setCurrentState after delay
      engine.setCurrentState(ZoneSealState.SEALED);

      // Assert - final state
      expect(engine.isSealed()).toBe(true);
    });

    it('should handle open-close-open sequence', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);

      // Act - sensor opens
      engine.handleAnySensorOpened();
      expect(engine.getCurrentState()).toBe(ZoneSealState.OPEN_DELAY);

      // All sensors close during open delay
      engine.handleAllSensorsClosed();
      expect(engine.getCurrentState()).toBe(ZoneSealState.CLOSE_DELAY);

      // Sensor opens again during close delay
      engine.handleAnySensorOpened();
      expect(engine.getCurrentState()).toBe(ZoneSealState.OPEN_DELAY);

      // Assert - back in open delay
      expect(engine.isInDelay()).toBe(true);
    });

    it('should handle immediate transitions with zero delays', () => {
      // Arrange
      const engine = new ZoneSealEngine(zeroDelayConfig, ZoneSealState.SEALED);

      // Act - sensor opens (immediate)
      const t1 = engine.handleAnySensorOpened();
      expect(t1.immediate).toBe(true);
      expect(engine.isLeaky()).toBe(true);

      // All sensors close (immediate)
      const t2 = engine.handleAllSensorsClosed();
      expect(t2.immediate).toBe(true);
      expect(engine.isSealed()).toBe(true);

      // Assert - back to sealed
      expect(engine.getCurrentState()).toBe(ZoneSealState.SEALED);
    });

    it('should handle multiple sensor opens during open delay', () => {
      // Arrange
      const engine = new ZoneSealEngine(defaultConfig, ZoneSealState.SEALED);

      // Act - first sensor opens
      engine.handleAnySensorOpened();
      const firstDeadline = engine.getActiveDelayDeadline();

      // Additional sensors open
      engine.handleAnySensorOpened();
      engine.handleAnySensorOpened();

      // Assert - deadline unchanged
      expect(engine.getActiveDelayDeadline()).toBe(firstDeadline);
      expect(engine.getCurrentState()).toBe(ZoneSealState.OPEN_DELAY);
    });
  });

  describe('delay deadline tracking', () => {
    it('should track deadline for open delay', () => {
      // Arrange
      const engine = new ZoneSealEngine({ openDelaySeconds: 30, closeDelaySeconds: 5 }, ZoneSealState.SEALED);
      const startTime = Date.now();

      // Act
      engine.handleAnySensorOpened();
      const deadline = engine.getActiveDelayDeadline();

      // Assert
      expect(deadline).not.toBeNull();
      const expectedDeadline = startTime + 30000;
      expect(deadline).toBeGreaterThanOrEqual(expectedDeadline);
      expect(deadline).toBeLessThanOrEqual(expectedDeadline + 100); // Small tolerance
    });

    it('should track deadline for close delay', () => {
      // Arrange
      const engine = new ZoneSealEngine({ openDelaySeconds: 10, closeDelaySeconds: 15 }, ZoneSealState.LEAKY);
      const startTime = Date.now();

      // Act
      engine.handleAllSensorsClosed();
      const deadline = engine.getActiveDelayDeadline();

      // Assert
      expect(deadline).not.toBeNull();
      const expectedDeadline = startTime + 15000;
      expect(deadline).toBeGreaterThanOrEqual(expectedDeadline);
      expect(deadline).toBeLessThanOrEqual(expectedDeadline + 100); // Small tolerance
    });

    it('should not set deadline for immediate transitions', () => {
      // Arrange
      const engine = new ZoneSealEngine(zeroDelayConfig, ZoneSealState.SEALED);

      // Act
      engine.handleAnySensorOpened();

      // Assert
      expect(engine.getActiveDelayDeadline()).toBeNull();
    });
  });
});
