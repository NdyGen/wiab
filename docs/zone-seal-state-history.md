# Zone Seal State Transition History API

## Overview

The Zone Seal device tracks the last 100 state transitions with full context including timestamps, trigger types, sensor information, and stale sensor indicators. This document provides practical examples for accessing and analyzing this data.

## Quick Start

### Access from Device Class

```typescript
// Get full history
const history = this.transitionHistory;

// Get most recent transition
const last = history[history.length - 1];
console.log(`Last: ${last.fromState} → ${last.toState} (${last.trigger})`);
```

### Access from App Class

```typescript
const driver = this.homey.drivers.getDriver('wiab-zone-seal');
const device = driver.getDevice({ id: deviceId });
const history = await device.getStoreValue('transitionHistory') || [];
```

## API Methods

### Method 1: Direct Property Access (Within Device)

```typescript
// drivers/wiab-zone-seal/device.ts

// Full history array
const history: StateTransitionLogEntry[] = this.transitionHistory;

// Filter by trigger type
const staleTransitions = history.filter(t => t.trigger === 'stale_detected');

// Count recent transitions
const oneHourAgo = Date.now() - (60 * 60 * 1000);
const recent = history.filter(t => t.timestamp > oneHourAgo);
```

### Method 2: Device Store Access (From App)

```typescript
// app.ts

async getZoneSealHistory(deviceId: string): Promise<StateTransitionLogEntry[]> {
  const driver = this.homey.drivers.getDriver('wiab-zone-seal');
  const device = driver.getDevice({ id: deviceId });
  return await device.getStoreValue('transitionHistory') || [];
}
```

### Method 3: Real-Time Capability Listeners

```typescript
// Monitor state changes in real-time (Homey Web API compatible)
device.makeCapabilityInstance('alarm_zone_leaky', (value) => {
  console.log(`State changed: ${value ? 'LEAKY' : 'SEALED'}`);
  console.log(`Time: ${new Date().toISOString()}`);
});
```

### Method 4: Custom Flow Cards

```typescript
// Expose history via Flow cards for end users
this.homey.flow.getConditionCard('count_recent_transitions')
  .registerRunListener(async (args) => {
    const history = await args.device.getStoreValue('transitionHistory') || [];
    const cutoff = Date.now() - (args.hours * 60 * 60 * 1000);
    const count = history.filter(t => t.timestamp > cutoff).length;
    return count > args.threshold;
  });
```

### Method 5: JSON Export

```typescript
// Export for external analysis
async exportTransitionHistory(): Promise<string> {
  return JSON.stringify(this.transitionHistory.map(entry => ({
    timestamp: new Date(entry.timestamp).toISOString(),
    fromState: entry.fromState,
    toState: entry.toState,
    trigger: entry.trigger,
    sensorName: entry.sensorName,
    sensorStale: entry.sensorStale,
    nonStaleSensorCount: entry.nonStaleSensorCount,
    totalSensorCount: entry.totalSensorCount
  })), null, 2);
}
```

## Practical Examples

### Example 1: Identify Problematic Sensors

```typescript
async identifyProblematicSensors(deviceId: string): Promise<void> {
  const driver = this.homey.drivers.getDriver('wiab-zone-seal');
  const device = driver.getDevice({ id: deviceId });
  const history = await device.getStoreValue('transitionHistory') || [];

  // Count stale transitions per sensor
  const sensorIssues = new Map<string, number>();

  for (const entry of history) {
    if (entry.trigger === 'stale_detected' && entry.sensorId) {
      const count = sensorIssues.get(entry.sensorId) || 0;
      sensorIssues.set(entry.sensorId, count + 1);
    }
  }

  // Sort by frequency
  const sorted = Array.from(sensorIssues.entries())
    .sort((a, b) => b[1] - a[1]);

  console.log('Sensors with most stale transitions:');
  for (const [sensorId, count] of sorted) {
    const sensorName = history.find(t => t.sensorId === sensorId)?.sensorName || sensorId;
    console.log(`  ${sensorName}: ${count} times`);
  }
}
```

### Example 2: Calculate Uptime Statistics

```typescript
function calculateUptime(history: StateTransitionLogEntry[]): {
  sealedPercent: number;
  leakyPercent: number;
  avgSealedDuration: number;
} {
  let sealedTime = 0;
  let leakyTime = 0;
  let lastTimestamp = history[0]?.timestamp || Date.now();
  let lastState = history[0]?.toState || 'sealed';

  for (let i = 1; i < history.length; i++) {
    const duration = history[i].timestamp - lastTimestamp;

    if (lastState === 'sealed') {
      sealedTime += duration;
    } else if (lastState === 'leaky') {
      leakyTime += duration;
    }

    lastTimestamp = history[i].timestamp;
    lastState = history[i].toState;
  }

  const total = sealedTime + leakyTime;
  return {
    sealedPercent: (sealedTime / total) * 100,
    leakyPercent: (leakyTime / total) * 100,
    avgSealedDuration: sealedTime / history.filter(t => t.toState === 'sealed').length
  };
}
```

### Example 3: Detect Flapping (Rapid State Changes)

```typescript
function detectFlapping(history: StateTransitionLogEntry[], windowMinutes = 5): boolean {
  const windowMs = windowMinutes * 60 * 1000;
  const now = Date.now();

  // Count transitions in last N minutes
  const recentTransitions = history.filter(
    t => t.timestamp > now - windowMs
  );

  // More than 10 transitions in 5 minutes = flapping
  return recentTransitions.length > 10;
}
```

### Example 4: Generate Debug Report

```typescript
function generateDebugReport(history: StateTransitionLogEntry[]): string {
  const report: string[] = ['=== Zone Seal Debug Report ===\n'];

  // Last 10 transitions
  report.push('Last 10 Transitions:');
  history.slice(-10).forEach(t => {
    const time = new Date(t.timestamp).toLocaleString();
    const sensor = t.sensorName || t.sensorId || 'N/A';
    const stale = t.sensorStale ? ' [STALE]' : '';
    report.push(`  ${time}: ${t.fromState} → ${t.toState} (${t.trigger})${stale}`);
    if (sensor !== 'N/A') {
      report.push(`    Sensor: ${sensor}`);
    }
  });

  // Statistics
  const staleCount = history.filter(t => t.trigger === 'stale_detected').length;
  const delayCount = history.filter(t => t.trigger === 'delay_expired').length;

  report.push(`\nStatistics:`);
  report.push(`  Total transitions: ${history.length}`);
  report.push(`  Stale-triggered: ${staleCount} (${((staleCount/history.length)*100).toFixed(1)}%)`);
  report.push(`  Delay-triggered: ${delayCount}`);

  return report.join('\n');
}
```

## Data Structure

### StateTransitionLogEntry

```typescript
interface StateTransitionLogEntry {
  timestamp: number;              // Unix timestamp (ms)
  fromState: ZoneSealState;       // Previous state
  toState: ZoneSealState;         // New state
  trigger: StateTransitionTrigger; // What caused the transition
  sensorId?: string;              // Optional: Device ID
  sensorName?: string;            // Optional: Human-readable name
  sensorStale?: boolean;          // Optional: Stale indicator
  nonStaleSensorCount?: number;   // Count of non-stale sensors
  totalSensorCount?: number;      // Total sensor count
}
```

### Trigger Types

| Trigger | Description |
|---------|-------------|
| `sensor_opened` | Sensor reported open state |
| `sensor_closed` | Sensor reported closed state |
| `delay_expired` | Open/close delay timer completed |
| `stale_detected` | Fail-safe triggered (stale sensors) |
| `stale_ignored` | Stale detection bypassed |
| `initialization` | Initial state during device init |

### State Types

| State | Description |
|-------|-------------|
| `sealed` | All sensors closed, zone secure |
| `leaky` | One or more sensors open |
| `open_delay` | Sensor opened, waiting for delay |
| `close_delay` | All closed, waiting for delay |

## Limitations

### Homey Web API

The Homey Web API **does not expose** `getStoreValue()` for external access. For external integrations:

1. Use real-time capability listeners
2. Implement custom Flow cards
3. Poll capability values periodically

### Storage

- Max 100 entries (older entries pruned)
- Persisted to device store (survives restarts)
- Not accessible via cloud API

## Best Practices

1. **For debugging**: Enable enhanced logging and review production logs
2. **For analysis**: Export history to JSON and analyze offline
3. **For monitoring**: Use custom Flow cards to alert on patterns
4. **For users**: Expose simplified statistics via Flow cards

## Related Documentation

- [State Transition Implementation](../drivers/wiab-zone-seal/device.ts)
- [Type Definitions](../lib/types.ts)
- [Fail-Safe Behavior](../CLAUDE.md#stale-sensor-detection)
