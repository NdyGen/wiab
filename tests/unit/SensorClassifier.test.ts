/**
 * Unit tests for SensorClassifier module.
 *
 * Tests cover:
 * - Classification of PIR capabilities (alarm_motion, alarm_occupancy, etc.)
 * - Classification of door capabilities (alarm_contact, etc.)
 * - Edge cases and fallback behavior
 */

import {
  classifySensor,
  classifySensors,
  isDoorCapability,
  isPirCapability,
  SensorType,
} from '../../lib/SensorClassifier';
import type { SensorConfig } from '../../lib/types';

describe('SensorClassifier', () => {
  describe('classifySensor', () => {
    describe('PIR capabilities', () => {
      it('should classify alarm_motion as PIR', () => {
        const sensor: SensorConfig = { deviceId: 'd1', capability: 'alarm_motion' };
        const result = classifySensor(sensor);
        expect(result.type).toBe(SensorType.PIR);
      });

      it('should classify alarm_occupancy as PIR', () => {
        const sensor: SensorConfig = { deviceId: 'd1', capability: 'alarm_occupancy' };
        const result = classifySensor(sensor);
        expect(result.type).toBe(SensorType.PIR);
      });

      it('should classify alarm_presence as PIR', () => {
        const sensor: SensorConfig = { deviceId: 'd1', capability: 'alarm_presence' };
        const result = classifySensor(sensor);
        expect(result.type).toBe(SensorType.PIR);
      });

      it('should classify motion_alarm as PIR', () => {
        const sensor: SensorConfig = { deviceId: 'd1', capability: 'motion_alarm' };
        const result = classifySensor(sensor);
        expect(result.type).toBe(SensorType.PIR);
      });

      it('should classify presence_alarm as PIR', () => {
        const sensor: SensorConfig = { deviceId: 'd1', capability: 'presence_alarm' };
        const result = classifySensor(sensor);
        expect(result.type).toBe(SensorType.PIR);
      });

      it('should classify motion as PIR', () => {
        const sensor: SensorConfig = { deviceId: 'd1', capability: 'motion' };
        const result = classifySensor(sensor);
        expect(result.type).toBe(SensorType.PIR);
      });

      it('should classify presence as PIR', () => {
        const sensor: SensorConfig = { deviceId: 'd1', capability: 'presence' };
        const result = classifySensor(sensor);
        expect(result.type).toBe(SensorType.PIR);
      });

      it('should be case-insensitive for PIR capabilities', () => {
        const sensor: SensorConfig = { deviceId: 'd1', capability: 'ALARM_OCCUPANCY' };
        const result = classifySensor(sensor);
        expect(result.type).toBe(SensorType.PIR);
      });
    });

    describe('door capabilities', () => {
      it('should classify alarm_contact as DOOR', () => {
        const sensor: SensorConfig = { deviceId: 'd1', capability: 'alarm_contact' };
        const result = classifySensor(sensor);
        expect(result.type).toBe(SensorType.DOOR);
      });

      it('should classify alarm_window as DOOR', () => {
        const sensor: SensorConfig = { deviceId: 'd1', capability: 'alarm_window' };
        const result = classifySensor(sensor);
        expect(result.type).toBe(SensorType.DOOR);
      });

      it('should classify alarm_door as DOOR', () => {
        const sensor: SensorConfig = { deviceId: 'd1', capability: 'alarm_door' };
        const result = classifySensor(sensor);
        expect(result.type).toBe(SensorType.DOOR);
      });

      it('should be case-insensitive for door capabilities', () => {
        const sensor: SensorConfig = { deviceId: 'd1', capability: 'ALARM_CONTACT' };
        const result = classifySensor(sensor);
        expect(result.type).toBe(SensorType.DOOR);
      });
    });

    describe('substring matching', () => {
      it('should classify capability containing "motion" as PIR', () => {
        const sensor: SensorConfig = { deviceId: 'd1', capability: 'custom_motion_sensor' };
        const result = classifySensor(sensor);
        expect(result.type).toBe(SensorType.PIR);
      });

      it('should classify capability containing "presence" as PIR', () => {
        const sensor: SensorConfig = { deviceId: 'd1', capability: 'my_presence_detector' };
        const result = classifySensor(sensor);
        expect(result.type).toBe(SensorType.PIR);
      });

      it('should classify capability containing "contact" as DOOR', () => {
        const sensor: SensorConfig = { deviceId: 'd1', capability: 'custom_contact_sensor' };
        const result = classifySensor(sensor);
        expect(result.type).toBe(SensorType.DOOR);
      });

      it('should classify capability containing "door" as DOOR', () => {
        const sensor: SensorConfig = { deviceId: 'd1', capability: 'garage_door_sensor' };
        const result = classifySensor(sensor);
        expect(result.type).toBe(SensorType.DOOR);
      });

      it('should classify capability containing "window" as DOOR', () => {
        const sensor: SensorConfig = { deviceId: 'd1', capability: 'window_sensor_status' };
        const result = classifySensor(sensor);
        expect(result.type).toBe(SensorType.DOOR);
      });
    });

    describe('fallback behavior', () => {
      it('should default to PIR for unknown capabilities', () => {
        const sensor: SensorConfig = { deviceId: 'd1', capability: 'unknown_sensor' };
        const result = classifySensor(sensor);
        expect(result.type).toBe(SensorType.PIR);
      });
    });

    describe('preserves sensor properties', () => {
      it('should preserve deviceId and capability in result', () => {
        const sensor: SensorConfig = {
          deviceId: 'test-device',
          capability: 'alarm_occupancy',
          deviceName: 'Test Sensor'
        };
        const result = classifySensor(sensor);

        expect(result.deviceId).toBe('test-device');
        expect(result.capability).toBe('alarm_occupancy');
        expect(result.deviceName).toBe('Test Sensor');
        expect(result.type).toBe(SensorType.PIR);
      });
    });
  });

  describe('classifySensors', () => {
    it('should separate sensors into doors and pirs', () => {
      const sensors: SensorConfig[] = [
        { deviceId: 'd1', capability: 'alarm_motion' },
        { deviceId: 'd2', capability: 'alarm_contact' },
        { deviceId: 'd3', capability: 'alarm_occupancy' },
        { deviceId: 'd4', capability: 'alarm_window' },
      ];

      const { doors, pirs } = classifySensors(sensors);

      expect(pirs).toHaveLength(2);
      expect(doors).toHaveLength(2);
      expect(pirs.map(s => s.deviceId)).toContain('d1');
      expect(pirs.map(s => s.deviceId)).toContain('d3');
      expect(doors.map(s => s.deviceId)).toContain('d2');
      expect(doors.map(s => s.deviceId)).toContain('d4');
    });

    it('should handle empty array', () => {
      const { doors, pirs } = classifySensors([]);
      expect(doors).toHaveLength(0);
      expect(pirs).toHaveLength(0);
    });

    it('should handle all PIR sensors', () => {
      const sensors: SensorConfig[] = [
        { deviceId: 'd1', capability: 'alarm_motion' },
        { deviceId: 'd2', capability: 'alarm_occupancy' },
      ];

      const { doors, pirs } = classifySensors(sensors);
      expect(pirs).toHaveLength(2);
      expect(doors).toHaveLength(0);
    });

    it('should handle all door sensors', () => {
      const sensors: SensorConfig[] = [
        { deviceId: 'd1', capability: 'alarm_contact' },
        { deviceId: 'd2', capability: 'alarm_door' },
      ];

      const { doors, pirs } = classifySensors(sensors);
      expect(doors).toHaveLength(2);
      expect(pirs).toHaveLength(0);
    });
  });

  describe('isPirCapability', () => {
    it('should return true for alarm_motion', () => {
      expect(isPirCapability('alarm_motion')).toBe(true);
    });

    it('should return true for alarm_occupancy', () => {
      expect(isPirCapability('alarm_occupancy')).toBe(true);
    });

    it('should return false for alarm_contact', () => {
      expect(isPirCapability('alarm_contact')).toBe(false);
    });
  });

  describe('isDoorCapability', () => {
    it('should return true for alarm_contact', () => {
      expect(isDoorCapability('alarm_contact')).toBe(true);
    });

    it('should return false for alarm_motion', () => {
      expect(isDoorCapability('alarm_motion')).toBe(false);
    });

    it('should return false for alarm_occupancy', () => {
      expect(isDoorCapability('alarm_occupancy')).toBe(false);
    });
  });
});
