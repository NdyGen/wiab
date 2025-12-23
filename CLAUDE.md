# WIAB Development Guidelines

## Critical Rules

**MUST follow these rules. Violations are unacceptable.**

1. **No AI references** - Never mention Claude, AI, or code generation in code, comments, commits, PRs, or issues
2. **Conventional commits** - All commits/PR titles: `<type>: <lowercase imperative description>`
   - Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
   - Example: `feat: add sensor timeout configuration`
3. **All checks must pass before PR** - `npm run build && npm run lint && npm test && npm run test:coverage && npm run validate`
4. **70% test coverage minimum** - Enforced by Jest; PR will fail if coverage drops
5. **Use Homey Compose** - Edit `.homeycompose/` files, never edit generated `app.json`
6. **Clean up resources** - Always implement `onDeleted()` to stop monitors and clear intervals

---

## Quick Reference

### Commands
```bash
npm run build          # Compile TypeScript
npm run lint           # Check code style (--fix for auto-fix)
npm test               # Run tests
npm run test:coverage  # Run tests + coverage report
npm run validate       # Validate Homey app structure
homey app run          # Test locally on Homey
```

### Pre-Commit Checklist
```bash
npm run build && npm run lint && npm test && npm run test:coverage && npm run validate
```

All must pass. No exceptions.

---

## Git Workflow

### Branch Model: GitHub Flow
- **`main`** - Production-ready, protected, all PRs target here
- **`feature/*`** - Feature branches, created from main, deleted after merge

### Creating a Feature Branch

**From main worktree:**
```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

**Using worktree (for parallel development):**
```bash
git worktree add ../wiab-feature-name -b feature/your-feature-name main
cd ../wiab-feature-name
npm install
```

### Committing Changes
```bash
git add .
git commit -m "feat: description in lowercase imperative"
git push -u origin feature/your-feature-name
```

### Creating a Pull Request

**CRITICAL: Follow this exact procedure.**

1. Ensure all checks pass locally:
   ```bash
   npm run build && npm run lint && npm test && npm run test:coverage && npm run validate
   ```

2. Push branch if not already pushed:
   ```bash
   git push -u origin feature/your-feature-name
   ```

3. Create PR with `gh`:
   ```bash
   gh pr create --base main --title "feat: your feature description" --body "## Summary
   - What this PR does

   ## Test Plan
   - How to verify"
   ```

4. **PR title MUST be valid conventional commit** - CI validates this

### After PR is Merged

**Standard branch:**
```bash
git checkout main
git pull origin main
git branch -d feature/your-feature-name
```

**Worktree:**
```bash
cd /Users/andy/projects/ndygen/wiab
git worktree remove ../wiab-feature-name
git branch -d feature/your-feature-name
```

---

## Worktrees for Parallel Development

Use worktrees when multiple features need simultaneous development.

### Rules
- One branch per worktree (cannot checkout same branch twice)
- Each worktree needs its own `npm install`
- Clean up worktrees after PR merge
- Main worktree stays on `main` branch

### Commands
| Action | Command |
|--------|---------|
| Create | `git worktree add ../wiab-feature-x -b feature/x main` |
| List | `git worktree list` |
| Remove | `git worktree remove ../wiab-feature-x` |
| Prune orphans | `git worktree prune` |

### Workflow
```bash
# 1. Create worktree
git worktree add ../wiab-feature-x -b feature/x main

# 2. Setup
cd ../wiab-feature-x
npm install

# 3. Develop, commit, push
git add . && git commit -m "feat: x" && git push -u origin feature/x

# 4. Create PR
gh pr create --base main --title "feat: x" --body "..."

# 5. After merge, cleanup
cd /Users/andy/projects/ndygen/wiab
git worktree remove ../wiab-feature-x
```

### Troubleshooting
- **"branch already checked out"** → Find with `git worktree list`, use that worktree or remove it
- **Orphaned worktree** → `git worktree prune` then `rm -rf ../broken-worktree`

---

## CI/CD Pipeline

Runs on every push/PR to `main`.

### Pipeline Steps
1. Build TypeScript
2. Lint code
3. Run tests with coverage
4. Validate Homey app
5. Validate PR title (conventional commit format)

### Fixing Failures
```bash
# Check which step failed, fix locally, then:
npm run build && npm run lint && npm test && npm run validate
git add . && git commit -m "fix: resolve CI failures" && git push
```

### Release Process
Releases are tag-based:
```bash
git checkout main && git pull
git tag v1.0.4
git push origin v1.0.4
# GitHub Actions handles the rest
```

---

## Project Overview

WIAB (Wasp in a Box) creates virtual occupancy sensors by aggregating physical sensors.
- **Trigger sensors** (motion) → activate occupancy on FALSE→TRUE
- **Reset sensors** (door contacts) → deactivate occupancy on FALSE→TRUE

Core metaphor: Like a wasp in a box - active until it finds the exit.

### Architecture
```
app.ts                     # Minimal coordinator
drivers/wiab-device/
  driver.ts                # Pairing logic
  device.ts                # Business logic
lib/
  types.ts                 # TypeScript interfaces
  SensorMonitor.ts         # Polling engine (2s interval)
  DeviceRegistry.ts        # Device lookup
.homeycompose/             # Metadata (edit these, not app.json)
tests/                     # Jest tests
```

### Design Patterns
- **Coordinator** - App delegates to drivers/devices
- **Polling** - 2s interval, more reliable than events
- **Edge detection** - Only FALSE→TRUE triggers actions
- **Priority** - Reset sensors checked before trigger sensors

---

## State Machine

### Initialization
- Read current trigger sensor values
- ANY trigger TRUE → occupancy ON
- ALL triggers FALSE → occupancy OFF
- Reset sensors IGNORED at init

### Runtime (every 2s poll)
1. Check reset sensors for FALSE→TRUE → set occupancy OFF, exit
2. Check trigger sensors for FALSE→TRUE → set occupancy ON
3. All other states ignored (TRUE→FALSE, static states)

### Why This Design
- Door position is ambiguous; the ACT of opening indicates exit
- Motion sensors reliably indicate presence
- Edge detection prevents repeated triggers

---

## Coding Standards

### TypeScript
- Strict mode enabled
- Explicit types for public interfaces
- Use `unknown` over `any`
- Prefer interfaces over type aliases

### Error Handling
- Fail gracefully, never crash
- Log errors with context: `this.error(\`Failed for ${id}:\`, error)`
- Return safe defaults (empty arrays, null) on validation failure

### Naming
- Classes/Interfaces: `PascalCase`
- Methods/Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`

### Device Lifecycle
Always implement:
- `onInit()` - Setup monitoring
- `onSettings()` - Recreate monitor on config change
- `onDeleted()` - Stop monitor, clear intervals, cleanup

---

## Testing

### Philosophy
- 70% coverage minimum (enforced)
- Test business logic, not framework
- Mock Homey SDK
- AAA pattern: Arrange-Act-Assert

### What to Test
- State transitions
- Error handling
- Edge cases (empty arrays, null, invalid input)
- Callback invocations

### What NOT to Test
- Homey SDK internals
- Timer precision (use `jest.useFakeTimers`)

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Memory leaks | Implement `onDeleted()`, clear intervals |
| Events unreliable | Use polling with edge detection |
| Crashes on bad JSON | Validate input, return safe defaults |
| Blocking main thread | Use async/await |
| Log spam | Log state changes and errors only |
| Hardcoded device IDs | Use settings/configuration |

---

## Links

### Homey SDK
- [SDK v3 Docs](https://apps-sdk-v3.developer.homey.app/)
- [Device](https://apps-sdk-v3.developer.homey.app/Device.html) | [Driver](https://apps-sdk-v3.developer.homey.app/Driver.html) | [App](https://apps-sdk-v3.developer.homey.app/App.html)
- [Compose](https://apps.developer.homey.app/homey-compose)

### Development
- [CLI Getting Started](https://apps.developer.homey.app/the-basics/getting-started)
- [Debugging](https://apps.developer.homey.app/the-basics/debugging)
- [Publishing](https://apps.developer.homey.app/the-basics/publishing)
