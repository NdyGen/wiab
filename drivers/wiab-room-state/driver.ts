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
   * Guides users through:
   * 1. Selecting a WIAB device to monitor
   * 2. Configuring extended state timers
   */
  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    this.log('Pairing session started');

    const pairingData = {
      wiabDeviceId: '',
      idleTimeout: 0,
      occupiedTimeout: 0,
    };

    // Handle WIAB device list request
    session.setHandler('get_wiab_devices', async (): Promise<Array<{ id: string; name: string }>> => {
      this.log('get_wiab_devices handler called');
      try {
        const app = this.homey.app as { homeyApi?: { devices: { getDevices(): Promise<Record<string, unknown>> }; zones: { getZone(params: { id: string }): Promise<{ name?: string }> } } };

        if (!app.homeyApi) {
          this.error('HomeyAPI not available during pairing');
          throw new Error('System not ready. Please wait a moment and try again.');
        }

        this.log('Fetching devices from HomeyAPI...');
        const devices = await app.homeyApi.devices.getDevices();
        this.log(`Retrieved ${Object.keys(devices).length} total devices`);

        const wiabDevices: Array<{ id: string; name: string }> = [];

        for (const [deviceId, device] of Object.entries(devices)) {
          const deviceObj = device as { driverId?: string; name?: string; zone?: string };

          // Filter for WIAB devices only
          if (deviceObj.driverId?.endsWith(':wiab-device')) {
            let displayName = deviceObj.name || 'Unknown WIAB Device';

            // Try to get zone name if device has a zone
            if (deviceObj.zone) {
              try {
                const zone = await app.homeyApi.zones.getZone({ id: deviceObj.zone });
                if (zone.name) {
                  displayName = `${displayName} (${zone.name})`;
                }
              } catch (zoneError) {
                this.log(`Could not fetch zone for device ${deviceId}:`, zoneError);
              }
            }

            this.log(`Found WIAB device: ${displayName} (${deviceId})`);
            wiabDevices.push({
              id: deviceId,
              name: displayName,
            });
          }
        }

        this.log(`Returning ${wiabDevices.length} WIAB devices to pairing screen`);
        return wiabDevices;
      } catch (error) {
        this.error('Failed to get WIAB devices:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        throw new Error(`Failed to load WIAB devices: ${errorMessage}`);
      }
    });

    // Handle WIAB device selection
    session.setHandler('wiab_device_selected', async (data: { wiabDeviceId: string }): Promise<void> => {
      pairingData.wiabDeviceId = data.wiabDeviceId;
      this.log('WIAB device selected:', data.wiabDeviceId);
    });

    // Handle timer configuration from pairing page
    session.setHandler('set_timers', async (data: { idleTimeout: number; occupiedTimeout: number }): Promise<void> => {
      pairingData.idleTimeout = data.idleTimeout;
      pairingData.occupiedTimeout = data.occupiedTimeout;
      this.log('Timers configured:', data);
    });

    // Handler for list_devices - returns device with pairing data
    session.setHandler('list_devices', async (): Promise<Array<{ name: string; data: { id: string }; settings: Record<string, unknown> }>> => {
      // Validate that WIAB device was selected
      if (!pairingData.wiabDeviceId) {
        this.error('No WIAB device selected during pairing');
        throw new Error('Please select a WIAB device');
      }

      // Validate timer values
      if (typeof pairingData.idleTimeout !== 'number' || pairingData.idleTimeout < 0 || pairingData.idleTimeout > 1440) {
        this.error('Invalid idle timeout:', pairingData.idleTimeout);
        throw new Error('Idle timeout must be between 0 and 1440 minutes');
      }

      if (typeof pairingData.occupiedTimeout !== 'number' || pairingData.occupiedTimeout < 0 || pairingData.occupiedTimeout > 1440) {
        this.error('Invalid occupied timeout:', pairingData.occupiedTimeout);
        throw new Error('Occupied timeout must be between 0 and 1440 minutes');
      }

      // Verify that the WIAB device still exists
      const app = this.homey.app as { homeyApi?: { devices: { getDevices(): Promise<Record<string, unknown>> } } };

      if (!app.homeyApi) {
        throw new Error('System not ready. Please try pairing again.');
      }

      const devices = await app.homeyApi.devices.getDevices();
      const device = devices[pairingData.wiabDeviceId];

      if (!device) {
        this.error('Selected WIAB device no longer exists:', pairingData.wiabDeviceId);
        throw new Error('Selected WIAB device not found. It may have been deleted. Please start pairing again.');
      }

      const deviceObj = device as { driverId?: string };
      if (!deviceObj.driverId?.endsWith(':wiab-device')) {
        this.error('Selected device is not a WIAB device:', pairingData.wiabDeviceId);
        throw new Error('Selected device is not a valid WIAB device. Please start pairing again.');
      }

      return [
        {
          name: 'Room State Manager',
          data: {
            id: `room-state-${Date.now()}`,
          },
          settings: {
            wiabDeviceId: pairingData.wiabDeviceId,
            idleTimeout: pairingData.idleTimeout,
            occupiedTimeout: pairingData.occupiedTimeout,
          },
        },
      ];
    });
  }
}

module.exports = RoomStateDriver;
