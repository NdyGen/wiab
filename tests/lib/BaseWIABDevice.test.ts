import { BaseWIABDevice } from '../../lib/BaseWIABDevice';
import { WarningManager } from '../../lib/WarningManager';
import { ErrorReporter } from '../../lib/ErrorReporter';
import { FlowCardErrorHandler } from '../../lib/FlowCardErrorHandler';
import { RetryManager } from '../../lib/RetryManager';
import { ErrorClassifier } from '../../lib/ErrorClassifier';
import { ErrorSeverity } from '../../lib/ErrorTypes';
import { createMockHomey } from '../setup';

// Concrete test implementation of BaseWIABDevice
class TestDevice extends BaseWIABDevice {
  async onInit(): Promise<void> {
    this.log('Test device initializing');
    this.initializeErrorHandling();
  }

  // Expose protected properties for testing
  public getWarningManager(): WarningManager | undefined {
    return this.warningManager;
  }

  public getErrorReporter(): ErrorReporter | undefined {
    return this.errorReporter;
  }

  public getFlowCardHandler(): FlowCardErrorHandler | undefined {
    return this.flowCardHandler;
  }

  public getRetryManager(): RetryManager | undefined {
    return this.retryManager;
  }

  public getErrorClassifier(): ErrorClassifier | undefined {
    return this.errorClassifier;
  }
}

describe('BaseWIABDevice', () => {
  let device: TestDevice;
  let mockHomey: ReturnType<typeof createMockHomey>;

  beforeEach(() => {
    mockHomey = createMockHomey();
    device = new TestDevice();
    Object.assign(device, {
      homey: mockHomey,
      log: jest.fn(),
      error: jest.fn(),
      setWarning: jest.fn(),
      unsetWarning: jest.fn(),
      getData: jest.fn(() => ({ id: 'test-device-123' })),
      getName: jest.fn(() => 'Test Device'),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initializeErrorHandling', () => {
    it('should initialize all error handling utilities', async () => {
      // Act
      await device.onInit();

      // Assert
      expect(device.getWarningManager()).toBeInstanceOf(WarningManager);
      expect(device.getErrorReporter()).toBeInstanceOf(ErrorReporter);
      expect(device.getFlowCardHandler()).toBeInstanceOf(FlowCardErrorHandler);
      expect(device.getRetryManager()).toBeInstanceOf(RetryManager);
      expect(device.getErrorClassifier()).toBeInstanceOf(ErrorClassifier);
    });

    it('should initialize WarningManager with correct context', async () => {
      // Act
      await device.onInit();

      // Assert
      const warningManager = device.getWarningManager();
      expect(warningManager).toBeDefined();
    });

    it('should initialize ErrorReporter with correct context', async () => {
      // Act
      await device.onInit();

      // Assert
      const errorReporter = device.getErrorReporter();
      expect(errorReporter).toBeDefined();
    });

    it('should initialize FlowCardErrorHandler with homey instance', async () => {
      // Act
      await device.onInit();

      // Assert
      const flowCardHandler = device.getFlowCardHandler();
      expect(flowCardHandler).toBeDefined();
    });

    it('should initialize RetryManager with correct context', async () => {
      // Act
      await device.onInit();

      // Assert
      const retryManager = device.getRetryManager();
      expect(retryManager).toBeDefined();
    });

    it('should initialize ErrorClassifier with correct context', async () => {
      // Act
      await device.onInit();

      // Assert
      const errorClassifier = device.getErrorClassifier();
      expect(errorClassifier).toBeDefined();
    });

    it('should initialize utilities before device-specific logic', async () => {
      // Arrange
      const initOrder: string[] = [];

      class OrderTestDevice extends BaseWIABDevice {
        async onInit(): Promise<void> {
          initOrder.push('start');
          this.initializeErrorHandling();
          initOrder.push('error-handling-initialized');

          // Verify utilities are available after initializeErrorHandling
          if (this.warningManager) {
            initOrder.push('warningManager-available');
          }
          if (this.errorReporter) {
            initOrder.push('errorReporter-available');
          }
          if (this.flowCardHandler) {
            initOrder.push('flowCardHandler-available');
          }
          if (this.retryManager) {
            initOrder.push('retryManager-available');
          }
          if (this.errorClassifier) {
            initOrder.push('errorClassifier-available');
          }

          initOrder.push('device-logic');
        }
      }

      const orderDevice = new OrderTestDevice();
      Object.assign(orderDevice, {
        homey: mockHomey,
        log: jest.fn(),
        error: jest.fn(),
        getData: jest.fn(() => ({ id: 'test-device-order' })),
        getName: jest.fn(() => 'Order Test Device'),
      });

      // Act
      await orderDevice.onInit();

      // Assert
      expect(initOrder).toEqual([
        'start',
        'error-handling-initialized',
        'warningManager-available',
        'errorReporter-available',
        'flowCardHandler-available',
        'retryManager-available',
        'errorClassifier-available',
        'device-logic',
      ]);
    });

    it('should allow multiple calls without errors', async () => {
      // Act
      await device.onInit();
      await device.onInit(); // Second call

      // Assert - no error thrown
      expect(device.getWarningManager()).toBeInstanceOf(WarningManager);
      expect(device.getErrorReporter()).toBeInstanceOf(ErrorReporter);
    });
  });

  describe('error handling utilities usage', () => {
    it('should allow ErrorReporter usage after initialization', async () => {
      // Arrange
      await device.onInit();
      const errorReporter = device.getErrorReporter();

      // Act - Should not throw
      errorReporter?.reportError({
        errorId: 'TEST_ERROR',
        severity: ErrorSeverity.HIGH,
        userMessage: 'Test error',
        technicalMessage: 'Test technical message',
        context: { test: true },
      });

      // Assert
      expect(device.error).toHaveBeenCalledWith(
        expect.stringContaining('[TEST_ERROR]')
      );
    });

    it('should allow WarningManager usage after initialization', async () => {
      // Arrange
      await device.onInit();
      const warningManager = device.getWarningManager();

      // Act
      await warningManager?.setWarning('TEST_WARNING', 'Test warning message');

      // Assert
      expect(device.setWarning).toHaveBeenCalledWith('Test warning message');
    });

    it('should allow RetryManager usage after initialization', async () => {
      // Arrange
      await device.onInit();
      const retryManager = device.getRetryManager();

      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Retry me');
        }
        return 'success';
      };

      // Act
      const result = await retryManager?.retryWithBackoff(
        operation,
        'Test operation',
        { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2 }
      );

      // Assert
      expect(result?.success).toBe(true);
      expect(result?.value).toBe('success');
      expect(attempts).toBe(2);
    });
  });

  describe('inheritance behavior', () => {
    it('should be extendable by device implementations', async () => {
      // Arrange
      class CustomDevice extends BaseWIABDevice {
        private customProperty = 'custom';

        async onInit(): Promise<void> {
          this.initializeErrorHandling();
          this.log(`Custom device with property: ${this.customProperty}`);
        }

        public getCustomProperty(): string {
          return this.customProperty;
        }
      }

      const customDevice = new CustomDevice();
      Object.assign(customDevice, {
        homey: mockHomey,
        log: jest.fn(),
        error: jest.fn(),
        getData: jest.fn(() => ({ id: 'custom-device' })),
        getName: jest.fn(() => 'Custom Device'),
      });

      // Act
      await customDevice.onInit();

      // Assert
      expect(customDevice.getCustomProperty()).toBe('custom');
      expect(customDevice.log).toHaveBeenCalledWith(
        'Custom device with property: custom'
      );
    });

    it('should maintain Homey.Device functionality', () => {
      // Assert - verify base class is Homey.Device
      expect(device).toHaveProperty('log');
      expect(device).toHaveProperty('error');
      expect(device).toHaveProperty('getData');
      expect(device).toHaveProperty('getName');
    });
  });
});
