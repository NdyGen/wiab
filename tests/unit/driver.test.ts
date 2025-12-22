/**
 * Unit tests for WIABDriver class - Pairing Session Handlers
 *
 * Tests cover:
 * - Room template selection handler
 * - Device fetching handlers (motion/contact devices)
 * - Sensor selection handlers
 * - Device creation with accumulated settings
 * - End-to-end pairing flow
 * - Error handling in all handlers
 */

import WIABDriver from '../../drivers/wiab-device/driver';
import Homey from 'homey';
import { createMockHomey, createMockHomeyApi, createMockDevice } from '../setup';
import type { TimerValues } from '../../lib/RoomTemplates';

/**
 * Mock PairSession for testing driver pairing handlers.
 * Mimics Homey.Driver.PairSession interface.
 */
class MockPairSession {
  private handlers: Map<string, (...args: unknown[]) => Promise<unknown>> = new Map();

  setHandler(event: string, handler: (...args: unknown[]) => Promise<unknown>): void {
    this.handlers.set(event, handler);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getHandler(event: string): (...args: any[]) => Promise<any> {
    const handler = this.handlers.get(event);
    if (!handler) {
      throw new Error(`Handler '${event}' not registered in pairing session`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return handler as (...args: any[]) => Promise<any>;
  }

  hasHandler(event: string): boolean {
    return this.handlers.has(event);
  }

  clearHandlers(): void {
    this.handlers.clear();
  }
}

describe('WIABDriver - Pairing Session', () => {
  let driver: InstanceType<typeof WIABDriver>;
  let mockHomey: ReturnType<typeof createMockHomey>;
  let mockHomeyApi: ReturnType<typeof createMockHomeyApi>;
  let mockSession: MockPairSession;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock Homey
    mockHomey = createMockHomey();
    mockHomeyApi = createMockHomeyApi();

    // Create driver instance with mocked homey
    driver = new WIABDriver();
    (driver as unknown as { homey: typeof mockHomey }).homey = mockHomey;

    // Setup mock app with homeyApi for driver to use
    const mockApp = {
      homeyApi: mockHomeyApi,
    };
    (driver.homey as unknown as { app: typeof mockApp }).app = mockApp;

    // Mock driver methods
    driver.log = jest.fn();
    driver.error = jest.fn();

    // Create fresh mock session
    mockSession = new MockPairSession();
  });

  describe('Pairing handler registration', () => {
    it('should register all required pairing handlers', async () => {
      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      expect(mockSession.hasHandler('get_room_templates')).toBe(true);
      expect(mockSession.hasHandler('select_room_type')).toBe(true);
      expect(mockSession.hasHandler('get_motion_devices')).toBe(true);
      expect(mockSession.hasHandler('get_contact_devices')).toBe(true);
      expect(mockSession.hasHandler('select_trigger_sensors')).toBe(true);
      expect(mockSession.hasHandler('select_reset_sensors')).toBe(true);
      expect(mockSession.hasHandler('list_devices')).toBe(true);
    });
  });

  describe('get_room_templates handler', () => {
    it('should return all 7 room templates', async () => {
      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      const handler = mockSession.getHandler('get_room_templates');
      const templates = await handler();

      expect(templates).toHaveLength(7);
      expect(templates[0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        description: expect.any(String),
        timerValues: expect.objectContaining({
          t_enter: expect.any(Number),
          t_clear: expect.any(Number),
          stalePirMinutes: expect.any(Number),
          staleDoorMinutes: expect.any(Number),
        }),
      });
    });

    it('should include bedroom template with correct values', async () => {
      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      const handler = mockSession.getHandler('get_room_templates');
      const templates = await handler();

      const bedroomTemplate = templates.find((t: {id: string}) => t.id === 'bedroom');
      expect(bedroomTemplate).toBeDefined();
      expect(bedroomTemplate.name).toBe('Bedroom');
      expect(bedroomTemplate.timerValues).toMatchObject({
        t_enter: 30,
        t_clear: 1200,
        stalePirMinutes: 60,
        staleDoorMinutes: 60,
      });
    });
  });

  describe('select_room_type handler', () => {
    it('should accept and store valid timer values', async () => {
      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      const handler = mockSession.getHandler('select_room_type');
      const timerValues: TimerValues = {
        t_enter: 30,
        t_clear: 1200,
        stalePirMinutes: 60,
        staleDoorMinutes: 60,
      };

      const result = await handler(timerValues);

      expect(result).toEqual({ success: true });
      expect(driver.log).toHaveBeenCalledWith(
        'Room template selected with timers:',
        expect.objectContaining({ t_enter: 30, t_clear: 1200 })
      );
    });

    it('should accept null when user skips template selection', async () => {
      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      const handler = mockSession.getHandler('select_room_type');
      const result = await handler(null);

      expect(result).toEqual({ success: true });
      expect(driver.log).toHaveBeenCalledWith(
        'Room template selection skipped, using default timer values'
      );
    });

    it('should reject timer values with invalid structure (missing properties)', async () => {
      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      const handler = mockSession.getHandler('select_room_type');
      const invalidTimers = {
        t_enter: 30,
        // Missing t_clear, stalePirMinutes, staleDoorMinutes
      };

      await expect(handler(invalidTimers)).rejects.toThrow('Invalid timer configuration');
      expect(driver.error).toHaveBeenCalledWith(
        expect.stringContaining('[PAIRING_004]'),
        invalidTimers
      );
    });

    it('should reject timer values outside valid ranges (t_enter too low)', async () => {
      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      const handler = mockSession.getHandler('select_room_type');
      const invalidTimers: TimerValues = {
        t_enter: 2, // Min is 5
        t_clear: 1200,
        stalePirMinutes: 60,
        staleDoorMinutes: 60,
      };

      await expect(handler(invalidTimers)).rejects.toThrow('Invalid timer configuration');
    });

    it('should reject timer values outside valid ranges (t_clear too high)', async () => {
      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      const handler = mockSession.getHandler('select_room_type');
      const invalidTimers: TimerValues = {
        t_enter: 30,
        t_clear: 5000, // Max is 3600
        stalePirMinutes: 60,
        staleDoorMinutes: 60,
      };

      await expect(handler(invalidTimers)).rejects.toThrow('Invalid timer configuration');
    });

    it('should reject non-numeric timer values', async () => {
      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      const handler = mockSession.getHandler('select_room_type');
      const invalidTimers = {
        t_enter: '30', // String instead of number
        t_clear: 1200,
        stalePirMinutes: 60,
        staleDoorMinutes: 60,
      };

      await expect(handler(invalidTimers)).rejects.toThrow('Invalid timer configuration');
    });
  });

  describe('get_motion_devices handler', () => {
    it('should fetch devices with alarm_motion capability', async () => {
      const motionDevice1 = createMockDevice({
        id: 'motion-1',
        name: 'Living Room Motion',
        capabilities: ['alarm_motion'],
      });
      const motionDevice2 = createMockDevice({
        id: 'motion-2',
        name: 'Bedroom Motion',
        capabilities: ['alarm_motion'],
      });

      mockHomeyApi.devices._addDevice('motion-1', motionDevice1);
      mockHomeyApi.devices._addDevice('motion-2', motionDevice2);

      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      const handler = mockSession.getHandler('get_motion_devices');
      const devices = await handler();

      expect(devices).toHaveLength(2);
      expect(devices[0]).toMatchObject({
        deviceId: 'motion-1',
        name: 'Living Room Motion',
        capability: 'alarm_motion',
      });
      expect(devices[1]).toMatchObject({
        deviceId: 'motion-2',
        name: 'Bedroom Motion',
        capability: 'alarm_motion',
      });
    });

    it('should return empty array when no motion devices exist', async () => {
      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      const handler = mockSession.getHandler('get_motion_devices');
      const devices = await handler();

      expect(devices).toEqual([]);
    });

    it('should include zone information when available', async () => {
      const motionDevice = createMockDevice({
        id: 'motion-1',
        name: 'Living Room Motion',
        capabilities: ['alarm_motion'],
      });
      (motionDevice as unknown as { zone: string }).zone = 'living-room-zone';

      mockHomeyApi.devices._addDevice('motion-1', motionDevice);
      mockHomeyApi.zones._addZone('living-room-zone', 'Living Room');

      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      const handler = mockSession.getHandler('get_motion_devices');
      const devices = await handler();

      expect(devices).toHaveLength(1);
      expect(devices[0].zone).toBe('Living Room');
    });
  });

  describe('get_contact_devices handler', () => {
    it('should fetch devices with alarm_contact capability', async () => {
      const contactDevice1 = createMockDevice({
        id: 'door-1',
        name: 'Front Door',
        capabilities: ['alarm_contact'],
      });
      const contactDevice2 = createMockDevice({
        id: 'window-1',
        name: 'Living Room Window',
        capabilities: ['alarm_contact'],
      });

      mockHomeyApi.devices._addDevice('door-1', contactDevice1);
      mockHomeyApi.devices._addDevice('window-1', contactDevice2);

      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      const handler = mockSession.getHandler('get_contact_devices');
      const devices = await handler();

      expect(devices).toHaveLength(2);
      expect(devices[0]).toMatchObject({
        deviceId: 'door-1',
        name: 'Front Door',
        capability: 'alarm_contact',
      });
    });
  });

  describe('select_trigger_sensors handler', () => {
    it('should store selected trigger sensors', async () => {
      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      const handler = mockSession.getHandler('select_trigger_sensors');
      const sensors = [
        { deviceId: 'motion-1', capability: 'alarm_motion' },
        { deviceId: 'motion-2', capability: 'alarm_motion' },
      ];

      const result = await handler(sensors);

      expect(result).toEqual({ success: true });
      expect(driver.log).toHaveBeenCalledWith('Trigger sensors selected:', sensors);
    });

    it('should accept empty array when no sensors selected', async () => {
      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      const handler = mockSession.getHandler('select_trigger_sensors');
      const result = await handler([]);

      expect(result).toEqual({ success: true });
    });
  });

  describe('select_reset_sensors handler', () => {
    it('should store selected reset sensors', async () => {
      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      const handler = mockSession.getHandler('select_reset_sensors');
      const sensors = [
        { deviceId: 'door-1', capability: 'alarm_contact' },
      ];

      const result = await handler(sensors);

      expect(result).toEqual({ success: true });
      expect(driver.log).toHaveBeenCalledWith('Reset sensors selected:', sensors);
    });
  });

  describe('list_devices handler', () => {
    it('should create device with default settings when no template selected', async () => {
      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      // Skip template selection
      const selectRoomType = mockSession.getHandler('select_room_type');
      await selectRoomType(null);

      // Select sensors
      const selectTrigger = mockSession.getHandler('select_trigger_sensors');
      await selectTrigger([{ deviceId: 'motion-1', capability: 'alarm_motion' }]);

      const selectReset = mockSession.getHandler('select_reset_sensors');
      await selectReset([{ deviceId: 'door-1', capability: 'alarm_contact' }]);

      // Create device
      const listDevices = mockSession.getHandler('list_devices');
      const devices = await listDevices();

      expect(devices).toHaveLength(1);
      expect(devices[0]).toMatchObject({
        name: 'Wasp in a Box',
        data: {
          id: expect.stringMatching(/^wiab-\d+-[a-z0-9]+$/),
        },
      });

      const settings = devices[0].settings as Record<string, unknown>;
      expect(settings.triggerSensors).toBe(
        JSON.stringify([{ deviceId: 'motion-1', capability: 'alarm_motion' }])
      );
      expect(settings.resetSensors).toBe(
        JSON.stringify([{ deviceId: 'door-1', capability: 'alarm_contact' }])
      );

      // Timer values should NOT be present (using defaults)
      expect(settings.t_enter).toBeUndefined();
      expect(settings.t_clear).toBeUndefined();
    });

    it('should create device with template timer values when template selected', async () => {
      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      // Select template
      const selectRoomType = mockSession.getHandler('select_room_type');
      const timerValues: TimerValues = {
        t_enter: 30,
        t_clear: 1200,
        stalePirMinutes: 60,
        staleDoorMinutes: 60,
      };
      await selectRoomType(timerValues);

      // Select sensors
      const selectTrigger = mockSession.getHandler('select_trigger_sensors');
      await selectTrigger([{ deviceId: 'motion-1', capability: 'alarm_motion' }]);

      // Create device
      const listDevices = mockSession.getHandler('list_devices');
      const devices = await listDevices();

      expect(devices).toHaveLength(1);

      const settings = devices[0].settings as Record<string, unknown>;
      expect(settings.t_enter).toBe(30);
      expect(settings.t_clear).toBe(1200);
      expect(settings.stalePirMinutes).toBe(60);
      expect(settings.staleDoorMinutes).toBe(60);
    });

    it('should generate unique device IDs for multiple devices', async () => {
      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      const listDevices = mockSession.getHandler('list_devices');

      const devices1 = await listDevices();
      const devices2 = await listDevices();

      expect(devices1[0].data.id).not.toBe(devices2[0].data.id);
      expect(devices1[0].data.id).toMatch(/^wiab-\d+-[a-z0-9]+$/);
      expect(devices2[0].data.id).toMatch(/^wiab-\d+-[a-z0-9]+$/);
    });
  });

  describe('End-to-end pairing flow', () => {
    it('should complete full pairing flow with bedroom template', async () => {
      // Setup devices in HomeyAPI
      const motionDevice = createMockDevice({
        id: 'motion-1',
        name: 'Bedroom Motion',
        capabilities: ['alarm_motion'],
      });
      const doorDevice = createMockDevice({
        id: 'door-1',
        name: 'Bedroom Door',
        capabilities: ['alarm_contact'],
      });

      mockHomeyApi.devices._addDevice('motion-1', motionDevice);
      mockHomeyApi.devices._addDevice('door-1', doorDevice);

      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      // 1. Select bedroom template
      const selectRoomType = mockSession.getHandler('select_room_type');
      const bedroomTimers: TimerValues = {
        t_enter: 30,
        t_clear: 1200,
        stalePirMinutes: 60,
        staleDoorMinutes: 60,
      };
      const templateResult = await selectRoomType(bedroomTimers);
      expect(templateResult).toEqual({ success: true });

      // 2. Fetch motion devices
      const getMotionDevices = mockSession.getHandler('get_motion_devices');
      const motionDevices = await getMotionDevices();
      expect(motionDevices).toHaveLength(1);

      // 3. Select trigger sensors
      const selectTrigger = mockSession.getHandler('select_trigger_sensors');
      await selectTrigger([{ deviceId: 'motion-1', capability: 'alarm_motion' }]);

      // 4. Fetch contact devices
      const getContactDevices = mockSession.getHandler('get_contact_devices');
      const contactDevices = await getContactDevices();
      expect(contactDevices).toHaveLength(1);

      // 5. Select reset sensors
      const selectReset = mockSession.getHandler('select_reset_sensors');
      await selectReset([{ deviceId: 'door-1', capability: 'alarm_contact' }]);

      // 6. Create device
      const listDevices = mockSession.getHandler('list_devices');
      const devices = await listDevices();

      // Verify final device configuration
      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('Wasp in a Box');

      const settings = devices[0].settings as Record<string, unknown>;

      // Verify template values applied
      expect(settings).toMatchObject({
        t_enter: 30,
        t_clear: 1200,
        stalePirMinutes: 60,
        staleDoorMinutes: 60,
      });

      // Verify sensors configured
      expect(JSON.parse(settings.triggerSensors as string)).toEqual([
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ]);
      expect(JSON.parse(settings.resetSensors as string)).toEqual([
        { deviceId: 'door-1', capability: 'alarm_contact' },
      ]);
    });

    it('should handle pairing flow with skip template and no reset sensors', async () => {
      const motionDevice = createMockDevice({
        id: 'motion-1',
        name: 'Living Room Motion',
        capabilities: ['alarm_motion'],
      });
      mockHomeyApi.devices._addDevice('motion-1', motionDevice);

      await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);

      // 1. Skip template selection
      const selectRoomType = mockSession.getHandler('select_room_type');
      await selectRoomType(null);

      // 2. Select trigger sensors
      const selectTrigger = mockSession.getHandler('select_trigger_sensors');
      await selectTrigger([{ deviceId: 'motion-1', capability: 'alarm_motion' }]);

      // 3. Skip reset sensors (empty array)
      const selectReset = mockSession.getHandler('select_reset_sensors');
      await selectReset([]);

      // 4. Create device
      const listDevices = mockSession.getHandler('list_devices');
      const devices = await listDevices();

      const settings = devices[0].settings as Record<string, unknown>;

      // No template values
      expect(settings.t_enter).toBeUndefined();

      // Sensors configured
      expect(JSON.parse(settings.triggerSensors as string)).toEqual([
        { deviceId: 'motion-1', capability: 'alarm_motion' },
      ]);
      expect(JSON.parse(settings.resetSensors as string)).toEqual([]);
    });
  });

  describe('Error handling', () => {
    describe('get_motion_devices error scenarios', () => {
      it('should provide friendly error when Homey API not available', async () => {
        // Remove HomeyAPI to simulate API not ready
        (driver.homey.app as unknown as { homeyApi?: unknown }).homeyApi = undefined;

        await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);
        const handler = mockSession.getHandler('get_motion_devices');

        await expect(handler()).rejects.toThrow('The app is still initializing');
        expect(driver.error).toHaveBeenCalledWith(
          expect.stringContaining('[PAIRING_002]'),
          expect.any(Error)
        );
      });

      it('should provide friendly error on timeout', async () => {
        mockHomeyApi.devices.getDevices = jest.fn().mockRejectedValue(
          new Error('Request timeout after 30 seconds')
        );

        await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);
        const handler = mockSession.getHandler('get_motion_devices');

        await expect(handler()).rejects.toThrow('Request timed out');
        expect(driver.error).toHaveBeenCalledWith(
          expect.stringContaining('[PAIRING_002]'),
          expect.any(Error)
        );
      });

      it('should provide friendly error on permission denied', async () => {
        mockHomeyApi.devices.getDevices = jest.fn().mockRejectedValue(
          new Error('Insufficient permissions to access devices')
        );

        await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);
        const handler = mockSession.getHandler('get_motion_devices');

        await expect(handler()).rejects.toThrow('Permission denied');
        expect(driver.error).toHaveBeenCalledWith(
          expect.stringContaining('[PAIRING_002]'),
          expect.any(Error)
        );
      });

      it('should re-throw unexpected errors with logging', async () => {
        const unexpectedError = new Error('Unexpected system error');
        mockHomeyApi.devices.getDevices = jest.fn().mockRejectedValue(unexpectedError);

        await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);
        const handler = mockSession.getHandler('get_motion_devices');

        await expect(handler()).rejects.toThrow('Unexpected system error');
        expect(driver.error).toHaveBeenCalledWith(
          expect.stringContaining('Unexpected error fetching motion devices'),
          unexpectedError
        );
      });
    });

    describe('get_contact_devices error scenarios', () => {
      it('should provide friendly error when Homey API not available', async () => {
        (driver.homey.app as unknown as { homeyApi?: unknown }).homeyApi = undefined;

        await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);
        const handler = mockSession.getHandler('get_contact_devices');

        await expect(handler()).rejects.toThrow('The app is still initializing');
        expect(driver.error).toHaveBeenCalledWith(
          expect.stringContaining('[PAIRING_003]'),
          expect.any(Error)
        );
      });

      it('should provide friendly error on timeout', async () => {
        mockHomeyApi.devices.getDevices = jest.fn().mockRejectedValue(
          new Error('Connection timeout')
        );

        await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);
        const handler = mockSession.getHandler('get_contact_devices');

        await expect(handler()).rejects.toThrow('Request timed out');
      });

      it('should provide friendly error on permission denied', async () => {
        mockHomeyApi.devices.getDevices = jest.fn().mockRejectedValue(
          new Error('permission error')
        );

        await driver.onPair(mockSession as unknown as Homey.Driver.PairSession);
        const handler = mockSession.getHandler('get_contact_devices');

        await expect(handler()).rejects.toThrow('Permission denied');
      });
    });
  });
});
