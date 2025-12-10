/**
 * Unit tests for DeviceRegistry class
 *
 * Tests cover:
 * - getDevicesWithCapability filters correctly
 * - getMotionSensors returns alarm_motion devices
 * - getContactSensors returns alarm_contact devices
 * - handles empty driver list gracefully
 * - handles errors in device enumeration
 * - getDeviceById finds devices correctly
 * - getAllDevices returns all devices
 */

import { DeviceRegistry } from '../../lib/DeviceRegistry';
import {
  createMockHomey,
  createMockDevice,
  createMockDriver,
} from '../setup';

describe('DeviceRegistry', () => {
  let homey: ReturnType<typeof createMockHomey>;
  let registry: DeviceRegistry;

  beforeEach(() => {
    homey = createMockHomey();
    registry = new DeviceRegistry(homey);
  });

  describe('getDevicesWithCapability', () => {
    /**
     * Test that getDevicesWithCapability correctly filters devices
     * by the specified capability
     */
    it('should return devices with specified capability', () => {
      // Setup devices with various capabilities
      const motionSensor1 = createMockDevice({
        id: 'motion-1',
        name: 'Living Room Motion',
        capabilities: ['alarm_motion'],
      });

      const motionSensor2 = createMockDevice({
        id: 'motion-2',
        name: 'Bedroom Motion',
        capabilities: ['alarm_motion'],
      });

      const tempSensor = createMockDevice({
        id: 'temp-1',
        name: 'Temperature Sensor',
        capabilities: ['measure_temperature'],
      });

      const driver = createMockDriver([
        motionSensor1,
        motionSensor2,
        tempSensor,
      ]);
      homey.drivers._addDriver('sensor-driver', driver);

      // Query for motion sensors
      const devices = registry.getDevicesWithCapability('alarm_motion');

      expect(devices).toHaveLength(2);
      expect(devices[0].id).toBe('motion-1');
      expect(devices[0].name).toBe('Living Room Motion');
      expect(devices[0].driverName).toBe('sensor-driver');
      expect(devices[0].capabilities).toContain('alarm_motion');
      expect(devices[1].id).toBe('motion-2');
    });

    /**
     * Test that devices without the capability are excluded
     */
    it('should exclude devices without the capability', () => {
      const motionSensor = createMockDevice({
        id: 'motion-1',
        capabilities: ['alarm_motion'],
      });

      const contactSensor = createMockDevice({
        id: 'contact-1',
        capabilities: ['alarm_contact'],
      });

      const tempSensor = createMockDevice({
        id: 'temp-1',
        capabilities: ['measure_temperature'],
      });

      const driver = createMockDriver([
        motionSensor,
        contactSensor,
        tempSensor,
      ]);
      homey.drivers._addDriver('driver', driver);

      const devices = registry.getDevicesWithCapability('alarm_contact');

      expect(devices).toHaveLength(1);
      expect(devices[0].id).toBe('contact-1');
    });

    /**
     * Test searching across multiple drivers
     */
    it('should find devices across multiple drivers', () => {
      const motionDevice1 = createMockDevice({
        id: 'motion-1',
        capabilities: ['alarm_motion'],
      });

      const motionDevice2 = createMockDevice({
        id: 'motion-2',
        capabilities: ['alarm_motion'],
      });

      const driver1 = createMockDriver([motionDevice1]);
      const driver2 = createMockDriver([motionDevice2]);

      homey.drivers._addDriver('driver-1', driver1);
      homey.drivers._addDriver('driver-2', driver2);

      const devices = registry.getDevicesWithCapability('alarm_motion');

      expect(devices).toHaveLength(2);
      expect(devices.map((d) => d.id)).toEqual(['motion-1', 'motion-2']);
    });

    /**
     * Test handling empty driver list gracefully
     */
    it('should handle empty driver list gracefully', () => {
      // No drivers registered
      const devices = registry.getDevicesWithCapability('alarm_motion');

      expect(devices).toEqual([]);
      expect(homey.log).toHaveBeenCalledWith(
        "Found 0 devices with capability 'alarm_motion'"
      );
    });

    /**
     * Test handling drivers with no devices
     */
    it('should handle drivers with no devices', () => {
      const emptyDriver = createMockDriver([]);
      homey.drivers._addDriver('empty-driver', emptyDriver);

      const devices = registry.getDevicesWithCapability('alarm_motion');

      expect(devices).toEqual([]);
    });

    /**
     * Test handling devices with multiple capabilities
     */
    it('should include multi-capability devices', () => {
      const multiSensor = createMockDevice({
        id: 'multi-1',
        name: 'Multi Sensor',
        capabilities: ['alarm_motion', 'alarm_contact', 'measure_temperature'],
      });

      const driver = createMockDriver([multiSensor]);
      homey.drivers._addDriver('driver', driver);

      // Should appear in motion sensor query
      const motionDevices = registry.getDevicesWithCapability('alarm_motion');
      expect(motionDevices).toHaveLength(1);
      expect(motionDevices[0].id).toBe('multi-1');

      // Should also appear in contact sensor query
      const contactDevices =
        registry.getDevicesWithCapability('alarm_contact');
      expect(contactDevices).toHaveLength(1);
      expect(contactDevices[0].id).toBe('multi-1');
    });
  });

  describe('getMotionSensors', () => {
    /**
     * Test that getMotionSensors returns devices with alarm_motion capability
     */
    it('should return all motion sensors', () => {
      const motionSensor1 = createMockDevice({
        id: 'motion-1',
        name: 'Motion 1',
        capabilities: ['alarm_motion'],
      });

      const motionSensor2 = createMockDevice({
        id: 'motion-2',
        name: 'Motion 2',
        capabilities: ['alarm_motion'],
      });

      const contactSensor = createMockDevice({
        id: 'contact-1',
        name: 'Contact 1',
        capabilities: ['alarm_contact'],
      });

      const driver = createMockDriver([
        motionSensor1,
        motionSensor2,
        contactSensor,
      ]);
      homey.drivers._addDriver('driver', driver);

      const motionSensors = registry.getMotionSensors();

      expect(motionSensors).toHaveLength(2);
      expect(motionSensors.map((d) => d.id)).toEqual(['motion-1', 'motion-2']);
      expect(motionSensors.every((d) => d.capabilities.includes('alarm_motion'))).toBe(true);
    });

    /**
     * Test that getMotionSensors returns empty array when no motion sensors exist
     */
    it('should return empty array when no motion sensors exist', () => {
      const contactSensor = createMockDevice({
        id: 'contact-1',
        capabilities: ['alarm_contact'],
      });

      const driver = createMockDriver([contactSensor]);
      homey.drivers._addDriver('driver', driver);

      const motionSensors = registry.getMotionSensors();

      expect(motionSensors).toEqual([]);
    });
  });

  describe('getContactSensors', () => {
    /**
     * Test that getContactSensors returns devices with alarm_contact capability
     */
    it('should return all contact sensors', () => {
      const contactSensor1 = createMockDevice({
        id: 'contact-1',
        name: 'Door Sensor',
        capabilities: ['alarm_contact'],
      });

      const contactSensor2 = createMockDevice({
        id: 'contact-2',
        name: 'Window Sensor',
        capabilities: ['alarm_contact'],
      });

      const motionSensor = createMockDevice({
        id: 'motion-1',
        name: 'Motion Sensor',
        capabilities: ['alarm_motion'],
      });

      const driver = createMockDriver([
        contactSensor1,
        contactSensor2,
        motionSensor,
      ]);
      homey.drivers._addDriver('driver', driver);

      const contactSensors = registry.getContactSensors();

      expect(contactSensors).toHaveLength(2);
      expect(contactSensors.map((d) => d.id)).toEqual([
        'contact-1',
        'contact-2',
      ]);
      expect(contactSensors.every((d) => d.capabilities.includes('alarm_contact'))).toBe(true);
    });

    /**
     * Test that getContactSensors returns empty array when no contact sensors exist
     */
    it('should return empty array when no contact sensors exist', () => {
      const motionSensor = createMockDevice({
        id: 'motion-1',
        capabilities: ['alarm_motion'],
      });

      const driver = createMockDriver([motionSensor]);
      homey.drivers._addDriver('driver', driver);

      const contactSensors = registry.getContactSensors();

      expect(contactSensors).toEqual([]);
    });
  });

  describe('getDeviceById', () => {
    /**
     * Test finding a device by ID
     */
    it('should find device by ID', () => {
      const device1 = createMockDevice({
        id: 'device-1',
        name: 'Device 1',
        capabilities: ['alarm_motion'],
      });

      const device2 = createMockDevice({
        id: 'device-2',
        name: 'Device 2',
        capabilities: ['alarm_contact'],
      });

      const driver = createMockDriver([device1, device2]);
      homey.drivers._addDriver('driver', driver);

      const foundDevice = registry.getDeviceById('device-2');

      expect(foundDevice).not.toBeNull();
      expect(foundDevice!.id).toBe('device-2');
      expect(foundDevice!.name).toBe('Device 2');
      expect(foundDevice!.driverName).toBe('driver');
      expect(foundDevice!.capabilities).toContain('alarm_contact');
    });

    /**
     * Test finding device across multiple drivers
     */
    it('should find device across multiple drivers', () => {
      const device1 = createMockDevice({
        id: 'device-1',
        name: 'Device 1',
        capabilities: ['alarm_motion'],
      });

      const device2 = createMockDevice({
        id: 'device-2',
        name: 'Device 2',
        capabilities: ['alarm_contact'],
      });

      const driver1 = createMockDriver([device1]);
      const driver2 = createMockDriver([device2]);

      homey.drivers._addDriver('driver-1', driver1);
      homey.drivers._addDriver('driver-2', driver2);

      const foundDevice = registry.getDeviceById('device-2');

      expect(foundDevice).not.toBeNull();
      expect(foundDevice!.id).toBe('device-2');
      expect(foundDevice!.driverName).toBe('driver-2');
    });

    /**
     * Test returning null when device not found
     */
    it('should return null when device not found', () => {
      const device = createMockDevice({
        id: 'device-1',
        capabilities: ['alarm_motion'],
      });

      const driver = createMockDriver([device]);
      homey.drivers._addDriver('driver', driver);

      const foundDevice = registry.getDeviceById('non-existent');

      expect(foundDevice).toBeNull();
      expect(homey.log).toHaveBeenCalledWith(
        'Device not found: non-existent'
      );
    });

    /**
     * Test handling empty driver list
     */
    it('should return null when no drivers exist', () => {
      const foundDevice = registry.getDeviceById('device-1');

      expect(foundDevice).toBeNull();
    });
  });

  describe('getAllDevices', () => {
    /**
     * Test getting all devices regardless of capabilities
     */
    it('should return all devices', () => {
      const device1 = createMockDevice({
        id: 'device-1',
        name: 'Motion Sensor',
        capabilities: ['alarm_motion'],
      });

      const device2 = createMockDevice({
        id: 'device-2',
        name: 'Contact Sensor',
        capabilities: ['alarm_contact'],
      });

      const device3 = createMockDevice({
        id: 'device-3',
        name: 'Temperature Sensor',
        capabilities: ['measure_temperature'],
      });

      const driver1 = createMockDriver([device1, device2]);
      const driver2 = createMockDriver([device3]);

      homey.drivers._addDriver('driver-1', driver1);
      homey.drivers._addDriver('driver-2', driver2);

      const allDevices = registry.getAllDevices();

      expect(allDevices).toHaveLength(3);
      expect(allDevices.map((d) => d.id).sort()).toEqual([
        'device-1',
        'device-2',
        'device-3',
      ]);
      expect(homey.log).toHaveBeenCalledWith('Found 3 total devices');
    });

    /**
     * Test returning empty array when no devices exist
     */
    it('should return empty array when no devices exist', () => {
      const emptyDriver = createMockDriver([]);
      homey.drivers._addDriver('driver', emptyDriver);

      const allDevices = registry.getAllDevices();

      expect(allDevices).toEqual([]);
      expect(homey.log).toHaveBeenCalledWith('Found 0 total devices');
    });

    /**
     * Test that device info includes all expected fields
     */
    it('should include complete device information', () => {
      const device = createMockDevice({
        id: 'device-1',
        name: 'Test Device',
        capabilities: ['alarm_motion', 'measure_temperature'],
      });

      const driver = createMockDriver([device]);
      homey.drivers._addDriver('test-driver', driver);

      const allDevices = registry.getAllDevices();

      expect(allDevices).toHaveLength(1);
      const deviceInfo = allDevices[0];
      expect(deviceInfo.id).toBe('device-1');
      expect(deviceInfo.name).toBe('Test Device');
      expect(deviceInfo.driverName).toBe('test-driver');
      expect(deviceInfo.capabilities).toEqual([
        'alarm_motion',
        'measure_temperature',
      ]);
    });
  });

  describe('Error handling', () => {
    /**
     * Test graceful handling of device enumeration errors
     */
    it('should handle device errors gracefully and continue', () => {
      const goodDevice = createMockDevice({
        id: 'good-device',
        name: 'Good Device',
        capabilities: ['alarm_motion'],
      });

      const badDevice = createMockDevice({
        id: 'bad-device',
        name: 'Bad Device',
        capabilities: ['alarm_motion'],
      });

      // Make bad device throw error on hasCapability
      badDevice.hasCapability.mockImplementation(() => {
        throw new Error('Device malfunction');
      });

      const driver = createMockDriver([goodDevice, badDevice]);
      homey.drivers._addDriver('driver', driver);

      const devices = registry.getDevicesWithCapability('alarm_motion');

      // Should return the good device despite error in bad device
      expect(devices).toHaveLength(1);
      expect(devices[0].id).toBe('good-device');
      expect(homey.error).toHaveBeenCalledWith(
        expect.stringContaining('Error processing device'),
        expect.any(Error)
      );
    });

    /**
     * Test handling of driver access errors
     */
    it('should handle driver errors gracefully', () => {
      const goodDevice = createMockDevice({
        id: 'good-device',
        capabilities: ['alarm_motion'],
      });

      const goodDriver = createMockDriver([goodDevice]);
      const badDriver = createMockDriver([]);

      // Make bad driver throw error on getDevices
      badDriver.getDevices.mockImplementation(() => {
        throw new Error('Driver malfunction');
      });

      homey.drivers._addDriver('good-driver', goodDriver);
      homey.drivers._addDriver('bad-driver', badDriver);

      const devices = registry.getDevicesWithCapability('alarm_motion');

      // Should return devices from good driver despite error in bad driver
      expect(devices).toHaveLength(1);
      expect(devices[0].id).toBe('good-device');
      expect(homey.error).toHaveBeenCalledWith(
        expect.stringContaining('Error accessing devices for driver'),
        expect.any(Error)
      );
    });

    /**
     * Test handling of getDrivers error
     */
    it('should handle getDrivers error', () => {
      homey.drivers.getDrivers.mockImplementation(() => {
        throw new Error('Cannot access drivers');
      });

      const devices = registry.getDevicesWithCapability('alarm_motion');

      expect(devices).toEqual([]);
      expect(homey.error).toHaveBeenCalledWith(
        'Error retrieving devices:',
        expect.any(Error)
      );
    });

    /**
     * Test error handling in getDeviceById
     */
    it('should handle errors in getDeviceById', () => {
      const device = createMockDevice({
        id: 'device-1',
        capabilities: ['alarm_motion'],
      });

      const driver = createMockDriver([device]);

      // Make getData throw error
      device.getData.mockImplementation(() => {
        throw new Error('Device data error');
      });

      homey.drivers._addDriver('driver', driver);

      const result = registry.getDeviceById('device-1');

      expect(result).toBeNull();
      expect(homey.error).toHaveBeenCalledWith(
        expect.stringContaining('Error accessing driver'),
        expect.any(Error)
      );
    });

    /**
     * Test error handling in getAllDevices
     */
    it('should handle errors in getAllDevices', () => {
      const goodDevice = createMockDevice({
        id: 'good-device',
        name: 'Good Device',
        capabilities: ['alarm_motion'],
      });

      const badDevice = createMockDevice({
        id: 'bad-device',
        name: 'Bad Device',
        capabilities: ['alarm_contact'],
      });

      // Make bad device throw error on getData
      badDevice.getData.mockImplementation(() => {
        throw new Error('Cannot get data');
      });

      const driver = createMockDriver([goodDevice, badDevice]);
      homey.drivers._addDriver('driver', driver);

      const allDevices = registry.getAllDevices();

      // Should return good device despite error in bad device
      expect(allDevices).toHaveLength(1);
      expect(allDevices[0].id).toBe('good-device');
      expect(homey.error).toHaveBeenCalledWith(
        'Error processing device:',
        expect.any(Error)
      );
    });
  });
});
