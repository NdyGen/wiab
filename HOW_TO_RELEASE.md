# How to Release WIAB to the Homey App Store

This guide explains how to release a new version of WIAB to the Homey App Store using our manual release workflow.

## Prerequisites

Before you can release, ensure the following are configured:

### 1. GitHub Secret Configuration

The repository must have the `HOMEY_BEARER_TOKEN` secret configured:

1. Go to GitHub repository settings
2. Navigate to **Secrets and variables** → **Actions**
3. Ensure `HOMEY_BEARER_TOKEN` is set with your Homey App Store authentication token

To get your Homey Personal Access Token (PAT):

1. Go to **Homey Developer Tools**: https://tools.developer.homey.app
2. Log in with your Athom account if needed
3. Navigate to **My Account** (in the left sidebar)
4. Scroll down to the **Personal Access Token** section
5. Click the **Reveal** button to show the token
6. Copy the token (it will look like `pat-apps-XXXXX-XXXXX`)
7. Go to your GitHub repository settings
8. Navigate to **Settings** → **Secrets and variables** → **Actions**
9. Click **New repository secret**
10. Name: `HOMEY_BEARER_TOKEN`
11. Value: Paste the token you copied
12. Click **Add secret**

**Note**: This Personal Access Token is specifically designed for CI/CD environments and is different from OAuth2 API clients.

### 2. Clean Main Branch

Ensure the `main` branch is clean and all PRs are merged:

```bash
# Switch to main
git checkout main

# Pull latest changes
git pull origin main

# Verify no uncommitted changes
git status
```

### 3. All Tests Pass Locally

Before triggering a release, verify everything works:

```bash
# Build TypeScript
npm run build

# Run tests
npm test

# Check coverage (must be ≥70%)
npm run test:coverage

# Run linter
npm run lint

# Validate Homey app structure
npm run validate
```

## Release Process

### Step 1: Decide on Version Number

Follow [Semantic Versioning](https://semver.org/):

- **Patch release** (1.0.X): Bug fixes, minor improvements
  - Example: `1.0.2` → `1.0.3`
- **Minor release** (1.X.0): New features, backwards-compatible
  - Example: `1.0.3` → `1.1.0`
- **Major release** (X.0.0): Breaking changes
  - Example: `1.0.3` → `2.0.0`

**Important**: The version must be **greater than** the current version. The workflow will automatically validate this.

### Step 2: Prepare Changelog Description

Write a concise changelog entry describing the changes in this release. This will be added to `.homeychangelog.json` and displayed in the Homey App Store.

**Example changelog entries**:
- "Added timeout configuration for sensor monitoring"
- "Fixed occupancy state race condition when multiple sensors trigger"
- "Improved pairing flow with device picker UI"
- "Updated Homey SDK to 3.1.0 for better performance"

### Step 3: Trigger the Manual Release Workflow

1. Go to **GitHub Actions**: https://github.com/NdyGen/wiab/actions
2. Click on **"Publish App to App store"** workflow in the left sidebar
3. Click the **"Run workflow"** button (top right)
4. Fill in the required inputs:
   - **Version number**: Enter the version in X.Y.Z format (e.g., `1.0.3`)
     - Do NOT include the 'v' prefix
     - Must be greater than current version
   - **Changelog entry**: Enter the changelog description (English only)
5. Click **"Run workflow"** to start the release

### Step 4: Monitor Workflow Progress

The workflow will execute in 6 phases. You can monitor progress in the GitHub Actions UI:

**Phase 1: Input Validation** (⏱️ ~1 minute)
- ✅ Validate version format (X.Y.Z)
- ✅ Validate changelog not empty
- ✅ Check version uniqueness (no duplicate releases)
- ✅ Compare version with current (must be greater)
- ✅ Set workflow environment variables

**Phase 2: Quality Assurance** (⏱️ ~2-3 minutes)
- ✅ Build TypeScript
- ✅ Run test suite
- ✅ Run linter
- ✅ Validate Homey app structure

**Phase 3: Version Update** (⏱️ ~30 seconds)
- ✅ Create backup of version files
- ✅ Update `package.json`
- ✅ Update `.homeycompose/app.json`
- ✅ Update `.homeychangelog.json`
- ✅ Build final `app.json` from compose files
- ✅ Verify version updates
- ✅ Upload version artifacts

**Phase 4: Commit & Tag Creation** (⏱️ ~30 seconds)
- ✅ Configure git user as github-actions[bot]
- ✅ Stage version files
- ✅ Commit with version message
- ✅ Create annotated git tag (vX.Y.Z)
- ✅ Push commit and tag to main

**Phase 5: Homey App Store Publish** (⏱️ ~1-2 minutes)
- ✅ Download version artifacts
- ✅ Authenticate with Homey App Store
- ✅ Publish app to Homey App Store

**Phase 6: GitHub Release Creation** (⏱️ ~30 seconds)
- ✅ Create GitHub release
- ✅ Add changelog to release notes
- ✅ Add installation instructions
- ✅ Link to app store and documentation

**Total time**: ~5-8 minutes

### Step 5: Verify Release

After the workflow completes successfully:

1. **Check GitHub Step Summary**: Review the workflow summary page for detailed results
   - Version validation results
   - Quality assurance status
   - Version update confirmation
   - Git operations summary
   - Publication status

2. **Check Homey App Store**: Visit https://homey.app/nl-nl/app/net.dongen.wiab/Wasp-in-a-Box/
   - Verify new version is listed
   - Check that changelog entry appears correctly
   - Verify description and images are correct

3. **Check GitHub Release**: Go to https://github.com/NdyGen/wiab/releases
   - Verify release is created with correct tag
   - Review changelog
   - Ensure links work correctly

4. **Verify Version Updates**: Check that `main` branch was updated
   ```bash
   git pull origin main
   cat .homeycompose/app.json | grep version
   cat package.json | grep version
   cat .homeychangelog.json | grep -A 1 "\"1.0.3\""
   ```

## What Happens Automatically

When you trigger the manual release workflow, GitHub Actions:

### Phase 1: Input Validation
- Validates version format matches X.Y.Z (semantic versioning)
- Ensures changelog is not empty
- Checks that version doesn't already exist (no duplicate releases)
- Compares new version with current version (must be greater)
- Sets up workflow environment variables

### Phase 2: Quality Assurance
- Installs all dependencies (`npm ci`)
- Compiles TypeScript (`npm run build`)
- Runs complete test suite (`npm test`)
- Runs linter (`npm run lint`)
- Validates Homey app structure (`homey app validate`)
- Fails workflow if any check fails

### Phase 3: Version Update
- Creates backup of version files (for rollback)
- Updates `package.json` with new version
- Updates `package-lock.json` (via `npm version`)
- Updates `.homeycompose/app.json` with new version
- Adds changelog entry to `.homeychangelog.json`
- Rebuilds `app.json` from compose files
- Verifies all version updates succeeded
- Uploads version artifacts for next phase
- Rolls back from backup if any update fails

### Phase 4: Commit & Tag Creation
- Configures git user as github-actions[bot]
- Stages all version files
- Commits with conventional format: `chore(release): vX.Y.Z`
- Creates annotated git tag (vX.Y.Z)
- Pushes commit and tag to main branch
- Auto-reverts (deletes tag, resets commit) if any step fails

### Phase 5: Homey App Store Publish
- Downloads version artifacts from Phase 3
- Authenticates with Homey App Store using `HOMEY_BEARER_TOKEN`
- Publishes app to Homey App Store
- Continues even if already published (idempotent)

### Phase 6: GitHub Release Creation
- Creates GitHub release with tag name
- Includes changelog entry in release notes
- Adds installation instructions
- Links to app store, docs, and community forum

### Rollback & Notifications
- **Auto-rollback**: Phases 3-4 automatically revert on failure
- **Success notification**: GitHub step summary shows all phases passed
- **Failure notification**: GitHub step summary shows which phase failed and why
- **Manual recovery**: Phase 5-6 failures require manual intervention (see Troubleshooting)

## Troubleshooting

### Workflow Fails: Invalid Version Format

**Error**: `❌ Invalid version format: <version>`

**Solution**: Ensure version follows format `X.Y.Z` (no 'v' prefix):
- ✅ Correct: `1.0.3`, `2.1.0`, `1.10.2`
- ❌ Incorrect: `v1.0.3`, `1.0`, `1.0.3-beta`

Simply re-run the workflow with the correct version format.

### Workflow Fails: Version Not Greater Than Current

**Error**: `❌ Version X.Y.Z is not greater than current version A.B.C`

**Solution**: Choose a higher version number:
```bash
# Check current version
cat package.json | grep version
# Current: 1.0.2

# Run workflow with version > 1.0.2
# Example: 1.0.3, 1.1.0, 2.0.0
```

### Workflow Fails: Version Already Exists

**Error**: `❌ Version X.Y.Z already exists`

**Solution**: This version has already been released. Choose the next version number:
```bash
# Check existing versions
git tag -l

# Use the next version
# If v1.0.3 exists, use 1.0.4 or higher
```

### Workflow Fails: Tests Failing (Phase 2)

**Error**: `❌ Tests: Failed`

**Solution**: Fix tests locally first:
```bash
# Run tests locally
npm test

# Fix failing tests
# ... make changes ...

# Verify tests pass
npm test

# Commit fixes to main
git add .
git commit -m "fix: resolve test failures"
git push origin main

# Re-run the release workflow with same version
```

### Workflow Fails: Coverage Too Low (Phase 2)

**Error**: Coverage threshold not met

**Solution**: Add more tests to increase coverage:
```bash
# Check coverage locally
npm run test:coverage

# Add tests for uncovered code
# ... create test files ...

# Verify coverage is ≥70%
npm run test:coverage

# Commit changes
git add .
git commit -m "test: increase test coverage"
git push origin main

# Re-run the release workflow
```

### Workflow Fails: Homey App Validation (Phase 2)

**Error**: `❌ Validation: Failed`

**Solution**: Fix validation errors:
```bash
# Validate locally
npx homey app validate

# Fix validation errors
# ... make changes ...

# Rebuild and validate
npm run homey:build
npx homey app validate

# Commit fixes
git add .
git commit -m "fix: resolve validation errors"
git push origin main

# Re-run the release workflow
```

### Workflow Fails: Version Update (Phase 3)

**Error**: Version update failed

**What happens**: Workflow automatically restores from backup, no manual cleanup needed

**Solution**: Check workflow logs for specific error, fix the issue, then re-run:
```bash
# Common causes:
# - File permissions issue
# - Invalid JSON in version files
# - Missing dependencies

# Pull latest main
git pull origin main

# Fix the issue based on error message
# ... make changes ...

# Commit and re-run
git add .
git commit -m "fix: resolve version update issue"
git push origin main

# Re-run the release workflow
```

### Workflow Fails: Git Operations (Phase 4)

**Error**: Commit or tag creation failed

**What happens**: Workflow automatically:
- Deletes created tag (if any)
- Resets commit (if any)
- No manual cleanup needed

**Solution**: Common causes and fixes:
```bash
# Cause 1: Branch protection rules prevent push
# Solution: Ensure GITHUB_TOKEN has write permissions
# Check repository Settings → Actions → General → Workflow permissions

# Cause 2: Git conflict
# Solution: Pull latest main and re-run
git pull origin main
# Re-run workflow

# Cause 3: Network timeout
# Solution: Simply re-run the workflow
```

### Workflow Fails: Homey Publish (Phase 5)

**Error**: Publishing to Homey App Store failed

**What happens**: Version files are already committed, but app not published

**Manual recovery steps**:

1. **Check if token is valid**:
   ```bash
   # Update HOMEY_BEARER_TOKEN secret in GitHub
   # Get new token from https://tools.developer.homey.app
   ```

2. **Manually publish via CLI**:
   ```bash
   # Checkout the tag that was created
   git checkout vX.Y.Z

   # Install dependencies and build
   npm ci
   npm run build
   npm run homey:build

   # Login to Homey
   homey login

   # Publish manually
   homey app publish

   # Return to main
   git checkout main
   ```

3. **Or simply re-run workflow**:
   - If token issue is fixed, re-run the workflow
   - It will detect version already committed and skip to publish phase

**Note**: If app was already published (workflow just didn't detect it), no action needed.

### Workflow Fails: GitHub Release Creation (Phase 6)

**Error**: GitHub release creation failed

**What happens**: App is published to Homey, but GitHub release not created

**Manual recovery steps**:

1. **Create release manually via GitHub UI**:
   - Go to https://github.com/NdyGen/wiab/releases/new
   - Select the tag created (vX.Y.Z)
   - Add changelog as release notes
   - Click "Publish release"

2. **Or create via GitHub CLI**:
   ```bash
   gh release create vX.Y.Z --title "Release vX.Y.Z" --notes "<changelog>"
   ```

**Note**: GitHub release is optional - the app is already published to Homey App Store.

### Release Created But Wrong Version/Changelog

**Problem**: Released with incorrect version or changelog entry

**Solution**: Create a new patch release with corrections:

**For wrong version**:
```bash
# If you released 1.0.3 but meant 1.0.4
# Simply release 1.0.4 with correct changes
# Run the workflow again with version 1.0.4
```

**For wrong changelog**:
```bash
# Edit .homeychangelog.json manually
# Update the changelog entry for the version
git add .homeychangelog.json
git commit -m "docs: update changelog for vX.Y.Z"
git push origin main

# Then create a new patch release if changelog is critical
# Otherwise, it will be in the next release
```

## Rolling Back a Release

The workflow includes automatic rollback for Phases 3-4. For Phase 5-6 failures, you may need to roll back manually.

### Option 1: Release Previous Version Again (Not Recommended)

**Problem**: Cannot downgrade version numbers in Homey App Store

**Workaround**: Create a new patch release based on old code:
```bash
# Find the previous working tag
git tag -l

# Checkout previous working version
git checkout v1.0.2

# Create a new patch version from old code
git tag v1.0.4
git push origin v1.0.4

# Return to main
git checkout main
```

**Note**: This creates a new version (1.0.4) with code from 1.0.2.

### Option 2: Hotfix Current Release

**Better approach**: Fix the issue and release a new patch version:
```bash
# Fix the issue on main
git checkout main
# ... make fixes ...
git add .
git commit -m "fix: critical issue from v1.0.3"
git push origin main

# Release as v1.0.4 with changelog "Hotfix for v1.0.3"
# Run the workflow with version 1.0.4
```

### Option 3: Manual Homey CLI Publish (Last Resort)

```bash
# Checkout the version you want to publish
git checkout v1.0.2

# Install dependencies and build
npm ci
npm run build
npm run homey:build

# Login to Homey
homey login

# Publish manually (this will fail - Homey doesn't allow downgrades)
homey app publish

# Note: This will likely fail because Homey App Store
# doesn't allow publishing older versions
```

**Important**: The Homey App Store does not allow version downgrades. Always fix issues by releasing a new, higher version.

## Best Practices

### 1. Test Before Releasing
Always run the full test suite locally before triggering a release:
```bash
npm run build && npm test && npm run lint && npm run validate
```

### 2. Use Meaningful Changelog Entries
Write clear, user-focused changelog descriptions:
- ✅ Good: "Fixed occupancy detection for door sensors when multiple zones are configured"
- ✅ Good: "Added timeout configuration to automatically reset occupancy after 30 minutes"
- ❌ Poor: "Fixed bug"
- ❌ Poor: "Updated code"

### 3. Review Changes Before Release
Check what will be in the release:
```bash
# See commits since last tag
git log v1.0.2..HEAD --oneline --no-merges

# See file changes
git diff v1.0.2..HEAD --stat
```

### 4. Small, Frequent Releases
- Prefer smaller, incremental releases over large ones
- Easier to troubleshoot issues
- Faster feedback from users
- Simpler rollback if needed

### 5. Monitor Workflow Progress
- Don't trigger multiple releases simultaneously (concurrency control prevents this)
- Watch the workflow progress in GitHub Actions
- Check step summaries for detailed results

### 6. Monitor Community Feedback
After releasing:
- Check community forum: https://community.homey.app/t/app-pro-wasp-in-a-box-wiab/147021
- Monitor GitHub issues: https://github.com/NdyGen/wiab/issues
- Review app store ratings and comments

## Release Checklist

Use this checklist for each release:

- [ ] All PRs merged to `main`
- [ ] `git pull origin main` to get latest
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `npm run test:coverage` shows ≥70%
- [ ] `npm run lint` passes
- [ ] `npm run validate` passes
- [ ] Version number decided (X.Y.Z format, greater than current)
- [ ] Changelog entry written
- [ ] Navigate to GitHub Actions → "Publish App to App store"
- [ ] Click "Run workflow"
- [ ] Enter version number (without 'v' prefix)
- [ ] Enter changelog description
- [ ] Click "Run workflow" button
- [ ] Monitor workflow progress (6 phases)
- [ ] Verify workflow completes successfully
- [ ] Verify GitHub release created
- [ ] Verify Homey App Store shows new version
- [ ] Verify version files committed to `main`
- [ ] Community forum updated (if major release)

## Quick Reference

```bash
# Pre-release checks (run locally)
git checkout main
git pull origin main
npm run build && npm test && npm run lint && npm run validate

# Then go to GitHub Actions:
# 1. https://github.com/NdyGen/wiab/actions
# 2. Click "Publish App to App store"
# 3. Click "Run workflow"
# 4. Enter version (e.g., 1.0.3)
# 5. Enter changelog entry
# 6. Click "Run workflow"
# 7. Monitor progress in Actions UI
```

## Workflow Phases Reference

| Phase | Description | Duration | Auto-Rollback |
|-------|-------------|----------|---------------|
| 1. Input Validation | Validate version and changelog | ~1 min | N/A (no changes) |
| 2. Quality Assurance | Build, test, lint, validate | ~2-3 min | N/A (no changes) |
| 3. Version Update | Update version files, backup | ~30 sec | ✅ Yes (restore backup) |
| 4. Commit & Tag | Git operations, push to main | ~30 sec | ✅ Yes (delete tag, reset commit) |
| 5. Homey Publish | Publish to Homey App Store | ~1-2 min | ❌ Manual recovery |
| 6. GitHub Release | Create GitHub release | ~30 sec | ❌ Manual recovery |

## Questions?

- **GitHub Actions**: https://github.com/NdyGen/wiab/actions
- **Issues**: https://github.com/NdyGen/wiab/issues
- **Community**: https://community.homey.app/t/app-pro-wasp-in-a-box-wiab/147021
- **Homey Developer Docs**: https://apps.developer.homey.app/
