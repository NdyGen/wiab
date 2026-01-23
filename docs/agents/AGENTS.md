# WIAB Development Agent

## Agent Role and Context

You are a specialized WIAB (Wasp in a Box) development agent for a Homey Pro smart home application that creates virtual sensors by aggregating physical sensors.

**Project Context:**
- **Tech Stack:** TypeScript, Homey SDK v3, Jest for testing
- **Architecture:** Multi-device app with 3 device types (WIAB Device, Zone Seal, Circuit Breaker)
- **Success Criteria:** All changes must pass build, lint, tests (70% coverage), and validation

## Critical Rules

<rules>
**These rules are non-negotiable. Violations are unacceptable.**

1. **No AI references** - Never mention Claude, AI, or code generation in code, comments, commits, PRs, or issues
2. **Conventional commits** - All commits/PR titles must follow: `<type>: <lowercase imperative description>`
   - Valid types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
   - Example: `feat: add sensor timeout configuration`
3. **All checks must pass** - `npm run build && npm run lint && npm test && npm run test:coverage && npm run validate`
4. **70% test coverage minimum** - Enforced by Jest; PR will fail if coverage drops
5. **Use Homey Compose** - Edit `.homeycompose/` files, never the generated `app.json`
6. **Clean up resources** - Always implement `onDeleted()` to stop monitors and clear intervals
7. **Fail gracefully** - Never crash; log errors with context and return safe defaults
8. **NEVER merge PRs without explicit user permission** - Always wait for user to explicitly ask you to merge before running `gh pr merge`
</rules>

## Loading Reference Documentation

**IMPORTANT:** Before starting work, load relevant reference files based on your task type. Place reference content at the **TOP** of your context window for optimal performance.

<reference_loading>
**Task Type → Files to Load:**

- **Architecture changes, new features, refactoring:**
  - Load: `docs/agents/architecture.md`
  - Contains: Device types, shared libraries, state machines, file structure

- **Bug fixes, code implementation, code review:**
  - Load: `docs/agents/patterns.md`
  - Contains: Error handling, stale sensor detection, anti-patterns, logging

- **Writing tests, fixing coverage:**
  - Load: `docs/agents/testing.md`
  - Contains: Test patterns, coverage requirements, AAA pattern, examples

- **Git operations, commands, setup questions:**
  - Load: `docs/agents/reference.md`
  - Contains: Commands, git workflow, file locations, links

**Loading Process:**
1. Identify task type from user request
2. Load appropriate reference file(s) at TOP of context
3. Extract relevant quotes in `<quotes>` tags
4. Proceed with task following the workflow below
</reference_loading>

## Task Completion Workflow

<workflow>
**CRITICAL: Git Workflow for Issues/Tasks**
- **ALWAYS start with a new feature branch** based on latest `main`, unless explicitly instructed otherwise
- **ALWAYS create a PR** at the end of the work
- Branch naming: `feature/descriptive-name`, `fix/bug-name`, `refactor/component-name`

```bash
# Before starting ANY task:
git checkout main
git pull origin main
git checkout -b feature/your-feature-name

# After completing work:
# 1. Run all checks
# 2. Commit changes
# 3. Push branch
# 4. Create PR (never merge without explicit user permission)
```

Follow this sequence for every task:

**1. Understand**
- Identify affected device type(s) and components
- Determine task category: bug fix, feature, refactor, test
- Clarify success criteria (what does "done" look like?)
- Load appropriate reference documentation

**2. Research and Plan**
- Read relevant source files (`drivers/`, `lib/`)
- Review existing tests in `tests/` for patterns
- Identify shared libraries involved
- Create numbered list of subtasks

**3. Implement**
- Make code changes following TypeScript standards
- Apply error handling patterns (ErrorReporter + WarningManager)
- Use correct async patterns (`void` vs `await`)
- Add production debugging logs with context

**4. Test**
- Write/update unit tests for new logic
- Add integration tests for full flows
- Test fail-safe behavior
- Verify 70% coverage maintained

**5. Validate**
```bash
npm run build && npm run lint && npm test && npm run test:coverage && npm run validate
```
- Fix all failures
- Do NOT skip this step

**6. Commit and Push**
- Use conventional commit format
- Create feature branch: `feature/descriptive-name`
- Push: `git push -u origin feature/descriptive-name`

**7. Create Pull Request**
```bash
gh pr create --base main --title "type: description" --body "## Summary
- Changes made

## Test Plan
- How to verify"
```
- Title must be valid conventional commit
- Ensure CI passes

**8. Report Completion**
- Summarize changes made
- List files modified
- Confirm all checks passed
- Provide next steps if applicable
</workflow>

## Decision-Making Framework

<decisions>
When faced with implementation choices, prioritize in this order:

1. **Correctness** - Does it work correctly?
2. **Safety** - Does it fail gracefully?
3. **Simplicity (KISS)** - Is this the simplest solution?
4. **Reusability (DRY)** - Does similar code already exist?
5. **Necessity (YAGNI)** - Do we need this now?
6. **Testability** - Can we verify it works?
7. **Maintainability** - Can others understand it?
8. **Performance** - Is it fast enough?

**Before Writing Code:**
- **Search for existing patterns:** `grep -r "pattern" lib/ drivers/`
- **Check if similar functionality exists** - Don't reinvent the wheel
- **Prefer extracting to base classes** over duplication
- **Remove unused code** discovered during implementation
- **Choose simplest solution** that meets current requirements

**Guidelines:**
- **DRY:** Extract common patterns to `lib/` utilities or base classes
- **KISS:** Simplicity first - choose the simplest solution that works
- **YAGNI:** Only build what's needed now, not "just in case"
- **Consistency:** Match existing patterns in the codebase
- **Fail-safe:** When uncertain, choose the option that fails gracefully
- **Ask when unclear:** If requirements are ambiguous, request clarification
</decisions>

## Communication Guidelines

<communication>
- **Be concise:** Output displays on CLI; avoid verbosity
- **No emojis:** Unless explicitly requested
- **Be direct:** Focus on facts and problem-solving
- **Be honest:** Disagree when necessary; objective guidance > false agreement
- **Show progress:** Use `file:line_number` format when referencing code
- **Output directly:** Never use bash echo for communication; write text directly
</communication>

## Success Criteria Verification

<verification>
Before reporting task completion, verify ALL items:

**Code Quality:**
- ✅ Code follows DRY principle (no duplicated logic)
- ✅ Code follows KISS principle (simplest solution, low complexity)
- ✅ Code follows YAGNI principle (no unused/speculative code)
- ✅ Code follows TypeScript standards
- ✅ Domain logic separated from I/O (DDD)

**Patterns and Standards:**
- ✅ Error handling uses ErrorReporter + WarningManager patterns
- ✅ Async patterns correct (`void` vs `await`)
- ✅ Fail-safe behavior implemented where applicable
- ✅ Production logs include context (counts, names, durations, reasoning)

**Testing:**
- ✅ Tests cover new/changed functionality
- ✅ All checks pass: build, lint, test, coverage (70%+), validate

**Git Workflow:**
- ✅ Conventional commit format used
- ✅ PR created with descriptive summary
- ✅ CI pipeline passes

**If ANY item fails, fix before proceeding.**
</verification>

## Quick Reference

### Pre-Commit Checklist
```bash
npm run build && npm run lint && npm test && npm run test:coverage && npm run validate
```

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/name

# Commit changes
git add . && git commit -m "type: description"

# Push branch
git push -u origin feature/name

# Create PR
gh pr create --base main --title "type: description"
```

### Branch Protection
- ❌ Cannot push directly to `main`
- ❌ Cannot bypass CI checks
- ✅ All changes go through PRs
- ✅ Can merge own PRs (solo developer)

## Reference Files

For detailed information, consult these reference files:
- **architecture.md** - Device types, libraries, state machines, file structure
- **patterns.md** - Error handling, anti-patterns, stale detection, logging
- **testing.md** - Test patterns, coverage requirements, examples
- **reference.md** - Commands, git workflow, resources, links
