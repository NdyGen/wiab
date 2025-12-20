# Room Type Templates

WIAB provides pre-configured timer templates for common room types, eliminating the need for trial-and-error configuration. These templates are based on typical occupancy patterns and sensor behavior for each room type.

## Overview

Room templates automatically configure four critical timer settings:

- **Door motion window** (`t_enter`): How long to wait for motion after a door event
- **Empty timeout** (`t_clear`): How long with no motion before marking the room empty
- **PIR stale timeout** (`stalePirMinutes`): Ignore motion sensors stuck active longer than this
- **Door stale timeout** (`staleDoorMinutes`): Ignore door sensors stuck open longer than this

## Available Templates

### 1. Bedroom
**Best for:** Bedrooms, sleeping areas, guest rooms

**Timer Values:**
- Door motion window: **30 seconds** (slower entry, reading in bed)
- Empty timeout: **1200 seconds (20 minutes)** (people sleep or read with minimal motion)
- PIR stale timeout: **60 minutes** (long periods of stillness expected)
- Door stale timeout: **60 minutes** (doors may be left open intentionally)

**When to use:**
- Rooms where people sleep or rest for long periods
- Minimal motion expected while occupied
- Higher tolerance for false positives (better to keep lights on than turn off)

**Example scenario:** Someone reading in bed generates little motion but should keep lights on. Long empty timeout prevents premature light shutoff.

---

### 2. Bathroom
**Best for:** Bathrooms, powder rooms, en-suites

**Timer Values:**
- Door motion window: **10 seconds** (quick entry/exit)
- Empty timeout: **300 seconds (5 minutes)** (short visits typical)
- PIR stale timeout: **15 minutes** (steam can trigger false motion)
- Door stale timeout: **15 minutes** (doors usually closed quickly)

**When to use:**
- Quick in-and-out usage patterns
- Shower steam may affect motion sensors
- Doors typically closed during use

**Example scenario:** Shower steam triggers motion sensor continuously. Stale timeout prevents false occupancy. Short empty timeout turns off lights quickly after exit.

---

### 3. Home Office
**Best for:** Home offices, study rooms, workspaces

**Timer Values:**
- Door motion window: **15 seconds** (normal entry)
- Empty timeout: **900 seconds (15 minutes)** (focused work = minimal motion)
- PIR stale timeout: **30 minutes** (sitting at desk expected)
- Door stale timeout: **30 minutes** (door may be left open)

**When to use:**
- Desk work with minimal movement
- Keyboard/mouse work doesn't trigger motion sensors well
- Longer empty timeout for concentrated work periods

**Example scenario:** Typing at computer generates little motion. 15-minute empty timeout allows work without constant hand-waving to keep lights on.

---

### 4. Kitchen
**Best for:** Kitchens, pantries, dining areas

**Timer Values:**
- Door motion window: **15 seconds** (normal entry)
- Empty timeout: **600 seconds (10 minutes)** (cooking = intermittent motion)
- PIR stale timeout: **30 minutes** (normal activity range)
- Door stale timeout: **30 minutes** (open during meal prep common)

**When to use:**
- Cooking activities with periodic motion
- Doors often open during meal preparation
- Moderate empty timeout balances activity patterns

**Example scenario:** Cooking involves bursts of motion (chopping, stirring) with pauses. 10-minute timeout accommodates cooking rhythm without premature shutoff.

---

### 5. Living Room
**Best for:** Living rooms, family rooms, TV rooms

**Timer Values:**
- Door motion window: **20 seconds** (casual entry)
- Empty timeout: **900 seconds (15 minutes)** (watching TV = minimal motion)
- PIR stale timeout: **30 minutes** (normal sitting expected)
- Door stale timeout: **30 minutes** (doors may stay open)

**When to use:**
- TV watching, reading, relaxing activities
- Minimal motion while seated
- Longer timeout prevents lights turning off during movies

**Example scenario:** Watching TV involves little motion. 15-minute empty timeout allows full movie/show segments without motion requirement.

---

### 6. Hallway / Corridor
**Best for:** Hallways, corridors, staircases, entryways

**Timer Values:**
- Door motion window: **5 seconds** (fast transit)
- Empty timeout: **60 seconds (1 minute)** (passing through only)
- PIR stale timeout: **15 minutes** (no extended occupancy expected)
- Door stale timeout: **15 minutes** (doors closed quickly)

**When to use:**
- Transit areas where people don't linger
- Very short occupancy times
- Lights should turn off quickly after passing

**Example scenario:** Walking through hallway to another room. 1-minute timeout ensures lights turn off promptly after transit.

---

### 7. Storage / Garage
**Best for:** Storage rooms, garages, attics, basements, utility rooms

**Timer Values:**
- Door motion window: **10 seconds** (normal entry)
- Empty timeout: **180 seconds (3 minutes)** (grab items and leave)
- PIR stale timeout: **30 minutes** (normal activity range)
- Door stale timeout: **30 minutes** (doors may be left open while retrieving items)

**When to use:**
- Quick retrieval of stored items
- Moderate empty timeout for finding items
- Not intended for extended occupancy

**Example scenario:** Finding seasonal decorations in storage. 3-minute timeout allows searching shelves without lights turning off too quickly.

---

## Using Room Templates

### During Device Pairing

1. **First pairing step:** "Select Room Type (Optional)"
2. You'll see a list of all room types with descriptions and timer values
3. Click a room type to select it and automatically proceed
4. Or click "Skip - Configure Manually" to use default values
5. Template timer values are applied immediately when the device is created

**Note:** Template selection is optional. You can skip this step and configure timer values manually in device settings.

### In Device Settings

1. Open your WIAB device settings
2. At the top, find "Room Type Templates" section
3. Select a room type from the "Apply Room Template" dropdown
4. Timer values update automatically
5. The dropdown resets to empty (ready for future template applications)
6. Click "Save" to apply the changes (if using custom settings page)

**Tip:** You can apply a template and then fine-tune the values manually. Template selection doesn't lock you into those values.

---

## Customizing After Template Selection

Templates provide sensible starting points, but every setup is unique. You can (and should) adjust values based on:

- **Your sensor sensitivity:** PIR sensors vary in detection range and sensitivity
- **Room layout:** Larger rooms may need longer timeouts
- **Usage patterns:** Your family's habits may differ from typical patterns
- **Sensor placement:** Corner placement vs. center affects detection zones

### How to Adjust

1. Apply a template that's closest to your room type
2. Monitor occupancy detection for a few days
3. Adjust values in device settings if needed:
   - **Too many false positives?** Increase stale timeouts
   - **Lights turn off too quickly?** Increase empty timeout
   - **Lights don't respond fast enough?** Decrease door motion window
   - **Lights stay on when room is empty?** Decrease empty timeout

---

## Template Values Reference Table

| Template | Door Motion Window | Empty Timeout | PIR Stale | Door Stale |
|----------|-------------------|---------------|-----------|------------|
| Bedroom | 30s | 1200s (20min) | 60min | 60min |
| Bathroom | 10s | 300s (5min) | 15min | 15min |
| Home Office | 15s | 900s (15min) | 30min | 30min |
| Kitchen | 15s | 600s (10min) | 30min | 30min |
| Living Room | 20s | 900s (15min) | 30min | 30min |
| Hallway / Corridor | 5s | 60s (1min) | 15min | 15min |
| Storage / Garage | 10s | 180s (3min) | 30min | 30min |

---

## Understanding Timer Settings

### Door Motion Window (`t_enter`)

**What it does:** After a door opens or closes, the system waits this long to detect motion indicating entry or exit.

**How it affects occupancy:**
- **Motion during window:** Room marked occupied (entry) or empty (exit)
- **No motion during window:** No occupancy change

**When to increase:**
- Slow-moving occupants (elderly, mobility issues)
- Sensor is far from door
- Taking time to close/lock door

**When to decrease:**
- Fast transit areas (hallways)
- Sensor very close to door
- Quick entry/exit patterns

---

### Empty Timeout (`t_clear`)

**What it does:** When doors are open and no motion is detected for this duration, the room is marked as empty.

**How it affects occupancy:**
- **Motion detected:** Timer resets, room stays occupied
- **Timer expires:** Room marked empty, lights turn off

**When to increase:**
- Activities with minimal motion (reading, TV, desk work)
- Larger rooms with detection gaps
- Higher tolerance for leaving lights on

**When to decrease:**
- Transit areas (hallways, entries)
- Quick in-and-out usage (bathrooms, storage)
- Energy saving priority

---

### PIR Stale Timeout (`stalePirMinutes`)

**What it does:** At device initialization (restart, settings change), ignore PIR sensors stuck reporting motion longer than this.

**How it affects occupancy:**
- Prevents false "occupied" state from malfunctioning sensors
- Only checked during initialization, not during runtime
- Runtime sensor failures are handled differently

**When to increase:**
- Rooms with extended stillness periods (bedrooms)
- Older PIR sensors prone to sticking
- Home automation hub restarts frequently

**When to decrease:**
- Need faster startup occupancy detection
- Confident in sensor reliability
- Rooms rarely have extended occupancy

---

### Door Stale Timeout (`staleDoorMinutes`)

**What it does:** At device initialization, ignore door sensors stuck reporting "open" longer than this.

**How it affects occupancy:**
- Prevents false "occupied" state from doors left open
- Only checked during initialization
- Runtime behavior independent of stale timeout

**When to increase:**
- Doors frequently left open intentionally
- Warmer climates with doors left open for ventilation
- Home automation hub restarts frequently

**When to decrease:**
- Doors typically stay closed
- Need more accurate initialization state
- Climate-controlled environments

---

## Frequently Asked Questions

### Can I change template values after applying?
**Yes!** Templates pre-fill values, but you can adjust any timer manually. Template selection doesn't lock you into those values.

### Does the device remember which template I used?
**No.** Template names are not stored. Only the timer values are saved. This allows you to mix-and-match or customize freely.

### Can I apply a template multiple times?
**Yes.** You can apply the same template again to reset to those values, or switch to a different template anytime.

### What happens if I don't select a template?
The device uses built-in default values:
- Door motion window: 20 seconds
- Empty timeout: 600 seconds (10 minutes)
- PIR stale timeout: 30 minutes
- Door stale timeout: 30 minutes

### Do templates work with existing devices?
**Yes!** You can apply templates to existing WIAB devices through device settings. No need to delete and re-pair.

### Can I create custom templates?
Not through the UI, but you can create your own "template" by:
1. Configuring timer values manually
2. Documenting your values
3. Applying the same values to other devices

### Why don't some templates match my expectations?
Templates are based on typical usage patterns. Your specific room layout, sensor placement, and usage habits may require adjustment. Use templates as starting points, not absolute rules.

### How were these values determined?
Template values are based on:
- Real-world usage patterns from WIAB community
- Typical room occupancy durations
- Common PIR sensor behavior
- Balance between responsiveness and false positives

---

## Technical Details

### Template Data Location
Templates are defined in `/lib/RoomTemplates.ts` as TypeScript constants.

### Template Structure
Each template contains:
- **ID:** Unique identifier (e.g., `bedroom`, `kitchen`)
- **Name:** Localized display names (English, Dutch, German, Norwegian, Swedish)
- **Description:** Localized explanations of use case
- **Timer Values:** Four numeric timer settings

### Adding New Templates
To add custom templates to the codebase:
1. Edit `/lib/RoomTemplates.ts`
2. Add new template object to `ROOM_TEMPLATES` array
3. Update `driver.settings.compose.json` with new dropdown option
4. Update `pair/select_room_type.html` with new template
5. Rebuild app: `homey app build`

### Internationalization
Templates support five languages:
- **en:** English
- **nl:** Dutch (Nederlands)
- **de:** German (Deutsch)
- **no:** Norwegian (Norsk)
- **sv:** Swedish (Svenska)

Additional languages can be added by expanding the `LocalizedText` interface.

---

## Related Documentation

- **WIAB State Machine:** `docs/STATE_DIAGRAM.md` - How occupancy states work
- **Timer Behavior:** `docs/wiab_multi_door_multi_pir_full.md` - Detailed timer specifications
- **Settings Configuration:** See driver settings in Homey app

---

## Feedback and Improvements

Have suggestions for template improvements or new room types? Please open an issue on the WIAB GitHub repository with:
- Room type description
- Typical usage patterns
- Recommended timer values
- Rationale for values

Your real-world feedback helps improve templates for everyone!
