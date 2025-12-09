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
      // Get all drivers in the system
      const drivers = this.homey.drivers.getDrivers();

      // Iterate through each driver
      for (const driver of Object.values(drivers)) {
        try {
          // Get all devices for this driver
          const driverDevices = driver.getDevices();

          // Filter and map devices with the requested capability
          for (const device of driverDevices) {
            try {
              // Check if device has the requested capability
              if (device.hasCapability(capability)) {
                // Get zone name if available
                let zoneName: string | undefined;
                try {
                  // Type assertion needed as getZone may not be in all device types
                  const zone = await (device as any).getZone();
                  zoneName = zone?.name;
                } catch (error) {
                  // Zone information is optional, continue without it
                  this.log(
                    `Could not retrieve zone for device ${device.getName()}:`,
                    error
                  );
                }

                // Add device to results
                devices.push({
                  id: device.getData().id,
                  name: device.getName(),
                  class: device.getClass(),
                  capability: capability,
                  zoneName: zoneName,
                });
              }
            } catch (error) {
              // Log error but continue processing other devices
              this.error(
                `Error processing device ${device.getName ? device.getName() : 'unknown'}:`,
                error
              );
            }
          }
        } catch (error) {
          // Log error but continue processing other drivers
          this.error(`Error processing driver ${driver.id}:`, error);
        }
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
}

module.exports = WIABApp;
