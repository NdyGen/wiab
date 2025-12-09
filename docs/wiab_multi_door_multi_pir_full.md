# WiAB (Wasp-in-a-Box) Occupancy Model — Multi-door, Multi-PIR Version

This specification extends the WiAB occupancy model to work with:

- **One or more door sensors**
- **One or more PIR sensors**

It defines a **tri-state internal occupancy model** plus a **boolean occupancy output**, using timers.
All transitions are explicit; there are no undefined situations.

---

## 1. Assumptions

1. The room has **one or more physical entrances**, each with a door contact sensor.
2. Any person entering or leaving the room **must** use at least one of these doors.
3. Each door contact is **reliable**:
   - Transitions OPEN↔CLOSED are always detected and processed in correct time order.
4. All PIR sensors are **reliable within the chosen timers**:
   - If at least one person is in the room and moves minimally within the timer windows,
     at least one PIR sensor will generate a motion event.
5. Events (door and PIR) are **time-ordered**.
   - If door and PIR share an identical timestamp, process **door events first, then PIR**.
6. Time is represented as a monotonically increasing numeric value (`now()` → seconds).

This is a logical model, not tied to a specific platform.

---

## 2. Inputs and Outputs

### 2.1 Inputs

#### Door sensors

There is a set of door sensors:

```text
door_ids = {d1, d2, ..., dN}
```

For each `door_id ∈ door_ids`:

- State: `door_state[door_id] ∈ {OPEN, CLOSED}`

Events:

- `door_open_event(door_id)` when that door changes from CLOSED → OPEN  
- `door_closed_event(door_id)` when that door changes from OPEN → CLOSED  

#### PIR sensors

There is a set of PIR sensors:

```text
pir_ids = {p1, p2, ..., pM}
```

For each `pir_id ∈ pir_ids`:

- Events:
  - `pir_motion_event(pir_id)`  
    A momentary event indicating motion detected in the room by that sensor.

#### Time

- `now()` → returns current timestamp (monotonic, e.g. seconds).

### 2.2 Outputs

#### Internal tri-state

```text
occupancy_state ∈ {UNKNOWN, OCCUPIED, UNOCCUPIED}
```

#### External boolean

```text
occupied ∈ {true, false}
```

The boolean is derived from a “last stable” tri-state (see section 5).

---

## 3. Configuration Parameters

Durations (strictly positive, in seconds):

- `T_ENTER`  
  Short window after **any door state change** (open or close) within which PIR motion must occur to confirm occupancy.  
  Typical: 10–30 seconds.

- `T_CLEAR`  
  Longer window used when **at least one door is open** and the room is occupied, to decide that it has become empty if no PIR occurs.  
  Typical: 300–900 seconds (5–15 minutes).

These are constants or configuration parameters.

---

## 4. Derived Door Status

From individual door states we derive:

```text
any_door_open  = (∃ door_id : door_state[door_id] == OPEN)
all_doors_closed = (∀ door_id : door_state[door_id] == CLOSED)
```

- When `all_doors_closed == true`, the room is **“sealed”**:  
  no one can enter or leave without triggering a future door event.
- When `any_door_open == true`, the room is **“leaky”**:  
  people can enter or leave without further door state changes.

---

## 5. Internal Variables

The agent maintains at least:

```text
# Occupancy state
occupancy_state ∈ {UNKNOWN, OCCUPIED, UNOCCUPIED}
last_stable_occupancy ∈ {OCCUPIED, UNOCCUPIED}

# Doors
door_state[door_id] ∈ {OPEN, CLOSED}  for each door_id
last_door_event_timestamp ∈ number | null

# PIR aggregation
pir_since_last_door_event ∈ {true, false}
last_pir_timestamp ∈ number | null

# ENTER timer
enter_timer_active ∈ {true, false}
enter_timer_deadline ∈ number | null

# CLEAR timer
clear_timer_active ∈ {true, false}
clear_timer_deadline ∈ number | null
clear_timer_anchor_timestamp ∈ number | null
```

### 5.1 Initialization

On startup:

```text
occupancy_state = UNOCCUPIED
last_stable_occupancy = UNOCCUPIED

# If actual initial door states are known, use them; otherwise assume CLOSED.
for each door_id:
    door_state[door_id] = CLOSED

last_door_event_timestamp = null

pir_since_last_door_event = false
last_pir_timestamp = null

enter_timer_active = false
enter_timer_deadline = null

clear_timer_active = false
clear_timer_deadline = null
clear_timer_anchor_timestamp = null
```

Initial boolean output:

```text
occupied = false
```

---

## 6. Mapping Tri-State → Boolean

We define:

```text
if last_stable_occupancy == OCCUPIED:
    occupied = true
else:
    occupied = false
```

Update rules:

- Whenever `occupancy_state` is set to `OCCUPIED`, set `last_stable_occupancy = OCCUPIED`.
- Whenever `occupancy_state` is set to `UNOCCUPIED`, set `last_stable_occupancy = UNOCCUPIED`.
- When `occupancy_state` is set to `UNKNOWN`, **do not** change `last_stable_occupancy`.

Therefore:

- If `occupancy_state ∈ {OCCUPIED, UNOCCUPIED}`:  
  `occupied` matches that state.
- If `occupancy_state == UNKNOWN`:  
  `occupied` remains what it was previously (no gap).

---

## 7. Timers

### 7.1 ENTER Timer (`T_ENTER`)

Used after **any door event** to resolve `UNKNOWN` → `OCCUPIED` or `UNOCCUPIED`.

**Start / restart:**

```text
enter_timer_active = true
enter_timer_deadline = now() + T_ENTER
pir_since_last_door_event = false
last_door_event_timestamp = now()
```

**Stop:**

```text
enter_timer_active = false
enter_timer_deadline = null
```

### 7.2 CLEAR Timer (`T_CLEAR`)

Used when:

- The room is currently considered `OCCUPIED`, and  
- At least one door is open (`any_door_open == true`).

It resolves prolonged inactivity with open doors to `UNOCCUPIED`.

**Start / restart:**

```text
clear_timer_active = true
clear_timer_deadline = now() + T_CLEAR
clear_timer_anchor_timestamp = now()
```

**Stop:**

```text
clear_timer_active = false
clear_timer_deadline = null
clear_timer_anchor_timestamp = null
```

---

## 8. Event Handling

The system responds to:

- Door events
- PIR motion events
- Timer expiry

Event ordering rule:  
If multiple events share the same timestamp, process **door events first**, then PIR events, then timer checks.

### 8.1 Door Open Event

**Event:** `door_open_event(door_id)`

Steps:

```text
door_state[door_id] = OPEN
# Update derived status
any_door_open  = (∃ d : door_state[d] == OPEN)
all_doors_closed = (∀ d : door_state[d] == CLOSED)

# Set transitional occupancy
occupancy_state = UNKNOWN

pir_since_last_door_event = false
last_door_event_timestamp = now()

# Start / restart ENTER timer
enter_timer_active = true
enter_timer_deadline = now() + T_ENTER

# CLEAR timer:
# If the last stable state was OCCUPIED, open doors imply the room might empty over time.
if last_stable_occupancy == OCCUPIED:
    clear_timer_active = true
    clear_timer_deadline = now() + T_CLEAR
    clear_timer_anchor_timestamp = now()
else:
    # Optionally keep CLEAR off, since we consider the room empty or unknown anyway.
    # For safety: ensure CLEAR is not accidentally left active.
    if not any_door_open:
        clear_timer_active = false
        clear_timer_deadline = null
        clear_timer_anchor_timestamp = null
```

Note:  
If multiple doors open in succession, each `door_open_event` re-applies this logic, but the model remains consistent.

---

### 8.2 Door Close Event

**Event:** `door_closed_event(door_id)`

Steps:

```text
door_state[door_id] = CLOSED
any_door_open  = (∃ d : door_state[d] == OPEN)
all_doors_closed = (∀ d : door_state[d] == CLOSED)

occupancy_state = UNKNOWN

pir_since_last_door_event = false
last_door_event_timestamp = now()

# Start / restart ENTER timer
enter_timer_active = true
enter_timer_deadline = now() + T_ENTER

# CLEAR timer handling:
# CLEAR is only used while at least one door is open.
if all_doors_closed:
    clear_timer_active = false
    clear_timer_deadline = null
    clear_timer_anchor_timestamp = null
else:
    # At least one door remains open: CLEAR may stay as-is or be restarted.
    if last_stable_occupancy == OCCUPIED and not clear_timer_active:
        clear_timer_active = true
        clear_timer_deadline = now() + T_CLEAR
        clear_timer_anchor_timestamp = now()
```

---

### 8.3 PIR Motion Event

**Event:** `pir_motion_event(pir_id)`

Common part:

```text
last_pir_timestamp = now()
pir_since_last_door_event = true
```

Now branch based on aggregated door status.

#### 8.3.1 PIR with all doors CLOSED

When `all_doors_closed == true`:

```text
occupancy_state = OCCUPIED
last_stable_occupancy = OCCUPIED

# With all doors closed, CLEAR is not needed.
clear_timer_active = false
clear_timer_deadline = null
clear_timer_anchor_timestamp = null
```

Interpretation:  
With all doors closed, motion can only be from someone already inside.  
Until a door opens, occupants cannot leave.

#### 8.3.2 PIR with at least one door OPEN

When `any_door_open == true`:

```text
occupancy_state = OCCUPIED
last_stable_occupancy = OCCUPIED

# While the room is leaky (any door open), we rely on CLEAR timer
# to eventually declare 'UNOCCUPIED' after prolonged inactivity.
clear_timer_active = true
clear_timer_deadline = now() + T_CLEAR
clear_timer_anchor_timestamp = now()
```

Interpretation:  
Open doors plus motion means someone is present (or remained present).  
Each PIR reset extends the “active presence” window.

---

### 8.4 ENTER Timer Expiry

Periodically or via scheduled callback, check:

```text
if enter_timer_active and now() >= enter_timer_deadline:
    enter_timer_active = false

    # At expiry, we resolve UNKNOWN after door activity.
    if occupancy_state == UNKNOWN:
        if pir_since_last_door_event == true:
            # PIR event already promoted state to OCCUPIED earlier;
            # this branch is mostly a safeguard.
            occupancy_state = OCCUPIED
            last_stable_occupancy = OCCUPIED
        else:
            # No PIR after last door change → assume room empty.
            occupancy_state = UNOCCUPIED
            last_stable_occupancy = UNOCCUPIED
```

This applies regardless of how many doors exist. The key is that **any door change** marks a potential entry/exit moment, resolved by PIR within `T_ENTER`.

---

### 8.5 CLEAR Timer Expiry

Periodically or via scheduled callback, check:

```text
if clear_timer_active and now() >= clear_timer_deadline:
    clear_timer_active = false

    # CLEAR timer is only meaningful if:
    # - the room is currently considered occupied, AND
    # - at least one door is open (room is leaky).
    any_door_open  = (∃ d : door_state[d] == OPEN)

    if occupancy_state == OCCUPIED and any_door_open:
        # If last_pir_timestamp is null, no PIR was ever seen.
        # In that (rare) case, treat as no motion since timer start.
        if last_pir_timestamp == null:
            occupancy_state = UNOCCUPIED
            last_stable_occupancy = UNOCCUPIED
        else:
            # Check whether there has been motion since CLEAR timer was started.
            if last_pir_timestamp <= clear_timer_anchor_timestamp:
                # No motion since timer scheduled → consider room empty now.
                occupancy_state = UNOCCUPIED
                last_stable_occupancy = UNOCCUPIED
            else:
                # There was motion after timer start; PIR handler should already
                # have restarted CLEAR, so nothing more to do here.
                pass
```

If `occupancy_state != OCCUPIED` or `any_door_open == false` at expiry, CLEAR expiry does nothing (either room is already unoccupied, or all doors are closed and a different logic applies).

---

## 9. Behavioral Summary (Multi-door, Multi-PIR)

1. **Any door event (open or close)**:
   - Sets `occupancy_state = UNKNOWN`
   - Resets `pir_since_last_door_event = false`
   - Starts or restarts `T_ENTER`
   - Keeps or adjusts CLEAR depending on whether any door is open and the last stable state.

2. **PIR from any sensor**:
   - Marks `pir_since_last_door_event = true`
   - Updates `last_pir_timestamp`
   - If **all doors closed** → immediately `OCCUPIED`
   - If **any door open** → `OCCUPIED` and CLEAR timer started / restarted

3. **ENTER timer expiration**:
   - If no PIR since last door event → `UNOCCUPIED`
   - If PIR occurred, state should already be `OCCUPIED`; this branch is a safety net.

4. **CLEAR timer expiration**:
   - If still `OCCUPIED` and at least one door open, and there has been no PIR since the timer started → `UNOCCUPIED`.

5. `UNKNOWN` is always temporary:
   - It appears after door events and resolves via timers and/or PIR.

6. **Boolean `occupied`**:
   - Is always defined:
     - true if `last_stable_occupancy == OCCUPIED`
     - false otherwise
   - During temporary `UNKNOWN`, the boolean retains the previous stable value.

This model works for:

- Single door & single PIR (trivial subset)
- Multiple doors & single PIR
- Single door & multiple PIRs
- Multiple doors & multiple PIRs

without any logical gaps.
