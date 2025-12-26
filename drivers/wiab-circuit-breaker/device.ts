import Homey from 'homey';
import { CircuitBreakerHierarchyManager } from '../../lib/CircuitBreakerHierarchyManager';
import { CircuitBreakerCascadeEngine } from '../../lib/CircuitBreakerCascadeEngine';
import { validateCircuitBreakerSettings } from '../../lib/CircuitBreakerSettingsValidator';
import { HomeyAPI } from '../../lib/types';
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
 * Circuit Breaker Device - Hierarchical flow control for Homey automations
 *
 * This device implements a virtual circuit breaker with parent-child hierarchy.
 * When a circuit breaker is turned OFF, it blocks flows and cascades the OFF state
 * to all descendant breakers. Children can still be controlled independently.
 *
 * Key Features:
 * - ON/OFF state with capability 'onoff'
 * - Parent-child tree structure for hierarchy
 * - State cascading from parent to all descendants
 * - Cycle detection to prevent circular dependencies
 * - Orphaning behavior (children become root breakers when parent deleted)
 * - Flow card integration (triggers, conditions, actions)
 *
 * Lifecycle:
 * 1. onInit() - Initialize state, setup cascade engine, register capability listener
 * 2. onSettings() - Validate parent changes, prevent cycles, update hierarchy
 * 3. onDeleted() - Orphan all children (async fire-and-forget)
 *
 * State Propagation:
 * - When parent turns OFF → all descendants turn OFF (cascade)
 * - When parent turns ON → children retain their current state
 * - Children can turn ON/OFF independently regardless of parent state
 */
class CircuitBreakerDevice extends Homey.Device {
  private hierarchyManager?: CircuitBreakerHierarchyManager;
  private cascadeEngine?: CircuitBreakerCascadeEngine;

  /**
   * Initializes the circuit breaker device.
   *
   * Sets up:
   * - Hierarchy manager for parent-child queries
   * - Cascade engine for state propagation
   * - Capability listener for onoff state changes
   * - Initial state from capability value
   */
  async onInit(): Promise<void> {
    this.log('Circuit breaker device initializing');

    try {
      // Get HomeyAPI instance from app
      const app = this.homey.app as WIABApp;
      if (!app.homeyApi) {
        throw new Error('HomeyAPI not available');
      }

      // Initialize hierarchy manager and cascade engine
      this.hierarchyManager = new CircuitBreakerHierarchyManager(app.homeyApi, {
        log: this.log.bind(this),
        error: this.error.bind(this),
      });
      this.cascadeEngine = new CircuitBreakerCascadeEngine(
        app.homeyApi,
        this.hierarchyManager,
        {
          log: this.log.bind(this),
          error: this.error.bind(this),
        }
      );

      // Register capability listener for onoff
      this.registerCapabilityListener('onoff', async (value: boolean) => {
        return this.onCapabilityOnoff(value);
      });

      // Log initialization success
      const currentState = this.getCapabilityValue('onoff') ?? true;
      const parentId = this.getSetting('parentId');
      this.log(
        `Circuit breaker initialized: state=${currentState ? 'ON' : 'OFF'}, parent=${parentId || 'none'}`
      );
    } catch (error) {
      this.error(`[${CircuitBreakerErrorId.DEVICE_INIT_FAILED}] Device initialization failed:`, error);
      throw error;
    }
  }

  /**
   * Handles onoff capability changes.
   *
   * When state changes:
   * 1. Trigger appropriate flow cards (turned_on, turned_off, flipped)
   * 2. If turning OFF, cascade state to all descendants
   * 3. If turning ON, descendants retain their state
   *
   * @param value - New onoff state (true = ON, false = OFF)
   * @returns Promise that resolves when state change is complete
   */
  private async onCapabilityOnoff(value: boolean): Promise<void> {
    const deviceId = this.getData().id;
    this.log(`Circuit breaker ${deviceId} state changing to ${value ? 'ON' : 'OFF'}`);

    try {
      // Trigger flow cards for state change
      await this.triggerFlowCards(value);

      // If turning OFF, cascade to all descendants
      if (!value && this.cascadeEngine) {
        this.log(`Cascading OFF state to descendants of ${deviceId}`);
        const result = await this.cascadeEngine.cascadeStateChange(deviceId, false);
        this.log(
          `Cascade complete: ${result.success} succeeded, ${result.failed} failed`
        );

        if (result.failed > 0) {
          this.error(
            `[${CircuitBreakerErrorId.CASCADE_FAILED}] ${result.failed} descendants failed to update:`,
            result.errors
          );
        }
      }

      this.log(`Circuit breaker ${deviceId} state changed successfully`);
    } catch (error) {
      const errorReporter = new ErrorReporter({
        log: this.log.bind(this),
        error: this.error.bind(this),
      });
      const message = errorReporter.reportAndGetMessage({
        errorId: CircuitBreakerErrorId.CAPABILITY_UPDATE_FAILED,
        severity: ErrorSeverity.HIGH,
        userMessage: 'Failed to update circuit breaker state',
        technicalMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(message);
    }
  }

  /**
   * Triggers flow cards for state changes.
   *
   * Fires:
   * - turned_on: When breaker turns ON
   * - turned_off: When breaker turns OFF
   * - flipped: On any state change (with state token)
   *
   * Flow card triggers are non-critical and don't block state changes on failure.
   *
   * @param newState - New onoff state
   */
  private async triggerFlowCards(newState: boolean): Promise<void> {
    try {
      const driver = this.driver as unknown as {
        turnedOnTrigger?: Homey.FlowCardTriggerDevice;
        turnedOffTrigger?: Homey.FlowCardTriggerDevice;
        flippedTrigger?: Homey.FlowCardTriggerDevice;
      };

      // Trigger specific state flow cards
      if (newState) {
        await driver.turnedOnTrigger?.trigger(this, {}, {});
      } else {
        await driver.turnedOffTrigger?.trigger(this, {}, {});
      }

      // Trigger flipped flow card with state token
      await driver.flippedTrigger?.trigger(
        this,
        { state: newState },
        {}
      );

      this.log(`Flow cards triggered for state=${newState ? 'ON' : 'OFF'}`);
    } catch (error) {
      const errorReporter = new ErrorReporter({
        log: this.log.bind(this),
        error: this.error.bind(this),
      });
      const message = errorReporter.reportAndGetMessage({
        errorId: CircuitBreakerErrorId.FLOW_CARD_TRIGGER_FAILED,
        severity: ErrorSeverity.MEDIUM,
        userMessage: 'Flow card trigger failed',
        technicalMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw - flow cards are non-critical
      this.error(message);
    }
  }

  /**
   * Handles settings changes.
   *
   * Validates parent ID changes:
   * - Prevents self-parent assignment
   * - Prevents circular dependencies
   * - Updates hierarchy when parent changes
   *
   * @param event - Settings change event
   */
  async onSettings(event: {
    oldSettings: { [key: string]: string | number | boolean | null | undefined };
    newSettings: { [key: string]: string | number | boolean | null | undefined };
    changedKeys: string[];
  }): Promise<void> {
    this.log('Circuit breaker settings changing');

    try {
      // Only validate if parentId changed
      if (!event.changedKeys.includes('parentId')) {
        return;
      }

      const deviceId = this.getData().id;
      const oldParentId = event.oldSettings.parentId as string | null | undefined;
      const newParentId = event.newSettings.parentId as string | null | undefined;

      // Validate new parent assignment
      if (!this.hierarchyManager) {
        throw new Error('Hierarchy manager not initialized');
      }

      // Validate settings (includes cycle detection)
      await validateCircuitBreakerSettings(
        event.newSettings,
        deviceId,
        this.hierarchyManager
      );

      this.log(
        `Parent ID changed from ${oldParentId || 'none'} to ${newParentId || 'none'}`
      );
    } catch (error) {
      this.error(
        `[${CircuitBreakerErrorId.SETTINGS_UPDATE_FAILED}] Settings update failed:`,
        error
      );
      throw error;
    }
  }

  /**
   * Handles device deletion.
   *
   * Orphans all children (sets their parentId to null) in a fire-and-forget manner.
   * Children become root circuit breakers when parent is deleted.
   */
  async onDeleted(): Promise<void> {
    this.log('Circuit breaker device being deleted');

    try {
      const deviceId = this.getData().id;

      // Orphan children (fire-and-forget)
      if (this.hierarchyManager) {
        this.log(`Orphaning children of ${deviceId}`);

        // Get all children IDs and update their settings asynchronously
        const childrenIds = await this.hierarchyManager.getChildren(deviceId);

        // Fire-and-forget orphan operation
        Promise.allSettled(
          childrenIds.map(async (childId) => {
            try {
              // Get child device through driver
              const driver = this.driver;
              const devices = driver.getDevices();
              const childDevice = devices.find((d) => {
                const data = d.getData() as { id: string };
                return data.id === childId;
              });

              if (childDevice) {
                await childDevice.setSettings({ parentId: null });
                this.log(`Orphaned child ${childId}`);
              }
            } catch (error) {
              this.error(
                `[${CircuitBreakerErrorId.ORPHAN_CHILDREN_FAILED}] Failed to orphan child ${childId}:`,
                error
              );
            }
          })
        )
          .then((results) => {
            const failures = results.filter((r) => r.status === 'rejected');
            if (failures.length > 0) {
              this.error(
                `[${CircuitBreakerErrorId.ORPHAN_CHILDREN_FAILED}] Failed to orphan ${failures.length} children`,
                failures
              );
            }
          });
      }

      this.log('Circuit breaker device deleted');
    } catch (error) {
      this.error(
        `[${CircuitBreakerErrorId.DEVICE_DELETION_FAILED}] Error during deletion:`,
        error
      );
      // Don't throw - deletion should proceed even if orphaning fails
    }
  }
}

module.exports = CircuitBreakerDevice;
