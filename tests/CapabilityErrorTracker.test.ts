import { CapabilityErrorTracker } from '../lib/CapabilityErrorTracker';
import { ErrorSeverity } from '../lib/ErrorTypes';
import type { ErrorReporter } from '../lib/ErrorReporter';

// Mock ErrorReporter
interface MockErrorReporter {
  reportError: jest.Mock;
}

describe('CapabilityErrorTracker', () => {
  let tracker: CapabilityErrorTracker;
  let mockErrorReporter: MockErrorReporter;

  beforeEach(() => {
    tracker = new CapabilityErrorTracker();
    mockErrorReporter = {
      reportError: jest.fn(),
    };
  });

  describe('track', () => {
    it('should track successful capability update', () => {
      // Act
      tracker.track('onoff', true);

      // Assert
      expect(tracker.getSuccessCount()).toBe(1);
      expect(tracker.getFailureCount()).toBe(0);
      expect(tracker.getTotalCount()).toBe(1);
    });

    it('should track failed capability update', () => {
      // Arrange
      const error = new Error('Update failed');

      // Act
      tracker.track('dim', false, error);

      // Assert
      expect(tracker.getSuccessCount()).toBe(0);
      expect(tracker.getFailureCount()).toBe(1);
      expect(tracker.getTotalCount()).toBe(1);
    });

    it('should track multiple updates', () => {
      // Act
      tracker.track('onoff', true);
      tracker.track('dim', false, new Error('Dim failed'));
      tracker.track('hue', true);

      // Assert
      expect(tracker.getSuccessCount()).toBe(2);
      expect(tracker.getFailureCount()).toBe(1);
      expect(tracker.getTotalCount()).toBe(3);
    });
  });

  describe('hasAnyFailures', () => {
    it('should return false when no failures', () => {
      // Arrange
      tracker.track('onoff', true);
      tracker.track('dim', true);

      // Assert
      expect(tracker.hasAnyFailures()).toBe(false);
    });

    it('should return true when at least one failure', () => {
      // Arrange
      tracker.track('onoff', true);
      tracker.track('dim', false, new Error('Failed'));

      // Assert
      expect(tracker.hasAnyFailures()).toBe(true);
    });
  });

  describe('hasAllFailures', () => {
    it('should return false when no updates tracked', () => {
      // Assert
      expect(tracker.hasAllFailures()).toBe(false);
    });

    it('should return false when some succeed', () => {
      // Arrange
      tracker.track('onoff', true);
      tracker.track('dim', false, new Error('Failed'));

      // Assert
      expect(tracker.hasAllFailures()).toBe(false);
    });

    it('should return true when all fail', () => {
      // Arrange
      tracker.track('onoff', false, new Error('Failed 1'));
      tracker.track('dim', false, new Error('Failed 2'));

      // Assert
      expect(tracker.hasAllFailures()).toBe(true);
    });
  });

  describe('getFailedCapabilities', () => {
    it('should return empty array when no failures', () => {
      // Arrange
      tracker.track('onoff', true);

      // Assert
      expect(tracker.getFailedCapabilities()).toEqual([]);
    });

    it('should return failed capability names', () => {
      // Arrange
      tracker.track('onoff', false, new Error('Failed'));
      tracker.track('dim', true);
      tracker.track('hue', false, new Error('Failed'));

      // Assert
      expect(tracker.getFailedCapabilities()).toEqual(['onoff', 'hue']);
    });
  });

  describe('getSuccessfulCapabilities', () => {
    it('should return empty array when no successes', () => {
      // Arrange
      tracker.track('onoff', false, new Error('Failed'));

      // Assert
      expect(tracker.getSuccessfulCapabilities()).toEqual([]);
    });

    it('should return successful capability names', () => {
      // Arrange
      tracker.track('onoff', true);
      tracker.track('dim', false, new Error('Failed'));
      tracker.track('hue', true);

      // Assert
      expect(tracker.getSuccessfulCapabilities()).toEqual(['onoff', 'hue']);
    });
  });

  describe('determineSeverity', () => {
    it('should return CRITICAL when all capabilities fail', () => {
      // Arrange
      tracker.track('onoff', false, new Error('Failed 1'));
      tracker.track('dim', false, new Error('Failed 2'));
      tracker.track('hue', false, new Error('Failed 3'));

      // Assert
      expect(tracker.determineSeverity()).toBe(ErrorSeverity.CRITICAL);
    });

    it('should return HIGH when multiple capabilities fail', () => {
      // Arrange
      tracker.track('onoff', false, new Error('Failed'));
      tracker.track('dim', false, new Error('Failed'));
      tracker.track('hue', true);

      // Assert
      expect(tracker.determineSeverity()).toBe(ErrorSeverity.HIGH);
    });

    it('should return MEDIUM when single capability fails', () => {
      // Arrange
      tracker.track('onoff', true);
      tracker.track('dim', false, new Error('Failed'));
      tracker.track('hue', true);

      // Assert
      expect(tracker.determineSeverity()).toBe(ErrorSeverity.MEDIUM);
    });
  });

  describe('reportToErrorReporter', () => {
    it('should not report when no failures', () => {
      // Arrange
      tracker.track('onoff', true);
      tracker.track('dim', true);

      // Act
      tracker.reportToErrorReporter(
        mockErrorReporter as unknown as ErrorReporter,
        'TEST_ERROR',
        'device-123'
      );

      // Assert
      expect(mockErrorReporter.reportError).not.toHaveBeenCalled();
    });

    it('should report with CRITICAL severity when all fail', () => {
      // Arrange
      tracker.track('onoff', false, new Error('Failed 1'));
      tracker.track('dim', false, new Error('Failed 2'));

      // Act
      tracker.reportToErrorReporter(
        mockErrorReporter as unknown as ErrorReporter,
        'CAPABILITY_FAILED',
        'device-123'
      );

      // Assert
      expect(mockErrorReporter.reportError).toHaveBeenCalledWith({
        errorId: 'CAPABILITY_FAILED',
        severity: ErrorSeverity.CRITICAL,
        userMessage: expect.stringContaining('Failed to update all capabilities'),
        technicalMessage: expect.stringContaining('0/2 succeeded'),
        context: expect.objectContaining({
          deviceId: 'device-123',
          failedCapabilities: ['onoff', 'dim'],
          successfulCapabilities: [],
          totalAttempts: 2,
          failureCount: 2,
        }),
      });
    });

    it('should report with HIGH severity when multiple fail', () => {
      // Arrange
      tracker.track('onoff', false, new Error('Failed'));
      tracker.track('dim', false, new Error('Failed'));
      tracker.track('hue', true);

      // Act
      tracker.reportToErrorReporter(
        mockErrorReporter as unknown as ErrorReporter,
        'CAPABILITY_FAILED',
        'device-456'
      );

      // Assert
      expect(mockErrorReporter.reportError).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: ErrorSeverity.HIGH,
          userMessage: expect.stringContaining('Failed to update 2 capabilities'),
        })
      );
    });

    it('should report with MEDIUM severity when single fails', () => {
      // Arrange
      tracker.track('onoff', true);
      tracker.track('dim', false, new Error('Dim failed'));
      tracker.track('hue', true);

      // Act
      tracker.reportToErrorReporter(
        mockErrorReporter as unknown as ErrorReporter,
        'CAPABILITY_FAILED',
        'device-789'
      );

      // Assert
      expect(mockErrorReporter.reportError).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: ErrorSeverity.MEDIUM,
          userMessage: expect.stringContaining('Failed to update dim capability'),
        })
      );
    });

    it('should include error messages in context', () => {
      // Arrange
      tracker.track('onoff', false, new Error('Network timeout'));
      tracker.track('dim', true);

      // Act
      tracker.reportToErrorReporter(
        mockErrorReporter as unknown as ErrorReporter,
        'CAPABILITY_FAILED',
        'device-123'
      );

      // Assert
      expect(mockErrorReporter.reportError).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            errors: [
              {
                capability: 'onoff',
                message: 'Network timeout',
              },
            ],
          }),
        })
      );
    });

    it('should include additional context when provided', () => {
      // Arrange
      tracker.track('onoff', false, new Error('Failed'));
      const additionalContext = { zoneId: 'zone-123', retryAttempts: 3 };

      // Act
      tracker.reportToErrorReporter(
        mockErrorReporter as unknown as ErrorReporter,
        'CAPABILITY_FAILED',
        'device-123',
        additionalContext
      );

      // Assert
      expect(mockErrorReporter.reportError).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            zoneId: 'zone-123',
            retryAttempts: 3,
          }),
        })
      );
    });

    it('should include technical message with capability lists', () => {
      // Arrange
      tracker.track('onoff', false, new Error('Failed'));
      tracker.track('dim', true);
      tracker.track('hue', true);

      // Act
      tracker.reportToErrorReporter(
        mockErrorReporter as unknown as ErrorReporter,
        'CAPABILITY_FAILED',
        'device-123'
      );

      // Assert
      expect(mockErrorReporter.reportError).toHaveBeenCalledWith(
        expect.objectContaining({
          technicalMessage: expect.stringMatching(/2\/3 succeeded.*Failed: onoff.*Succeeded: dim, hue/s),
        })
      );
    });
  });

  describe('reset', () => {
    it('should clear all tracked results', () => {
      // Arrange
      tracker.track('onoff', true);
      tracker.track('dim', false, new Error('Failed'));

      // Act
      tracker.reset();

      // Assert
      expect(tracker.getTotalCount()).toBe(0);
      expect(tracker.getSuccessCount()).toBe(0);
      expect(tracker.getFailureCount()).toBe(0);
      expect(tracker.hasAnyFailures()).toBe(false);
    });

    it('should allow reuse after reset', () => {
      // Arrange
      tracker.track('onoff', false, new Error('Failed'));
      tracker.reset();

      // Act
      tracker.track('dim', true);

      // Assert
      expect(tracker.getTotalCount()).toBe(1);
      expect(tracker.getSuccessCount()).toBe(1);
      expect(tracker.getFailureCount()).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle tracking without error for failures', () => {
      // Act
      tracker.track('onoff', false);

      // Assert
      expect(tracker.getFailureCount()).toBe(1);
      expect(tracker.hasAnyFailures()).toBe(true);
    });

    it('should generate user messages for partial success', () => {
      // Arrange
      tracker.track('onoff', false, new Error('Failed'));
      tracker.track('dim', true);

      // Act
      tracker.reportToErrorReporter(
        mockErrorReporter as unknown as ErrorReporter,
        'TEST_ERROR',
        'device-123'
      );

      // Assert
      const call = mockErrorReporter.reportError.mock.calls[0][0];
      expect(call.userMessage).toContain('Other capabilities updated successfully');
    });

    it('should generate user messages for multiple failures with partial success', () => {
      // Arrange
      tracker.track('onoff', false, new Error('Failed'));
      tracker.track('dim', false, new Error('Failed'));
      tracker.track('hue', true);

      // Act
      tracker.reportToErrorReporter(
        mockErrorReporter as unknown as ErrorReporter,
        'TEST_ERROR',
        'device-123'
      );

      // Assert
      const call = mockErrorReporter.reportError.mock.calls[0][0];
      expect(call.userMessage).toContain('1 capabilities updated successfully');
    });
  });
});
