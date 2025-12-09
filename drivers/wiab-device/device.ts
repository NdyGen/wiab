import Homey from 'homey';
import { SensorMonitor } from '../../lib/SensorMonitor';
import { SensorConfig, SensorCallbacks } from '../../lib/types';

/**
 * WIAB (Wasp in a Box) virtual occupancy sensor device.
 *
 * This device aggregates input from multiple physical sensors (motion detectors,
 * contact sensors, etc.) to maintain a virtual occupancy state. It uses two types
 * of sensors:
 *
 * - Trigger sensors: Activate occupancy when they trigger (e.g., motion detected)
 * - Reset sensors: Deactivate occupancy when they trigger (e.g., door opened)
 *
 * The device manages the lifecycle of a SensorMonitor instance that listens to
 * configured sensors and updates the alarm_occupancy capability accordingly.
 *
 * Lifecycle:
 * 1. onInit() - Initialize device and setup sensor monitoring
 * 2. onSettings() - Reconfigure monitoring when settings change
 * 3. onDeleted() - Cleanup when device is removed
 */
class WIABDevice extends Homey.Device {
  private sensorMonitor?: SensorMonitor;

  /**
   * Initializes the WIAB device.
   *
   * Called by the Homey framework when the device is added or the app is restarted.
   * This method performs initial setup of sensor monitoring based on the device's
   * current settings.
   */
  async onInit(): Promise<void> {
    this.log('WIAB device has been initialized');

    // Setup sensor monitoring with current settings
    await this.setupSensorMonitoring();

    this.log('WIAB device initialization complete');
  }

  /**
   * Handles device settings changes.
   *
   * Called when the user modifies device settings in the Homey app. This method
   * tears down the existing sensor monitoring and recreates it with the new settings
   * to ensure all changes take effect immediately.
   *
   * @param event - The settings change event containing old and new values
   */
  async onSettings(event: {
    oldSettings: { [key: string]: unknown };
    newSettings: { [key: string]: unknown };
    changedKeys: string[];
  }): Promise<void> {
    this.log('WIAB device settings were changed');

    // Check if sensor configuration changed
    const sensorSettingsChanged =
      event.changedKeys.includes('triggerSensors') ||
      event.changedKeys.includes('resetSensors');

    if (sensorSettingsChanged) {
      this.log('Sensor configuration changed, reinitializing monitoring');

      // Teardown existing monitoring
      this.teardownSensorMonitoring();

      // Setup new monitoring with updated settings
      await this.setupSensorMonitoring();
    }
  }

  /**
   * Handles device deletion.
   *
   * Called when the device is removed from Homey. This method ensures proper
   * cleanup of all sensor listeners and monitoring resources to prevent memory
   * leaks and orphaned listeners.
   */
  async onDeleted(): Promise<void> {
    this.log('WIAB device has been deleted');

    // Cleanup sensor monitoring
    this.teardownSensorMonitoring();
  }

  /**
   * Sets up sensor monitoring based on current device settings.
   *
   * This method:
   * 1. Retrieves trigger and reset sensor configurations from settings
   * 2. Validates the JSON configuration
   * 3. Creates a new SensorMonitor instance
   * 4. Starts monitoring the configured sensors
   *
   * If sensor configuration is invalid, monitoring is not started and an error
   * is logged. This prevents the device from entering an inconsistent state.
   */
  private async setupSensorMonitoring(): Promise<void> {
    try {
      // Get sensor configurations from device settings
      const triggerSensorsJson = this.getSetting('triggerSensors') as string;
      const resetSensorsJson = this.getSetting('resetSensors') as string;

      // Validate and parse sensor configurations
      const triggerSensors = this.validateSensorSettings(triggerSensorsJson);
      const resetSensors = this.validateSensorSettings(resetSensorsJson);

      this.log(
        `Setting up monitoring for ${triggerSensors.length} trigger sensors and ${resetSensors.length} reset sensors`
      );

      // Define callbacks for sensor events
      const callbacks: SensorCallbacks = {
        onTriggered: () => this.handleTriggered(),
        onReset: () => this.handleReset(),
      };

      // Get HomeyAPI instance from app
      const app = this.homey.app as any;
      if (!app || !app.homeyApi) {
        throw new Error('Homey API not available');
      }

      // Create and start sensor monitor with HomeyAPI for device access and Homey SDK for logging
      this.sensorMonitor = new SensorMonitor(
        app.homeyApi,   // HomeyAPI for device access
        this.homey,     // Homey SDK for logging
        triggerSensors,
        resetSensors,
        callbacks
      );

      await this.sensorMonitor.start();
    } catch (error) {
      this.error('Failed to setup sensor monitoring:', error);
      // Don't throw - allow device to function in degraded mode
    }
  }

  /**
   * Tears down sensor monitoring and cleans up resources.
   *
   * This method safely stops the sensor monitor and releases all listeners.
   * It is safe to call this method multiple times or when no monitor is active.
   */
  private teardownSensorMonitoring(): void {
    if (this.sensorMonitor) {
      this.log('Tearing down sensor monitoring');
      this.sensorMonitor.stop();
      this.sensorMonitor = undefined;
    }
  }

  /**
   * Handles trigger sensor activation.
   *
   * Called by the SensorMonitor when any configured trigger sensor activates.
   * This method sets the alarm_occupancy capability to true, indicating that
   * occupancy has been detected.
   */
  private async handleTriggered(): Promise<void> {
    this.log('Trigger sensor activated - setting occupancy to true');

    try {
      await this.setCapabilityValue('alarm_occupancy', true);
    } catch (error) {
      this.error('Failed to set occupancy alarm:', error);
    }
  }

  /**
   * Handles reset sensor activation.
   *
   * Called by the SensorMonitor when any configured reset sensor activates.
   * This method sets the alarm_occupancy capability to false, indicating that
   * occupancy has ended.
   */
  private async handleReset(): Promise<void> {
    this.log('Reset sensor activated - setting occupancy to false');

    try {
      await this.setCapabilityValue('alarm_occupancy', false);
    } catch (error) {
      this.error('Failed to clear occupancy alarm:', error);
    }
  }

  /**
   * Validates and parses sensor settings JSON.
   *
   * This method attempts to parse the JSON string and validates that it contains
   * a valid array of sensor configurations. If parsing fails or the result is
   * not an array, it returns an empty array and logs a warning.
   *
   * This forgiving approach ensures the device remains functional even with
   * invalid configuration, though it may not monitor any sensors until the
   * configuration is corrected.
   *
   * @param jsonString - JSON string containing sensor configuration array
   * @returns Parsed and validated sensor configuration array, or empty array if invalid
   */
  private validateSensorSettings(jsonString: string): SensorConfig[] {
    try {
      // Handle null, undefined, or empty string
      if (!jsonString || jsonString.trim() === '') {
        return [];
      }

      const parsed = JSON.parse(jsonString);

      // Validate that parsed result is an array
      if (!Array.isArray(parsed)) {
        this.error('Sensor settings is not an array:', parsed);
        return [];
      }

      return parsed as SensorConfig[];
    } catch (error) {
      this.error('Failed to parse sensor settings JSON:', error);
      return [];
    }
  }
}

module.exports = WIABDevice;
