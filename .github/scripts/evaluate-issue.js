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
const https = require('https');

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
 * Posts a comment to the GitHub issue
 */
async function postComment(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ body });

    const options = {
      hostname: 'api.github.com',
      path: `/repos/${REPOSITORY}/issues/${ISSUE_NUMBER}/comments`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'User-Agent': 'WIAB-Issue-Evaluator',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };

    const req = https.request(options, (res) => {
      let responseBody = '';

      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(responseBody));
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode} - ${responseBody}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Adds labels to the GitHub issue
 */
async function addLabels(labels) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ labels });

    const options = {
      hostname: 'api.github.com',
      path: `/repos/${REPOSITORY}/issues/${ISSUE_NUMBER}/labels`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'User-Agent': 'WIAB-Issue-Evaluator',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };

    const req = https.request(options, (res) => {
      let responseBody = '';

      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(responseBody));
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode} - ${responseBody}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
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
 * Extracts suggested labels from the evaluation
 */
function extractLabels(evaluation) {
  const labelMatch = evaluation.match(/\*\*Suggested Labels:\*\* `\[(.*?)\]`/);
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

    // Extract and add suggested labels
    const suggestedLabels = extractLabels(evaluation);
    if (suggestedLabels.length > 0) {
      console.log('Adding labels:', suggestedLabels);
      try {
        await addLabels(suggestedLabels);
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
