import Homey from 'homey';
import type { StateConfig } from '../../lib/types';

/**
 * Room State Manager Driver
 *
 * Handles pairing flow for room state devices, allowing users to:
 * 1. Select a zone to monitor
 * 2. Define states with hierarchies and transitions
 * 3. Set initial state
 *
 * The driver validates state configurations before device creation.
 */
class RoomStateDriver extends Homey.Driver {
  /**
   * Initializes the driver.
   */
  async onInit(): Promise<void> {
    this.log('Room State driver initialized');

    // Register flow card listeners
    this.registerFlowCardListeners();
  }

  /**
   * Registers flow card action and condition listeners.
   */
  private registerFlowCardListeners(): void {
    // Action: Set room state manually
    const setStateAction = this.homey.flow.getActionCard('set_room_state');
    if (setStateAction) {
      setStateAction.registerRunListener(async (args) => {
        const device = args.device;
        const targetState = args.state;

        this.log(`Flow action: Set room state to "${targetState}"`);

        // Call device method to set state manually
        if (typeof device.handleManualStateChange === 'function') {
          await device.handleManualStateChange(targetState);
        }

        return true;
      });
    }

    // Action: Return to automatic mode
    const returnAutoAction = this.homey.flow.getActionCard('return_to_automatic');
    if (returnAutoAction) {
      returnAutoAction.registerRunListener(async (args) => {
        const device = args.device;

        this.log('Flow action: Return to automatic mode');

        // Call device method to return to automatic
        if (typeof device.returnToAutomatic === 'function') {
          await device.returnToAutomatic();
        }

        return true;
      });
    }

    // Condition: Is in specific state
    const isStateCondition = this.homey.flow.getConditionCard('is_in_state');
    if (isStateCondition) {
      isStateCondition.registerRunListener(async (args) => {
        const device = args.device;
        const targetState = args.state;

        this.log(`Flow condition: Is in state "${targetState}"?`);

        // Check if device is in target state (with hierarchy support)
        if (typeof device.isInState === 'function') {
          return device.isInState(targetState);
        }

        return false;
      });
    }

    // Condition: Is exactly in specific state
    const isExactlyStateCondition = this.homey.flow.getConditionCard('is_exactly_state');
    if (isExactlyStateCondition) {
      isExactlyStateCondition.registerRunListener(async (args) => {
        const device = args.device;
        const targetState = args.state;

        this.log(`Flow condition: Is exactly in state "${targetState}"?`);

        // Check if device is exactly in target state (no hierarchy)
        if (typeof device.isExactlyInState === 'function') {
          return device.isExactlyInState(targetState);
        }

        return false;
      });
    }

    // Condition: Is manual override active
    const isManualCondition = this.homey.flow.getConditionCard('is_manual_override');
    if (isManualCondition) {
      isManualCondition.registerRunListener(async (args) => {
        const device = args.device;

        this.log('Flow condition: Is manual override active?');

        // Check if manual override is active
        if (typeof device.isManualOverride === 'function') {
          return device.isManualOverride();
        }

        return false;
      });
    }

    this.log('Flow card listeners registered');
  }

  /**
   * Handles pairing flow.
   *
   * Returns list of devices to pair. In this case, we allow
   * unlimited room state devices to be created.
   */
  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    this.log('Pairing session started');

    // Handler for list_devices - returns empty array to show custom pairing UI
    session.setHandler('list_devices', async () => {
      return [];
    });

    // Handler for validate_zone - validates zone ID
    session.setHandler('validate_zone', async (data: { zoneId: string }) => {
      try {
        const { zoneId } = data;

        if (!zoneId || zoneId.trim() === '') {
          return { valid: false, error: 'Zone ID is required' };
        }

        // TODO: Validate zone exists via HomeyAPI
        // For now, accept any non-empty zone ID

        return { valid: true };
      } catch (error) {
        this.error('Failed to validate zone:', error);
        return { valid: false, error: 'Failed to validate zone' };
      }
    });

    // Handler for validate_states - validates state configuration
    session.setHandler(
      'validate_states',
      async (data: { states: string; initialState: string }) => {
        try {
          const { states, initialState } = data;

          // Parse states JSON
          let stateConfigs: StateConfig[];
          try {
            stateConfigs = JSON.parse(states);
          } catch {
            return { valid: false, error: 'Invalid JSON format' };
          }

          if (!Array.isArray(stateConfigs)) {
            return { valid: false, error: 'States must be an array' };
          }

          if (stateConfigs.length === 0) {
            return { valid: false, error: 'At least one state is required' };
          }

          // Validate initial state exists
          if (!stateConfigs.find((s) => s.id === initialState)) {
            return { valid: false, error: `Initial state "${initialState}" not found` };
          }

          // TODO: Use RoomStateEngine.validateConfiguration() for full validation

          return { valid: true };
        } catch (error) {
          this.error('Failed to validate states:', error);
          return { valid: false, error: 'Failed to validate states' };
        }
      }
    );

    // Handler for add_device - creates device with configuration
    session.setHandler(
      'add_device',
      async (data: { name: string; zoneId: string; states: string; initialState: string }) => {
        try {
          const { name, zoneId, states, initialState } = data;

          this.log(`Adding room state device: ${name}`);

          const device = {
            name,
            data: {
              id: `room-state-${Date.now()}`,
            },
            settings: {
              zoneId,
              states,
              initialState,
            },
          };

          return device;
        } catch (error) {
          this.error('Failed to add device:', error);
          throw error;
        }
      }
    );
  }
}

module.exports = RoomStateDriver;
