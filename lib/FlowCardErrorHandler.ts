/**
 * FlowCardErrorHandler - Safe flow card triggering with error handling
 *
 * Provides safe wrappers for triggering Homey flow cards that handle errors
 * gracefully without interrupting device operation. Flow card failures are
 * logged but don't propagate as exceptions.
 *
 * @example
 * ```typescript
 * const flowHandler = new FlowCardErrorHandler(homey, logger);
 *
 * // Trigger a flow card safely
 * await flowHandler.triggerDeviceCard(
 *   device,
 *   'zone_status_changed',
 *   { is_leaky: true },
 *   'ZONE_SEAL_004'
 * );
 * ```
 */

import Homey from 'homey';
import { Logger } from './ErrorTypes';

/**
 * Homey-like interface with flow manager access
 */
interface HomeyFlowInterface {
  flow: {
    getDeviceTriggerCard(id: string): {
      trigger(device: Homey.Device, tokens?: Record<string, unknown>): Promise<void>;
    } | undefined;
    getConditionCard(id: string): {
      registerRunListener(listener: (args: unknown) => Promise<boolean> | boolean): void;
    } | undefined;
    getActionCard(id: string): {
      registerRunListener(listener: (args: unknown) => Promise<void>): void;
    } | undefined;
  };
}

export class FlowCardErrorHandler {
  private homey: HomeyFlowInterface;
  private logger: Logger;

  /**
   * Creates a new FlowCardErrorHandler instance.
   *
   * @param homey - Homey instance for flow card access (from this.homey in Device/App)
   * @param logger - Logger for flow card errors
   */
  constructor(homey: HomeyFlowInterface, logger: Logger) {
    this.homey = homey;
    this.logger = logger;
  }

  /**
   * Triggers a device trigger card safely.
   *
   * Wraps flow card triggering with error handling to prevent flow card failures
   * from breaking device operation. Errors are logged with error ID but not thrown.
   *
   * @param device - Device to trigger card for
   * @param cardId - Flow card ID
   * @param tokens - Token values for the flow card
   * @param errorId - Error ID for logging failures
   * @returns Promise that resolves when trigger completes (or fails gracefully)
   *
   * @example
   * ```typescript
   * await flowHandler.triggerDeviceCard(
   *   this,
   *   'zone_leaky',
   *   {},
   *   'ZONE_SEAL_004'
   * );
   * ```
   */
  public async triggerDeviceCard(
    device: Homey.Device,
    cardId: string,
    tokens: Record<string, unknown>,
    errorId: string
  ): Promise<void> {
    try {
      const card = this.homey.flow.getDeviceTriggerCard(cardId);

      if (!card) {
        this.logger.error(
          `[${errorId}] Flow card not found: ${cardId} - check .homeycompose configuration`
        );
        return;
      }

      await card.trigger(device, tokens);

      this.logger.log(`Triggered flow card: ${cardId}`);
    } catch (error) {
      this.logger.error(
        `[${errorId}] Failed to trigger flow card ${cardId}:`,
        error
      );
      // Don't throw - flow card failures shouldn't break device operation
    }
  }

  /**
   * Triggers multiple device trigger cards safely.
   *
   * Triggers all specified cards, logging any failures but continuing to
   * trigger remaining cards even if some fail.
   *
   * @param device - Device to trigger cards for
   * @param cards - Array of card configurations
   * @param errorId - Error ID for logging failures
   * @returns Promise that resolves when all triggers complete
   *
   * @example
   * ```typescript
   * await flowHandler.triggerMultipleCards(
   *   this,
   *   [
   *     { cardId: 'zone_status_changed', tokens: { is_leaky: true } },
   *     { cardId: 'zone_leaky', tokens: {} }
   *   ],
   *   'ZONE_SEAL_004'
   * );
   * ```
   */
  public async triggerMultipleCards(
    device: Homey.Device,
    cards: Array<{ cardId: string; tokens: Record<string, unknown> }>,
    errorId: string
  ): Promise<void> {
    for (const { cardId, tokens } of cards) {
      await this.triggerDeviceCard(device, cardId, tokens, errorId);
    }
  }

  /**
   * Triggers a device trigger card with conditional logic.
   *
   * Triggers different cards based on a condition. Useful for paired cards
   * like zone_leaky / zone_sealed.
   *
   * @param device - Device to trigger card for
   * @param condition - Condition to evaluate
   * @param trueCardId - Card to trigger if condition is true
   * @param falseCardId - Card to trigger if condition is false
   * @param tokens - Token values for the flow card
   * @param errorId - Error ID for logging failures
   * @returns Promise that resolves when trigger completes
   *
   * @example
   * ```typescript
   * await flowHandler.triggerConditionalCard(
   *   this,
   *   isLeaky,
   *   'zone_leaky',
   *   'zone_sealed',
   *   {},
   *   'ZONE_SEAL_004'
   * );
   * ```
   */
  public async triggerConditionalCard(
    device: Homey.Device,
    condition: boolean,
    trueCardId: string,
    falseCardId: string,
    tokens: Record<string, unknown>,
    errorId: string
  ): Promise<void> {
    const cardId = condition ? trueCardId : falseCardId;
    await this.triggerDeviceCard(device, cardId, tokens, errorId);
  }

  /**
   * Registers a condition card handler with error handling.
   *
   * Wraps condition card handler registration to ensure errors are caught
   * and logged. Returns false on error instead of crashing flow execution.
   *
   * @param cardId - Condition card ID
   * @param handler - Handler function that evaluates the condition
   * @param errorId - Error ID for logging failures
   *
   * @example
   * ```typescript
   * flowHandler.registerConditionCard(
   *   'is_zone_leaky',
   *   async (args) => {
   *     return args.device.getCapabilityValue('alarm_zone_leaky');
   *   },
   *   'ZONE_SEAL_FLOW'
   * );
   * ```
   */
  public registerConditionCard(
    cardId: string,
    handler: (args: { device: Homey.Device }) => Promise<boolean> | boolean,
    errorId: string
  ): void {
    try {
      const card = this.homey.flow.getConditionCard(cardId);

      if (!card) {
        this.logger.error(
          `[${errorId}] Condition card not found: ${cardId} - check .homeycompose configuration`
        );
        return;
      }

      card.registerRunListener(async (args: unknown) => {
        try {
          return await handler(args as { device: Homey.Device });
        } catch (error) {
          this.logger.error(
            `[${errorId}] Condition card ${cardId} evaluation failed:`,
            error
          );
          // Return false on error - safer than throwing in flow execution
          return false;
        }
      });

      this.logger.log(`Registered condition card handler: ${cardId}`);
    } catch (error) {
      this.logger.error(
        `[${errorId}] Failed to register condition card ${cardId}:`,
        error
      );
    }
  }

  /**
   * Registers an action card handler with error handling.
   *
   * Wraps action card handler registration to ensure errors are properly
   * logged and propagated to the flow engine (actions should throw on failure).
   *
   * @param cardId - Action card ID
   * @param handler - Handler function that executes the action
   * @param errorId - Error ID for logging failures
   *
   * @example
   * ```typescript
   * flowHandler.registerActionCard(
   *   'set_state',
   *   async (args) => {
   *     await args.device.pauseDevice(args.state);
   *   },
   *   'DEVICE_ACTION'
   * );
   * ```
   */
  public registerActionCard(
    cardId: string,
    handler: (args: { device: Homey.Device; [key: string]: unknown }) => Promise<void>,
    errorId: string
  ): void {
    try {
      const card = this.homey.flow.getActionCard(cardId);

      if (!card) {
        this.logger.error(
          `[${errorId}] Action card not found: ${cardId} - check .homeycompose configuration`
        );
        return;
      }

      card.registerRunListener(async (args: unknown) => {
        try {
          await handler(args as { device: Homey.Device; [key: string]: unknown });
        } catch (error) {
          this.logger.error(
            `[${errorId}] Action card ${cardId} execution failed:`,
            error
          );
          // Re-throw for action cards - user should see failure
          throw error;
        }
      });

      this.logger.log(`Registered action card handler: ${cardId}`);
    } catch (error) {
      this.logger.error(
        `[${errorId}] Failed to register action card ${cardId}:`,
        error
      );
    }
  }
}
