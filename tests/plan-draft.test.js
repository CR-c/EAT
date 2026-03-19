import test from "node:test";
import assert from "node:assert/strict";

import {
  PLAN_DRAFT_PARSE_ERROR_CODES,
  PLAN_VALIDATION_ERROR_CODES,
  buildPlanningPrompt,
  looksLikeCompletePlanText,
  parsePlanDraftText,
  validatePlanDraft,
} from "../src/services/plan-draft.js";

test("buildPlanningPrompt requests JSON-only plan output", () => {
  const prompt = buildPlanningPrompt({
    description: "Build Phase 05 planning flow.",
    title: "Plan generation",
  });

  assert.match(prompt, /JSON only/i);
  assert.match(prompt, /subtasks/i);
  assert.match(prompt, /branch_suffix/i);
  assert.match(prompt, /depends_on/i);
});

test("parsePlanDraftText extracts markdown-wrapped JSON payloads", () => {
  const result = parsePlanDraftText(`
Planning draft:

\`\`\`json
{
  "subtasks": [
    {
      "title": "Build API",
      "description": "Implement task endpoints.",
      "recommended_agent": "codex-cli",
      "branch_suffix": "build-api"
    }
  ]
}
\`\`\`
`);

  assert.equal(result.ok, true);
  assert.equal(result.payload.subtasks[0].branch_suffix, "build-api");
});

test("parsePlanDraftText rejects payloads without valid JSON", () => {
  const missingJson = parsePlanDraftText("Plan draft is still thinking.");
  assert.equal(missingJson.ok, false);
  assert.equal(missingJson.error.code, PLAN_DRAFT_PARSE_ERROR_CODES.JSON_NOT_FOUND);

  const invalidJson = parsePlanDraftText("```json\n{\"subtasks\":[}\n```");
  assert.equal(invalidJson.ok, false);
  assert.equal(invalidJson.error.code, PLAN_DRAFT_PARSE_ERROR_CODES.INVALID_JSON);
});

test("looksLikeCompletePlanText waits for a complete fenced or raw JSON object", () => {
  assert.equal(looksLikeCompletePlanText("```json\n{\"subtasks\": []"), false);
  assert.equal(looksLikeCompletePlanText("{\"subtasks\": []}"), true);
  assert.equal(looksLikeCompletePlanText("```json\n{\"subtasks\": []}\n```"), true);
});

test("validatePlanDraft normalizes a valid plan and rejects duplicate or unhealthy subtasks", () => {
  const validPlan = validatePlanDraft(
    {
      notes: "Keep the work parallel-safe.",
      subtasks: [
        {
          title: " Backend ",
          description: " Implement the API ",
          recommended_agent: "codex-cli",
          branch_suffix: "backend-api",
        },
        {
          title: " Frontend ",
          description: " Build the UI ",
          recommended_agent: "codex-cli",
          branch_suffix: "frontend-ui",
          depends_on: ["backend-api"],
        },
      ],
    },
    {
      agentHealth: {
        "codex-cli": { available: true },
      },
    },
  );

  assert.equal(validPlan.ok, true);
  assert.deepEqual(validPlan.plan, {
    notes: "Keep the work parallel-safe.",
    subtasks: [
      {
        branch_suffix: "backend-api",
        description: "Implement the API",
        recommended_agent: "codex-cli",
        title: "Backend",
      },
      {
        branch_suffix: "frontend-ui",
        depends_on: ["backend-api"],
        description: "Build the UI",
        recommended_agent: "codex-cli",
        title: "Frontend",
      },
    ],
  });

  const duplicateBranchSuffix = validatePlanDraft(
    {
      subtasks: [
        {
          title: "One",
          description: "One",
          recommended_agent: "codex-cli",
          branch_suffix: "dup",
        },
        {
          title: "Two",
          description: "Two",
          recommended_agent: "codex-cli",
          branch_suffix: "dup",
        },
      ],
    },
    {
      agentHealth: {
        "codex-cli": { available: true },
      },
    },
  );
  assert.equal(duplicateBranchSuffix.ok, false);
  assert.equal(duplicateBranchSuffix.error.code, PLAN_VALIDATION_ERROR_CODES.BRANCH_SUFFIX_DUPLICATE);

  const unhealthyAgent = validatePlanDraft(
    {
      subtasks: [
        {
          title: "One",
          description: "One",
          recommended_agent: "broken-agent",
          branch_suffix: "one",
        },
      ],
    },
    {
      agentHealth: {
        "broken-agent": { available: false, failureReason: { message: "offline" } },
      },
    },
  );
  assert.equal(unhealthyAgent.ok, false);
  assert.equal(unhealthyAgent.error.code, PLAN_VALIDATION_ERROR_CODES.RECOMMENDED_AGENT_UNHEALTHY);

  const invalidDependsOn = validatePlanDraft(
    {
      subtasks: [
        {
          title: "Frontend",
          description: "Build the UI",
          recommended_agent: "codex-cli",
          branch_suffix: "frontend-ui",
          depends_on: ["backend-api"],
        },
        {
          title: "Backend",
          description: "Build the API",
          recommended_agent: "codex-cli",
          branch_suffix: "backend-api",
        },
      ],
    },
    {
      agentHealth: {
        "codex-cli": { available: true },
      },
    },
  );
  assert.equal(invalidDependsOn.ok, false);
  assert.equal(invalidDependsOn.error.code, PLAN_VALIDATION_ERROR_CODES.DEPENDS_ON_INVALID);
});
