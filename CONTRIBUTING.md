# Contributing to WIAB

Thank you for your interest in contributing to WIAB (Wasp in a Box)! This document provides guidelines for contributing to the project using the Gitflow workflow.

## Table of Contents

- [Branch Structure](#branch-structure)
- [Gitflow Workflow](#gitflow-workflow)
- [Development Process](#development-process)
- [Code Quality Standards](#code-quality-standards)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)

## Branch Structure

WIAB uses the Gitflow branching model with the following branches:

### Permanent Branches

- **`main`** - Production-ready code. Always deployable.
- **`develop`** - Integration branch for features. Default branch for PRs.

### Temporary Branches

- **`feature/*`** - New features (e.g., `feature/sensor-timeout`)
- **`release/*`** - Release preparation (e.g., `release/1.1.0`)
- **`hotfix/*`** - Critical production fixes (e.g., `hotfix/1.0.1`)

## Gitflow Workflow

### Working on Features

Features are new functionality or enhancements to existing features.

**Using slash commands (recommended):**
```bash
# Start a new feature
/git:start-feature my-awesome-feature

# Work on your feature
git add .
git commit -m "feat: add awesome feature"

# Push your changes
git push

# Finish feature (creates PR to develop)
/git:finish-feature my-awesome-feature
```

**Manual approach:**
```bash
# Create feature branch from develop
git checkout develop
git pull origin develop
git checkout -b feature/my-awesome-feature

# Work on your feature
git add .
git commit -m "feat: add awesome feature"

# Push and create PR to develop
git push -u origin feature/my-awesome-feature
```

### Creating Releases

Releases prepare code for deployment to production.

**Using slash commands (recommended):**
```bash
# Start release from develop
/git:start-release 1.1.0

# Update version numbers, test, finalize
git add .
git commit -m "chore: bump version to 1.1.0"

# Finish release (merges to main and develop, creates tag)
/git:finish-release 1.1.0
```

**Manual approach:**
```bash
# Create release branch from develop
git checkout develop
git pull origin develop
git checkout -b release/1.1.0

# Update package.json version, test, etc.
git add .
git commit -m "chore: bump version to 1.1.0"

# Push and create PRs to main and develop
git push -u origin release/1.1.0
```

### Fixing Production Issues

Hotfixes address critical bugs in production.

**Using slash commands (recommended):**
```bash
# Start hotfix from main
/git:start-hotfix 1.0.1

# Fix the bug
git add .
git commit -m "fix: critical production bug"

# Finish hotfix (merges to main and develop, creates tag)
/git:finish-hotfix 1.0.1
```

**Manual approach:**
```bash
# Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/1.0.1

# Fix the bug
git add .
git commit -m "fix: critical production bug"

# Push and create PRs to main and develop
git push -u origin hotfix/1.0.1
```

## Development Process

### 1. Setup Development Environment

```bash
# Clone the repository
git clone https://github.com/NdyGen/wiab.git
cd wiab

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test
```

### 2. Before Starting Work

```bash
# Ensure you're on develop and up to date
git checkout develop
git pull origin develop

# Create your feature branch
git checkout -b feature/your-feature-name
```

### 3. During Development

- Write tests for new functionality
- Follow TypeScript strict mode guidelines
- Document public methods with JSDoc comments
- Run tests frequently: `npm test`
- Check coverage: `npm run test:coverage`
- Lint your code: `npm run lint`

### 4. Before Committing

```bash
# Build TypeScript
npm run build

# Run full test suite
npm test

# Check coverage (must be ≥70%)
npm run test:coverage

# Lint code
npm run lint

# Validate Homey app
npm run validate
```

### 5. Creating Pull Requests

- Ensure all checks pass locally
- Push your branch to GitHub
- Create PR targeting `develop` (for features) or `main` (for hotfixes)
- Fill out the PR template completely
- Request review from code owner
- Address review feedback promptly

## Code Quality Standards

All code must meet these standards before merging:

### Required Checks

- ✅ TypeScript compiles without errors
- ✅ All tests pass
- ✅ Test coverage ≥70% (branches, functions, lines, statements)
- ✅ No linting errors
- ✅ Homey app validation passes

### Code Style

- Use TypeScript strict mode
- Follow existing naming conventions (see CLAUDE.md)
- Document public methods with JSDoc
- Implement comprehensive error handling
- Add logging for key events (not every poll)

### Testing Requirements

- Write unit tests for new functionality
- Test edge cases (empty arrays, null values, invalid IDs)
- Use AAA pattern (Arrange-Act-Assert)
- Mock external dependencies (Homey SDK)
- Aim for 70%+ coverage

## Commit Messages

Use conventional commit format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **refactor**: Code refactoring
- **test**: Adding or updating tests
- **chore**: Maintenance tasks (dependencies, build, etc.)

### Examples

```bash
# Feature
git commit -m "feat: add sensor timeout configuration"

# Bug fix
git commit -m "fix: prevent memory leak in sensor monitor"

# Documentation
git commit -m "docs: update gitflow workflow in CONTRIBUTING.md"

# Refactor
git commit -m "refactor: extract sensor validation logic"

# Tests
git commit -m "test: add edge case tests for SensorMonitor"

# Chore
git commit -m "chore: update dependencies to latest versions"
```

### Important Commit Guidelines

- **Never reference AI tools** in commit messages (no mentions of Claude, AI assistants, or code generation)
- Keep subject line under 72 characters
- Use imperative mood ("add" not "added")
- Start subject with lowercase letter
- No period at end of subject
- Include issue number if applicable: `fix: sensor crash (#123)`

## Pull Request Titles

**IMPORTANT**: Since we use squash merges, your PR title becomes the commit message on `develop` or `main`. PR titles **must** follow conventional commit format and will be automatically validated.

### Format

```
<type>(<scope>): <subject>
```

- **type**: Same as commit types (feat, fix, docs, refactor, test, chore, etc.)
- **scope**: Optional, e.g., `sensors`, `occupancy`, `pairing`, `docs`
- **subject**: Short description in imperative mood, starting with lowercase

### Validation Rules

✅ **Valid PR Titles:**
```
feat: add sensor timeout configuration
fix: resolve occupancy state race condition
docs: update installation instructions
refactor(sensors): extract validation logic
test: add edge cases for door sensor events
chore(deps): update homey sdk to 3.1.0
```

❌ **Invalid PR Titles:**
```
feat: Added sensor timeout          # Past tense
fix: Resolve occupancy state        # Capitalized subject
Update README                        # Missing type prefix
Feature/sensor timeout               # Not conventional format
```

### Why This Matters

When your PR is squash-merged:
1. All commits are combined into one
2. The PR title becomes the commit message on the target branch
3. This commit appears in `git log`, release notes, and changelogs
4. Consistent format enables automated changelog generation

### Automated Validation

A GitHub Action automatically checks your PR title when:
- PR is opened
- PR title is edited
- New commits are pushed

If validation fails, you'll see a clear error message explaining what needs to be fixed.

## Pull Request Process

### 1. Before Creating PR

- All local checks pass (build, test, lint, validate)
- Branch is up to date with target branch
- Commits are clean and follow conventions

### 2. Creating the PR

- Use the PR template (automatically loaded)
- Fill out all sections completely
- Link related issues
- Add screenshots/videos for UI changes
- Assign yourself as assignee
- Add appropriate labels

### 3. Review Process

- Code owner will be automatically requested for review
- CI checks must pass (enforced)
- At least 1 approval required (enforced)
- All conversations must be resolved (enforced)
- Address feedback promptly and professionally

### 4. Merging

- Once approved and checks pass, PR will auto-merge
- Squash merging is used for features (single commit to develop)
- Branch is automatically deleted after merge

### 5. After Merge

- Pull the latest changes: `git pull origin develop`
- Delete local branch: `git branch -d feature/your-feature-name`
- Start next feature!

## Branch Protection Rules

### `main` branch

- Requires PR with 1 approval
- Requires status checks: build, test, lint, validate
- Requires up-to-date branch
- Requires conversation resolution
- No direct pushes (except admin for emergencies)
- Linear history preferred

### `develop` branch

- Requires PR with 1 approval
- Requires status checks: build, test, lint, validate
- Requires up-to-date branch
- No force pushes

## Questions or Issues?

- Open an issue on GitHub
- Contact: andy@dongen.net

## License

By contributing to WIAB, you agree that your contributions will be licensed under the MIT License.
