# GitHub Repository Configuration Guide

This guide provides step-by-step instructions for configuring GitHub repository settings to support the Gitflow workflow for WIAB.

## Prerequisites

- Admin access to the GitHub repository: https://github.com/NdyGen/wiab
- `develop` branch already created and pushed to remote ✅

---

## Table of Contents

1. [Change Default Branch](#1-change-default-branch)
2. [Configure Branch Protection Rules](#2-configure-branch-protection-rules)
3. [Configure Repository Settings](#3-configure-repository-settings)
4. [Verify CI Workflow](#4-verify-ci-workflow)
5. [Test the Setup](#5-test-the-setup)

---

## 1. Change Default Branch

The default branch should be `develop` for the Gitflow workflow.

**Steps:**

1. Go to: https://github.com/NdyGen/wiab/settings
2. Click **"Branches"** in the left sidebar
3. Under **"Default branch"**, click the switch icon (⇄)
4. Select **`develop`** from the dropdown
5. Click **"Update"**
6. Confirm the change by clicking **"I understand, update the default branch"**

✅ Default branch is now `develop`

---

## 2. Configure Branch Protection Rules

### 2.1. Protect `main` Branch

**Steps:**

1. Go to: https://github.com/NdyGen/wiab/settings/branches
2. Click **"Add branch protection rule"**
3. Enter branch name pattern: **`main`**

**Configure the following settings:**

#### Protect matching branches

- ✅ **Require a pull request before merging**
  - ✅ Require approvals: **1**
  - ✅ Dismiss stale pull request approvals when new commits are pushed
  - ✅ Require review from Code Owners

- ✅ **Require status checks to pass before merging**
  - ✅ Require branches to be up to date before merging
  - **Add required status checks** (search and add):
    - `build` (will appear after first CI run)
    - `test` (will appear after first CI run)
    - `lint` (will appear after first CI run)
    - `validate` (will appear after first CI run)
    - `Build, Test, and Validate` (the full job name)

- ✅ **Require conversation resolution before merging**

- ✅ **Require linear history** (optional but recommended for clean history)

- ✅ **Do not allow bypassing the above settings**

- ✅ **Restrict who can push to matching branches**
  - Add exception for admins (yourself) for emergency hotfixes

#### Rules applied to everyone including administrators

- ✅ **Allow force pushes**: **Disabled** (unchecked)
- ✅ **Allow deletions**: **Disabled** (unchecked)

4. Click **"Create"** at the bottom

✅ `main` branch is now protected

---

### 2.2. Protect `develop` Branch

**Steps:**

1. Still on: https://github.com/NdyGen/wiab/settings/branches
2. Click **"Add branch protection rule"** again
3. Enter branch name pattern: **`develop`**

**Configure the following settings:**

#### Protect matching branches

- ✅ **Require a pull request before merging**
  - ✅ Require approvals: **1**
  - ✅ Dismiss stale pull request approvals when new commits are pushed
  - ✅ Require review from Code Owners

- ✅ **Require status checks to pass before merging**
  - ✅ Require branches to be up to date before merging
  - **Add required status checks** (same as main):
    - `Build, Test, and Validate`

- ✅ **Require conversation resolution before merging**

- ✅ **Do not allow bypassing the above settings**

#### Rules applied to everyone including administrators

- ✅ **Allow force pushes**: **Disabled** (unchecked)
- ✅ **Allow deletions**: **Disabled** (unchecked)

4. Click **"Create"** at the bottom

✅ `develop` branch is now protected

---

## 3. Configure Repository Settings

### 3.1. General Settings

1. Go to: https://github.com/NdyGen/wiab/settings

#### Pull Requests

- ✅ **Allow merge commits**: **Disabled** (uncheck)
- ✅ **Allow squash merging**: **Enabled** (check)
  - Default to pull request title and description
- ✅ **Allow rebase merging**: **Enabled** (check)
- ✅ **Always suggest updating pull request branches**: **Enabled** (check)
- ✅ **Automatically delete head branches**: **Enabled** (check)

#### Pushes

- ✅ **Limit how many branches and tags can be updated in a single push**: **Disabled** (default)

2. Scroll down and click **"Save changes"**

---

### 3.2. Actions Settings

1. Go to: https://github.com/NdyGen/wiab/settings/actions

#### Actions permissions

- ✅ **Allow all actions and reusable workflows**: **Enabled** (recommended)

#### Workflow permissions

- ✅ **Read and write permissions**: **Enabled**
- ✅ **Allow GitHub Actions to create and approve pull requests**: **Enabled** (for auto-merge)

2. Click **"Save"**

---

### 3.3. Enable Auto-merge

1. Go to: https://github.com/NdyGen/wiab/settings

#### Pull Requests

- ✅ **Allow auto-merge**: **Enabled** (check)

2. Click **"Save changes"**

---

### 3.4. Configure Code Owners

Code owners are automatically configured via the `.github/CODEOWNERS` file that was created.

**Verification:**

1. Open any file in the repo on GitHub
2. Click on the file name to view it
3. You should see "andy@dongen.net" listed as a code owner in the sidebar (after committing CODEOWNERS)

---

## 4. Verify CI Workflow

After pushing the `.github/workflows/ci.yml` file:

1. Go to: https://github.com/NdyGen/wiab/actions
2. You should see the **"CI"** workflow listed
3. Click on a workflow run to view details
4. Verify all jobs complete successfully:
   - Build TypeScript
   - Run linter
   - Run tests with coverage
   - Check coverage threshold
   - Validate Homey app

**Note:** The required status checks won't appear in branch protection settings until the CI workflow runs at least once. You may need to:
1. Commit and push the GitHub configuration files
2. Let CI run
3. Go back to branch protection settings and add the status checks

---

## 5. Test the Setup

### 5.1. Test Feature Branch Workflow

```bash
# Create a test feature
git checkout develop
git pull origin develop
git checkout -b feature/test-gitflow

# Make a small change
echo "# Test" >> TEST.md
git add TEST.md
git commit -m "test: verify gitflow setup"

# Push and create PR
git push -u origin feature/test-gitflow
```

Then:
1. Go to: https://github.com/NdyGen/wiab/pulls
2. Create a PR from `feature/test-gitflow` to `develop`
3. Verify:
   - PR template loads automatically ✅
   - CI checks run automatically ✅
   - Review is required ✅
   - Status checks must pass ✅
   - Cannot merge until approved ✅

### 5.2. Test Direct Push Protection

```bash
# Try to push directly to main (should fail)
git checkout main
echo "# Test" >> DIRECT_TEST.md
git add DIRECT_TEST.md
git commit -m "test: this should fail"
git push origin main
```

Expected result: **Push rejected** ✅

### 5.3. Test Auto-merge

1. Create a PR
2. Approve the PR
3. Enable auto-merge on the PR
4. Once CI passes, PR should auto-merge ✅

---

## Troubleshooting

### Status checks not appearing in branch protection

**Solution:** Run CI workflow at least once, then add status checks in branch protection settings.

### Cannot push to develop

**Solution:** Ensure you're creating a PR instead of pushing directly.

### CI workflow not running

**Solution:**
1. Check: https://github.com/NdyGen/wiab/actions
2. Verify workflow file is in `.github/workflows/ci.yml`
3. Check Actions are enabled in repository settings

### Code owners not working

**Solution:**
1. Verify `.github/CODEOWNERS` file exists
2. Check file permissions (should be committed to repo)
3. Ensure email matches GitHub account

---

## Summary Checklist

After completing all steps, verify:

- ✅ Default branch is `develop`
- ✅ `main` branch protection rules configured
- ✅ `develop` branch protection rules configured
- ✅ Merge settings configured (squash enabled, merge commits disabled)
- ✅ Auto-merge enabled
- ✅ GitHub Actions enabled and working
- ✅ CI workflow running successfully
- ✅ CODEOWNERS file working
- ✅ PR template loading automatically
- ✅ Cannot push directly to protected branches
- ✅ PRs require approval and passing checks

---

## Next Steps

1. **Update README.md** with badge showing CI status:
   ```markdown
   [![CI](https://github.com/NdyGen/wiab/workflows/CI/badge.svg)](https://github.com/NdyGen/wiab/actions)
   ```

2. **Share CONTRIBUTING.md** with any collaborators

3. **Start using gitflow** for all new features:
   ```bash
   /git:start-feature my-feature
   ```

4. **Consider adding** (future enhancements):
   - Release workflow (when ready)
   - Gitflow validation workflow (when needed)
   - Codecov integration (if desired)
   - Dependabot for dependency updates

---

## Reference Links

- **Repository**: https://github.com/NdyGen/wiab
- **Settings**: https://github.com/NdyGen/wiab/settings
- **Branch Protection**: https://github.com/NdyGen/wiab/settings/branches
- **Actions**: https://github.com/NdyGen/wiab/actions
- **CONTRIBUTING.md**: Local file with developer guidelines
- **Gitflow Documentation**: https://nvie.com/posts/a-successful-git-branching-model/

