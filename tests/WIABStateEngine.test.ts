import { WIABStateEngine, RoomState, RoomStateTimerConfig } from '../lib/WIABStateEngine';

describe('WIABStateEngine', () => {
  let engine: WIABStateEngine;
  const defaultConfig: RoomStateTimerConfig = {
    idleTimeoutMinutes: 30,
    occupiedTimeoutMinutes: 60,
  };

  beforeEach(() => {
    engine = new WIABStateEngine(defaultConfig);
  });

  describe('initialization', () => {
    it('should initialize with idle state by default', () => {
      // Assert
      expect(engine.getCurrentState()).toBe(RoomState.IDLE);
    });

    it('should initialize with specified initial state', () => {
      // Arrange & Act
      const occupiedEngine = new WIABStateEngine(defaultConfig, RoomState.OCCUPIED);

      // Assert
      expect(occupiedEngine.getCurrentState()).toBe(RoomState.OCCUPIED);
    });

    it('should store timer configuration', () => {
      // Assert
      const config = engine.getConfig();
      expect(config.idleTimeoutMinutes).toBe(30);
      expect(config.occupiedTimeoutMinutes).toBe(60);
    });
  });

  describe('handleOccupancyChange', () => {
    describe('when transitioning from idle to occupied', () => {
      it('should transition to occupied state', () => {
        // Arrange
        expect(engine.getCurrentState()).toBe(RoomState.IDLE);

        // Act
        const result = engine.handleOccupancyChange(true);

        // Assert
        expect(result.newState).toBe(RoomState.OCCUPIED);
        expect(result.previousState).toBe(RoomState.IDLE);
        expect(engine.getCurrentState()).toBe(RoomState.OCCUPIED);
      });

      it('should schedule occupied timer', () => {
        // Act
        const result = engine.handleOccupancyChange(true);

        // Assert
        expect(result.scheduledTimerMinutes).toBe(60);
      });
    });

    describe('when transitioning from occupied to idle', () => {
      beforeEach(() => {
        engine.handleOccupancyChange(true); // Set to occupied first
      });

      it('should transition to idle state', () => {
        // Act
        const result = engine.handleOccupancyChange(false);

        // Assert
        expect(result.newState).toBe(RoomState.IDLE);
        expect(result.previousState).toBe(RoomState.OCCUPIED);
        expect(engine.getCurrentState()).toBe(RoomState.IDLE);
      });

      it('should schedule idle timer', () => {
        // Act
        const result = engine.handleOccupancyChange(false);

        // Assert
        expect(result.scheduledTimerMinutes).toBe(30);
      });
    });

    describe('when already in target state family', () => {
      it('should not transition if already in occupied family', () => {
        // Arrange
        engine.handleOccupancyChange(true); // occupied
        engine.handleTimerExpiry(); // extended_occupied

        // Act
        const result = engine.handleOccupancyChange(true);

        // Assert
        expect(result.newState).toBeNull();
        expect(engine.getCurrentState()).toBe(RoomState.EXTENDED_OCCUPIED);
      });

      it('should not transition if already in idle family', () => {
        // Arrange - start in idle, then extended_idle
        engine.handleTimerExpiry(); // extended_idle

        // Act
        const result = engine.handleOccupancyChange(false);

        // Assert
        expect(result.newState).toBeNull();
        expect(engine.getCurrentState()).toBe(RoomState.EXTENDED_IDLE);
      });
    });

    describe('when timer is disabled', () => {
      beforeEach(() => {
        engine = new WIABStateEngine({
          idleTimeoutMinutes: 0,
          occupiedTimeoutMinutes: 0,
        });
      });

      it('should not schedule timer when transitioning to occupied', () => {
        // Act
        const result = engine.handleOccupancyChange(true);

        // Assert
        expect(result.newState).toBe(RoomState.OCCUPIED);
        expect(result.scheduledTimerMinutes).toBeNull();
      });

      it('should not schedule timer when transitioning to idle', () => {
        // Arrange
        engine.handleOccupancyChange(true);

        // Act
        const result = engine.handleOccupancyChange(false);

        // Assert
        expect(result.newState).toBe(RoomState.IDLE);
        expect(result.scheduledTimerMinutes).toBeNull();
      });
    });
  });

  describe('handleTimerExpiry', () => {
    it('should transition from occupied to extended_occupied', () => {
      // Arrange
      engine.handleOccupancyChange(true);

      // Act
      const result = engine.handleTimerExpiry();

      // Assert
      expect(result.newState).toBe(RoomState.EXTENDED_OCCUPIED);
      expect(result.previousState).toBe(RoomState.OCCUPIED);
      expect(engine.getCurrentState()).toBe(RoomState.EXTENDED_OCCUPIED);
    });

    it('should transition from idle to extended_idle', () => {
      // Act
      const result = engine.handleTimerExpiry();

      // Assert
      expect(result.newState).toBe(RoomState.EXTENDED_IDLE);
      expect(result.previousState).toBe(RoomState.IDLE);
      expect(engine.getCurrentState()).toBe(RoomState.EXTENDED_IDLE);
    });

    it('should not schedule another timer after transitioning to extended state', () => {
      // Arrange
      engine.handleOccupancyChange(true);

      // Act
      const result = engine.handleTimerExpiry();

      // Assert
      expect(result.scheduledTimerMinutes).toBeNull();
    });

    it('should do nothing if already in extended state', () => {
      // Arrange
      engine.handleTimerExpiry(); // Now in extended_idle

      // Act
      const result = engine.handleTimerExpiry();

      // Assert
      expect(result.newState).toBeNull();
      expect(engine.getCurrentState()).toBe(RoomState.EXTENDED_IDLE);
    });

    it('should not transition if timer is disabled', () => {
      // Arrange
      engine = new WIABStateEngine({
        idleTimeoutMinutes: 0,
        occupiedTimeoutMinutes: 60,
      });

      // Act
      const result = engine.handleTimerExpiry();

      // Assert
      expect(result.newState).toBeNull();
      expect(engine.getCurrentState()).toBe(RoomState.IDLE);
    });
  });

  describe('setManualState', () => {
    it('should set state to specified value', () => {
      // Act
      const result = engine.setManualState(RoomState.EXTENDED_OCCUPIED);

      // Assert
      expect(result.newState).toBe(RoomState.EXTENDED_OCCUPIED);
      expect(result.previousState).toBe(RoomState.IDLE);
      expect(engine.getCurrentState()).toBe(RoomState.EXTENDED_OCCUPIED);
    });

    it('should not schedule timer for extended states', () => {
      // Act
      const result = engine.setManualState(RoomState.EXTENDED_IDLE);

      // Assert
      expect(result.scheduledTimerMinutes).toBeNull();
    });

    it('should schedule timer for base states', () => {
      // Arrange
      engine.setManualState(RoomState.EXTENDED_OCCUPIED);

      // Act
      const result = engine.setManualState(RoomState.IDLE);

      // Assert
      expect(result.scheduledTimerMinutes).toBe(30);
    });

    it('should return null newState if already in that state', () => {
      // Act
      const result = engine.setManualState(RoomState.IDLE);

      // Assert
      expect(result.newState).toBeNull();
    });
  });

  describe('isInState (with hierarchy)', () => {
    it('should return true for exact match', () => {
      // Arrange
      engine.handleOccupancyChange(true);

      // Assert
      expect(engine.isInState(RoomState.OCCUPIED)).toBe(true);
    });

    it('should return true for child of target state', () => {
      // Arrange
      engine.handleOccupancyChange(true);
      engine.handleTimerExpiry(); // Now extended_occupied

      // Assert
      expect(engine.isInState(RoomState.OCCUPIED)).toBe(true);
      expect(engine.isInState(RoomState.EXTENDED_OCCUPIED)).toBe(true);
    });

    it('should return false for unrelated state', () => {
      // Arrange
      engine.handleOccupancyChange(true);

      // Assert
      expect(engine.isInState(RoomState.IDLE)).toBe(false);
      expect(engine.isInState(RoomState.EXTENDED_IDLE)).toBe(false);
    });
  });

  describe('isExactlyInState (no hierarchy)', () => {
    it('should return true only for exact match', () => {
      // Arrange
      engine.handleOccupancyChange(true);
      engine.handleTimerExpiry(); // Now extended_occupied

      // Assert
      expect(engine.isExactlyInState(RoomState.EXTENDED_OCCUPIED)).toBe(true);
      expect(engine.isExactlyInState(RoomState.OCCUPIED)).toBe(false);
    });
  });

  describe('getStateHierarchy', () => {
    it('should return single-element array for root states', () => {
      // Assert
      expect(engine.getStateHierarchy(RoomState.IDLE)).toEqual([RoomState.IDLE]);
      expect(engine.getStateHierarchy(RoomState.OCCUPIED)).toEqual([RoomState.OCCUPIED]);
    });

    it('should return child-to-parent array for extended states', () => {
      // Assert
      expect(engine.getStateHierarchy(RoomState.EXTENDED_IDLE)).toEqual([
        RoomState.EXTENDED_IDLE,
        RoomState.IDLE,
      ]);
      expect(engine.getStateHierarchy(RoomState.EXTENDED_OCCUPIED)).toEqual([
        RoomState.EXTENDED_OCCUPIED,
        RoomState.OCCUPIED,
      ]);
    });
  });

  describe('getTimerForState', () => {
    it('should return timer duration for base states', () => {
      // Assert
      expect(engine.getTimerForState(RoomState.IDLE)).toBe(30);
      expect(engine.getTimerForState(RoomState.OCCUPIED)).toBe(60);
    });

    it('should return null for extended states', () => {
      // Assert
      expect(engine.getTimerForState(RoomState.EXTENDED_IDLE)).toBeNull();
      expect(engine.getTimerForState(RoomState.EXTENDED_OCCUPIED)).toBeNull();
    });

    it('should return null when timer is disabled', () => {
      // Arrange
      engine = new WIABStateEngine({
        idleTimeoutMinutes: 0,
        occupiedTimeoutMinutes: 0,
      });

      // Assert
      expect(engine.getTimerForState(RoomState.IDLE)).toBeNull();
      expect(engine.getTimerForState(RoomState.OCCUPIED)).toBeNull();
    });
  });

  describe('updateConfig', () => {
    it('should update timer configuration', () => {
      // Act
      engine.updateConfig({ idleTimeoutMinutes: 45 });

      // Assert
      const config = engine.getConfig();
      expect(config.idleTimeoutMinutes).toBe(45);
      expect(config.occupiedTimeoutMinutes).toBe(60); // unchanged
    });

    it('should update multiple config values', () => {
      // Act
      engine.updateConfig({
        idleTimeoutMinutes: 15,
        occupiedTimeoutMinutes: 120,
      });

      // Assert
      const config = engine.getConfig();
      expect(config.idleTimeoutMinutes).toBe(15);
      expect(config.occupiedTimeoutMinutes).toBe(120);
    });
  });

  describe('static methods', () => {
    describe('getAllStates', () => {
      it('should return all four states', () => {
        // Act
        const states = WIABStateEngine.getAllStates();

        // Assert
        expect(states).toHaveLength(4);
        expect(states).toContain(RoomState.IDLE);
        expect(states).toContain(RoomState.EXTENDED_IDLE);
        expect(states).toContain(RoomState.OCCUPIED);
        expect(states).toContain(RoomState.EXTENDED_OCCUPIED);
      });
    });

    describe('isValidState', () => {
      it('should return true for valid states', () => {
        // Assert
        expect(WIABStateEngine.isValidState('idle')).toBe(true);
        expect(WIABStateEngine.isValidState('extended_idle')).toBe(true);
        expect(WIABStateEngine.isValidState('occupied')).toBe(true);
        expect(WIABStateEngine.isValidState('extended_occupied')).toBe(true);
      });

      it('should return false for invalid states', () => {
        // Assert
        expect(WIABStateEngine.isValidState('invalid')).toBe(false);
        expect(WIABStateEngine.isValidState('')).toBe(false);
        expect(WIABStateEngine.isValidState('IDLE')).toBe(false); // case-sensitive
      });
    });
  });

  describe('complete state flow scenarios', () => {
    it('should handle idle → occupied → extended_occupied → idle flow', () => {
      // Start in idle
      expect(engine.getCurrentState()).toBe(RoomState.IDLE);

      // Occupancy detected
      const occupiedResult = engine.handleOccupancyChange(true);
      expect(occupiedResult.newState).toBe(RoomState.OCCUPIED);
      expect(occupiedResult.scheduledTimerMinutes).toBe(60);

      // Timer expires
      const extendedResult = engine.handleTimerExpiry();
      expect(extendedResult.newState).toBe(RoomState.EXTENDED_OCCUPIED);
      expect(extendedResult.scheduledTimerMinutes).toBeNull();

      // Occupancy lost
      const idleResult = engine.handleOccupancyChange(false);
      expect(idleResult.newState).toBe(RoomState.IDLE);
      expect(idleResult.previousState).toBe(RoomState.EXTENDED_OCCUPIED);
      expect(idleResult.scheduledTimerMinutes).toBe(30);
    });

    it('should handle rapid occupancy toggles correctly', () => {
      // Start in idle
      expect(engine.getCurrentState()).toBe(RoomState.IDLE);

      // Toggle to occupied
      engine.handleOccupancyChange(true);
      expect(engine.getCurrentState()).toBe(RoomState.OCCUPIED);

      // Toggle back to idle before timer expires
      engine.handleOccupancyChange(false);
      expect(engine.getCurrentState()).toBe(RoomState.IDLE);

      // Toggle to occupied again
      engine.handleOccupancyChange(true);
      expect(engine.getCurrentState()).toBe(RoomState.OCCUPIED);
    });
  });
});
