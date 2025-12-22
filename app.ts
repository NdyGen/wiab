import Homey from 'homey';
import { HomeyAPI } from 'homey-api';
import { DeviceResponse } from './lib/types';

/**
 * Main application coordinator for the WIAB (Wasp in a Box) Homey app.
 *
 * This class serves as the entry point and coordinator for the application.
 * It provides API endpoints for the device settings page and coordinates access
 * to device information across the Homey system.
 *
 * The app's responsibilities include:
 * - Initializing the application
 * - Initializing the HomeyAPI client for accessing all devices
 * - Providing API methods for device discovery
 * - Coordinating between the API layer and device layer
 * - Centralized logging for application lifecycle events
 */
class WIABApp extends Homey.App {
  homeyApi!: HomeyAPI;

  /**
   * Initializes the WIAB application.
   *
   * Called by the Homey framework when the app is loaded. This method is responsible
   * for any app-level initialization tasks including setting up the HomeyAPI client
   * that allows access to all devices across all apps on the Homey system.
   */
  async onInit(): Promise<void> {
    this.log('WIAB app initializing...');

    try {
      // Initialize HomeyAPI client to access all devices on Homey
      this.homeyApi = await HomeyAPI.createAppAPI({
        homey: this.homey,
      });
      this.log('HomeyAPI client initialized successfully');
    } catch (error) {
      this.error('Failed to initialize HomeyAPI client:', error);
      throw error;
    }

    this.log('WIAB app has been initialized');
  }

  /**
   * Retrieves all devices in the Homey system that have a specific capability.
   *
   * This method is called by the API endpoints (api.js) to provide device lists
   * to the settings page. It scans through all drivers and their devices to find
   * those that support the requested capability.
   *
   * The method performs the following steps:
   * 1. Retrieves all drivers from the Homey system
   * 2. For each driver, gets all associated devices
   * 3. Filters devices by the requested capability
   * 4. Formats device information for API response
   * 5. Includes zone information if available
   *
   * This method is forgiving of errors - if a device cannot be processed
   * (e.g., missing zone information or device properties), it continues
   * processing other devices rather than failing entirely. This ensures
   * that the settings page can still display available devices even if
   * some devices have incomplete information.
   *
   * Error Handling:
   * - Logs warnings for devices that cannot retrieve zone information
   * - Logs errors for devices that fail to process but continues with others
   * - Logs errors for drivers that fail to process but continues with others
   * - Throws only if there are critical errors accessing the Homey API
   *
   * @param capability - The capability to filter by (e.g., 'alarm_motion', 'alarm_contact')
   * @returns Promise resolving to array of device information objects
   * @throws May throw if there are critical errors accessing the Homey API
   *
   * @example
   * // Get all motion sensors
   * const motionDevices = await this.getDevicesWithCapability('alarm_motion');
   *
   * @example
   * // Get all contact sensors
   * const contactDevices = await this.getDevicesWithCapability('alarm_contact');
   */
  async getDevicesWithCapability(
    capability: string
  ): Promise<DeviceResponse[]> {
    const devices: DeviceResponse[] = [];

    try {
      const drivers = this.homey.drivers.getDrivers();

      for (const driver of Object.values(drivers)) {
        const driverDevices = this.getDevicesFromDriver(driver);
        const matchingDevices = await this.filterDevicesByCapability(
          driverDevices,
          capability
        );
        devices.push(...matchingDevices);
      }
    } catch (error) {
      this.error('Error retrieving devices with capability:', error);
      throw error;
    }

    this.log(
      `Found ${devices.length} devices with capability ${capability}`
    );
    return devices;
  }

  /**
   * Retrieves all devices from a driver.
   *
   * @param driver - The driver to retrieve devices from
   * @returns Array of devices, or empty array if error occurs
   */
  private getDevicesFromDriver(driver: Homey.Driver): Homey.Device[] {
    try {
      return driver.getDevices();
    } catch (error) {
      this.error(`Error accessing devices for driver ${driver.id}:`, error);
      return [];
    }
  }

  /**
   * Filters devices by capability and maps them to DeviceResponse format.
   *
   * @param devices - Array of devices to filter
   * @param capability - The capability to filter by
   * @returns Array of DeviceResponse objects for matching devices
   */
  private async filterDevicesByCapability(
    devices: Homey.Device[],
    capability: string
  ): Promise<DeviceResponse[]> {
    const matchingDevices: DeviceResponse[] = [];

    for (const device of devices) {
      try {
        if (!device.hasCapability(capability)) {
          continue;
        }

        const zoneName = await this.getDeviceZoneName(device);

        matchingDevices.push({
          id: device.getData().id,
          name: device.getName(),
          class: device.getClass(),
          capability: capability,
          zoneName: zoneName,
        });
      } catch (error) {
        this.error(
          `Error processing device ${device.getName ? device.getName() : 'unknown'}:`,
          error
        );
      }
    }

    return matchingDevices;
  }

  /**
   * Retrieves the zone name for a device.
   *
   * @param device - The device to get zone information for
   * @returns Zone name or undefined if not available
   */
  private async getDeviceZoneName(device: Homey.Device): Promise<string | undefined> {
    try {
      if (!this.hasGetZoneMethod(device)) {
        return undefined;
      }

      const zone = await device.getZone();
      return zone?.name;
    } catch (error) {
      this.log(
        `Could not retrieve zone for device ${device.getName()}:`,
        error
      );
      return undefined;
    }
  }

  /**
   * Type guard to check if device has getZone method.
   *
   * @param device - The device to check
   * @returns true if device has getZone method
   */
  private hasGetZoneMethod(
    device: Homey.Device
  ): device is Homey.Device & { getZone: () => Promise<{ name?: string }> } {
    return 'getZone' in device && typeof (device as { getZone?: unknown }).getZone === 'function';
  }
}

module.exports = WIABApp;
