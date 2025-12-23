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
      // Register autocomplete for state selection
      setStateAction.registerArgumentAutocompleteListener('state', async (): Promise<Array<{ id: string; name: string }>> => {
        return this.getAvailableStates();
      });

      setStateAction.registerRunListener(async (args): Promise<boolean> => {
        const device = args.device;
        const targetState = args.state.id || args.state;

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
      returnAutoAction.registerRunListener(async (args): Promise<boolean> => {
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
      // Register autocomplete for state selection
      isStateCondition.registerArgumentAutocompleteListener('state', async (): Promise<Array<{ id: string; name: string }>> => {
        return this.getAvailableStates();
      });

      isStateCondition.registerRunListener(async (args): Promise<boolean> => {
        const device = args.device;
        const targetState = args.state.id || args.state;

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
      // Register autocomplete for state selection
      isExactlyStateCondition.registerArgumentAutocompleteListener('state', async (): Promise<Array<{ id: string; name: string }>> => {
        return this.getAvailableStates();
      });

      isExactlyStateCondition.registerRunListener(async (args): Promise<boolean> => {
        const device = args.device;
        const targetState = args.state.id || args.state;

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
      isManualCondition.registerRunListener(async (args): Promise<boolean> => {
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
   * Returns the list of available states for autocomplete.
   *
   * The Room State Manager uses a fixed 4-state configuration:
   * - idle: Room is inactive
   * - extended_idle: Room has been inactive for extended period
   * - occupied: Room is active
   * - extended_occupied: Room has been active for extended period
   *
   * Returns localized state names based on Homey's language setting.
   *
   * @returns {Array} Array of autocomplete options with id and localized name
   * @private
   */
  private getAvailableStates(): Array<{ id: string; name: string }> {
    const language = this.homey.i18n.getLanguage();

    const translations: Record<string, Record<string, string>> = {
      idle: {
        en: 'idle',
        nl: 'vrij',
        de: 'inaktiv',
        no: 'ledig',
        sv: 'ledig'
      },
      extended_idle: {
        en: 'extended idle',
        nl: 'verlengd vrij',
        de: 'erweitert inaktiv',
        no: 'utvidet ledig',
        sv: 'utökad ledig'
      },
      occupied: {
        en: 'occupied',
        nl: 'bezet',
        de: 'besetzt',
        no: 'opptatt',
        sv: 'upptagen'
      },
      extended_occupied: {
        en: 'extended occupied',
        nl: 'verlengd bezet',
        de: 'erweitert besetzt',
        no: 'utvidet opptatt',
        sv: 'utökad upptagen'
      }
    };

    return [
      {
        id: 'idle',
        name: translations.idle[language] || translations.idle.en
      },
      {
        id: 'extended_idle',
        name: translations.extended_idle[language] || translations.extended_idle.en
      },
      {
        id: 'occupied',
        name: translations.occupied[language] || translations.occupied.en
      },
      {
        id: 'extended_occupied',
        name: translations.extended_occupied[language] || translations.extended_occupied.en
      }
    ];
  }

  /**
   * Handles pairing flow.
   *
   * Guides users through configuring zone and states during pairing.
   */
  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    this.log('Pairing session started');

    const pairingData = {
      idleTimeout: 0,
      occupiedTimeout: 0,
    };

    // Handle timer configuration from pairing page
    session.setHandler('set_timers', async (data: { idleTimeout: number; occupiedTimeout: number }): Promise<void> => {
      pairingData.idleTimeout = data.idleTimeout;
      pairingData.occupiedTimeout = data.occupiedTimeout;
      this.log('Timers configured:', data);
    });

    // Handler for list_devices - returns device with pairing data
    session.setHandler('list_devices', async (): Promise<Array<{ name: string; data: { id: string }; settings: Record<string, unknown> }>> => {
      return [
        {
          name: 'Room State Manager',
          data: {
            id: `room-state-${Date.now()}`,
          },
          settings: {
            idleTimeout: pairingData.idleTimeout,
            occupiedTimeout: pairingData.occupiedTimeout,
          },
        },
      ];
    });
  }
}

module.exports = RoomStateDriver;
