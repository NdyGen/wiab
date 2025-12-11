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

### Recommended Next Steps

**Option 1: Report to Homey and Wait (Recommended)**
- File an issue on the Homey GitHub repository
- Link: https://github.com/athombv/homey-sdk
- Include: This reproduction case and error messages
- Wait for Homey team to release a fix in CLI v3.10.1+

**Option 2: Workaround (If Available)**
- Check Homey community forums for reported workarounds
- Monitor Homey SDK releases for fixes
- Some users may have patches or alternative submission methods

**Option 3: Manual API Submission (If Possible)**
- Contact Homey support to explore direct API submission
- Ask if there's a bypass for the CLI validation bug

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

### Contact Information
- App ID: `net.dongen.wiab`
- Version: 1.0.0
- Author: Andy van Dongen (andy@dongen.net)

---

**Status: Ready for submission once Homey CLI bug is fixed**
