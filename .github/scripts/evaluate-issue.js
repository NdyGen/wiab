#!/usr/bin/env node

/**
 * Issue Evaluator - Automatically evaluates newly created issues
 *
 * Uses Claude API to assess:
 * - Feasibility (technical complexity, dependencies, risks)
 * - Value Added (user impact, alignment with project goals)
 * - Priority (urgency, impact)
 *
 * Posts evaluation as a comment and adds appropriate labels
 */

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const { execSync } = require('child_process');

// Configuration
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ISSUE_NUMBER = process.env.ISSUE_NUMBER;
const ISSUE_TITLE = process.env.ISSUE_TITLE;
const ISSUE_BODY = process.env.ISSUE_BODY || 'No description provided';
const ISSUE_AUTHOR = process.env.ISSUE_AUTHOR;
const REPOSITORY = process.env.REPOSITORY;

// Validate environment
if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is required');
  process.exit(1);
}

if (!GITHUB_TOKEN) {
  console.error('Error: GITHUB_TOKEN is required');
  process.exit(1);
}

// Read project context
let projectContext = '';
try {
  projectContext = fs.readFileSync('CLAUDE.md', 'utf-8');
} catch (error) {
  console.warn('Warning: Could not read CLAUDE.md:', error.message);
}

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

/**
 * Posts a comment to the GitHub issue using gh CLI
 */
async function postComment(body) {
  // Write comment body to temp file to avoid command-line escaping issues
  const tempFile = `/tmp/evaluation-${ISSUE_NUMBER}.md`;
  fs.writeFileSync(tempFile, body, 'utf-8');

  try {
    execSync(`gh issue comment ${ISSUE_NUMBER} --body-file ${tempFile}`, {
      env: { ...process.env, GH_TOKEN: GITHUB_TOKEN },
      stdio: 'inherit'
    });
    console.log('Comment posted successfully');
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

/**
 * Adds labels to the GitHub issue using gh CLI
 */
async function addLabels(labels) {
  if (!labels || labels.length === 0) {
    return;
  }

  const labelArgs = labels.map(l => `--add-label "${l}"`).join(' ');
  execSync(`gh issue edit ${ISSUE_NUMBER} ${labelArgs}`, {
    env: { ...process.env, GH_TOKEN: GITHUB_TOKEN },
    stdio: 'inherit'
  });
  console.log('Labels added successfully');
}

/**
 * Evaluates the issue using Claude API
 */
async function evaluateIssue() {
  const prompt = `You are an expert technical project manager evaluating a new GitHub issue for the WIAB (Wasp in a Box) Homey app project.

## Project Context
${projectContext}

## Issue Details
**Title:** ${ISSUE_TITLE}
**Author:** ${ISSUE_AUTHOR}
**Description:**
${ISSUE_BODY}

## Your Task
Evaluate this issue comprehensively across three dimensions:

### 1. Feasibility (Technical)
- Technical complexity (1-10 scale)
- Required changes (list key files/components)
- Dependencies and prerequisites
- Potential risks or blockers
- Estimated effort (hours/days)

### 2. Value Added (Business)
- User impact (1-10 scale)
- Alignment with project goals
- Benefits vs. costs
- Potential for regression or breaking changes

### 3. Priority (Urgency)
- Priority level: Critical / High / Medium / Low
- Reasoning for priority level
- Suggested timeline

## Output Format
Provide your evaluation in the following structured format:

\`\`\`markdown
## 🤖 Automated Issue Evaluation

### 📊 Feasibility Assessment
**Complexity Score:** [1-10]/10
**Effort Estimate:** [X hours/days]

**Technical Analysis:**
[Your analysis here]

**Required Changes:**
- [File/component 1]
- [File/component 2]

**Risks & Blockers:**
- [Risk 1]
- [Risk 2]

### 💎 Value Assessment
**Impact Score:** [1-10]/10

**Benefits:**
- [Benefit 1]
- [Benefit 2]

**Alignment with Project Goals:**
[Your analysis here]

**Potential Concerns:**
- [Concern 1 if any]

### ⚡ Priority Assessment
**Priority Level:** [Critical/High/Medium/Low]
**Suggested Timeline:** [Immediate/This Sprint/Next Sprint/Backlog]

**Reasoning:**
[Your reasoning here]

### 🎯 Recommendation

**Decision:** [✅ APPROVE / ⚠️ APPROVE WITH CONDITIONS / ❌ REJECT / 🤔 NEEDS MORE INFO]

**Rationale:**
[2-3 sentences explaining your recommendation]

**Next Steps:**
1. [Step 1]
2. [Step 2]

**Suggested Labels:** \`[label1, label2, label3]\`

---
*This evaluation was generated automatically using Claude Sonnet 4.5. Please review and adjust as needed.*
\`\`\`

Be thorough, specific, and practical. Consider the Homey app ecosystem constraints and the project's architecture patterns.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    return message.content[0].text;
  } catch (error) {
    console.error('Error calling Anthropic API:', error);
    throw error;
  }
}

/**
 * Extracts the recommendation decision from the evaluation
 */
function extractRecommendation(evaluation) {
  // Match format: **Decision:** [✅ APPROVE / ⚠️ APPROVE WITH CONDITIONS / ❌ REJECT / 🤔 NEEDS MORE INFO]
  const decisionMatch = evaluation.match(/\*\*Decision:\*\*\s*\[?[✅⚠️❌🤔]?\s*([^\]\/\n]+)/i);
  if (!decisionMatch) {
    return null;
  }

  const decision = decisionMatch[1].trim().toUpperCase();

  // Map decision to label
  if (decision.includes('APPROVE WITH CONDITION')) {
    return 'approve-with-conditions';
  } else if (decision === 'APPROVE' || decision.includes('✅ APPROVE')) {
    return 'approved';
  } else if (decision.includes('REJECT')) {
    return 'rejected';
  } else if (decision.includes('NEEDS MORE INFO') || decision.includes('NEED MORE INFO')) {
    return 'needs-info';
  }

  return null;
}

/**
 * Extracts suggested labels from the evaluation
 */
function extractLabels(evaluation) {
  // Try format: **Suggested Labels:** `[label1, label2]`
  let labelMatch = evaluation.match(/\*\*Suggested Labels:\*\* `\[(.*?)\]`/);
  if (labelMatch) {
    return labelMatch[1].split(',').map(label => label.trim());
  }

  // Try format: **Suggested Labels:** `label1, label2, label3`
  labelMatch = evaluation.match(/\*\*Suggested Labels:\*\* `([^`]+)`/);
  if (labelMatch) {
    return labelMatch[1].split(',').map(label => label.trim());
  }

  return [];
}

/**
 * Main execution
 */
async function main() {
  console.log(`Evaluating issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}`);

  try {
    // Get evaluation from Claude
    console.log('Requesting evaluation from Claude API...');
    const evaluation = await evaluateIssue();
    console.log('Evaluation received');

    // Post evaluation as comment
    console.log('Posting evaluation comment...');
    await postComment(evaluation);
    console.log('Comment posted successfully');

    // Extract recommendation and suggested labels
    const recommendationLabel = extractRecommendation(evaluation);
    const suggestedLabels = extractLabels(evaluation);

    // Combine recommendation label with suggested labels (avoiding duplicates)
    const allLabels = recommendationLabel
      ? [recommendationLabel, ...suggestedLabels.filter(l => l !== recommendationLabel)]
      : suggestedLabels;

    if (allLabels.length > 0) {
      console.log('Adding labels:', allLabels);
      if (recommendationLabel) {
        console.log(`Recommendation label: ${recommendationLabel}`);
      }
      try {
        await addLabels(allLabels);
        console.log('Labels added successfully');
      } catch (labelError) {
        console.warn('Could not add labels (they may not exist):', labelError.message);
      }
    }

    console.log('✅ Issue evaluation complete');
  } catch (error) {
    console.error('❌ Error during evaluation:', error);

    // Post error comment
    try {
      await postComment(
        `## ⚠️ Automated Evaluation Failed\n\n` +
        `An error occurred while evaluating this issue:\n\n` +
        `\`\`\`\n${error.message}\n\`\`\`\n\n` +
        `Please manually review this issue.`
      );
    } catch (commentError) {
      console.error('Failed to post error comment:', commentError);
    }

    process.exit(1);
  }
}

main();
