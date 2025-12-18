# How to Release WIAB to the Homey App Store

This guide explains how to release a new version of WIAB to the Homey App Store using our automated release workflow.

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

Before creating a release tag, verify everything works:

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
  - Example: `1.0.3` → `1.0.4`
- **Minor release** (1.X.0): New features, backwards-compatible
  - Example: `1.0.3` → `1.1.0`
- **Major release** (X.0.0): Breaking changes
  - Example: `1.0.3` → `2.0.0`

### Step 2: Create and Push Version Tag

```bash
# Ensure you're on main and up to date
git checkout main
git pull origin main

# Create the version tag (replace with your version)
git tag v1.0.3

# Push the tag to GitHub
git push origin v1.0.3
```

**Important**: Tag format MUST be `vX.Y.Z` (e.g., `v1.0.3`, `v2.1.0`)

### Step 3: Monitor GitHub Actions

The automated release workflow will now run. You can monitor it:

1. Go to https://github.com/NdyGen/wiab/actions
2. Look for the "Release to Homey App Store" workflow
3. Click on the running workflow to see progress

The workflow will:
1. ✅ Validate tag format
2. ✅ Checkout code
3. ✅ Install dependencies
4. ✅ Build TypeScript
5. ✅ Run tests
6. ✅ Run linter
7. ✅ Update version in `package.json` and `.homeycompose/app.json`
8. ✅ Build Homey app
9. ✅ Validate Homey app structure
10. ✅ Publish to Homey App Store
11. ✅ Generate changelog from git commits
12. ✅ Create GitHub release
13. ✅ Commit version updates back to main

### Step 4: Verify Release

After the workflow completes successfully:

1. **Check Homey App Store**: Visit https://homey.app/nl-nl/app/net.dongen.wiab/Wasp-in-a-Box/
   - Verify new version is listed
   - Check that description and images are correct

2. **Check GitHub Release**: Go to https://github.com/NdyGen/wiab/releases
   - Verify release is created with correct tag
   - Review changelog
   - Ensure links work correctly

3. **Verify Version Updates**: Check that `main` branch was updated
   ```bash
   git pull origin main
   cat .homeycompose/app.json | grep version
   cat package.json | grep version
   ```

## What Happens Automatically

When you push a version tag, the GitHub Actions workflow:

### Builds and Tests
- Installs all dependencies (`npm ci`)
- Compiles TypeScript (`npm run build`)
- Runs complete test suite (`npm test`)
- Runs linter (`npm run lint`)
- Validates Homey app structure (`homey app validate`)

### Updates Version Numbers
- Updates `package.json` with new version
- Updates `package-lock.json` (via `npm version`)
- Updates `.homeycompose/app.json` with new version
- Rebuilds `app.json` from compose files

### Publishes to Homey
- Authenticates with Homey App Store using `HOMEY_BEARER_TOKEN`
- Runs `homey app publish`
- Continues even if already published (idempotent)

### Creates GitHub Release
- Generates changelog from commits between tags
- Creates release with tag name
- Includes installation instructions
- Adds links to app store, docs, and community forum

### Commits Back to Main
- Commits updated version files
- Pushes changes to `main` branch
- Keeps repository in sync with published version

## Troubleshooting

### Workflow Fails: Invalid Tag Format

**Error**: `❌ Invalid tag format: <tag>`

**Solution**: Ensure tag follows format `vX.Y.Z`:
```bash
# Delete incorrect tag locally
git tag -d v1.0.3-beta

# Delete from remote
git push origin :refs/tags/v1.0.3-beta

# Create correct tag
git tag v1.0.3
git push origin v1.0.3
```

### Workflow Fails: Tests Failing

**Error**: `❌ Tests: Passed`

**Solution**: Fix tests locally first:
```bash
# Run tests locally
npm test

# Fix failing tests
# ... make changes ...

# Commit fixes
git add .
git commit -m "fix: resolve test failures"
git push origin main

# Delete old tag and create new one
git tag -d v1.0.3
git push origin :refs/tags/v1.0.3
git tag v1.0.3
git push origin v1.0.3
```

### Workflow Fails: Coverage Too Low

**Error**: Coverage threshold not met

**Solution**: Add more tests to increase coverage:
```bash
# Check coverage locally
npm run test:coverage

# Add tests for uncovered code
# ... create test files ...

# Verify coverage is ≥70%
npm run test:coverage

# Commit and retry release
git add .
git commit -m "test: increase test coverage"
git push origin main
git tag -d v1.0.3
git push origin :refs/tags/v1.0.3
git tag v1.0.3
git push origin v1.0.3
```

### Workflow Fails: Homey App Validation

**Error**: `❌ Validation: Passed`

**Solution**: Fix validation errors:
```bash
# Validate locally
npx homey app validate

# Fix validation errors
# ... make changes ...

# Rebuild and validate
npm run homey:build
npx homey app validate

# Commit and retry
git add .
git commit -m "fix: resolve validation errors"
git push origin main
git tag -d v1.0.3
git push origin :refs/tags/v1.0.3
git tag v1.0.3
git push origin v1.0.3
```

### Workflow Fails: Homey Publish Error

**Error**: Publishing to Homey App Store failed

**Possible causes**:
1. `HOMEY_BEARER_TOKEN` secret is invalid or expired
2. App already published with this version (this is OK - workflow continues)
3. Network issues with Homey API

**Solution**:
```bash
# Option 1: Update bearer token
homey login
cat ~/.athom-cli.json
# Copy token to GitHub secrets

# Option 2: If already published, this is OK
# Check if release was created on GitHub
# Check if version appears in Homey App Store

# Option 3: Retry by re-pushing tag
git push origin :refs/tags/v1.0.3
git push origin v1.0.3
```

### Release Created But Version Wrong

**Problem**: Released wrong version number

**Solution**: Create a new patch release with correct version:
```bash
# Create corrected version tag
git tag v1.0.4
git push origin v1.0.4

# The new release will replace the old one in the app store
```

## Rolling Back a Release

If you need to roll back to a previous version:

### Option 1: Release Previous Version Again

```bash
# Find the previous working tag
git tag -l

# Create a new patch version based on old code
git checkout v1.0.2
git tag v1.0.4
git push origin v1.0.4
git checkout main
```

### Option 2: Manual Homey CLI Publish

```bash
# Checkout the version you want to publish
git checkout v1.0.2

# Install dependencies and build
npm ci
npm run build
npm run homey:build

# Login to Homey
homey login

# Publish manually
homey app publish
```

## Best Practices

### 1. Test Before Tagging
Always run the full test suite locally before creating a release tag:
```bash
npm run build && npm test && npm run lint && npm run validate
```

### 2. Meaningful Commit Messages
Use conventional commits for better changelogs:
- `feat: add new feature` → appears in changelog
- `fix: resolve bug` → appears in changelog
- `chore: update dependencies` → appears in changelog
- `docs: update readme` → appears in changelog

### 3. Review Changelog Before Release
Check what will be in the changelog:
```bash
# See commits since last tag
git log v1.0.2..HEAD --oneline --no-merges
```

### 4. Small, Frequent Releases
- Prefer smaller, incremental releases over large ones
- Easier to troubleshoot issues
- Faster feedback from users
- Simpler rollback if needed

### 5. Monitor Community Feedback
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
- [ ] Version number decided (X.Y.Z)
- [ ] `git tag vX.Y.Z` created
- [ ] `git push origin vX.Y.Z` pushed
- [ ] GitHub Actions workflow succeeds
- [ ] GitHub release created
- [ ] Homey App Store shows new version
- [ ] Version files committed to `main`
- [ ] Community forum updated (if major release)

## Quick Reference

```bash
# Full release flow (copy-paste this)
git checkout main
git pull origin main
npm run build && npm test && npm run lint && npm run validate
git tag v1.0.3
git push origin v1.0.3
# Then monitor: https://github.com/NdyGen/wiab/actions
```

## Questions?

- **GitHub Actions**: https://github.com/NdyGen/wiab/actions
- **Issues**: https://github.com/NdyGen/wiab/issues
- **Community**: https://community.homey.app/t/app-pro-wasp-in-a-box-wiab/147021
- **Homey Developer Docs**: https://apps.developer.homey.app/
