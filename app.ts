import Homey from 'homey';

/**
 * Main application coordinator for the WIAB (Wasp in a Box) Homey app.
 *
 * This class serves as the entry point and coordinator for the application.
 * It follows a minimal design pattern where the actual business logic is delegated
 * to the driver and device implementations.
 *
 * The app's primary responsibility is to initialize the application and provide
 * centralized logging for application lifecycle events.
 */
class WIABApp extends Homey.App {
  /**
   * Initializes the WIAB application.
   *
   * Called by the Homey framework when the app is loaded. This method is responsible
   * for any app-level initialization tasks. Currently, it only logs the initialization
   * event, as all device-specific logic is handled by the driver and device classes.
   */
  async onInit(): Promise<void> {
    this.log('WIAB app has been initialized');
  }
}

export default WIABApp;
