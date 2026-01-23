import Homey from 'homey';
import { CircuitBreakerHierarchyManager } from '../../lib/CircuitBreakerHierarchyManager';
import { CircuitBreakerCascadeEngine } from '../../lib/CircuitBreakerCascadeEngine';
import { validateCircuitBreakerSettings } from '../../lib/CircuitBreakerSettingsValidator';
import { HomeyAPI } from '../../lib/types';
import { CircuitBreakerErrorId } from '../../constants/errorIds';
import { BaseWIABDevice } from '../../lib/BaseWIABDevice';
import { ErrorReporter } from '../../lib/ErrorReporter';
import { ErrorSeverity } from '../../lib/ErrorTypes';
import { ErrorHandler } from '../../lib/ErrorHandler';

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
 * State changes (both ON and OFF) cascade from parent to all descendants.
 * Children can still be controlled independently.
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
 * - ALL state changes (both ON and OFF) cascade from parent to descendants
 * - Propagation is bidirectional: ON→ON and OFF→OFF
 * - State changes propagate recursively through entire descendant tree
 */
class CircuitBreakerDevice extends BaseWIABDevice {
  private hierarchyManager?: CircuitBreakerHierarchyManager | null;
  private cascadeEngine?: CircuitBreakerCascadeEngine | null;
  private homeyDeviceId?: string;

  /**
   * Initializes the circuit breaker device.
   *
   * Sets up:
   * - Hierarchy manager for parent-child queries
   * - Cascade engine for state propagation
   * - Capability listener for onoff state changes
   * - Initial state from capability value
   *
   * Performance Optimizations:
   * - Overall 30-second timeout prevents indefinite hanging
   */
  async onInit(): Promise<void> {
    this.log('Circuit breaker device initializing');

    // Initialize error handling utilities from base class
    this.initializeErrorHandling();

    try {
      // Wrap initialization in timeout to prevent indefinite hanging
      await this.initializeWithTimeout(() => this.performInitialization());

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
   * Performs the actual initialization steps.
   *
   * Separated from onInit() to allow timeout wrapper.
   *
   * @private
   * @returns {Promise<void>}
   */
  private async performInitialization(): Promise<void> {
    try {
      // Get HomeyAPI instance from app
      const app = this.homey.app as WIABApp;
      if (!app.homeyApi) {
        throw new Error('HomeyAPI not available');
      }

      // ═══════════════════════════════════════════════════════════════════
      // Homey Device ID Lookup
      // ═══════════════════════════════════════════════════════════════════
      // Circuit breaker devices use custom data.id for parent-child relationships.
      // The custom ID is generated during pairing (circuit-breaker-${Date.now()})
      // and stored in device.data for persistence across app restarts. This enables
      // parent-child references without requiring knowledge of Homey's UUID system.
      //
      // However, HomeyAPI cascade operations require the Homey-assigned UUID to
      // identify devices in the getDevices() map and call setCapabilityValue().
      //
      // Problem: Device context only provides custom data.id, not the HomeyAPI UUID
      // Solution: Match custom data.id against all devices to find the UUID
      //
      // This O(n) lookup happens once during each device initialization:
      // 1. Get all devices from HomeyAPI (returns {uuid: device} map)
      // 2. Iterate through devices checking each device.data.id property
      // 3. Match against this device's custom data.id
      // 4. Store the matching UUID for cascade operations
      //
      // ⚠️ Performance Note: With N circuit breaker devices, each device's O(n)
      // lookup results in O(n²) total startup cost when all devices initialize
      // simultaneously (e.g., app start, Homey reboot).
      //
      // Tested acceptable for N < 100 (typical home automation deployment).
      // For N ≥ 100, consider implementing app-level UUID cache to reduce
      // initialization to O(n) total. This is accepted technical debt for
      // current use cases but should be addressed if deployments exceed 100 devices.
      //
      // Example mapping:
      //   Custom data.id: "circuit-breaker-1234567890"  (from pairing)
      //   HomeyAPI UUID:  "a3f8c9d2-e5b4-4c3a-9f2d-1a5e6b7c8d9e"  (Homey-assigned)
      // ═══════════════════════════════════════════════════════════════════
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
        await this.onCapabilityOnoff(value);
      });
    } catch (error) {
      throw error; // Re-throw to be caught by onInit
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
    this.log(`Circuit breaker ${deviceId} state changing to ${value ? 'ON' : 'OFF'}`);

    try {
      await this.triggerFlowCards(value);
      await this.cascadeStateToDescendants(value);
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
   * Cascades state change to all descendant circuit breakers.
   *
   * Handles cascade execution, logging, and error reporting.
   * Uses safeSetWarning/safeClearWarning from BaseWIABDevice.
   *
   * @param value - New onoff state to cascade
   * @private
   */
  private async cascadeStateToDescendants(value: boolean): Promise<void> {
    if (!this.cascadeEngine || !this.homeyDeviceId) {
      return;
    }

    const deviceId = this.getData().id;
    this.log(`Cascading ${value ? 'ON' : 'OFF'} state to descendants of ${deviceId} (Homey ID: ${this.homeyDeviceId})`);

    try {
      const result = await this.cascadeEngine.cascadeStateChange(this.homeyDeviceId, value);
      this.log(`Cascade complete: ${result.success} succeeded, ${result.failed} failed`);

      if (result.failed > 0) {
        await this.handleCascadeFailures(result);
      } else {
        await this.handleCascadeSuccess();
      }
    } catch (cascadeError) {
      await this.handleCascadeError(cascadeError);
      throw cascadeError;
    }
  }

  /**
   * Handles cascade failures by logging errors and warning the user.
   *
   * Attempts to warn user via device warning. If warning fails, throws error
   * to ensure user sees cascade failure in flow execution.
   *
   * @param result - Cascade result containing errors
   * @private
   */
  private async handleCascadeFailures(result: { success: number; failed: number; errors: Array<{ deviceId: string; notFound?: boolean }> }): Promise<void> {
    this.logCascadeFailureDetails(result);

    const totalDevices = result.success + result.failed;
    const warningMessage = `${result.failed} of ${totalDevices} child circuit breaker(s) failed to update. Some flows may still execute.`;

    const userNotified = await this.safeSetWarning(
      CircuitBreakerErrorId.CASCADE_FAILED,
      warningMessage
    );

    if (!userNotified) {
      throw this.createCascadeFailureError(result, totalDevices);
    }
  }

  /**
   * Logs detailed information about cascade failures.
   *
   * @param result - Cascade result containing error details
   * @private
   */
  private logCascadeFailureDetails(result: { failed: number; errors: Array<{ notFound?: boolean }> }): void {
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
  }

  /**
   * Creates an error to throw when cascade fails and warning system is unavailable.
   *
   * @param result - Cascade result containing failed devices
   * @param totalDevices - Total number of devices in cascade
   * @returns Error with detailed failure information
   * @private
   */
  private createCascadeFailureError(result: { failed: number; errors: Array<{ deviceId: string }> }, totalDevices: number): Error {
    const failedDeviceIds = result.errors.map(e => e.deviceId).slice(0, 3).join(', ');
    const moreDevices = result.errors.length > 3 ? ` and ${result.errors.length - 3} more` : '';

    return new Error(
      `CRITICAL: Circuit breaker cascade failed for ${result.failed} of ${totalDevices} child devices. ` +
      `Warning system unavailable - this error shown as fallback notification. ` +
      `Failed devices: ${failedDeviceIds}${moreDevices}. ` +
      `Wait a moment and try again. If problem persists, restart the app to restore warning system.`
    );
  }

  /**
   * Handles successful cascade by clearing any existing warnings.
   *
   * Uses safeClearWarning from BaseWIABDevice to handle warning API failures gracefully.
   *
   * @private
   */
  private async handleCascadeSuccess(): Promise<void> {
    await this.safeClearWarning(CircuitBreakerErrorId.CASCADE_FAILED);
  }

  /**
   * Handles cascade engine errors by logging and attempting to warn the user.
   *
   * @param cascadeError - Error thrown by cascade engine
   * @private
   */
  private async handleCascadeError(cascadeError: unknown): Promise<void> {
    const errorId = (cascadeError as { errorId?: string })?.errorId ||
      CircuitBreakerErrorId.CASCADE_ENGINE_FAILED;

    this.error(
      `[${errorId}] Cascade failed:`,
      cascadeError instanceof Error ? cascadeError.message : String(cascadeError)
    );

    if (cascadeError instanceof Error && cascadeError.stack) {
      this.error(`[${errorId}] Stack trace:`, cascadeError.stack);
    }

    await this.safeSetWarning(
      CircuitBreakerErrorId.CASCADE_ENGINE_FAILED,
      'Circuit breaker cascade failed. Child circuit breakers may not be updated. Wait a moment and try again. If the problem persists, restart the app.'
    );
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
      // Distinguish between expected flow card failures vs programming errors
      // Use ErrorHandler for robust error classification instead of string matching
      if (ErrorHandler.isFlowCardError(error)) {
        // Expected flow card failure - log but don't escalate
        // Flow card triggers are non-critical - state changes proceed even if triggers fail
        this.error(
          `[${CircuitBreakerErrorId.FLOW_CARD_TRIGGER_FAILED}] Flow card trigger failed (non-critical):`,
          error
        );
      } else {
        // Unexpected error (programming bug) - log with CRITICAL severity
        // Flow cards are non-critical, so don't throw even for unexpected errors
        this.error(
          `[${CircuitBreakerErrorId.FLOW_CARD_TRIGGER_FAILED}] CRITICAL: Unexpected flow card error (possible SDK bug):`,
          error
        );

        // Set warning to alert user about broken automations
        // State change succeeded, so don't throw even if warning fails
        try {
          await this.setWarning(
            'Flow automations may not be working correctly. Circuit breaker state changes will continue to work. Check app logs or restart the app.'
          );
        } catch (warningError) {
          // Even if warning fails, don't throw - flow cards are non-critical
          // State change succeeded, that's what matters
          this.error(
            `[${CircuitBreakerErrorId.WARNING_SET_FAILED}] Cannot warn user about flow card failure:`,
            warningError
          );
        }
      }
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
          // Extract specific failure reasons for better diagnostics
          const failureReasons = failures.map((f, idx) => {
            if (f.status === 'rejected') {
              return `Child ${idx}: ${f.reason?.message || 'Unknown error'}`;
            }
            return '';
          }).filter(Boolean).join('; ');

          const errorReporter = new ErrorReporter({
            log: this.log.bind(this),
            error: this.error.bind(this),
          });

          this.error(
            `[${CircuitBreakerErrorId.ORPHAN_CHILDREN_FAILED}] Orphaning failures:`,
            failureReasons
          );

          const message = errorReporter.reportAndGetMessage({
            errorId: CircuitBreakerErrorId.ORPHAN_CHILDREN_FAILED,
            severity: ErrorSeverity.HIGH,
            userMessage: `Cannot delete: ${failures.length} child circuit breaker(s) failed to orphan. Delete all child devices first, or contact support if this persists.`,
            technicalMessage: `Orphaning failed: ${failureReasons}`,
          });

          // Also try to set device warning for visibility
          try {
            await this.setWarning(message);
          } catch (warningError) {
            // Log warning failure for diagnostics (deletion already failing)
            this.error(
              `[${CircuitBreakerErrorId.WARNING_SET_FAILED}] Could not set warning during deletion failure:`,
              warningError
            );
          }

          throw new Error(message);
        }

        // Only proceed with cleanup if orphaning succeeded
        this.log('All children orphaned successfully');
      }

      // Cleanup resources to prevent memory leaks
      if (this.hierarchyManager) {
        this.hierarchyManager = null;
      }

      if (this.cascadeEngine) {
        this.cascadeEngine = null;
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
