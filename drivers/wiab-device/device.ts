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
  private entryTimer?: NodeJS.Timeout;
  private entryTimerStartTime?: number;

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

    this.stopEntryTimer();
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
    this.stopEntryTimer();
    if (this.sensorMonitor) {
      this.log('Tearing down sensor monitoring');
      this.sensorMonitor.stop();
      this.sensorMonitor = undefined;
    }
  }

  /**
   * Handles trigger sensor activation (motion detected).
   *
   * Behavior depends on entry timer state:
   * - If timer active: Check if doors are closed before making occupancy permanent
   * - If timer inactive: Activate occupancy normally
   */
  private async handleTriggered(): Promise<void> {
    this.log('Trigger sensor activated - checking entry timer state');

    try {
      if (this.isEntryTimerActive()) {
        // Timer active: check if doors are closed
        if (this.areAllResetSensorsClosed()) {
          this.stopEntryTimer();
          await this.setCapabilityValue('alarm_occupancy', true);
          this.log('Occupancy made permanent: motion detected with doors closed');
        } else {
          this.log('Motion ignored: doors still open during entry timer');
        }
      } else {
        // Normal behavior: activate occupancy
        await this.setCapabilityValue('alarm_occupancy', true);
        this.log('Occupancy activated: motion detected');
      }
    } catch (error) {
      this.error('Failed to handle trigger:', error);
    }
  }

  /**
   * Handles reset sensor activation (door/window opened).
   *
   * Behavior depends on current occupancy state:
   * - If occupied: Reset occupancy immediately (exit detected)
   * - If unoccupied: Start entry timer grace period
   */
  private async handleReset(): Promise<void> {
    this.log('Reset sensor activated - handling based on current occupancy state');

    try {
      const currentOccupancy = this.getCapabilityValue('alarm_occupancy');

      if (currentOccupancy) {
        // Room occupied: reset immediately (current behavior)
        await this.setCapabilityValue('alarm_occupancy', false);
        this.log('Occupancy reset: door opened while occupied');
      } else {
        // Room unoccupied: start entry timer
        this.startEntryTimer();
      }
    } catch (error) {
      this.error('Failed to handle reset:', error);
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

  /**
   * Starts or restarts the entry timer grace period.
   *
   * When a reset sensor triggers while the room is unoccupied, this creates
   * a temporary occupancy state. If motion is detected during this period
   * with all doors closed, occupancy becomes permanent.
   */
  private startEntryTimer(): void {
    // Cancel existing timer if running
    this.stopEntryTimer();

    // Get and validate timeout setting
    const timeoutSeconds = this.getSetting('entryTimeout') as number || 60;
    const validatedTimeout = Math.max(1, Math.min(300, timeoutSeconds));
    const timeoutMs = validatedTimeout * 1000;

    // Set temporary occupancy
    this.setCapabilityValue('alarm_occupancy', true)
      .catch(error => this.error('Failed to set temporary occupancy:', error));

    // Start timer
    this.entryTimer = setTimeout(() => {
      this.log(`Entry timer expired after ${validatedTimeout}s: deactivating occupancy`);
      this.setCapabilityValue('alarm_occupancy', false)
        .catch(error => this.error('Failed to deactivate occupancy on timer expiration:', error));
      this.entryTimer = undefined;
      this.entryTimerStartTime = undefined;
    }, timeoutMs);

    this.entryTimerStartTime = Date.now();
    this.log(`Entry timer started: ${validatedTimeout}s grace period`);
  }

  /**
   * Stops the entry timer if active.
   *
   * Called when motion is detected during the grace period (making occupancy permanent),
   * when settings change, or when the device is deleted.
   */
  private stopEntryTimer(): void {
    if (this.entryTimer) {
      clearTimeout(this.entryTimer);
      this.entryTimer = undefined;
      this.entryTimerStartTime = undefined;
      this.log('Entry timer stopped');
    }
  }

  /**
   * Checks if the entry timer is currently active.
   *
   * @returns {boolean} True if grace period is active, false otherwise
   */
  private isEntryTimerActive(): boolean {
    return this.entryTimer !== undefined;
  }

  /**
   * Checks if all reset sensors are in closed state.
   *
   * Used during entry timer to determine if motion should make occupancy permanent.
   * Only motion detected with ALL doors closed will activate permanent occupancy.
   *
   * @returns {boolean} True if all reset sensors are closed (false), false if any are open or unavailable
   */
  private areAllResetSensorsClosed(): boolean {
    try {
      const resetSensorsJson = this.getSetting('resetSensors') as string;
      const resetSensors = this.validateSensorSettings(resetSensorsJson);

      // No reset sensors configured: treat as "closed"
      if (resetSensors.length === 0) {
        return true;
      }

      // Get HomeyAPI instance from app
      const app = this.homey.app as any;
      if (!app || !app.homeyApi) {
        this.error('Homey API not available for checking reset sensor states');
        return false;
      }

      // Check each reset sensor using HomeyAPI device references
      for (const sensor of resetSensors) {
        // Get device from cache (same pattern as SensorMonitor)
        const devices = app.homeyApi.devices;
        if (!devices || !devices[sensor.deviceId]) {
          this.error(`Reset sensor device not found: ${sensor.deviceId}`);
          return false; // Missing device = unsafe to assume closed
        }

        const device = devices[sensor.deviceId];
        const capabilitiesObj = device.capabilitiesObj;

        if (!capabilitiesObj || !(sensor.capability in capabilitiesObj)) {
          this.error(`Device ${sensor.deviceId} does not have capability: ${sensor.capability}`);
          return false;
        }

        const value = capabilitiesObj[sensor.capability]?.value;

        if (value === true) {
          // Sensor is open (true = contact open)
          this.log(`Reset sensor is open: ${sensor.deviceName || sensor.deviceId}`);
          return false;
        }
      }

      // All sensors are closed
      return true;
    } catch (error) {
      this.error('Failed to check reset sensor states:', error);
      return false; // Error = unsafe to assume closed
    }
  }
}

module.exports = WIABDevice;
