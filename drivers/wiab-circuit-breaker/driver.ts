import Homey from 'homey';
import { CircuitBreakerHierarchyManager } from '../../lib/CircuitBreakerHierarchyManager';
import { HomeyAPI, HomeyAPIDevice } from '../../lib/types';
import { CircuitBreakerErrorId } from '../../constants/errorIds';
import { ErrorReporter } from '../../lib/ErrorReporter';
import { ErrorSeverity } from '../../lib/ErrorTypes';

/**
 * Interface for WIABApp with HomeyAPI
 */
interface WIABApp extends Homey.App {
  homeyApi?: HomeyAPI;
}

/**
 * Interface for pairing session data
 */
interface PairSession extends Homey.Driver.PairSession {
  selectedParentId?: string | null;
}

/**
 * Driver class for Circuit Breaker virtual devices.
 *
 * This driver manages the pairing process for creating new circuit breaker instances.
 * Each circuit breaker is a virtual device that can be organized in a parent-child
 * hierarchy to control flow execution at different levels.
 *
 * Pairing Flow:
 * Frontend Pages:
 *   1. intro.html - Explains the circuit breaker concept
 *   2. select_parent.html - User selects parent (or "None" for root breaker)
 * Backend Handlers:
 *   - get_circuit_breakers - Fetches all existing circuit breakers for parent dropdown
 *   - parent_selected - Stores the selected parent ID in session
 *   - list_devices - Creates device with configured parent
 *
 * Flow Cards:
 * - Triggers: turned_on, turned_off, flipped (with state token)
 * - Conditions: is_on
 * - Actions: turn_on, turn_off
 */
class CircuitBreakerDriver extends Homey.Driver {
  public turnedOnTrigger?: Homey.FlowCardTriggerDevice;
  public turnedOffTrigger?: Homey.FlowCardTriggerDevice;
  public flippedTrigger?: Homey.FlowCardTriggerDevice;

  /**
   * Initializes the circuit breaker driver.
   *
   * Registers flow cards for triggers, conditions, and actions.
   *
   * @throws Error if driver initialization fails
   */
  async onInit(): Promise<void> {
    this.log('Circuit breaker driver initializing');

    try {
      // ─── Flow Card Triggers ─────────────────────────────────────────────
      // These triggers are fired by devices when state changes occur.
      // Stored as driver properties for device access during state changes.
      this.turnedOnTrigger = this.homey.flow.getDeviceTriggerCard('circuit_breaker_turned_on');
      this.turnedOffTrigger = this.homey.flow.getDeviceTriggerCard('circuit_breaker_turned_off');
      this.flippedTrigger = this.homey.flow.getDeviceTriggerCard('circuit_breaker_flipped');

      // ─── Flow Card Condition: Is Circuit Breaker ON? ────────────────────
      /**
       * Condition card for checking circuit breaker state in flow conditions.
       *
       * @param args.device - The circuit breaker device to check
       * @returns true if breaker is ON, false if OFF or on error
       *
       * @remarks Error Handling:
       * - Returns false on capability read failure (fail-safe: assume OFF)
       * - Logs error but doesn't throw (conditions should never break flows)
       * - False negatives preferred over flow crashes
       */
      this.homey.flow.getConditionCard('circuit_breaker_is_on')
        .registerRunListener(async (args: { device: Homey.Device }) => {
          try {
            const isOn = args.device.getCapabilityValue('onoff');
            return isOn === true;
          } catch (error) {
            this.error(
              `[${CircuitBreakerErrorId.CAPABILITY_UPDATE_FAILED}] Failed to check circuit breaker state:`,
              error
            );
            // For conditions, return false on error (fail-safe behavior)
            return false;
          }
        });

      // ─── Flow Card Action: Turn Circuit Breaker ON ──────────────────────
      /**
       * Action card for turning breaker ON from flows.
       *
       * @param args.device - The circuit breaker device to turn on
       * @returns true on success
       * @throws {Error} User-friendly error message on capability update failure
       *
       * @remarks Error Handling:
       * - Throws user-friendly error to show in flow execution
       * - Uses ErrorReporter for consistent error messaging
       * - Prevents silent failures (user should see when action fails)
       */
      this.homey.flow.getActionCard('circuit_breaker_turn_on')
        .registerRunListener(async (args: { device: Homey.Device }) => {
          try {
            await args.device.setCapabilityValue('onoff', true);
            return true;
          } catch (error) {
            const errorReporter = new ErrorReporter({
              log: this.log.bind(this),
              error: this.error.bind(this),
            });

            let userMessage = 'Cannot turn circuit breaker ON.';
            if (error instanceof Error) {
              if (error.message.includes('capability not found')) {
                userMessage += ' Device configuration is invalid. Delete and re-pair the device.';
              } else if (error.message.includes('permission')) {
                userMessage += ' Check app permissions in Homey settings.';
              } else {
                userMessage += ' Wait a moment and try again. If the problem persists, restart the app.';
              }
            } else {
              userMessage += ' Wait a moment and try again. If the problem persists, restart the app.';
            }

            const message = errorReporter.reportAndGetMessage({
              errorId: CircuitBreakerErrorId.CAPABILITY_UPDATE_FAILED,
              severity: ErrorSeverity.HIGH,
              userMessage,
              technicalMessage: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new Error(message);
          }
        });

      // ─── Flow Card Action: Turn Circuit Breaker OFF ─────────────────────
      /**
       * Action card for turning breaker OFF from flows.
       *
       * @param args.device - The circuit breaker device to turn off
       * @returns true on success
       * @throws {Error} User-friendly error message on capability update failure
       *
       * @remarks Error Handling:
       * - Throws user-friendly error to show in flow execution
       * - Uses ErrorReporter for consistent error messaging
       * - Prevents silent failures (user should see when action fails)
       */
      this.homey.flow.getActionCard('circuit_breaker_turn_off')
        .registerRunListener(async (args: { device: Homey.Device }) => {
          try {
            await args.device.setCapabilityValue('onoff', false);
            return true;
          } catch (error) {
            const errorReporter = new ErrorReporter({
              log: this.log.bind(this),
              error: this.error.bind(this),
            });

            let userMessage = 'Cannot turn circuit breaker OFF.';
            if (error instanceof Error) {
              if (error.message.includes('capability not found')) {
                userMessage += ' Device configuration is invalid. Delete and re-pair the device.';
              } else if (error.message.includes('permission')) {
                userMessage += ' Check app permissions in Homey settings.';
              } else {
                userMessage += ' Wait a moment and try again. If the problem persists, restart the app.';
              }
            } else {
              userMessage += ' Wait a moment and try again. If the problem persists, restart the app.';
            }

            const message = errorReporter.reportAndGetMessage({
              errorId: CircuitBreakerErrorId.CAPABILITY_UPDATE_FAILED,
              severity: ErrorSeverity.HIGH,
              userMessage,
              technicalMessage: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new Error(message);
          }
        });

      this.log('Circuit breaker driver initialized');
    } catch (error) {
      const errorReporter = new ErrorReporter({
        log: this.log.bind(this),
        error: this.error.bind(this),
      });
      const message = errorReporter.reportAndGetMessage({
        errorId: CircuitBreakerErrorId.DRIVER_INIT_FAILED,
        severity: ErrorSeverity.CRITICAL,
        userMessage: 'Circuit breaker driver failed to initialize. Restart the app.',
        technicalMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(message);
    }
  }

  /**
   * Registers pairing event handlers.
   *
   * Sets up handlers for:
   * - get_circuit_breakers: Returns all existing circuit breakers for parent selection
   * - parent_selected: Stores the selected parent ID in session
   * - list_devices: Creates the new circuit breaker device with parent configuration
   */
  async onPair(session: PairSession): Promise<void> {
    this.log('Pairing session started');

    // Store selected parent ID in session
    let selectedParentId: string | null = null;

    // Handler: Get all circuit breakers for parent dropdown
    session.setHandler('get_circuit_breakers', async () => {
      try {
        this.log('Fetching circuit breakers for pairing');
        const breakers = await this.getAllCircuitBreakers();
        this.log(`[PAIRING] Returning ${breakers.length} circuit breakers:`,
          breakers.map(b => `${b.id}:${b.name}`).join(', '));
        return breakers;
      } catch (error) {
        this.error('[PAIRING] Failed to fetch circuit breakers:', error);
        const errorReporter = new ErrorReporter({
          log: this.log.bind(this),
          error: this.error.bind(this),
        });
        const message = errorReporter.reportAndGetMessage({
          errorId: CircuitBreakerErrorId.PAIRING_HANDLER_FAILED,
          severity: ErrorSeverity.HIGH,
          userMessage: 'Cannot load circuit breakers for pairing. Wait a moment and try again. If the problem persists, restart Homey.',
          technicalMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        throw new Error(message);
      }
    });

    // Handler: Store selected parent
    session.setHandler('parent_selected', async (data: { parentId: string | null }) => {
      try {
        this.log(`Parent selected: ${data.parentId || 'none'}`);
        selectedParentId = data.parentId;
        return true;
      } catch (error) {
        const errorReporter = new ErrorReporter({
          log: this.log.bind(this),
          error: this.error.bind(this),
        });
        const message = errorReporter.reportAndGetMessage({
          errorId: CircuitBreakerErrorId.PAIRING_HANDLER_FAILED,
          severity: ErrorSeverity.HIGH,
          userMessage: 'Cannot load circuit breakers for pairing. Wait a moment and try again. If the problem persists, restart Homey.',
          technicalMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        throw new Error(message);
      }
    });

    // Handler: Create device with parent configuration
    session.setHandler('list_devices', async () => {
      try {
        this.log('Creating circuit breaker device');

        // Generate unique device ID
        const deviceId = `circuit-breaker-${Date.now()}`;

        return [
          {
            name: 'Circuit Breaker',
            data: {
              id: deviceId,
            },
            settings: {
              parentId: selectedParentId,
            },
            capabilities: ['onoff'],
          },
        ];
      } catch (error) {
        const errorReporter = new ErrorReporter({
          log: this.log.bind(this),
          error: this.error.bind(this),
        });
        const message = errorReporter.reportAndGetMessage({
          errorId: CircuitBreakerErrorId.PAIRING_HANDLER_FAILED,
          severity: ErrorSeverity.HIGH,
          userMessage: 'Cannot load circuit breakers for pairing. Wait a moment and try again. If the problem persists, restart Homey.',
          technicalMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        throw new Error(message);
      }
    });
  }

  /**
   * Retrieves all circuit breaker devices with zone information.
   *
   * Returns devices formatted as "Device Name (Zone Name)" for display in the
   * parent selection dropdown during pairing. For example:
   * - "Main Breaker (Kitchen)"
   * - "Floor 1 Breaker (Living Room)"
   *
   * Used by parent selection dropdown during pairing.
   *
   * @returns Array of circuit breaker device configs for pairing
   * @private
   */
  private async getAllCircuitBreakers(): Promise<Array<{
    id: string;
    name: string;
    displayName: string;
  }>> {
    try {
      const app = this.homey.app as WIABApp;
      if (!app.homeyApi) {
        this.error('[PAIRING] HomeyAPI not available');
        throw new Error('HomeyAPI not available');
      }

      this.log('[PAIRING] Creating hierarchy manager...');
      const hierarchyManager = new CircuitBreakerHierarchyManager(app.homeyApi, {
        log: this.log.bind(this),
        error: this.error.bind(this),
      });

      this.log('[PAIRING] Fetching circuit breakers from hierarchy manager...');
      const breakers = await hierarchyManager.getAllCircuitBreakers();
      this.log(`[PAIRING] Hierarchy manager returned ${breakers.length} breakers:`,
        breakers.map(b => `${b.id}:${b.name}:${b.driverId}`).join(', '));

      // Filter breakers to ensure they have valid IDs
      const validBreakers = breakers.filter((b): b is typeof b & { id: string } => !!b.id);
      this.log(`[PAIRING] After ID filtering: ${validBreakers.length} valid breakers`);

      // Get zone names for all breakers
      const breakersWithZones = await Promise.all(
        validBreakers.map(async (breaker): Promise<{ id: string; name: string; displayName: string }> => {
          const zoneName = await this.getDeviceZoneName(breaker.id, app.homeyApi!);
          const displayName = zoneName
            ? `${breaker.name} (${zoneName})`
            : breaker.name;

          return {
            id: breaker.id,
            name: breaker.name,
            displayName,
          };
        })
      );

      this.log(`[PAIRING] Found ${breakersWithZones.length} circuit breakers`);
      return breakersWithZones;
    } catch (error) {
      const errorReporter = new ErrorReporter({
        log: this.log.bind(this),
        error: this.error.bind(this),
      });
      const message = errorReporter.reportAndGetMessage({
        errorId: CircuitBreakerErrorId.HIERARCHY_QUERY_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'Cannot load circuit breakers for pairing. Wait a moment and try again. If the problem persists, restart the app.',
        technicalMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(message);
    }
  }

  /**
   * Retrieves zone name for a device.
   *
   * This method implements the graceful degradation pattern for optional data.
   * Zone names enhance the user experience by providing location context
   * (e.g., "Main Breaker (Kitchen)"), but are not critical to pairing functionality.
   *
   * For detailed information about this pattern, see:
   * @see {@link file://../../docs/patterns/graceful-degradation.md}
   *
   * @param deviceId - Device ID to query
   * @param homeyApi - HomeyAPI instance
   * @returns Zone name if available, null otherwise (including on error)
   * @private
   */
  private async getDeviceZoneName(deviceId: string, homeyApi: HomeyAPI): Promise<string | null> {
    try {
      const devices = await homeyApi.devices.getDevices();
      const device = devices[deviceId] as HomeyAPIDevice;

      if (!device || !device.zone) {
        return null;
      }

      const zone = await homeyApi.zones.getZone({ id: device.zone });
      return zone.name;
    } catch (error) {
      this.log(`Could not retrieve zone for device ${deviceId}:`, error);
      return null;
    }
  }
}

module.exports = CircuitBreakerDriver;
