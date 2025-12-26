# Graceful Degradation Pattern

## Overview
This pattern is used for optional data that enhances UX but isn't required for core functionality. Failures are logged but do not propagate errors.

## When to Use
- "Nice to have" supplementary data (e.g., zone names, display labels)
- Data that provides context but isn't essential (e.g., "Motion Sensor (Living Room)" vs "Motion Sensor")
- Operations where missing data has a reasonable fallback

## When NOT to Use
- Required data for core functionality (use `throw` instead)
- User-initiated actions where they should see errors
- Operations where partial results would be misleading
- Critical system operations

## Implementation Pattern

```typescript
private async getOptionalData(id: string): Promise<string | null> {
  try {
    // Attempt to get optional data
    const data = await api.getSomeData(id);
    return data;
  } catch (error) {
    // Log for monitoring but don't throw
    this.log(`Could not retrieve optional data for ${id}:`, error);
    return null; // Safe fallback
  }
}
```

## Example: Zone Name Retrieval

Zone names enhance UX by providing location context (e.g., "Main Breaker (Kitchen)"), but pairing can proceed without them.

```typescript
private async getDeviceZoneName(deviceId: string): Promise<string | null> {
  try {
    const device = await api.devices.getDevice(deviceId);
    if (!device || !device.zone) return null;

    const zone = await api.zones.getZone({ id: device.zone });
    return zone.name;
  } catch (error) {
    this.log(`Could not retrieve zone for device ${deviceId}:`, error);
    return null; // Pairing continues without zone name
  }
}
```
