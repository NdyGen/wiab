import Homey from 'homey';

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
   * Creates a basic device that will be configured through settings.
   * Users configure zone ID and states via device settings after pairing.
   */
  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    this.log('Pairing session started');

    // Handler for list_devices - returns a template device to be configured
    session.setHandler('list_devices', async () => {
      return [
        {
          name: 'Room State Manager',
          data: {
            id: `room-state-${Date.now()}`,
          },
          settings: {
            zoneId: '',
            states: '[]',
            initialState: '',
          },
        },
      ];
    });
  }
}

module.exports = RoomStateDriver;
