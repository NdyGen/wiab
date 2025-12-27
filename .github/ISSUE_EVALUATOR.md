# Automated Issue Evaluator

## Overview

The WIAB project uses an automated issue evaluation system powered by Claude Sonnet 4.5 to assess newly created issues for feasibility, value, and priority.

## How It Works

When a new issue is created, the GitHub Action automatically:

1. **Reads the issue details** - Title, description, and author
2. **Analyzes project context** - Reads `CLAUDE.md` for project guidelines and architecture
3. **Evaluates the issue** - Uses Claude AI to assess:
   - **Feasibility**: Technical complexity, effort estimate, required changes, risks
   - **Value**: User impact, alignment with goals, benefits vs. costs
   - **Priority**: Urgency level and suggested timeline
4. **Posts evaluation** - Adds a comprehensive evaluation comment to the issue
5. **Adds labels** - Automatically applies suggested labels (priority, type, etc.)

## Evaluation Criteria

### Feasibility Assessment
- **Complexity Score** (1-10): How technically challenging is this?
- **Effort Estimate**: Time required to implement
- **Required Changes**: Which files/components need modification
- **Risks & Blockers**: Potential issues or dependencies

### Value Assessment
- **Impact Score** (1-10): How much does this benefit users?
- **Benefits**: Specific advantages of implementing
- **Alignment**: How well does it fit project goals?
- **Concerns**: Potential drawbacks or breaking changes

### Priority Assessment
- **Priority Level**: Critical / High / Medium / Low
- **Timeline**: Immediate / This Sprint / Next Sprint / Backlog
- **Reasoning**: Why this priority level?

## Recommendation Types

The evaluator provides one of four recommendations:

- **✅ APPROVE**: Issue is valuable, feasible, and should be implemented
- **⚠️ APPROVE WITH CONDITIONS**: Good idea but needs clarification or prerequisites
- **❌ REJECT**: Not aligned with project goals or too risky
- **🤔 NEEDS MORE INFO**: Insufficient detail to make a decision

## Setup Requirements

### GitHub Secrets

The workflow requires one secret to be configured:

- `ANTHROPIC_API_KEY`: Your Anthropic API key for Claude access

To add this secret:
1. Go to repository Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `ANTHROPIC_API_KEY`
4. Value: Your Anthropic API key
5. Click "Add secret"

### Permissions

The workflow needs:
- `issues: write` - To post evaluation comments and add labels
- `contents: read` - To read project files like CLAUDE.md

These are already configured in `.github/workflows/evaluate-issue.yml`.

## Example Evaluation

```markdown
## 🤖 Automated Issue Evaluation

### 📊 Feasibility Assessment
**Complexity Score:** 6/10
**Effort Estimate:** 4-6 hours

**Technical Analysis:**
This feature requires modifications to the circuit breaker device class
and updates to the cascade engine. The complexity is moderate because
it touches existing core functionality.

**Required Changes:**
- `drivers/wiab-circuit-breaker/device.ts`
- `lib/CircuitBreakerCascadeEngine.ts`
- Add new tests in `tests/unit/CircuitBreakerDevice.test.ts`

**Risks & Blockers:**
- Potential breaking changes to cascade behavior
- Need to maintain backward compatibility

### 💎 Value Assessment
**Impact Score:** 8/10

**Benefits:**
- Significantly improves user experience for large hierarchies
- Eliminates confusing timeout messages
- No functional changes, just UX improvement

**Alignment with Project Goals:**
High alignment - focuses on reliability and user experience, core
project values per CLAUDE.md.

**Potential Concerns:**
- Fire-and-forget pattern means errors happen in background

### ⚡ Priority Assessment
**Priority Level:** High
**Suggested Timeline:** This Sprint

**Reasoning:**
This is a bug that affects user experience with a clear, low-risk solution.
The technical approach is sound and aligns with existing patterns.

### 🎯 Recommendation

**Decision:** ✅ APPROVE

**Rationale:**
This is a well-defined bug with clear user impact and a solid technical
solution. The fire-and-forget pattern is appropriate for this use case
and maintains all existing functionality while improving UX.

**Next Steps:**
1. Create feature branch
2. Implement fire-and-forget cascade pattern
3. Add comprehensive tests for async behavior
4. Submit PR with test coverage report

**Suggested Labels:** `[bug, priority-high, ux-improvement]`
```

## Customization

### Modifying Evaluation Criteria

To adjust what the evaluator considers, edit `.github/scripts/evaluate-issue.js`:

```javascript
const prompt = `You are an expert technical project manager...
// Modify this prompt to change evaluation criteria
`;
```

### Changing Labels

Labels are extracted from the evaluation. To ensure they're applied:

1. Create the labels in your repository first
2. The evaluator will suggest them in the format: `**Suggested Labels:** `[label1, label2]``
3. The script automatically applies labels that exist

### Adjusting Model Settings

To use a different model or adjust parameters, modify `.github/scripts/evaluate-issue.js`:

```javascript
const message = await anthropic.messages.create({
  model: 'claude-sonnet-4-5-20250929', // Change model here
  max_tokens: 4096,                      // Adjust output length
  // ...
});
```

## Troubleshooting

### Evaluation Not Running

1. Check workflow runs in Actions tab
2. Verify `ANTHROPIC_API_KEY` secret is set
3. Ensure workflow file is in `.github/workflows/`
4. Check GitHub Actions permissions in repository settings

### API Errors

If you see "Error calling Anthropic API":
1. Verify API key is valid and has credits
2. Check Anthropic API status
3. Review error message in workflow logs

### Label Errors

If labels fail to apply:
1. Create the suggested labels in your repository first
2. Check that workflow has `issues: write` permission
3. Review error in workflow logs (non-fatal, evaluation still posts)

## Cost Considerations

Each issue evaluation costs approximately:
- Input tokens: ~2,000-3,000 (project context + issue)
- Output tokens: ~1,500-2,000 (evaluation)
- **Total**: ~$0.02-0.04 per issue (Claude Sonnet 4.5 pricing)

For a typical project with 10-20 issues/month, this is ~$0.40-0.80/month.

## Benefits

✅ **Consistency**: Every issue gets the same thorough evaluation
✅ **Speed**: Instant feedback for contributors
✅ **Quality**: Catches unclear or problematic issues early
✅ **Prioritization**: Clear guidance on what to work on next
✅ **Documentation**: Evaluation becomes part of issue history

## Limitations

- Evaluation is AI-generated and should be reviewed by humans
- Cannot test code or verify implementation details
- May miss context that requires deep domain knowledge
- Works best with well-written, detailed issues

## Future Improvements

Potential enhancements:
- Add issue template compliance checking
- Integrate with project board for automatic organization
- Include historical data (similar past issues)
- Support for re-evaluation on issue updates
- Custom evaluation profiles for different issue types
