# Pull Request

<!--
⚠️ IMPORTANT: PR Title Format
Your PR title MUST follow conventional commit format (it becomes the squash merge commit):
✅ feat: add sensor timeout configuration
✅ fix: resolve occupancy state race condition
✅ docs(readme): update installation steps
❌ Added sensor timeout (wrong format)
❌ Fix bug (too vague)
-->

## Description
<!-- Provide a brief description of the changes in this PR -->

## Type of Change
<!-- Mark the relevant option with an "x" -->
- [ ] Feature (`feature/*` branch)
- [ ] Bugfix (`feature/*` or `hotfix/*` branch)
- [ ] Hotfix (`hotfix/*` branch)
- [ ] Release (`release/*` branch)
- [ ] Documentation
- [ ] Other (please describe):

## Gitflow Checklist
<!-- Ensure your PR follows gitflow workflow -->
- [ ] Branch naming follows convention (`feature/*`, `hotfix/*`, `release/*`)
- [ ] PR targets the correct branch:
  - Features/bugfixes → `develop`
  - Hotfixes → `main` (and will be merged back to `develop`)
  - Releases → `main` (and will be merged back to `develop`)
- [ ] Branch is up to date with target branch
- [ ] No merge conflicts

## Code Quality Checklist
- [ ] Code compiles without errors (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] Test coverage meets 70% threshold (`npm run test:coverage`)
- [ ] Code passes linting (`npm run lint`)
- [ ] Homey app validation passes (`npm run validate`)
- [ ] New tests added for new functionality
- [ ] Public methods/classes are documented
- [ ] Error handling is implemented

## Testing
<!-- Describe how you tested these changes -->
- [ ] Unit tests added/updated
- [ ] Manual testing performed
- [ ] Tested on actual Homey device (if applicable)

**Test scenarios:**
<!-- List the test scenarios you've verified -->
1.
2.
3.

## Related Issues
<!-- Link any related issues using #issue_number -->
Closes #
Related to #

## Breaking Changes
<!-- Does this PR introduce breaking changes? -->
- [ ] Yes (please describe below)
- [ ] No

**Breaking changes description:**
<!-- If yes, describe what breaks and migration path -->

## Additional Notes
<!-- Any additional information, context, or screenshots -->

## Reviewer Notes
<!-- @mentions or special instructions for reviewers -->

