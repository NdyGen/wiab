# Reference and Commands

## Common Commands

### Development Commands

```bash
# Compile TypeScript
npm run build

# Check code style
npm run lint

# Auto-fix lint issues
npm run lint -- --fix

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Validate Homey app structure
npm run validate

# Install app to Homey (use npx to avoid global install)
npx homey app install

# Test locally on Homey with live reload
npx homey app run
```

### Code Quality Commands

```bash
# Find usage of a method/class
grep -r "methodName" lib/ drivers/ tests/

# Find duplicated patterns
grep -r "pattern" lib/ drivers/

# Find technical debt
git grep "TODO\|FIXME"

# Find unused exports (manually check results)
# Export declared but no imports found = potential dead code
git grep "export.*MethodName" lib/
git grep "import.*MethodName" drivers/ tests/
```

### Pre-Commit Checklist

**MUST run and pass before committing:**

```bash
npm run build && npm run lint && npm test && npm run test:coverage && npm run validate
```

All commands must pass. No exceptions.

### Coverage Commands

```bash
# Run tests with coverage report
npm run test:coverage

# View coverage in browser
open coverage/lcov-report/index.html

# Check specific coverage threshold
npm run test:coverage -- --coverage --coverageThreshold='{"global":{"lines":70}}'
```

## Git Workflow

### Creating a Feature Branch

```bash
# Update main
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/descriptive-name
```

### Committing Changes

```bash
# Stage changes
git add .

# Commit with conventional format
git commit -m "feat: description in lowercase imperative"

# Push to remote
git push -u origin feature/descriptive-name
```

### Conventional Commit Format

```
<type>: <description>

Types:
- feat:     New feature
- fix:      Bug fix
- docs:     Documentation only
- refactor: Code change that neither fixes a bug nor adds a feature
- test:     Adding or updating tests
- chore:    Build process, tooling, dependencies

Examples:
✅ feat: add sensor timeout configuration
✅ fix: resolve stale sensor detection race condition
✅ test: add integration tests for delayed transitions
✅ refactor: extract state machine to separate class
✅ docs: update architecture documentation
✅ chore: update dependencies

❌ Feature: Add timeout (wrong format - capital F)
❌ add timeout (missing type)
❌ feat: Added timeout configuration (not imperative)
```

### Creating a Pull Request

```bash
# Ensure all checks pass locally first
npm run build && npm run lint && npm test && npm run test:coverage && npm run validate

# Create PR using GitHub CLI
gh pr create --base main --title "feat: your feature description" --body "## Summary
- What this PR does
- Why it's needed

## Test Plan
- How to verify the changes
- What tests were added

## Checklist
- [ ] Tests added/updated
- [ ] Coverage maintained at 70%+
- [ ] All checks pass locally
- [ ] Conventional commit format used"
```

**Important:**
- PR title MUST be valid conventional commit format
- CI validates this automatically
- PR will fail if title is incorrect

### After PR is Merged

```bash
# Switch to main
git checkout main

# Pull latest
git pull origin main

# Delete feature branch
git branch -d feature/descriptive-name

# Delete remote branch (if not auto-deleted)
git push origin --delete feature/descriptive-name
```

## Worktrees (Parallel Development)

Use worktrees for working on multiple features simultaneously.

### Creating a Worktree

```bash
# Create worktree in parallel directory
git worktree add ../wiab-feature-name -b feature/feature-name main

# Navigate to worktree
cd ../wiab-feature-name

# Install dependencies
npm install
```

### Managing Worktrees

```bash
# List all worktrees
git worktree list

# Remove a worktree
git worktree remove ../wiab-feature-name

# Prune orphaned worktrees
git worktree prune
```

### Worktree Rules

- One branch per worktree (cannot checkout same branch twice)
- Each worktree needs its own `npm install`
- Clean up worktrees after PR merge
- Main worktree stays on `main` branch

### Worktree Workflow

```bash
# 1. Create worktree
git worktree add ../wiab-fix-bug -b feature/fix-bug main

# 2. Setup
cd ../wiab-fix-bug
npm install

# 3. Develop, commit, push
git add . && git commit -m "fix: resolve bug" && git push -u origin feature/fix-bug

# 4. Create PR
gh pr create --base main --title "fix: resolve bug"

# 5. After merge, cleanup
cd /Users/andy/projects/ndygen/wiab
git worktree remove ../wiab-fix-bug
git branch -d feature/fix-bug
```

### Troubleshooting Worktrees

```bash
# Error: "branch already checked out"
# Find which worktree has it
git worktree list

# Use that worktree or remove it
git worktree remove ../path-to-worktree

# Orphaned worktree (directory deleted but git doesn't know)
git worktree prune
rm -rf ../orphaned-worktree
```

## Branch Protection

The `main` branch has these protections:

| Rule | Status | Effect |
|------|--------|--------|
| Require pull request | ✅ Enforced | Cannot push directly to main |
| Require status checks | ✅ Enforced | CI must pass (build, lint, test, coverage, validate) |
| Require up-to-date branch | ✅ Enforced | Must merge latest main before PR merge |
| Require conversation resolution | ✅ Enforced | All PR comments must be resolved |
| No bypassing | ✅ Enforced | Administrators cannot override |
| Require approvals | ❌ Not enforced | Solo developer can merge own PRs |

**What this means:**
- ❌ Direct pushes to main are blocked
- ❌ Cannot bypass CI checks
- ❌ Cannot force push or delete main
- ✅ Can merge own PRs (solo developer)
- ✅ All changes go through PRs

**If you try to push to main directly:**
```bash
git push origin main
# Error: GH006: Protected branch update failed for refs/heads/main.
# Required status check "build" is expected.
```

## CI/CD Pipeline

Runs on every push/PR to `main`.

### Pipeline Steps

1. **Build** - Compile TypeScript (`npm run build`)
2. **Lint** - Check code style (`npm run lint`)
3. **Test** - Run tests with coverage (`npm run test:coverage`)
4. **Validate** - Validate Homey app structure (`npm run validate`)
5. **PR Title** - Validate conventional commit format

### Fixing CI Failures

```bash
# Check which step failed in GitHub Actions
# Fix locally, then:

npm run build && npm run lint && npm test && npm run validate

# Commit fix
git add . && git commit -m "fix: resolve CI failures"

# Push
git push
```

### Release Process

Releases are tag-based:

```bash
# Ensure on main with latest changes
git checkout main
git pull origin main

# Create and push tag
git tag v1.0.4
git push origin v1.0.4

# GitHub Actions automatically:
# - Runs full CI pipeline
# - Creates GitHub release
# - Publishes to Homey App Store (if configured)
```

## File Locations

```
/Users/andy/projects/ndygen/wiab/
├── app.ts                      # Minimal coordinator
├── drivers/
│   ├── wiab-device/           # Occupancy sensor
│   ├── wiab-zone-seal/        # Zone integrity monitor
│   └── wiab-circuit-breaker/  # Device hierarchy monitor
├── lib/
│   ├── types.ts               # TypeScript interfaces
│   ├── SensorMonitor.ts       # Polling engine
│   ├── SensorStateAggregator.ts
│   ├── DeviceRegistry.ts
│   ├── WIABStateEngine.ts
│   ├── ErrorReporter.ts
│   ├── WarningManager.ts
│   ├── RetryManager.ts
│   └── FlowCardErrorHandler.ts
├── .homeycompose/             # EDIT THESE, not app.json
│   ├── app.json
│   ├── capabilities/
│   └── flow/
│       ├── actions/
│       ├── conditions/
│       └── triggers/
├── tests/
│   ├── setup.ts
│   ├── drivers/
│   └── lib/
└── docs/
    └── agents/                # Agent instructions
        ├── AGENTS.md          # Core instructions
        ├── architecture.md    # Architecture reference
        ├── patterns.md        # Code patterns
        ├── testing.md         # Testing guidelines
        └── reference.md       # This file
```

## Resources

### Homey SDK Documentation

- [SDK v3 Overview](https://apps-sdk-v3.developer.homey.app/)
- [Device API](https://apps-sdk-v3.developer.homey.app/Device.html)
- [Driver API](https://apps-sdk-v3.developer.homey.app/Driver.html)
- [App API](https://apps-sdk-v3.developer.homey.app/App.html)
- [Homey Compose](https://apps.developer.homey.app/homey-compose)

### Development Guides

- [CLI Getting Started](https://apps.developer.homey.app/the-basics/getting-started)
- [Debugging](https://apps.developer.homey.app/the-basics/debugging)
- [Publishing](https://apps.developer.homey.app/the-basics/publishing)
- [App Store Guidelines](https://apps.developer.homey.app/the-basics/app-store-guidelines)

### Testing

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Jest Fake Timers](https://jestjs.io/docs/timer-mocks)
- [Testing Async Code](https://jestjs.io/docs/asynchronous)

### TypeScript

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [TypeScript Do's and Don'ts](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)

### Git

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree)
- [GitHub CLI](https://cli.github.com/manual/)

## Quick Reference Card

```bash
# Daily workflow
git checkout main && git pull
git checkout -b feature/name
# ... make changes ...
npm run build && npm run lint && npm test && npm run test:coverage && npm run validate
git add . && git commit -m "type: description"
git push -u origin feature/name
gh pr create --base main --title "type: description"

# After PR merge
git checkout main && git pull
git branch -d feature/name

# Check status
git status
npm test
npm run test:coverage

# View logs
homey app log
```

## Environment Setup

### Required Tools

- Node.js (v16 or higher)
- npm (v8 or higher)
- Homey CLI (`npm install -g homey`)
- GitHub CLI (`brew install gh` or download from https://cli.github.com/)

### First-Time Setup

```bash
# Clone repository
git clone git@github.com:yourusername/wiab.git
cd wiab

# Install dependencies
npm install

# Login to Homey
homey login

# Verify setup
npm run build && npm test
```

### IDE Setup

Recommended VS Code extensions:
- ESLint
- TypeScript and JavaScript Language Features
- Jest Runner
- GitLens

Recommended settings (.vscode/settings.json):
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib"
}
```
