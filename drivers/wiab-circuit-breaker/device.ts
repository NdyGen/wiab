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
 * - When parent turns ON → all descendants turn ON (cascade)
 * - State changes propagate recursively through entire descendant tree
 */
class CircuitBreakerDevice extends Homey.Device {
  private hierarchyManager?: CircuitBreakerHierarchyManager;
  private cascadeEngine?: CircuitBreakerCascadeEngine;
  private homeyDeviceId?: string;

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

      // Find this device's Homey UUID by matching data.id
      const customDataId = this.getData().id;
      const allDevices = await app.homeyApi.devices.getDevices();
      for (const [deviceId, device] of Object.entries(allDevices)) {
        const deviceData = (device as unknown as { data?: { id?: string } }).data;
        if (deviceData?.id === customDataId) {
          this.homeyDeviceId = deviceId;
          this.log(`Found Homey device ID: ${deviceId} for data.id: ${customDataId}`);
          break;
        }
      }

      if (!this.homeyDeviceId) {
        throw new Error(`Could not find Homey device ID for data.id: ${customDataId}`);
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
        this.log(`[CAPABILITY LISTENER] onoff capability changed to ${value}`);
        await this.onCapabilityOnoff(value);
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
   * 2. Cascade state to all descendants (both ON and OFF propagate)
   *
   * @param value - New onoff state (true = ON, false = OFF)
   * @returns Promise that resolves when state change is complete
   */
  private async onCapabilityOnoff(value: boolean): Promise<void> {
    const deviceId = this.getData().id;
    this.log(`[CAPABILITY LISTENER] onoff capability changed to ${value}`);
    this.log(`Circuit breaker ${deviceId} state changing to ${value ? 'ON' : 'OFF'}`);

    try {
      // Trigger flow cards for state change
      await this.triggerFlowCards(value);

      // Cascade state to all descendants (both ON and OFF)
      if (this.cascadeEngine && this.homeyDeviceId) {
        this.log(`Cascading ${value ? 'ON' : 'OFF'} state to descendants of ${deviceId} (Homey ID: ${this.homeyDeviceId})`);
        try {
          const result = await this.cascadeEngine.cascadeStateChange(this.homeyDeviceId, value);
          this.log(
            `Cascade complete: ${result.success} succeeded, ${result.failed} failed`
          );

        if (result.failed > 0) {
          const notFoundCount = result.errors.filter(e => e.notFound).length;
          const updateFailedCount = result.failed - notFoundCount;

          let errorDetail = '';
          if (notFoundCount > 0) {
            errorDetail += `${notFoundCount} devices no longer exist. `;
          }
          if (updateFailedCount > 0) {
            errorDetail += `${updateFailedCount} devices failed to update.`;
          }

          this.error(
            `[${CircuitBreakerErrorId.CASCADE_FAILED}] Cascade failures: ${errorDetail}`,
            result.errors
          );

          // Warn user if more than 20% of cascades failed
          const totalDevices = result.success + result.failed;
          const failureRate = result.failed / totalDevices;
          if (failureRate > 0.2) {
            try {
              await this.setWarning(
                `${result.failed} of ${totalDevices} child circuit breakers failed to update. Some flows may still execute.`
              );
            } catch (warningError) {
              // Warning failed - log error but don't throw
              // Users won't see device warning, but cascade failure is still logged
              this.error('Failed to set cascade failure warning - user will not see device card warning:', warningError);
            }
          }
        } else {
          // Clear warning if cascade succeeds
          try {
            await this.unsetWarning();
          } catch (warningError) {
            // Log but don't throw - warning clear failure is not critical
            this.error('Failed to clear warning after successful cascade:', warningError);
          }
        }
        } catch (cascadeError) {
          this.error('[CASCADE ERROR] Failed to cascade state change:', cascadeError);
          this.error('[CASCADE ERROR] Error details:', cascadeError instanceof Error ? cascadeError.stack : String(cascadeError));
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
      // Flow card triggers are non-critical - state changes proceed even if triggers fail
      // Log for debugging but don't throw or report as error
      this.log('Flow card trigger failed (non-critical):', error);
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
   * Orphans all children (sets their parentId to null) in a blocking manner.
   * Children become root circuit breakers when parent is deleted.
   * Deletion fails if orphaning fails to prevent data corruption.
   */
  async onDeleted(): Promise<void> {
    this.log('Circuit breaker device being deleted');

    try {
      const deviceId = this.getData().id;

      // Orphan children (blocking operation)
      if (this.hierarchyManager) {
        this.log(`Orphaning children of ${deviceId}`);

        // Get all children IDs and update their settings
        const childIds = await this.hierarchyManager.getChildren(deviceId);

        const orphanResults = await Promise.allSettled(
          childIds.map(async (childId) => {
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
            } else {
              throw new Error(`Child device ${childId} not found`);
            }
          })
        );

        const failures = orphanResults.filter(r => r.status === 'rejected');
        if (failures.length > 0) {
          const errorReporter = new ErrorReporter({
            log: this.log.bind(this),
            error: this.error.bind(this),
          });
          const message = errorReporter.reportAndGetMessage({
            errorId: CircuitBreakerErrorId.ORPHAN_CHILDREN_FAILED,
            severity: ErrorSeverity.HIGH,
            userMessage: `Failed to orphan ${failures.length} child circuit breakers. Deletion cannot proceed. Check device logs.`,
            technicalMessage: `Orphaning failed for ${failures.length} devices`,
          });
          throw new Error(message);
        }

        // Only proceed with cleanup if orphaning succeeded
        this.log('All children orphaned successfully');
      }

      this.log('Circuit breaker device deleted');
    } catch (error) {
      this.error(
        `[${CircuitBreakerErrorId.DEVICE_DELETION_FAILED}] Error during deletion:`,
        error
      );
      throw error;
    }
  }
}

module.exports = CircuitBreakerDevice;
