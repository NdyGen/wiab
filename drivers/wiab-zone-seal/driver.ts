import Homey from 'homey';
import { HomeyAPI, HomeyAPIDevice, PairingDeviceConfig } from '../../lib/types';

/**
 * Interface for WIABApp with HomeyAPI
 */
interface WIABApp extends Homey.App {
  homeyApi?: HomeyAPI;
}

/**
 * Driver class for the WIAB Zone Seal virtual device.
 *
 * This driver manages the pairing process for creating new Zone Seal device instances.
 * It follows the Homey SDK3 patterns for virtual device creation, where each paired
 * device is a virtual sensor that monitors multiple contact sensors (doors/windows) to
 * determine if a zone is sealed (all closed) or leaky (at least one open).
 *
 * The driver's primary responsibility is to handle the device pairing flow and return
 * properly configured device instances to the Homey system.
 *
 * Pairing Flow:
 * 1. User selects contact sensors (doors/windows) to monitor
 * 2. Driver creates device with contactSensors configuration
 * 3. Device initializes with selected sensors and begins monitoring
 *
 * @class WIABZoneSealDriver
 * @extends {Homey.Driver}
 */
class WIABZoneSealDriver extends Homey.Driver {
  /**
   * Initializes the WIAB Zone Seal driver.
   *
   * Called by the Homey framework when the driver is loaded. This method performs
   * any driver-level initialization tasks. Currently, it only logs the initialization
   * event, as device-specific logic is handled in the device class itself.
   *
   * @returns {Promise<void>}
   */
  async onInit(): Promise<void> {
    this.log('WIAB Zone Seal driver has been initialized');
  }

  /**
   * Type guard to check if device has zone property.
   *
   * @private
   * @param device - The device to check
   * @returns true if device has zone property
   */
  private hasZoneProperty(device: HomeyAPIDevice): device is HomeyAPIDevice & { zone: string } {
    return 'zone' in device && typeof (device as { zone?: unknown }).zone === 'string';
  }

  /**
   * Retrieves zone name for a device if available.
   *
   * @private
   * @param device - The device to get zone information for
   * @param homeyApi - The HomeyAPI instance
   * @returns Zone name or null if not available
   */
  private async getDeviceZoneName(
    device: HomeyAPIDevice,
    homeyApi: HomeyAPI
  ): Promise<string | null> {
    try {
      if (!this.hasZoneProperty(device)) {
        return null;
      }

      const zone = await homeyApi.zones.getZone({ id: device.zone });
      this.log(`Device ${device.name} is in zone: ${zone.name}`);
      return zone.name;
    } catch (error) {
      this.log(`Could not retrieve zone for device ${device.name}:`, error);
      return null;
    }
  }

  /**
   * Fetches all devices with alarm_contact capability from HomeyAPI.
   *
   * This method discovers all contact sensors (doors, windows, etc.) available
   * in the Homey system that can be monitored for zone seal status.
   *
   * @private
   * @returns {Promise<PairingDeviceConfig[]>} Array of contact sensor devices
   * @throws {Error} If HomeyAPI is not available
   */
  private async getContactDevices(): Promise<PairingDeviceConfig[]> {
    this.log('Fetching contact sensor devices');

    const app = this.homey.app as WIABApp;
    if (!app || !app.homeyApi) {
      throw new Error('Homey API not available');
    }

    const homeyApi = app.homeyApi as HomeyAPI;
    const devices = await homeyApi.devices.getDevices();
    this.log(`Found ${Object.keys(devices).length} total devices on Homey`);

    const contactDevices: PairingDeviceConfig[] = [];
    const capability = 'alarm_contact';

    for (const [deviceId, device] of Object.entries<HomeyAPIDevice>(devices)) {
      const capabilityNames = Object.keys(device.capabilitiesObj || {});

      if (capabilityNames.includes(capability)) {
        this.log(`Device ${device.name} (${deviceId}) has ${capability} capability`);

        // Fetch zone name if device has a zone assigned
        const zoneName = await this.getDeviceZoneName(device, homeyApi);

        contactDevices.push({
          deviceId: deviceId,
          name: device.name,
          zone: zoneName,
          capability: capability,
        });
      }
    }

    this.log(`Found ${contactDevices.length} contact sensor devices`);
    return contactDevices;
  }

  /**
   * Handles the device pairing process.
   *
   * This method is called when a user initiates pairing of a new Zone Seal device.
   * The pairing process guides users through selecting contact sensors to monitor
   * via custom HTML pages, then creates the device with the selected configuration.
   *
   * Pairing flow:
   * 1. select_contact_sensors - User selects door/window sensors to monitor
   * 2. list_devices - Creates device with selected sensor configuration
   * 3. add_devices - Adds the device to Homey
   *
   * @param session - The pairing session object provided by Homey
   * @returns {Promise<void>}
   */
  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    this.log('WIAB Zone Seal pairing session started');

    // Store selected sensors during pairing flow
    let contactSensors: PairingDeviceConfig[] = [];

    /**
     * Handler for fetching contact devices.
     * Returns all devices with alarm_contact capability.
     */
    session.setHandler('get_contact_devices', async (): Promise<PairingDeviceConfig[]> => {
      try {
        return await this.getContactDevices();
      } catch (error) {
        this.error('Error fetching contact devices:', error);

        if (error instanceof Error) {
          if (error.message === 'Homey API not available') {
            throw new Error(
              'The app is still initializing. Please wait a moment and try again.'
            );
          }

          if (error.message.includes('timeout')) {
            throw new Error(
              'Request timed out. Please check your network connection and try again.'
            );
          }

          if (error.message.includes('permission')) {
            throw new Error(
              'Permission denied. Please check app permissions in Homey settings.'
            );
          }
        }

        throw new Error('Failed to fetch contact sensors. Please try again.');
      }
    });

    /**
     * Handler for storing selected contact sensors.
     */
    session.setHandler(
      'select_contact_sensors',
      async (devices: PairingDeviceConfig[]): Promise<{ success: boolean }> => {
        this.log('Contact sensors selected:', devices);
        // Validate device structure before storing
        contactSensors = (devices || []).filter(
          (d) => d && d.deviceId && d.capability
        );
        this.log(`Validated ${contactSensors.length} contact sensors`);
        return { success: true };
      }
    );

    /**
     * Handler for device listing.
     * Creates a virtual device with the selected sensor configuration.
     */
    session.setHandler('list_devices', async (): Promise<Array<{ name: string; data: { id: string }; settings: Record<string, unknown> }>> => {
      this.log('Creating Zone Seal device with selected sensors');
      this.log(`Contact sensors: ${contactSensors.length}`);

      // Create device settings with sensor configuration
      const settings: Record<string, unknown> = {
        contactSensors: JSON.stringify(contactSensors),
        openDelaySeconds: 0, // Default: immediate transition to leaky
        closeDelaySeconds: 0, // Default: immediate transition to sealed
        staleContactMinutes: 30, // Default: 30 minutes stale timeout
      };

      // Return a single virtual device instance with configured sensors
      const devices = [
        {
          name: 'Zone Seal',
          data: {
            id: `zone-seal-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          },
          settings,
        },
      ];

      this.log('Returning Zone Seal device for pairing');
      return devices;
    });
  }
}

export default WIABZoneSealDriver;
module.exports = WIABZoneSealDriver;
