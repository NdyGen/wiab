# WIAB v1.0.0 - App Store Submission Status

## Current Status: BLOCKED - Homey CLI Bug

### Issue
The Homey CLI v3.10.0 (latest) has a validation bug that prevents publishing the WIAB app:

**The Bug:**
- The CLI validator REQUIRES the `images` property on drivers for `publish`-level validation
- But the CLI's app build process AUTOMATICALLY REMOVES the `images` property from drivers
- This creates an impossible condition where validation cannot pass

### Evidence
```
✖ App did not validate against level `publish`:
✖ drivers.wiab-device: property `images` is required in order to publish an app.
```

This error occurs even when:
1. `images` are defined in `.homeycompose/drivers/wiab-device/driver.compose.json`
2. `images` are manually injected into `app.json`
3. The app builds successfully at `debug` validation level
4. All other validations pass

### What We've Verified
✅ App code compiles without errors  
✅ All 78 unit tests pass  
✅ App validates at `debug` level  
✅ Homey developer account is configured  
✅ Release v1.0.0 is tagged and on main branch  
✅ Documentation is complete and accurate  
✅ Driver images exist and are properly formatted:
   - `/drivers/wiab-device/assets/images/small.png` (75x75px)
   - `/drivers/wiab-device/assets/images/large.png` (500x500px)
   - `/drivers/wiab-device/assets/images/xlarge.png` (500x500px)

### Status: Issue Reported to Homey Team

**GitHub Issue #414 Filed**
- Repository: https://github.com/athombv/homey-apps-sdk-issues
- Issue: https://github.com/athombv/homey-apps-sdk-issues/issues/414
- Title: "Homey CLI v3.10.0: Driver images property stripped during build but required for publish validation"
- Date Filed: 2025-12-11
- Status: Open - Awaiting Homey team response and fix

The comprehensive issue report includes:
- Exact reproduction steps
- Root cause analysis with evidence
- All workarounds attempted
- Full environment and app details
- Suggested fixes for the Homey team

### Waiting for Fix

The app is now waiting for:
1. Homey team to acknowledge and investigate the bug
2. Fix to be released in CLI v3.10.1 or later
3. Once fixed, run `homey app publish` to submit to App Store

### Alternative Options (If Needed)

**Option 1: Contact Homey Support**
- If CLI fix takes too long, contact Homey support
- Ask if there's a bypass or alternative submission method
- Reference GitHub issue #414

**Option 2: Monitor CLI Releases**
- Subscribe to Homey SDK releases
- Check https://github.com/athombv/homey-apps-sdk-issues/releases
- Upgrade CLI once v3.10.1+ is released

### Files Prepared for Submission
- `.homeycompose/drivers/wiab-device/driver.compose.json` - Has images defined
- `app.json` - Generated build output (images stripped by CLI)
- All app code, tests, and documentation complete
- v1.0.0 release tag created and pushed

### Timeline
- 2025-12-11: App development completed
- 2025-12-11: Release v1.0.0 created and tagged
- 2025-12-11: Documentation finalized
- 2025-12-11: Submission blocked by Homey CLI v3.10.0 bug
- 2025-12-11: Community forum searched for workarounds (none found)
- 2025-12-11: GitHub issue #414 filed with Homey team
- 2025-12-11: App awaiting CLI fix to proceed with submission

### Contact Information
- App ID: `net.dongen.wiab`
- Version: 1.0.0
- Author: Andy van Dongen (andy@dongen.net)

---

**Status: Ready for submission once Homey CLI bug is fixed**
