/**
 * DeviceRegistry - Device discovery and capability filtering
 *
 * This helper class provides convenient methods for discovering and filtering
 * Homey devices based on their capabilities. It's particularly useful for
 * building sensor selection interfaces where users need to choose from
 * available motion sensors, contact sensors, or other device types.
 *
 * The registry scans all installed drivers and their devices, making it easy
 * to find devices that support specific capabilities.
 */

import { DeviceInfo } from './types';

/**
 * DeviceRegistry class for device discovery and filtering
 *
 * @class DeviceRegistry
 * @example
 * ```typescript
 * const registry = new DeviceRegistry(homey);
 * const motionSensors = registry.getMotionSensors();
 * const contactSensors = registry.getContactSensors();
 * const customDevices = registry.getDevicesWithCapability('measure_temperature');
 * ```
 */
export class DeviceRegistry {
  private homey: any;

  /**
   * Creates a new DeviceRegistry instance
   *
   * @param homey - The Homey instance for device access
   */
  constructor(homey: any) {
    this.homey = homey;
  }

  /**
   * Retrieves all devices that support a specific capability
   *
   * Scans all drivers and their devices, filtering for those that have
   * the specified capability. This is useful for building dynamic device
   * selection lists in the app's configuration interface.
   *
   * @public
   * @param {string} capability - The capability to filter by (e.g., 'alarm_motion', 'alarm_contact')
   * @returns {DeviceInfo[]} Array of device information objects for matching devices
   * @throws {Error} If there's an error accessing the device list (logged but not thrown)
   * @example
   * ```typescript
   * // Get all devices with motion detection capability
   * const motionDevices = registry.getDevicesWithCapability('alarm_motion');
   * console.log(`Found ${motionDevices.length} motion sensors`);
   * ```
   */
  public getDevicesWithCapability(capability: string): DeviceInfo[] {
    const devicesWithCapability: DeviceInfo[] = [];

    try {
      const drivers = this.homey.drivers.getDrivers();

      for (const [driverName, driver] of Object.entries(drivers)) {
        try {
          const devices = (driver as any).getDevices();

          for (const device of devices) {
            try {
              if (device.hasCapability(capability)) {
                const deviceData = device.getData();
                const capabilities = device.getCapabilities();

                devicesWithCapability.push({
                  id: deviceData.id,
                  name: device.getName(),
                  driverName: driverName,
                  capabilities: capabilities,
                });
              }
            } catch (deviceError) {
              // Log error but continue processing other devices
              this.homey.error(`Error processing device ${device.getName()}:`, deviceError);
            }
          }
        } catch (driverError) {
          // Log error but continue processing other drivers
          this.homey.error(`Error accessing devices for driver ${driverName}:`, driverError);
        }
      }

      this.homey.log(`Found ${devicesWithCapability.length} devices with capability '${capability}'`);
    } catch (error) {
      this.homey.error('Error retrieving devices:', error);
    }

    return devicesWithCapability;
  }

  /**
   * Retrieves all motion sensors in the Homey system
   *
   * Convenience method that filters for devices with the 'alarm_motion' capability.
   * Motion sensors are commonly used as trigger sensors in the WIAB app to detect
   * presence and activity.
   *
   * @public
   * @returns {DeviceInfo[]} Array of device information objects for motion sensors
   * @example
   * ```typescript
   * const motionSensors = registry.getMotionSensors();
   * motionSensors.forEach(sensor => {
   *   console.log(`Motion sensor: ${sensor.name} (${sensor.id})`);
   * });
   * ```
   */
  public getMotionSensors(): DeviceInfo[] {
    return this.getDevicesWithCapability('alarm_motion');
  }

  /**
   * Retrieves all contact sensors in the Homey system
   *
   * Convenience method that filters for devices with the 'alarm_contact' capability.
   * Contact sensors (door/window sensors) are commonly used as both trigger and
   * reset sensors in the WIAB app, depending on the desired behavior.
   *
   * @public
   * @returns {DeviceInfo[]} Array of device information objects for contact sensors
   * @example
   * ```typescript
   * const contactSensors = registry.getContactSensors();
   * contactSensors.forEach(sensor => {
   *   console.log(`Contact sensor: ${sensor.name} (${sensor.id})`);
   * });
   * ```
   */
  public getContactSensors(): DeviceInfo[] {
    return this.getDevicesWithCapability('alarm_contact');
  }

  /**
   * Retrieves detailed information for a specific device by ID
   *
   * Searches for a device across all drivers and returns its detailed information.
   * Returns null if the device is not found.
   *
   * @public
   * @param {string} deviceId - The unique identifier of the device
   * @returns {DeviceInfo | null} Device information or null if not found
   * @example
   * ```typescript
   * const deviceInfo = registry.getDeviceById('motion-sensor-123');
   * if (deviceInfo) {
   *   console.log(`Device: ${deviceInfo.name}`);
   *   console.log(`Capabilities: ${deviceInfo.capabilities.join(', ')}`);
   * }
   * ```
   */
  public getDeviceById(deviceId: string): DeviceInfo | null {
    try {
      const drivers = this.homey.drivers.getDrivers();

      for (const [driverName, driver] of Object.entries(drivers)) {
        try {
          const devices = (driver as any).getDevices();
          const device = devices.find((d: any) => d.getData().id === deviceId);

          if (device) {
            return {
              id: deviceId,
              name: device.getName(),
              driverName: driverName,
              capabilities: device.getCapabilities(),
            };
          }
        } catch (driverError) {
          this.homey.error(`Error accessing driver ${driverName}:`, driverError);
        }
      }

      this.homey.log(`Device not found: ${deviceId}`);
      return null;
    } catch (error) {
      this.homey.error(`Error finding device ${deviceId}:`, error);
      return null;
    }
  }

  /**
   * Gets all available devices in the Homey system
   *
   * Returns information about all devices regardless of capabilities.
   * Useful for debugging or building comprehensive device lists.
   *
   * @public
   * @returns {DeviceInfo[]} Array of all device information objects
   * @example
   * ```typescript
   * const allDevices = registry.getAllDevices();
   * console.log(`Total devices: ${allDevices.length}`);
   * ```
   */
  public getAllDevices(): DeviceInfo[] {
    const allDevices: DeviceInfo[] = [];

    try {
      const drivers = this.homey.drivers.getDrivers();

      for (const [driverName, driver] of Object.entries(drivers)) {
        try {
          const devices = (driver as any).getDevices();

          for (const device of devices) {
            try {
              const deviceData = device.getData();
              const capabilities = device.getCapabilities();

              allDevices.push({
                id: deviceData.id,
                name: device.getName(),
                driverName: driverName,
                capabilities: capabilities,
              });
            } catch (deviceError) {
              this.homey.error(`Error processing device:`, deviceError);
            }
          }
        } catch (driverError) {
          this.homey.error(`Error accessing driver ${driverName}:`, driverError);
        }
      }

      this.homey.log(`Found ${allDevices.length} total devices`);
    } catch (error) {
      this.homey.error('Error retrieving all devices:', error);
    }

    return allDevices;
  }
}
