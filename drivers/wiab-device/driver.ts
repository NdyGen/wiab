import Homey from 'homey';
import { HomeyAPI, HomeyAPIDevice, PairingDeviceConfig } from '../../lib/types';

/**
 * Driver class for the WIAB (Wasp in a Box) virtual occupancy sensor.
 *
 * This driver manages the pairing process for creating new WIAB device instances.
 * It follows the Homey SDK3 patterns for virtual device creation, where each
 * paired device is a virtual sensor that aggregates input from multiple physical
 * sensors to determine occupancy state.
 *
 * The driver's primary responsibility is to handle the device pairing flow and
 * return properly configured device instances to the Homey system.
 *
 * Sensor configuration is now handled through device settings after pairing,
 * allowing users to configure trigger and reset sensors after the device is added.
 */
class WIABDriver extends Homey.Driver {
  /**
   * Initializes the WIAB driver.
   *
   * Called by the Homey framework when the driver is loaded. This method performs
   * any driver-level initialization tasks. Currently, it only logs the initialization
   * event, as device-specific logic is handled in the device class itself.
   */
  async onInit(): Promise<void> {
    this.log('WIAB driver has been initialized');
  }

  /**
   * Fetches devices with a specific capability from HomeyAPI.
   *
   * This private helper method eliminates code duplication by providing a
   * reusable way to fetch and filter devices by capability type.
   *
   * @private
   * @param {string} capability - The capability to filter by (e.g., 'alarm_motion', 'alarm_contact')
   * @returns {Promise<PairingDeviceConfig[]>} Array of devices with the specified capability
   * @throws {Error} If HomeyAPI is not available
   */
  private async getDevicesWithCapability(capability: string): Promise<PairingDeviceConfig[]> {
    this.log(`Fetching devices with ${capability} capability`);

    const app = this.homey.app as any;
    if (!app || !app.homeyApi) {
      throw new Error('Homey API not available');
    }

    const homeyApi = app.homeyApi as HomeyAPI;
    const devices = await homeyApi.devices.getDevices();
    this.log(`Found ${Object.keys(devices).length} total devices on Homey`);

    const matchingDevices: PairingDeviceConfig[] = [];

    for (const [deviceId, device] of Object.entries<HomeyAPIDevice>(devices)) {
      const capabilityNames = Object.keys(device.capabilitiesObj || {});

      if (capabilityNames.includes(capability)) {
        this.log(`Device ${device.name} (${deviceId}) has ${capability} capability`);
        matchingDevices.push({
          deviceId: deviceId,
          name: device.name,
          zone: device.zoneName || null,
          capability: capability,
        });
      }
    }

    this.log(`Found ${matchingDevices.length} devices with ${capability} capability`);
    return matchingDevices;
  }

  /**
   * Handles the device pairing process.
   *
   * This method is called when a user initiates pairing of a new WIAB device.
   * The pairing process guides users through selecting trigger and reset sensors
   * via custom HTML pages, then creates the device with the selected configuration.
   *
   * Pairing flow:
   * 1. select_trigger_sensors - User selects motion sensors that trigger occupancy
   * 2. select_reset_sensors - User selects contact sensors that reset occupancy
   * 3. list_devices - Creates device with selected sensor configuration
   * 4. add_devices - Adds the device to Homey
   *
   * @param session - The pairing session object provided by Homey
   */
  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    this.log('WIAB pairing session started');

    // Store selected sensors during pairing flow
    let triggerSensors: any[] = [];
    let resetSensors: any[] = [];

    /**
     * Handler for fetching motion devices.
     * Returns all devices with alarm_motion capability.
     */
    session.setHandler('get_motion_devices', async () => {
      try {
        return await this.getDevicesWithCapability('alarm_motion');
      } catch (error) {
        this.error('Error fetching motion devices:', error);
        throw new Error('Failed to fetch motion devices');
      }
    });

    /**
     * Handler for fetching contact devices.
     * Returns all devices with alarm_contact capability.
     */
    session.setHandler('get_contact_devices', async () => {
      try {
        return await this.getDevicesWithCapability('alarm_contact');
      } catch (error) {
        this.error('Error fetching contact devices:', error);
        throw new Error('Failed to fetch contact devices');
      }
    });

    /**
     * Handler for storing selected trigger sensors.
     */
    session.setHandler('select_trigger_sensors', async (devices: any[]) => {
      this.log('Trigger sensors selected:', devices);
      triggerSensors = devices || [];
      return { success: true };
    });

    /**
     * Handler for storing selected reset sensors.
     */
    session.setHandler('select_reset_sensors', async (devices: any[]) => {
      this.log('Reset sensors selected:', devices);
      resetSensors = devices || [];
      return { success: true };
    });

    /**
     * Handler for device listing.
     * Creates a virtual device with the selected sensor configuration.
     */
    session.setHandler('list_devices', async () => {
      this.log('Creating WIAB device with selected sensors');
      this.log(`Trigger sensors: ${triggerSensors.length}, Reset sensors: ${resetSensors.length}`);

      // Return a single virtual device instance with configured sensors
      const devices = [
        {
          name: 'Wasp in a Box',
          data: {
            id: `wiab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          },
          settings: {
            triggerSensors: JSON.stringify(triggerSensors),
            resetSensors: JSON.stringify(resetSensors),
          },
        },
      ];

      this.log('Returning WIAB device for pairing');
      return devices;
    });
  }
}

module.exports = WIABDriver;
