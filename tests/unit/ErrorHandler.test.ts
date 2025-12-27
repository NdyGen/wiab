/**
 * Unit tests for ErrorHandler class
 *
 * Tests cover:
 * - isWarningApiError: detection of warning API unavailability
 * - isFlowCardError: detection of flow card unavailability
 * - isDeviceNotFound: detection of device not found errors
 * - createCascadeError: CascadeError creation with context
 * - createHierarchyError: HierarchyError creation with context
 * - createValidationError: ValidationError creation with context
 * - createDeviceNotFoundError: DeviceNotFoundError creation with context
 * - Error message differentiation: distinct messages for different error types
 */

import { ErrorHandler } from '../../lib/ErrorHandler';
import {
  CascadeError,
  HierarchyError,
  ValidationError,
  DeviceNotFoundError,
} from '../../lib/CircuitBreakerErrors';
import { CircuitBreakerErrorId } from '../../constants/errorIds';

describe('ErrorHandler', () => {
  describe('isWarningApiError', () => {
    it('should return true for "not supported" errors', () => {
      const error = new Error('Warning API not supported');
      expect(ErrorHandler.isWarningApiError(error)).toBe(true);
    });

    it('should return false for generic errors', () => {
      const error = new Error('Something went wrong');
      expect(ErrorHandler.isWarningApiError(error)).toBe(false);
    });

    it('should return false for non-Error values', () => {
      expect(ErrorHandler.isWarningApiError('string error')).toBe(false);
      expect(ErrorHandler.isWarningApiError(null)).toBe(false);
      expect(ErrorHandler.isWarningApiError(undefined)).toBe(false);
    });
  });

  describe('isFlowCardError', () => {
    it('should return true for "not supported" errors', () => {
      const error = new Error('Flow card not supported');
      expect(ErrorHandler.isFlowCardError(error)).toBe(true);
    });

    it('should return false for generic errors', () => {
      const error = new Error('Something went wrong');
      expect(ErrorHandler.isFlowCardError(error)).toBe(false);
    });

    it('should return false for non-Error values', () => {
      expect(ErrorHandler.isFlowCardError('string error')).toBe(false);
      expect(ErrorHandler.isFlowCardError(null)).toBe(false);
      expect(ErrorHandler.isFlowCardError(undefined)).toBe(false);
    });
  });

  describe('isDeviceNotFound', () => {
    it('should return true for DeviceNotFoundError instances', () => {
      const error = new DeviceNotFoundError('device-1', CircuitBreakerErrorId.CHILD_UPDATE_FAILED);
      expect(ErrorHandler.isDeviceNotFound(error)).toBe(true);
    });

    it('should return true for errors with name "DeviceNotFoundError"', () => {
      const error = new Error('Device not found');
      error.name = 'DeviceNotFoundError';
      expect(ErrorHandler.isDeviceNotFound(error)).toBe(true);
    });

    it('should return true for errors with notFound flag', () => {
      const error = new Error('Device not found') as Error & { notFound?: boolean };
      error.notFound = true;
      expect(ErrorHandler.isDeviceNotFound(error)).toBe(true);
    });

    it('should return false for generic errors', () => {
      const error = new Error('Something went wrong');
      expect(ErrorHandler.isDeviceNotFound(error)).toBe(false);
    });

    it('should return false for non-Error values', () => {
      expect(ErrorHandler.isDeviceNotFound('string error')).toBe(false);
      expect(ErrorHandler.isDeviceNotFound(null)).toBe(false);
      expect(ErrorHandler.isDeviceNotFound(undefined)).toBe(false);
    });
  });

  describe('createCascadeError', () => {
    it('should create CascadeError with correct properties', () => {
      const cause = new Error('Original error');
      const error = ErrorHandler.createCascadeError(
        'Cascade failed',
        CircuitBreakerErrorId.CASCADE_FAILED,
        2,
        3,
        cause,
        { deviceId: 'parent-1' }
      );

      expect(error).toBeInstanceOf(CascadeError);
      expect(error.message).toBe('Cascade failed');
      expect(error.errorId).toBe(CircuitBreakerErrorId.CASCADE_FAILED);
      expect(error.successCount).toBe(2);
      expect(error.failedCount).toBe(3);
      expect(error.cause).toBe(cause);
      expect(error.context).toMatchObject({
        deviceId: 'parent-1',
        successCount: 2,
        failedCount: 3,
        causeMessage: 'Original error',
      });
    });

    it('should create CascadeError without cause', () => {
      const error = ErrorHandler.createCascadeError(
        'Cascade failed',
        CircuitBreakerErrorId.CASCADE_FAILED,
        0,
        5
      );

      expect(error).toBeInstanceOf(CascadeError);
      expect(error.cause).toBeUndefined();
      expect(error.context?.causeMessage).toBeUndefined();
    });
  });

  describe('createHierarchyError', () => {
    it('should create HierarchyError with correct properties', () => {
      const cause = new Error('Hierarchy query failed');
      const error = ErrorHandler.createHierarchyError(
        'Failed to get children',
        CircuitBreakerErrorId.GET_CHILDREN_FAILED,
        'device-1',
        'getChildren',
        cause
      );

      expect(error).toBeInstanceOf(HierarchyError);
      expect(error.message).toBe('Failed to get children');
      expect(error.errorId).toBe(CircuitBreakerErrorId.GET_CHILDREN_FAILED);
      expect(error.deviceId).toBe('device-1');
      expect(error.operation).toBe('getChildren');
      expect(error.cause).toBe(cause);
    });
  });

  describe('createValidationError', () => {
    it('should create ValidationError with correct properties', () => {
      const error = ErrorHandler.createValidationError(
        'Cycle detected',
        CircuitBreakerErrorId.CYCLE_DETECTED,
        'parentId',
        'circuit-breaker-123'
      );

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Cycle detected');
      expect(error.errorId).toBe(CircuitBreakerErrorId.CYCLE_DETECTED);
      expect(error.field).toBe('parentId');
      expect(error.invalidValue).toBe('circuit-breaker-123');
    });

    it('should create ValidationError without field and value', () => {
      const error = ErrorHandler.createValidationError(
        'Validation failed',
        CircuitBreakerErrorId.SETTINGS_UPDATE_FAILED
      );

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.field).toBeUndefined();
      expect(error.invalidValue).toBeUndefined();
    });
  });

  describe('createDeviceNotFoundError', () => {
    it('should create DeviceNotFoundError with correct properties', () => {
      const error = ErrorHandler.createDeviceNotFoundError(
        'child-1',
        CircuitBreakerErrorId.CHILD_UPDATE_FAILED
      );

      expect(error).toBeInstanceOf(DeviceNotFoundError);
      expect(error.message).toBe('Device child-1 not found in HomeyAPI');
      expect(error.errorId).toBe(CircuitBreakerErrorId.CHILD_UPDATE_FAILED);
      expect(error.deviceId).toBe('child-1');
      expect(error.notFound).toBe(true);
    });
  });

  describe('Error message differentiation', () => {
    it('should have distinct error messages for different error types', () => {
      // Create different error types
      const cascadeError = ErrorHandler.createCascadeError(
        'Cascade operation failed',
        CircuitBreakerErrorId.CASCADE_FAILED,
        2,
        3
      );

      const hierarchyError = ErrorHandler.createHierarchyError(
        'Hierarchy query failed',
        CircuitBreakerErrorId.GET_CHILDREN_FAILED,
        'device-1',
        'getChildren'
      );

      const validationError = ErrorHandler.createValidationError(
        'Validation error occurred',
        CircuitBreakerErrorId.CYCLE_DETECTED,
        'parentId',
        'invalid-value'
      );

      const deviceNotFoundError = ErrorHandler.createDeviceNotFoundError(
        'missing-device',
        CircuitBreakerErrorId.CHILD_UPDATE_FAILED
      );

      // Collect all error messages
      const messages = [
        cascadeError.message,
        hierarchyError.message,
        validationError.message,
        deviceNotFoundError.message,
      ];

      // Verify all messages are distinct
      const uniqueMessages = new Set(messages);
      expect(uniqueMessages.size).toBe(4);

      // Verify messages are non-empty and descriptive
      messages.forEach(message => {
        expect(message).toBeTruthy();
        expect(message.length).toBeGreaterThan(10);
      });

      // Verify specific message content
      expect(cascadeError.message).toBe('Cascade operation failed');
      expect(hierarchyError.message).toBe('Hierarchy query failed');
      expect(validationError.message).toBe('Validation error occurred');
      expect(deviceNotFoundError.message).toContain('missing-device');
      expect(deviceNotFoundError.message).toContain('not found');
    });

    it('should include context in error messages where appropriate', () => {
      const cascadeError = ErrorHandler.createCascadeError(
        'Cascade failed for parent device',
        CircuitBreakerErrorId.CASCADE_FAILED,
        5,
        2,
        undefined,
        { parentDevice: 'breaker-1', state: 'OFF' }
      );

      const deviceNotFoundError = ErrorHandler.createDeviceNotFoundError(
        'device-xyz-123',
        CircuitBreakerErrorId.CHILD_UPDATE_FAILED,
        { operation: 'cascade', timestamp: Date.now() }
      );

      // Verify context is preserved
      expect(cascadeError.context).toHaveProperty('parentDevice', 'breaker-1');
      expect(cascadeError.context).toHaveProperty('state', 'OFF');
      expect(cascadeError.context).toHaveProperty('successCount', 5);
      expect(cascadeError.context).toHaveProperty('failedCount', 2);

      expect(deviceNotFoundError.context).toHaveProperty('operation', 'cascade');
      expect(deviceNotFoundError.context).toHaveProperty('timestamp');
      expect(deviceNotFoundError.context).toHaveProperty('deviceId', 'device-xyz-123');
    });
  });
});
