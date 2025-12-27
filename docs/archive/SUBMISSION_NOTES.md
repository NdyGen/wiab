# WIAB v1.0.0 - App Store Submission Status

## Current Status: ✅ SUCCESSFULLY SUBMITTED

### Submission Details
**Build ID**: 1
**Version**: 1.0.0
**Status**: In Homey's review queue
**Submission Date**: 2025-12-15
**Build URL**: https://tools.developer.homey.app/apps/app/net.dongen.wiab/build/1
**GitHub Release**: https://github.com/NdyGen/wiab/releases/tag/v1.0.0

### Resolution of GitHub Issue #414

**Original Issue**: Homey CLI v3.10.0 validation bug with driver images property
- Issue: https://github.com/athombv/homey-apps-sdk-issues/issues/414
- Filed: 2025-12-11

**Resolution**: The driver compose file location fix (commit d79c2af) on the develop branch resolved the issue:
- Moved driver compose files from `.homeycompose/drivers/wiab-device/` to `drivers/wiab-device/`
- This aligns with the correct Homey SDK v3 structure where driver compose files belong in the `drivers/` directory
- The Homey CLI correctly reads and processes driver metadata from this location
- The `images` property is now properly included in the final `app.json` after build

### Validation Success
✅ App validates at `publish` level (highest validation tier)
✅ All 78 unit tests pass
✅ 70%+ code coverage maintained
✅ TypeScript compiles without errors
✅ ESLint passes with no warnings
✅ All images meet Homey App Store requirements:
   - App images: 250x175, 500x350, 1000x700
   - Driver images: 75x75, 500x500, 500x500 (xlarge same as large for consistency)

### Release Process (Full Gitflow)

**Branch Strategy:**
- Created release/1.0.0 from develop branch
- Merged main into release branch to reconcile divergence
- Created PR #9 (release/1.0.0 → main) with full CI validation
- Tagged v1.0.0 on main branch (commit c4fa3e7)
- Created PR #10 (main → develop) for merge-back
- All PRs squash-merged with conventional commit messages

**Hotfix for Image Dimensions:**
- Created hotfix/image-dimensions branch from main
- Fixed image dimensions to meet App Store requirements
- Created PR #11 with image fixes
- Merged to main and back to develop
- Final commit: 4d334b8

**Quality Gates Passed:**
- ✅ All CI/CD checks (build, test, lint, coverage, validate)
- ✅ PR title validation (conventional commit format)
- ✅ Branch protection rules enforced
- ✅ Test coverage threshold maintained (70%+)

### Files Submitted
- `app.json` - Generated with all metadata, capabilities, and flow cards
- `drivers/wiab-device/driver.compose.json` - Driver configuration with images property
- `README.txt` - Plain text store listing with comprehensive documentation
- `assets/images/*.png` - App marketing images (small, large, xlarge)
- `drivers/wiab-device/assets/images/*.png` - Driver images (small, large, xlarge)
- All source code, tests, and documentation

### Submission Timeline

**Development Phase:**
- 2025-12-11: App development completed
- 2025-12-11: Initial v1.0.0 tag created (later removed for proper Gitflow)
- 2025-12-11: Documentation finalized
- 2025-12-11: Submission initially blocked by GitHub issue #414
- 2025-12-11: GitHub issue #414 filed with Homey team

**Release Phase:**
- 2025-12-15: Started Full Gitflow release process
- 2025-12-15: Deleted old v1.0.0 tag
- 2025-12-15: Created release/1.0.0 branch from develop (includes fix d79c2af)
- 2025-12-15: Merged main into release branch to reconcile divergence
- 2025-12-15: Created and merged PR #9 (release → main)
- 2025-12-15: Created new v1.0.0 annotated tag on commit c4fa3e7
- 2025-12-15: Created and merged PR #10 (main → develop merge-back)

**Submission Phase:**
- 2025-12-15: Validated app at publish level - discovered driver compose fix resolved issue #414!
- 2025-12-15: Fixed image dimension validation errors (PR #11 hotfix)
- 2025-12-15: Created README.txt for App Store requirements
- 2025-12-15: Successfully submitted to Homey App Store (Build ID: 1)
- 2025-12-15: Created GitHub Release v1.0.0 with comprehensive release notes

### What Resolved the Issue

The driver compose file location fix (commit d79c2af) from the develop branch was the key:

**Before (Broken):**
```
.homeycompose/drivers/wiab-device/
├── driver.compose.json          # ❌ Ignored by Homey CLI
├── driver.images.compose.json   # ❌ Ignored by Homey CLI
└── driver.settings.compose.json # ❌ Ignored by Homey CLI
```

**After (Working):**
```
drivers/wiab-device/
└── driver.compose.json          # ✅ Correctly processed by Homey CLI
    (includes images, settings, all metadata)
```

This change ensured the Homey CLI:
1. Correctly reads driver metadata from the proper location
2. Includes the `images` property in the final `app.json`
3. Passes publish-level validation without errors

### Next Steps

**Awaiting Homey Review:**
- App is now in Homey's review queue
- Review typically takes 1-7 business days
- Will receive email notification when review is complete
- No action required until review feedback is received

**If Approved:**
- App will be published to Homey App Store
- Users can install via Homey mobile app or web interface
- App will be publicly listed at: https://homey.app/a/net.dongen.wiab/

**If Changes Requested:**
- Address feedback from Homey review team
- Create feature branch from main for any fixes
- Follow Gitflow hotfix process for critical issues
- Resubmit updated build

### Contact Information
- App ID: `net.dongen.wiab`
- Version: 1.0.0
- Author: Andy van Dongen (andy@dongen.net)
- Repository: https://github.com/NdyGen/wiab
- Build URL: https://tools.developer.homey.app/apps/app/net.dongen.wiab/build/1

---

**Status: Successfully submitted - Awaiting Homey team review**
