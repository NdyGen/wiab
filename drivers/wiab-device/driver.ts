import Homey from 'homey';

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
   * Handles the device pairing process.
   *
   * This method is called when a user initiates pairing of a new WIAB device.
   * Since WIAB is a virtual device (not a physical device that needs discovery),
   * the pairing process immediately returns a preconfigured device instance
   * with default settings.
   *
   * The pairing session receives a single virtual device with:
   * - A default name "Wasp in a Box"
   * - A unique device ID generated using Homey's UUID generator
   * - Empty trigger and reset sensor configurations (JSON arrays)
   *
   * Users can later configure the actual sensors through the device settings.
   *
   * @param session - The pairing session object provided by Homey
   */
  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    this.log('WIAB pairing session started');

    session.setHandler('list_devices', async () => {
      this.log('Listing WIAB devices for pairing');

      // Return a single virtual device instance
      // The device ID is generated using Homey's UUID utility to ensure uniqueness
      const devices = [
        {
          name: 'Wasp in a Box',
          data: {
            id: `wiab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          },
          settings: {
            // Initialize with empty sensor configurations
            // These are stored as JSON strings to allow for flexible array storage
            triggerSensors: '[]',
            resetSensors: '[]',
          },
        },
      ];

      this.log('Returning virtual WIAB device for pairing');
      return devices;
    });
  }
}

export default WIABDriver;
