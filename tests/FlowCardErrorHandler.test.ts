import { FlowCardErrorHandler } from '../lib/FlowCardErrorHandler';
import { Logger } from '../lib/ErrorTypes';
import Homey from 'homey';

// Mock Homey flow interface
interface MockFlowCard {
  trigger: jest.Mock;
}

interface MockConditionCard {
  registerRunListener: jest.Mock;
}

interface MockActionCard {
  registerRunListener: jest.Mock;
}

interface MockHomeyFlow {
  getDeviceTriggerCard: jest.Mock<MockFlowCard | undefined>;
  getConditionCard: jest.Mock<MockConditionCard | undefined>;
  getActionCard: jest.Mock<MockActionCard | undefined>;
}

interface MockHomey {
  flow: MockHomeyFlow;
}

describe('FlowCardErrorHandler', () => {
  let mockHomey: MockHomey;
  let mockLogger: Logger;
  let mockDevice: Homey.Device;
  let flowCardHandler: FlowCardErrorHandler;

  beforeEach(() => {
    // Arrange: Create mocks
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
    };

    mockDevice = {} as Homey.Device;

    mockHomey = {
      flow: {
        getDeviceTriggerCard: jest.fn(),
        getConditionCard: jest.fn(),
        getActionCard: jest.fn(),
      },
    };

    flowCardHandler = new FlowCardErrorHandler(mockHomey as unknown as {
      flow: {
        getDeviceTriggerCard(id: string): { trigger(...args: unknown[]): Promise<void> } | undefined;
        getConditionCard(id: string): { registerRunListener(...args: unknown[]): void } | undefined;
        getActionCard(id: string): { registerRunListener(...args: unknown[]): void } | undefined;
      };
    }, mockLogger);
  });

  describe('triggerDeviceCard', () => {
    it('should trigger flow card successfully', async () => {
      // Arrange
      const mockCard: MockFlowCard = {
        trigger: jest.fn().mockResolvedValue(undefined),
      };
      mockHomey.flow.getDeviceTriggerCard.mockReturnValue(mockCard);

      const tokens = { is_leaky: true };
      const errorId = 'TEST_001';

      // Act
      await flowCardHandler.triggerDeviceCard(mockDevice, 'zone_leaky', tokens, errorId);

      // Assert
      expect(mockHomey.flow.getDeviceTriggerCard).toHaveBeenCalledWith('zone_leaky');
      expect(mockCard.trigger).toHaveBeenCalledWith(mockDevice, tokens);
      expect(mockLogger.log).toHaveBeenCalledWith('Triggered flow card: zone_leaky');
    });

    it('should log error if card not found', async () => {
      // Arrange
      mockHomey.flow.getDeviceTriggerCard.mockReturnValue(undefined);

      const errorId = 'TEST_002';

      // Act
      await flowCardHandler.triggerDeviceCard(mockDevice, 'nonexistent_card', {}, errorId);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[TEST_002] Flow card not found: nonexistent_card')
      );
    });

    it('should handle trigger failure gracefully', async () => {
      // Arrange
      const error = new Error('Trigger failed');
      const mockCard: MockFlowCard = {
        trigger: jest.fn().mockRejectedValue(error),
      };
      mockHomey.flow.getDeviceTriggerCard.mockReturnValue(mockCard);

      const errorId = 'TEST_003';

      // Act
      await flowCardHandler.triggerDeviceCard(mockDevice, 'failing_card', {}, errorId);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[TEST_003] Failed to trigger flow card failing_card'),
        error
      );
    });

    it('should not throw on card not found', async () => {
      // Arrange
      mockHomey.flow.getDeviceTriggerCard.mockReturnValue(undefined);

      // Act & Assert - should not throw
      await expect(
        flowCardHandler.triggerDeviceCard(mockDevice, 'missing_card', {}, 'TEST_004')
      ).resolves.toBeUndefined();
    });

    it('should not throw on trigger failure', async () => {
      // Arrange
      const mockCard: MockFlowCard = {
        trigger: jest.fn().mockRejectedValue(new Error('Trigger error')),
      };
      mockHomey.flow.getDeviceTriggerCard.mockReturnValue(mockCard);

      // Act & Assert - should not throw
      await expect(
        flowCardHandler.triggerDeviceCard(mockDevice, 'failing_card', {}, 'TEST_005')
      ).resolves.toBeUndefined();
    });
  });

  describe('triggerMultipleCards', () => {
    it('should trigger multiple cards in sequence', async () => {
      // Arrange
      const mockCard1: MockFlowCard = { trigger: jest.fn().mockResolvedValue(undefined) };
      const mockCard2: MockFlowCard = { trigger: jest.fn().mockResolvedValue(undefined) };

      mockHomey.flow.getDeviceTriggerCard
        .mockReturnValueOnce(mockCard1)
        .mockReturnValueOnce(mockCard2);

      const cards = [
        { cardId: 'card1', tokens: { value1: 'test1' } },
        { cardId: 'card2', tokens: { value2: 'test2' } },
      ];

      const errorId = 'TEST_006';

      // Act
      await flowCardHandler.triggerMultipleCards(mockDevice, cards, errorId);

      // Assert
      expect(mockCard1.trigger).toHaveBeenCalledWith(mockDevice, { value1: 'test1' });
      expect(mockCard2.trigger).toHaveBeenCalledWith(mockDevice, { value2: 'test2' });
    });

    it('should continue triggering cards even if one fails', async () => {
      // Arrange
      const mockCard1: MockFlowCard = {
        trigger: jest.fn().mockRejectedValue(new Error('Card 1 failed')),
      };
      const mockCard2: MockFlowCard = { trigger: jest.fn().mockResolvedValue(undefined) };

      mockHomey.flow.getDeviceTriggerCard
        .mockReturnValueOnce(mockCard1)
        .mockReturnValueOnce(mockCard2);

      const cards = [
        { cardId: 'card1', tokens: {} },
        { cardId: 'card2', tokens: {} },
      ];

      // Act
      await flowCardHandler.triggerMultipleCards(mockDevice, cards, 'TEST_007');

      // Assert - both cards attempted even though first failed
      expect(mockCard1.trigger).toHaveBeenCalled();
      expect(mockCard2.trigger).toHaveBeenCalled();
    });
  });

  describe('triggerConditionalCard', () => {
    it('should trigger true card when condition is true', async () => {
      // Arrange
      const mockCard: MockFlowCard = { trigger: jest.fn().mockResolvedValue(undefined) };
      mockHomey.flow.getDeviceTriggerCard.mockReturnValue(mockCard);

      const errorId = 'TEST_008';

      // Act
      await flowCardHandler.triggerConditionalCard(
        mockDevice,
        true,
        'true_card',
        'false_card',
        { test: 'value' },
        errorId
      );

      // Assert
      expect(mockHomey.flow.getDeviceTriggerCard).toHaveBeenCalledWith('true_card');
      expect(mockCard.trigger).toHaveBeenCalledWith(mockDevice, { test: 'value' });
    });

    it('should trigger false card when condition is false', async () => {
      // Arrange
      const mockCard: MockFlowCard = { trigger: jest.fn().mockResolvedValue(undefined) };
      mockHomey.flow.getDeviceTriggerCard.mockReturnValue(mockCard);

      const errorId = 'TEST_009';

      // Act
      await flowCardHandler.triggerConditionalCard(
        mockDevice,
        false,
        'true_card',
        'false_card',
        { test: 'value' },
        errorId
      );

      // Assert
      expect(mockHomey.flow.getDeviceTriggerCard).toHaveBeenCalledWith('false_card');
      expect(mockCard.trigger).toHaveBeenCalledWith(mockDevice, { test: 'value' });
    });
  });

  describe('registerConditionCard', () => {
    it('should register condition card handler', () => {
      // Arrange
      const mockCard: MockConditionCard = {
        registerRunListener: jest.fn(),
      };
      mockHomey.flow.getConditionCard.mockReturnValue(mockCard);

      const handler = jest.fn().mockResolvedValue(true);
      const errorId = 'TEST_010';

      // Act
      flowCardHandler.registerConditionCard('is_active', handler, errorId);

      // Assert
      expect(mockHomey.flow.getConditionCard).toHaveBeenCalledWith('is_active');
      expect(mockCard.registerRunListener).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Registered condition card handler: is_active'
      );
    });

    it('should wrap handler to catch errors', async () => {
      // Arrange
      let registeredHandler: (args: { device: Homey.Device }) => Promise<boolean>;

      const mockCard: MockConditionCard = {
        registerRunListener: jest.fn((handler) => {
          registeredHandler = handler;
        }),
      };
      mockHomey.flow.getConditionCard.mockReturnValue(mockCard);

      const handler = jest.fn().mockRejectedValue(new Error('Handler error'));
      const errorId = 'TEST_011';

      // Act
      flowCardHandler.registerConditionCard('failing_condition', handler, errorId);

      // Call registered handler
      const result = await registeredHandler!({ device: mockDevice });

      // Assert
      expect(result).toBe(false); // Returns false on error instead of throwing
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[TEST_011] Condition card failing_condition evaluation failed'),
        expect.any(Error)
      );
    });

    it('should return handler result when successful', async () => {
      // Arrange
      let registeredHandler: (args: { device: Homey.Device }) => Promise<boolean>;

      const mockCard: MockConditionCard = {
        registerRunListener: jest.fn((handler) => {
          registeredHandler = handler;
        }),
      };
      mockHomey.flow.getConditionCard.mockReturnValue(mockCard);

      const handler = jest.fn().mockResolvedValue(true);

      // Act
      flowCardHandler.registerConditionCard('test_condition', handler, 'TEST_012');

      const result = await registeredHandler!({ device: mockDevice });

      // Assert
      expect(result).toBe(true);
      expect(handler).toHaveBeenCalledWith({ device: mockDevice });
    });

    it('should log error if card not found', () => {
      // Arrange
      mockHomey.flow.getConditionCard.mockReturnValue(undefined);

      const handler = jest.fn();
      const errorId = 'TEST_013';

      // Act
      flowCardHandler.registerConditionCard('missing_card', handler, errorId);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[TEST_013] Condition card not found: missing_card')
      );
    });
  });

  describe('registerActionCard', () => {
    it('should register action card handler', () => {
      // Arrange
      const mockCard: MockActionCard = {
        registerRunListener: jest.fn(),
      };
      mockHomey.flow.getActionCard.mockReturnValue(mockCard);

      const handler = jest.fn().mockResolvedValue(undefined);
      const errorId = 'TEST_014';

      // Act
      flowCardHandler.registerActionCard('do_action', handler, errorId);

      // Assert
      expect(mockHomey.flow.getActionCard).toHaveBeenCalledWith('do_action');
      expect(mockCard.registerRunListener).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Registered action card handler: do_action'
      );
    });

    it('should wrap handler to catch and re-throw errors', async () => {
      // Arrange
      let registeredHandler: (args: { device: Homey.Device }) => Promise<void>;

      const mockCard: MockActionCard = {
        registerRunListener: jest.fn((handler) => {
          registeredHandler = handler;
        }),
      };
      mockHomey.flow.getActionCard.mockReturnValue(mockCard);

      const error = new Error('Action failed');
      const handler = jest.fn().mockRejectedValue(error);
      const errorId = 'TEST_015';

      // Act
      flowCardHandler.registerActionCard('failing_action', handler, errorId);

      // Call registered handler and expect it to throw
      await expect(registeredHandler!({ device: mockDevice })).rejects.toThrow('Action failed');

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[TEST_015] Action card failing_action execution failed'),
        error
      );
    });

    it('should pass through successful handler execution', async () => {
      // Arrange
      let registeredHandler: (args: { device: Homey.Device; value: string }) => Promise<void>;

      const mockCard: MockActionCard = {
        registerRunListener: jest.fn((handler) => {
          registeredHandler = handler;
        }),
      };
      mockHomey.flow.getActionCard.mockReturnValue(mockCard);

      const handler = jest.fn().mockResolvedValue(undefined);

      // Act
      flowCardHandler.registerActionCard('test_action', handler, 'TEST_016');

      await registeredHandler!({ device: mockDevice, value: 'test' });

      // Assert
      expect(handler).toHaveBeenCalledWith({ device: mockDevice, value: 'test' });
    });

    it('should log error if card not found', () => {
      // Arrange
      mockHomey.flow.getActionCard.mockReturnValue(undefined);

      const handler = jest.fn();
      const errorId = 'TEST_017';

      // Act
      flowCardHandler.registerActionCard('missing_card', handler, errorId);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[TEST_017] Action card not found: missing_card')
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty tokens object', async () => {
      // Arrange
      const mockCard: MockFlowCard = { trigger: jest.fn().mockResolvedValue(undefined) };
      mockHomey.flow.getDeviceTriggerCard.mockReturnValue(mockCard);

      // Act
      await flowCardHandler.triggerDeviceCard(mockDevice, 'test_card', {}, 'TEST_018');

      // Assert
      expect(mockCard.trigger).toHaveBeenCalledWith(mockDevice, {});
    });

    it('should handle complex token values', async () => {
      // Arrange
      const mockCard: MockFlowCard = { trigger: jest.fn().mockResolvedValue(undefined) };
      mockHomey.flow.getDeviceTriggerCard.mockReturnValue(mockCard);

      const complexTokens = {
        number: 42,
        boolean: true,
        string: 'test',
        object: { nested: 'value' },
        array: [1, 2, 3],
      };

      // Act
      await flowCardHandler.triggerDeviceCard(mockDevice, 'test_card', complexTokens, 'TEST_019');

      // Assert
      expect(mockCard.trigger).toHaveBeenCalledWith(mockDevice, complexTokens);
    });

    it('should handle registration failure gracefully', () => {
      // Arrange
      const mockCard: MockConditionCard = {
        registerRunListener: jest.fn(() => {
          throw new Error('Registration failed');
        }),
      };
      mockHomey.flow.getConditionCard.mockReturnValue(mockCard);

      const handler = jest.fn();

      // Act & Assert - should not throw
      expect(() => {
        flowCardHandler.registerConditionCard('test_card', handler, 'TEST_020');
      }).not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to register condition card'),
        expect.any(Error)
      );
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete flow card triggering workflow', async () => {
      // Arrange
      const mockCard: MockFlowCard = { trigger: jest.fn().mockResolvedValue(undefined) };
      mockHomey.flow.getDeviceTriggerCard.mockReturnValue(mockCard);

      // Act - trigger multiple related cards
      await flowCardHandler.triggerDeviceCard(mockDevice, 'state_changed', { state: 'active' }, 'FLOW_001');
      await flowCardHandler.triggerConditionalCard(mockDevice, true, 'activated', 'deactivated', {}, 'FLOW_002');

      // Assert
      expect(mockCard.trigger).toHaveBeenCalledTimes(2);
    });

    it('should handle complete card registration workflow', () => {
      // Arrange
      const mockConditionCard: MockConditionCard = { registerRunListener: jest.fn() };
      const mockActionCard: MockActionCard = { registerRunListener: jest.fn() };

      mockHomey.flow.getConditionCard.mockReturnValue(mockConditionCard);
      mockHomey.flow.getActionCard.mockReturnValue(mockActionCard);

      const conditionHandler = jest.fn().mockResolvedValue(true);
      const actionHandler = jest.fn().mockResolvedValue(undefined);

      // Act
      flowCardHandler.registerConditionCard('is_active', conditionHandler, 'REG_001');
      flowCardHandler.registerActionCard('set_state', actionHandler, 'REG_002');

      // Assert
      expect(mockConditionCard.registerRunListener).toHaveBeenCalled();
      expect(mockActionCard.registerRunListener).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledTimes(2);
    });
  });
});
