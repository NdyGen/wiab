/**
 * Unit tests for RoomTemplates module
 *
 * Tests cover:
 * - getAllTemplates returns all 7 room templates
 * - getTemplateById finds templates by valid IDs
 * - getTemplateById returns undefined for invalid IDs
 * - getTemplateTimers returns timer values for valid IDs
 * - getTemplateTimers returns undefined for invalid IDs
 * - All templates have required properties and timer values
 * - Template timer values match specifications from issue #59
 */

import {
  ROOM_TEMPLATES,
  getAllTemplates,
  getTemplateById,
  getTemplateTimers,
  RoomTemplate,
  TimerValues,
} from '../../lib/RoomTemplates';

describe('RoomTemplates', () => {
  describe('ROOM_TEMPLATES constant', () => {
    it('should define exactly 7 room templates', () => {
      expect(ROOM_TEMPLATES).toHaveLength(7);
    });

    it('should have all expected template IDs', () => {
      const ids = ROOM_TEMPLATES.map((t) => t.id);
      expect(ids).toContain('bedroom');
      expect(ids).toContain('bathroom');
      expect(ids).toContain('home_office');
      expect(ids).toContain('kitchen');
      expect(ids).toContain('living_room');
      expect(ids).toContain('hallway');
      expect(ids).toContain('storage');
    });

    it('should have all templates with required properties', () => {
      ROOM_TEMPLATES.forEach((template) => {
        // Required top-level properties
        expect(template).toHaveProperty('id');
        expect(template).toHaveProperty('name');
        expect(template).toHaveProperty('description');
        expect(template).toHaveProperty('timerValues');

        // Timer values properties
        expect(template.timerValues).toHaveProperty('t_enter');
        expect(template.timerValues).toHaveProperty('t_clear');
        expect(template.timerValues).toHaveProperty('stalePirMinutes');
        expect(template.timerValues).toHaveProperty('staleDoorMinutes');

        // Multilingual name properties
        expect(template.name).toHaveProperty('en');
        expect(template.name).toHaveProperty('nl');
        expect(template.name).toHaveProperty('de');
        expect(template.name).toHaveProperty('no');
        expect(template.name).toHaveProperty('sv');

        // Multilingual description properties
        expect(template.description).toHaveProperty('en');
        expect(template.description).toHaveProperty('nl');
        expect(template.description).toHaveProperty('de');
        expect(template.description).toHaveProperty('no');
        expect(template.description).toHaveProperty('sv');
      });
    });

    it('should have all timer values as positive numbers', () => {
      ROOM_TEMPLATES.forEach((template) => {
        expect(template.timerValues.t_enter).toBeGreaterThan(0);
        expect(template.timerValues.t_clear).toBeGreaterThan(0);
        expect(template.timerValues.stalePirMinutes).toBeGreaterThan(0);
        expect(template.timerValues.staleDoorMinutes).toBeGreaterThan(0);

        expect(typeof template.timerValues.t_enter).toBe('number');
        expect(typeof template.timerValues.t_clear).toBe('number');
        expect(typeof template.timerValues.stalePirMinutes).toBe('number');
        expect(typeof template.timerValues.staleDoorMinutes).toBe('number');
      });
    });
  });

  describe('getAllTemplates', () => {
    it('should return all 7 templates', () => {
      const templates = getAllTemplates();
      expect(templates).toHaveLength(7);
    });

    it('should return the same templates as ROOM_TEMPLATES', () => {
      const templates = getAllTemplates();
      expect(templates).toEqual(ROOM_TEMPLATES);
    });

    it('should return a readonly array', () => {
      const templates = getAllTemplates();
      // TypeScript enforces readonly at compile time
      // At runtime, we can verify it's the same reference
      expect(templates).toBe(ROOM_TEMPLATES);
    });
  });

  describe('getTemplateById', () => {
    it('should return bedroom template when given "bedroom" ID', () => {
      const template = getTemplateById('bedroom');
      expect(template).toBeDefined();
      expect(template?.id).toBe('bedroom');
      expect(template?.name.en).toBe('Bedroom');
    });

    it('should return bathroom template when given "bathroom" ID', () => {
      const template = getTemplateById('bathroom');
      expect(template).toBeDefined();
      expect(template?.id).toBe('bathroom');
      expect(template?.name.en).toBe('Bathroom');
    });

    it('should return home_office template when given "home_office" ID', () => {
      const template = getTemplateById('home_office');
      expect(template).toBeDefined();
      expect(template?.id).toBe('home_office');
      expect(template?.name.en).toBe('Home Office');
    });

    it('should return kitchen template when given "kitchen" ID', () => {
      const template = getTemplateById('kitchen');
      expect(template).toBeDefined();
      expect(template?.id).toBe('kitchen');
      expect(template?.name.en).toBe('Kitchen');
    });

    it('should return living_room template when given "living_room" ID', () => {
      const template = getTemplateById('living_room');
      expect(template).toBeDefined();
      expect(template?.id).toBe('living_room');
      expect(template?.name.en).toBe('Living Room');
    });

    it('should return hallway template when given "hallway" ID', () => {
      const template = getTemplateById('hallway');
      expect(template).toBeDefined();
      expect(template?.id).toBe('hallway');
      expect(template?.name.en).toBe('Hallway / Corridor');
    });

    it('should return storage template when given "storage" ID', () => {
      const template = getTemplateById('storage');
      expect(template).toBeDefined();
      expect(template?.id).toBe('storage');
      expect(template?.name.en).toBe('Storage / Garage');
    });

    it('should return undefined for invalid template ID', () => {
      const template = getTemplateById('invalid_room_type');
      expect(template).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      const template = getTemplateById('');
      expect(template).toBeUndefined();
    });

    it('should be case-sensitive', () => {
      const template = getTemplateById('BEDROOM'); // Uppercase
      expect(template).toBeUndefined();
    });
  });

  describe('getTemplateTimers', () => {
    it('should return timer values for bedroom template', () => {
      const timers = getTemplateTimers('bedroom');
      expect(timers).toBeDefined();
      expect(timers).toEqual({
        t_enter: 30,
        t_clear: 1200,
        stalePirMinutes: 60,
        staleDoorMinutes: 60,
      });
    });

    it('should return timer values for bathroom template', () => {
      const timers = getTemplateTimers('bathroom');
      expect(timers).toBeDefined();
      expect(timers).toEqual({
        t_enter: 10,
        t_clear: 300,
        stalePirMinutes: 15,
        staleDoorMinutes: 15,
      });
    });

    it('should return timer values for home_office template', () => {
      const timers = getTemplateTimers('home_office');
      expect(timers).toBeDefined();
      expect(timers).toEqual({
        t_enter: 15,
        t_clear: 900,
        stalePirMinutes: 30,
        staleDoorMinutes: 30,
      });
    });

    it('should return timer values for kitchen template', () => {
      const timers = getTemplateTimers('kitchen');
      expect(timers).toBeDefined();
      expect(timers).toEqual({
        t_enter: 15,
        t_clear: 600,
        stalePirMinutes: 30,
        staleDoorMinutes: 30,
      });
    });

    it('should return timer values for living_room template', () => {
      const timers = getTemplateTimers('living_room');
      expect(timers).toBeDefined();
      expect(timers).toEqual({
        t_enter: 20,
        t_clear: 900,
        stalePirMinutes: 30,
        staleDoorMinutes: 30,
      });
    });

    it('should return timer values for hallway template', () => {
      const timers = getTemplateTimers('hallway');
      expect(timers).toBeDefined();
      expect(timers).toEqual({
        t_enter: 5,
        t_clear: 60,
        stalePirMinutes: 15,
        staleDoorMinutes: 15,
      });
    });

    it('should return timer values for storage template', () => {
      const timers = getTemplateTimers('storage');
      expect(timers).toBeDefined();
      expect(timers).toEqual({
        t_enter: 10,
        t_clear: 180,
        stalePirMinutes: 30,
        staleDoorMinutes: 30,
      });
    });

    it('should return undefined for invalid template ID', () => {
      const timers = getTemplateTimers('nonexistent');
      expect(timers).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      const timers = getTemplateTimers('');
      expect(timers).toBeUndefined();
    });
  });

  describe('Template value specifications (GitHub Issue #59)', () => {
    it('bedroom template should match specification', () => {
      const template = getTemplateById('bedroom');
      expect(template?.timerValues).toEqual({
        t_enter: 30,
        t_clear: 1200, // 20 minutes
        stalePirMinutes: 60,
        staleDoorMinutes: 60,
      });
    });

    it('bathroom template should match specification', () => {
      const template = getTemplateById('bathroom');
      expect(template?.timerValues).toEqual({
        t_enter: 10,
        t_clear: 300, // 5 minutes
        stalePirMinutes: 15,
        staleDoorMinutes: 15,
      });
    });

    it('home_office template should match specification', () => {
      const template = getTemplateById('home_office');
      expect(template?.timerValues).toEqual({
        t_enter: 15,
        t_clear: 900, // 15 minutes
        stalePirMinutes: 30,
        staleDoorMinutes: 30,
      });
    });

    it('kitchen template should match specification', () => {
      const template = getTemplateById('kitchen');
      expect(template?.timerValues).toEqual({
        t_enter: 15,
        t_clear: 600, // 10 minutes
        stalePirMinutes: 30,
        staleDoorMinutes: 30,
      });
    });

    it('living_room template should match specification', () => {
      const template = getTemplateById('living_room');
      expect(template?.timerValues).toEqual({
        t_enter: 20,
        t_clear: 900, // 15 minutes
        stalePirMinutes: 30,
        staleDoorMinutes: 30,
      });
    });

    it('hallway template should match specification', () => {
      const template = getTemplateById('hallway');
      expect(template?.timerValues).toEqual({
        t_enter: 5,
        t_clear: 60, // 1 minute
        stalePirMinutes: 15,
        staleDoorMinutes: 15,
      });
    });

    it('storage template should match specification', () => {
      const template = getTemplateById('storage');
      expect(template?.timerValues).toEqual({
        t_enter: 10,
        t_clear: 180, // 3 minutes
        stalePirMinutes: 30,
        staleDoorMinutes: 30,
      });
    });
  });

  describe('Type safety', () => {
    it('should have TimerValues interface with correct types', () => {
      const timers: TimerValues | undefined = getTemplateTimers('bedroom');
      if (timers) {
        // TypeScript should enforce these are numbers at compile time
        const enterTime: number = timers.t_enter;
        const clearTime: number = timers.t_clear;
        const pirStale: number = timers.stalePirMinutes;
        const doorStale: number = timers.staleDoorMinutes;

        expect(typeof enterTime).toBe('number');
        expect(typeof clearTime).toBe('number');
        expect(typeof pirStale).toBe('number');
        expect(typeof doorStale).toBe('number');
      }
    });

    it('should have RoomTemplate interface with correct structure', () => {
      const template: RoomTemplate | undefined = getTemplateById('bedroom');
      if (template) {
        // TypeScript should enforce these properties exist at compile time
        expect(typeof template.id).toBe('string');
        expect(typeof template.name.en).toBe('string');
        expect(typeof template.description.en).toBe('string');
        expect(typeof template.timerValues.t_enter).toBe('number');
      }
    });
  });
});
