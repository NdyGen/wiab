import Homey from 'homey';
import { WarningManager } from './WarningManager';
import { ErrorReporter } from './ErrorReporter';
import { FlowCardErrorHandler } from './FlowCardErrorHandler';
import { RetryManager } from './RetryManager';
import { ErrorClassifier } from './ErrorClassifier';

/**
 * Base class for WIAB device types with shared error handling initialization.
 *
 * All WIAB device types (Zone Seal, Room State, Circuit Breaker, WIAB Device)
 * require the same error handling utilities (WarningManager, ErrorReporter, etc.).
 * This base class provides common initialization to reduce code duplication.
 *
 * Extending classes should:
 * 1. Call initializeErrorHandling() at the start of onInit()
 * 2. Access error handling utilities via protected properties
 * 3. Follow standard error handling patterns from CLAUDE.md
 *
 * Example (based on actual Zone Seal implementation):
 * ```typescript
 * class WIABZoneSealDevice extends BaseWIABDevice {
 *   async onInit(): Promise<void> {
 *     this.log('WIAB Zone Seal device initializing');
 *
 *     // Initialize error handling utilities first
 *     this.initializeErrorHandling();
 *
 *     try {
 *       await this.loadSensorConfiguration();
 *       await this.initializeState();
 *       await this.setupMonitoring();
 *
 *       this.log('WIAB Zone Seal device initialization complete');
 *     } catch (error) {
 *       await this.handleInitializationError(error);
 *     }
 *   }
 *
 *   private async handleInitializationError(error: unknown): Promise<void> {
 *     this.errorReporter!.reportError({
 *       errorId: ErrorId.DEVICE_INIT_FAILED,
 *       severity: ErrorSeverity.CRITICAL,
 *       userMessage: 'Device initialization failed. Check configuration.',
 *       technicalMessage: `Failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}`,
 *       context: { deviceId: this.getData().id },
 *     });
 *
 *     try {
 *       await this.warningManager!.setWarning(
 *         ErrorId.DEVICE_INIT_FAILED,
 *         'Device initialization failed. Check sensor configuration in settings.'
 *       );
 *     } catch (warningError) {
 *       this.error('Failed to set warning:', warningError);
 *     }
 *   }
 * }
 * ```
 *
 * @class BaseWIABDevice
 * @extends {Homey.Device}
 */
export abstract class BaseWIABDevice extends Homey.Device {
  /**
   * Warning manager for user-facing warnings in Homey UI.
   * Initialized by initializeErrorHandling().
   * @protected
   */
  protected warningManager?: WarningManager;

  /**
   * Error reporter for centralized error logging and Sentry integration.
   * Initialized by initializeErrorHandling().
   * @protected
   */
  protected errorReporter?: ErrorReporter;

  /**
   * Flow card error handler for robust flow card operations.
   * Initialized by initializeErrorHandling().
   * @protected
   */
  protected flowCardHandler?: FlowCardErrorHandler;

  /**
   * Retry manager for exponential backoff retry logic.
   * Initialized by initializeErrorHandling().
   * @protected
   */
  protected retryManager?: RetryManager;

  /**
   * Error classifier for retry decision logic.
   * Initialized by initializeErrorHandling().
   * @protected
   */
  protected errorClassifier?: ErrorClassifier;

  /**
   * Initializes error handling utilities for the device.
   *
   * Creates instances of:
   * - WarningManager: User-facing warning system
   * - ErrorReporter: Centralized error reporting with Sentry
   * - FlowCardErrorHandler: Flow card error handling
   * - RetryManager: Exponential backoff retry logic
   * - ErrorClassifier: Error classification for retry decisions
   *
   * This method should be called at the start of onInit() in extending classes.
   *
   * @protected
   */
  protected initializeErrorHandling(): void {
    this.warningManager = new WarningManager(this, this);
    this.errorReporter = new ErrorReporter(this);
    this.flowCardHandler = new FlowCardErrorHandler(this.homey, this);
    this.retryManager = new RetryManager(this);
    this.errorClassifier = new ErrorClassifier(this);
  }
}
