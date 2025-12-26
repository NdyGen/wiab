import Homey from 'homey';
import { CircuitBreakerHierarchyManager } from '../../lib/CircuitBreakerHierarchyManager';
import { HomeyAPI } from '../../lib/types';
import { CircuitBreakerErrorId } from '../../constants/errorIds';

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
 * 1. intro.html - Explains the circuit breaker concept
 * 2. select_parent.html - User selects parent (or "None" for root breaker)
 * 3. list_devices - Creates device with configured parent
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
   */
  async onInit(): Promise<void> {
    this.log('Circuit breaker driver initializing');

    try {
      // Register flow card triggers
      this.turnedOnTrigger = this.homey.flow.getDeviceTriggerCard('circuit_breaker_turned_on');
      this.turnedOffTrigger = this.homey.flow.getDeviceTriggerCard('circuit_breaker_turned_off');
      this.flippedTrigger = this.homey.flow.getDeviceTriggerCard('circuit_breaker_flipped');

      // Register flow card condition
      this.homey.flow.getConditionCard('circuit_breaker_is_on')
        .registerRunListener(async (args: { device: Homey.Device }) => {
          return args.device.getCapabilityValue('onoff') === true;
        });

      // Register flow card actions
      this.homey.flow.getActionCard('circuit_breaker_turn_on')
        .registerRunListener(async (args: { device: Homey.Device }) => {
          await args.device.setCapabilityValue('onoff', true);
        });

      this.homey.flow.getActionCard('circuit_breaker_turn_off')
        .registerRunListener(async (args: { device: Homey.Device }) => {
          await args.device.setCapabilityValue('onoff', false);
        });

      this.log('Circuit breaker driver initialized');
    } catch (error) {
      this.error(
        `[${CircuitBreakerErrorId.FLOW_CARD_REGISTRATION_FAILED}] Failed to register flow cards:`,
        error
      );
      throw error;
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

    try {
      // Handler: Get all circuit breakers for parent dropdown
      session.setHandler('get_circuit_breakers', async () => {
        this.log('Fetching circuit breakers for pairing');
        return await this.getAllCircuitBreakers();
      });

      // Handler: Store selected parent
      session.setHandler('parent_selected', async (data: { parentId: string | null }) => {
        this.log(`Parent selected: ${data.parentId || 'none'}`);
        selectedParentId = data.parentId;
        return true;
      });

      // Handler: Create device with parent configuration
      session.setHandler('list_devices', async () => {
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
      });
    } catch (error) {
      this.error(
        `[${CircuitBreakerErrorId.PAIRING_HANDLER_FAILED}] Pairing failed:`,
        error
      );
      throw error;
    }
  }

  /**
   * Retrieves all circuit breaker devices with zone information.
   *
   * Returns devices in format: "Device Name (Zone Name)"
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
        throw new Error('HomeyAPI not available');
      }

      const hierarchyManager = new CircuitBreakerHierarchyManager(app.homeyApi, {
        log: this.log.bind(this),
        error: this.error.bind(this),
      });
      const breakers = await hierarchyManager.getAllCircuitBreakers();

      // Filter breakers to ensure they have valid IDs
      const validBreakers = breakers.filter((b): b is typeof b & { id: string } => !!b.id);

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

      this.log(`Found ${breakersWithZones.length} circuit breakers`);
      return breakersWithZones;
    } catch (error) {
      this.error(
        `[${CircuitBreakerErrorId.HIERARCHY_QUERY_FAILED}] Failed to fetch circuit breakers:`,
        error
      );
      throw error;
    }
  }

  /**
   * Retrieves zone name for a device.
   *
   * @param deviceId - Device ID to query
   * @param homeyApi - HomeyAPI instance
   * @returns Zone name or null if not available
   * @private
   */
  private async getDeviceZoneName(deviceId: string, homeyApi: HomeyAPI): Promise<string | null> {
    try {
      const devices = await homeyApi.devices.getDevices();
      const device = devices[deviceId] as unknown as { zone?: string };

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
