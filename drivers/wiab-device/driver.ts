import Homey from 'homey';
import { HomeyAPI, HomeyAPIDevice, PairingDeviceConfig } from '../../lib/types';
import { TimerValues } from '../../lib/RoomTemplates';
import { PairingErrorId } from '../../constants/errorIds';

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
   * Validates timer values from room template selection.
   * Ensures all required properties exist and are within acceptable ranges.
   *
   * @private
   * @param {unknown} timers - The timer values to validate
   * @returns {boolean} True if valid, false otherwise
   */
  private isValidTimerValues(timers: unknown): timers is TimerValues {
    if (!timers || typeof timers !== 'object') {
      return false;
    }

    const t = timers as Record<string, unknown>;

    // Check all required properties exist and are numbers
    if (typeof t.t_enter !== 'number' ||
        typeof t.t_clear !== 'number' ||
        typeof t.stalePirMinutes !== 'number' ||
        typeof t.staleDoorMinutes !== 'number') {
      return false;
    }

    // Validate ranges (same as device settings validation)
    if (t.t_enter < 5 || t.t_enter > 60) return false;
    if (t.t_clear < 60 || t.t_clear > 3600) return false;
    if (t.stalePirMinutes < 5 || t.stalePirMinutes > 120) return false;
    if (t.staleDoorMinutes < 5 || t.staleDoorMinutes > 120) return false;

    return true;
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
   * This method implements the graceful degradation pattern for optional data.
   * Zone names enhance the user experience by providing location context
   * (e.g., "Motion Sensor (Living Room)"), but are not critical to pairing functionality.
   *
   * For detailed information about this pattern, see:
   * @see {@link file://../../docs/patterns/graceful-degradation.md}
   *
   * @private
   * @param device - The device to get zone information for
   * @param homeyApi - The HomeyAPI instance
   * @returns Zone name if available, null otherwise (including on error)
   */
  private async getDeviceZoneName(device: HomeyAPIDevice, homeyApi: HomeyAPI): Promise<string | null> {
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
   * Handles device fetch operations with standardized error handling.
   *
   * @private
   * @param capability - The capability to filter by
   * @param errorId - The error ID for logging
   * @param deviceType - Human-readable device type for error messages
   * @returns Array of devices with the specified capability
   */
  private async handleDeviceFetch(
    capability: string,
    errorId: string,
    deviceType: string
  ): Promise<PairingDeviceConfig[]> {
    try {
      return await this.getDevicesWithCapability(capability);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Homey API not available') {
          this.error(`[${errorId}] HomeyAPI not available`, error);
          throw new Error('The app is still initializing. Please wait a moment and try again.');
        }

        if (error.message.includes('timeout')) {
          this.error(`[${errorId}] Request timeout`, error);
          throw new Error('Request timed out. Please check your network connection and try again.');
        }

        if (error.message.includes('permission')) {
          this.error(`[${errorId}] Permission denied`, error);
          throw new Error('Permission denied. Please check app permissions in Homey settings.');
        }
      }

      this.error(`[${errorId}] Unexpected error fetching ${deviceType}:`, error);
      throw error;
    }
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
        const zoneName = await this.getDeviceZoneName(device, homeyApi);

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
     * Handler for fetching room templates.
     * Returns all available room type templates from RoomTemplates.ts.
     * Templates include localized names, descriptions, and pre-configured timer values.
     */
    session.setHandler('get_room_templates', async () => {
      try {
        const { getAllTemplates } = await import('../../lib/RoomTemplates');
        const templates = getAllTemplates();

        // Return simplified template data for frontend (English only for now)
        return templates.map(t => ({
          id: t.id,
          name: t.name.en,
          description: t.description.en,
          timerValues: t.timerValues,
        }));
      } catch (error) {
        this.error(`[${PairingErrorId.TEMPLATES_LOAD_FAILED}] Error loading room templates:`, error);
        throw new Error('Failed to load room templates. Please restart pairing.');
      }
    });

    /**
     * Handler for room template selection.
     * Stores timer values from the selected template.
     * If null is passed (user skipped), default values will be used.
     */
    session.setHandler('select_room_type', async (timerValues: TimerValues | null) => {
      if (timerValues) {
        // Validate timer values structure and ranges
        if (!this.isValidTimerValues(timerValues)) {
          this.error(`[${PairingErrorId.INVALID_TIMER_VALUES}] Invalid timer values received from pairing:`, timerValues);
          throw new Error('Invalid timer configuration. Timer values are out of acceptable ranges.');
        }

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
      return this.handleDeviceFetch(
        'alarm_motion',
        PairingErrorId.MOTION_DEVICES_FETCH_FAILED,
        'motion devices'
      );
    });

    /**
     * Handler for fetching contact devices.
     * Returns all devices with alarm_contact capability.
     */
    session.setHandler('get_contact_devices', async () => {
      return this.handleDeviceFetch(
        'alarm_contact',
        PairingErrorId.CONTACT_DEVICES_FETCH_FAILED,
        'contact devices'
      );
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
            id: `wiab-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          },
          settings,
        },
      ];

      this.log('Returning WIAB device for pairing');
      return devices;
    });
  }
}

export default WIABDriver;
module.exports = WIABDriver;
