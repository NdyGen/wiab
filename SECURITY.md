# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in WIAB, please report it by creating an issue at:
https://github.com/NdyGen/wiab/issues

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if available)

We will respond to security reports within 48 hours and provide a timeline for fixes.

## Known Vulnerabilities

This section documents known security vulnerabilities in WIAB's dependencies. These are tracked and assessed for risk.

### Current Status (as of December 19, 2025)

**Total Vulnerabilities:** 13 (4 low, 9 moderate)
**Overall Risk Level:** Low to Medium

All identified vulnerabilities are in **transitive dependencies** from the official Homey SDK packages (`homey@3.10.0` and `homey-api@3.14.22`), which are required for Homey app development.

### Vulnerability Details

#### 1. parseuri - Regular Expression Denial of Service (ReDoS)

- **Package:** `parseuri` (<2.0.0)
- **Severity:** Moderate
- **CVE:** GHSA-6fx8-h7jm-663j
- **Dependency Path:** `homey-api` → `engine.io-client` → `parseuri`
- **Impact on WIAB:** Minimal - would require malicious input to socket.io connection
- **Status:** Waiting for Homey SDK update
- **Mitigation:** WIAB runs in Homey's sandboxed environment with controlled input

#### 2. got - UNIX Socket Redirect Vulnerability

- **Package:** `got` (<11.8.5)
- **Severity:** Moderate
- **CVE:** GHSA-pfrx-2q88-qq97
- **CVSS Score:** 5.3
- **Dependency Path:** `homey` → `update-notifier` → `latest-version` → `package-json` → `got`
- **Impact on WIAB:** Minimal - not exposed to external requests
- **Status:** Waiting for Homey SDK update
- **Mitigation:** Development-time dependency only, not used at runtime

#### 3. engine.io-client - Affected by parseuri

- **Package:** `engine.io-client` (1.0.2 - 6.1.1)
- **Severity:** Moderate
- **Dependency Path:** `homey-api` → `engine.io-client`
- **Impact on WIAB:** Minimal - inherits parseuri vulnerability
- **Status:** Waiting for Homey SDK update
- **Mitigation:** WIAB runs in Homey's sandboxed environment

#### 4. tmp - Arbitrary File Write via Symlink

- **Package:** `tmp` (≤0.2.3)
- **Severity:** Low
- **CVE:** GHSA-52f5-9888-hmc6
- **Dependency Path:** `homey` → `eslint` → `inquirer` → `external-editor` → `tmp`
- **Impact on WIAB:** None - development-time dependency only
- **Status:** Waiting for Homey SDK update
- **Mitigation:** Not used during app runtime

#### 5. eslint - Via inquirer Vulnerability

- **Package:** `eslint` (4.0.0-alpha.0 - 7.2.0)
- **Severity:** Low
- **Dependency Path:** `homey` → `eslint` (bundled with old version)
- **Impact on WIAB:** None - development-time dependency only
- **Status:** Waiting for Homey SDK update
- **Mitigation:** Not used during app runtime

### Why These Vulnerabilities Exist

The Homey SDK (version 3.x) is maintained by Athom and includes these vulnerable dependencies. The suggested fixes from `npm audit` would require:

- **Breaking changes:** Downgrading `homey` from v3.10.0 to v2.34.0
- **App breakage:** Homey SDK v2 is incompatible with current WIAB implementation
- **Limited benefit:** Only 1 of 13 vulnerabilities would be fixed without force flag

### Risk Assessment

| Vulnerability | Exploitability | Runtime Impact | Development Impact |
|---------------|----------------|----------------|-------------------|
| parseuri ReDoS | Low | Minimal | None |
| got UNIX redirect | Low | Minimal | Low |
| engine.io-client | Low | Minimal | None |
| tmp symlink | Very Low | None | Low |
| eslint | Very Low | None | None |

**Factors Reducing Risk:**

1. **Sandboxed Environment:** WIAB runs in Homey's controlled sandbox
2. **No External Exposure:** App doesn't expose network interfaces to external users
3. **Controlled Input:** All input is mediated by Homey platform
4. **Development Dependencies:** Most vulnerabilities are in build-time tools
5. **Official SDK:** Using Athom's official, required SDK packages

### Monitoring and Remediation Strategy

**Immediate Actions:**
- ✅ Documented known vulnerabilities in this file
- ✅ Configured npm audit to suppress known, accepted risks
- ✅ Assessed actual risk to WIAB users (Low to Medium)

**Ongoing Actions:**
- 📊 Monitor Homey SDK releases for security updates
- 🔍 Review npm audit output with each dependency update
- 📝 Re-assess risk when new vulnerabilities are discovered
- 🚀 Update to patched Homey SDK versions when available

**Tracking:**
- Homey SDK GitHub: https://github.com/athombv/node-homey-sdk
- Homey SDK npm: https://www.npmjs.com/package/homey
- Homey API npm: https://www.npmjs.com/package/homey-api

### For Developers

**Running Security Audits:**

```bash
# Check for new vulnerabilities
npm audit

# See what automatic fixes are available (review before applying)
npm audit fix --dry-run

# Apply safe fixes only (no breaking changes)
npm audit fix

# See all vulnerabilities including suppressed ones
npm audit --audit-level=low
```

**Important Notes:**

- **Do NOT run `npm audit fix --force`** - This will downgrade Homey SDK to v2 and break the app
- Review any package updates carefully before applying
- Test thoroughly after dependency changes
- Check Homey app compatibility after SDK updates

### Vulnerability Disclosure Timeline

| Date | Event |
|------|-------|
| 2025-12-19 | Initial security audit performed |
| 2025-12-19 | Vulnerabilities documented in SECURITY.md |
| 2025-12-19 | Risk assessment completed: Low to Medium |
| TBD | Waiting for Homey SDK security updates |

---

**Last Updated:** December 19, 2025
**Next Review:** When Homey SDK releases new version
