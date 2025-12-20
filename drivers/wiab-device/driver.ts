import Homey from 'homey';
import { HomeyAPI, HomeyAPIDevice, PairingDeviceConfig } from '../../lib/types';
import { TimerValues } from '../../lib/RoomTemplates';

/**
 * Interface for WIABApp with HomeyAPI
 */
interface WIABApp extends Homey.App {
  homeyApi?: HomeyAPI;
}

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

    const app = this.homey.app as WIABApp;
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

        // Fetch zone name if device has a zone assigned
        let zoneName: string | null = null;
        try {
          const deviceWithZone = device as HomeyAPIDevice & { zone?: string };
          if (deviceWithZone.zone) {
            const zone = await homeyApi.zones.getZone({ id: deviceWithZone.zone });
            zoneName = zone.name;
            this.log(`Device ${device.name} is in zone: ${zoneName}`);
          }
        } catch (error) {
          // Zone information is optional, continue without it
          this.log(`Could not retrieve zone for device ${device.name}:`, error);
        }

        matchingDevices.push({
          deviceId: deviceId,
          name: device.name,
          zone: zoneName,
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

    // Store selected sensors and template timers during pairing flow
    let triggerSensors: PairingDeviceConfig[] = [];
    let resetSensors: PairingDeviceConfig[] = [];
    let pairingTimers: TimerValues | null = null;

    /**
     * Handler for room template selection.
     * Stores timer values from the selected template.
     * If null is passed (user skipped), default values will be used.
     */
    session.setHandler('select_room_type', async (timerValues: TimerValues | null) => {
      if (timerValues) {
        this.log('Room template selected with timers:', timerValues);
        pairingTimers = timerValues;
      } else {
        this.log('Room template selection skipped, using default timer values');
        pairingTimers = null;
      }
      return { success: true };
    });

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
    session.setHandler('select_trigger_sensors', async (devices: PairingDeviceConfig[]) => {
      this.log('Trigger sensors selected:', devices);
      triggerSensors = devices || [];
      return { success: true };
    });

    /**
     * Handler for storing selected reset sensors.
     */
    session.setHandler('select_reset_sensors', async (devices: PairingDeviceConfig[]) => {
      this.log('Reset sensors selected:', devices);
      resetSensors = devices || [];
      return { success: true };
    });

    /**
     * Handler for device listing.
     * Creates a virtual device with the selected sensor configuration.
     * Applies room template timer values if a template was selected.
     */
    session.setHandler('list_devices', async () => {
      this.log('Creating WIAB device with selected sensors');
      this.log(`Trigger sensors: ${triggerSensors.length}, Reset sensors: ${resetSensors.length}`);

      // Base settings with sensor configuration
      const settings: Record<string, unknown> = {
        triggerSensors: JSON.stringify(triggerSensors),
        resetSensors: JSON.stringify(resetSensors),
      };

      // Apply template timer values if a template was selected
      if (pairingTimers) {
        settings.t_enter = pairingTimers.t_enter;
        settings.t_clear = pairingTimers.t_clear;
        settings.stalePirMinutes = pairingTimers.stalePirMinutes;
        settings.staleDoorMinutes = pairingTimers.staleDoorMinutes;
        this.log('Applying template timer values:', pairingTimers);
      } else {
        this.log('No template selected, device will use default timer values');
      }

      // Return a single virtual device instance with configured sensors and timers
      const devices = [
        {
          name: 'Wasp in a Box',
          data: {
            id: `wiab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          },
          settings,
        },
      ];

      this.log('Returning WIAB device for pairing');
      return devices;
    });
  }
}

module.exports = WIABDriver;
