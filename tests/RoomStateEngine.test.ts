import { RoomStateEngine } from '../lib/RoomStateEngine';
import type { StateConfig } from '../lib/types';

describe('RoomStateEngine', () => {
  const basicStates: StateConfig[] = [
    {
      id: 'unoccupied',
      name: 'Unoccupied',
      activeTransitions: [{ targetState: 'occupied', afterMinutes: 0 }],
      inactiveTransitions: []
    },
    {
      id: 'occupied',
      name: 'Occupied',
      parent: undefined,
      activeTransitions: [{ targetState: 'working', afterMinutes: 15 }],
      inactiveTransitions: [{ targetState: 'unoccupied', afterMinutes: 5 }]
    },
    {
      id: 'working',
      name: 'Working',
      parent: 'occupied',
      activeTransitions: [],
      inactiveTransitions: [{ targetState: 'unoccupied', afterMinutes: 10 }]
    }
  ];

  describe('constructor', () => {
    it('should create engine with valid configuration', () => {
      const engine = new RoomStateEngine(basicStates, 'unoccupied');
      expect(engine.getCurrentState()).toBe('unoccupied');
    });

    it('should throw error for invalid initial state', () => {
      expect(() => new RoomStateEngine(basicStates, 'invalid')).toThrow();
    });

    it('should throw error for circular dependencies', () => {
      const circularStates: StateConfig[] = [
        {
          id: 'state1',
          name: 'State 1',
          parent: 'state2',
          activeTransitions: [],
          inactiveTransitions: []
        },
        {
          id: 'state2',
          name: 'State 2',
          parent: 'state1',
          activeTransitions: [],
          inactiveTransitions: []
        }
      ];

      expect(() => new RoomStateEngine(circularStates, 'state1')).toThrow(/circular/i);
    });
  });

  describe('validateConfiguration', () => {
    it('should validate correct configuration', () => {
      const engine = new RoomStateEngine(basicStates, 'unoccupied');
      const result = engine.validateConfiguration();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing parent', () => {
      const invalidStates: StateConfig[] = [
        {
          id: 'child',
          name: 'Child',
          parent: 'nonexistent',
          activeTransitions: [],
          inactiveTransitions: []
        }
      ];

      expect(() => new RoomStateEngine(invalidStates, 'child')).toThrow();
    });

    it('should detect excessive hierarchy depth', () => {
      const deepStates: StateConfig[] = [
        { id: 'root', name: 'Root', activeTransitions: [], inactiveTransitions: [] },
        {
          id: 'child',
          name: 'Child',
          parent: 'root',
          activeTransitions: [],
          inactiveTransitions: []
        },
        {
          id: 'grandchild',
          name: 'Grandchild',
          parent: 'child',
          activeTransitions: [],
          inactiveTransitions: []
        }
      ];

      expect(() => new RoomStateEngine(deepStates, 'root')).toThrow(/depth/i);
    });
  });

  describe('getStateHierarchy', () => {
    it('should return hierarchy for root state', () => {
      const engine = new RoomStateEngine(basicStates, 'unoccupied');
      const hierarchy = engine.getStateHierarchy('occupied');
      expect(hierarchy).toEqual(['occupied']);
    });

    it('should return hierarchy for child state', () => {
      const engine = new RoomStateEngine(basicStates, 'unoccupied');
      const hierarchy = engine.getStateHierarchy('working');
      expect(hierarchy).toEqual(['working', 'occupied']);
    });
  });

  describe('isState', () => {
    it('should return true for exact match', () => {
      const engine = new RoomStateEngine(basicStates, 'occupied');
      expect(engine.isState('occupied', 'occupied')).toBe(true);
    });

    it('should return true for child matching parent', () => {
      const engine = new RoomStateEngine(basicStates, 'working');
      expect(engine.isState('working', 'occupied')).toBe(true);
    });

    it('should return false for parent matching child', () => {
      const engine = new RoomStateEngine(basicStates, 'occupied');
      expect(engine.isState('occupied', 'working')).toBe(false);
    });
  });

  describe('isExactlyState', () => {
    it('should return true for exact match', () => {
      const engine = new RoomStateEngine(basicStates, 'occupied');
      expect(engine.isExactlyState('occupied', 'occupied')).toBe(true);
    });

    it('should return false for child matching parent', () => {
      const engine = new RoomStateEngine(basicStates, 'working');
      expect(engine.isExactlyState('working', 'occupied')).toBe(false);
    });
  });

  describe('getNextTimedTransition', () => {
    it('should return active transition when zone active', () => {
      const engine = new RoomStateEngine(basicStates, 'occupied');
      const next = engine.getNextTimedTransition('occupied', true);
      expect(next).toEqual({ targetState: 'working', afterMinutes: 15 });
    });

    it('should return inactive transition when zone inactive', () => {
      const engine = new RoomStateEngine(basicStates, 'occupied');
      const next = engine.getNextTimedTransition('occupied', false);
      expect(next).toEqual({ targetState: 'unoccupied', afterMinutes: 5 });
    });

    it('should return null when no transitions defined', () => {
      const engine = new RoomStateEngine(basicStates, 'working');
      const next = engine.getNextTimedTransition('working', true);
      expect(next).toBeNull();
    });
  });

  describe('evaluateStateTransition', () => {
    it('should transition when time threshold met', () => {
      const engine = new RoomStateEngine(basicStates, 'occupied');
      const result = engine.evaluateStateTransition('occupied', true, 15);
      expect(result.nextState).toBe('working');
      expect(result.reason).toContain('15 minutes');
    });

    it('should not transition when time threshold not met', () => {
      const engine = new RoomStateEngine(basicStates, 'occupied');
      const result = engine.evaluateStateTransition('occupied', true, 10);
      expect(result.nextState).toBeNull();
    });
  });

  describe('state management', () => {
    it('should update current state', () => {
      const engine = new RoomStateEngine(basicStates, 'unoccupied');
      engine.setCurrentState('occupied');
      expect(engine.getCurrentState()).toBe('occupied');
    });

    it('should throw when setting invalid state', () => {
      const engine = new RoomStateEngine(basicStates, 'unoccupied');
      expect(() => engine.setCurrentState('invalid')).toThrow();
    });

    it('should return all state IDs', () => {
      const engine = new RoomStateEngine(basicStates, 'unoccupied');
      const ids = engine.getAllStateIds();
      expect(ids).toContain('unoccupied');
      expect(ids).toContain('occupied');
      expect(ids).toContain('working');
    });
  });
});
