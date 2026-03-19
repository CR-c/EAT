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
  assert.match(prompt, /nodes/i);
  assert.match(prompt, /role/i);
  assert.match(prompt, /deliverable/i);
  assert.match(prompt, /acceptance_criteria/i);
  assert.match(prompt, /template_hint/i);
  assert.match(prompt, /branch_suffix/i);
  assert.match(prompt, /depends_on/i);
});

test("parsePlanDraftText extracts markdown-wrapped JSON payloads", () => {
  const result = parsePlanDraftText(`
Planning draft:

\`\`\`json
{
  "nodes": [
    {
      "title": "Build API",
      "description": "Implement task endpoints.",
      "role": "backend",
      "recommended_agent": "codex-cli",
      "branch_suffix": "build-api",
      "deliverable": "REST endpoints",
      "acceptance_criteria": ["Routes are implemented"],
      "template_hint": "service-implementation"
    }
  ]
}
\`\`\`
`);

  assert.equal(result.ok, true);
  assert.equal(result.payload.nodes[0].branch_suffix, "build-api");
});

test("parsePlanDraftText rejects payloads without valid JSON", () => {
  const missingJson = parsePlanDraftText("Plan draft is still thinking.");
  assert.equal(missingJson.ok, false);
  assert.equal(missingJson.error.code, PLAN_DRAFT_PARSE_ERROR_CODES.JSON_NOT_FOUND);

  const invalidJson = parsePlanDraftText("```json\n{\"nodes\":[}\n```");
  assert.equal(invalidJson.ok, false);
  assert.equal(invalidJson.error.code, PLAN_DRAFT_PARSE_ERROR_CODES.INVALID_JSON);
});

test("looksLikeCompletePlanText waits for a complete fenced or raw JSON object", () => {
  assert.equal(looksLikeCompletePlanText("```json\n{\"nodes\": []"), false);
  assert.equal(looksLikeCompletePlanText("{\"nodes\": []}"), true);
  assert.equal(looksLikeCompletePlanText("```json\n{\"nodes\": []}\n```"), true);
});

test("validatePlanDraft normalizes a role-aware DAG plan and still backfills legacy subtask payloads", () => {
  const validPlan = validatePlanDraft(
    {
      notes: "Keep the work parallel-safe.",
      nodes: [
        {
          title: " Backend ",
          description: " Implement the API ",
          role: " backend ",
          recommended_agent: "codex-cli",
          branch_suffix: "backend-api",
          deliverable: " API service ",
          acceptance_criteria: [" Auth routes documented ", " CRUD routes documented "],
          template_hint: " service-implementation ",
        },
        {
          title: " Frontend ",
          description: " Build the UI ",
          role: " frontend ",
          recommended_agent: "codex-cli",
          branch_suffix: "frontend-ui",
          depends_on: ["backend-api"],
          deliverable: " React app ",
          acceptance_criteria: [" Build passes "],
          template_hint: " react-feature ",
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
    nodes: [
      {
        acceptance_criteria: ["Auth routes documented", "CRUD routes documented"],
        branch_suffix: "backend-api",
        deliverable: "API service",
        description: "Implement the API",
        recommended_agent: "codex-cli",
        role: "backend",
        template_hint: "service-implementation",
        title: "Backend",
      },
      {
        acceptance_criteria: ["Build passes"],
        branch_suffix: "frontend-ui",
        deliverable: "React app",
        depends_on: ["backend-api"],
        description: "Build the UI",
        recommended_agent: "codex-cli",
        role: "frontend",
        template_hint: "react-feature",
        title: "Frontend",
      },
    ],
    subtasks: [
      {
        acceptance_criteria: ["Auth routes documented", "CRUD routes documented"],
        branch_suffix: "backend-api",
        deliverable: "API service",
        description: "Implement the API",
        recommended_agent: "codex-cli",
        role: "backend",
        template_hint: "service-implementation",
        title: "Backend",
      },
      {
        acceptance_criteria: ["Build passes"],
        branch_suffix: "frontend-ui",
        depends_on: ["backend-api"],
        deliverable: "React app",
        description: "Build the UI",
        recommended_agent: "codex-cli",
        role: "frontend",
        template_hint: "react-feature",
        title: "Frontend",
      },
    ],
  });

  const legacyPlan = validatePlanDraft(
    {
      subtasks: [
        {
          title: "Legacy backend",
          description: "Keep older plan payloads compatible.",
          recommended_agent: "codex-cli",
          branch_suffix: "legacy-backend",
        },
      ],
    },
    {
      agentHealth: {
        "codex-cli": { available: true },
      },
    },
  );
  assert.equal(legacyPlan.ok, true);
  assert.equal(legacyPlan.plan.nodes[0].role, "legacy-backend");
  assert.equal(legacyPlan.plan.nodes[0].deliverable, "Keep older plan payloads compatible.");
  assert.deepEqual(legacyPlan.plan.nodes[0].acceptance_criteria, ["Keep older plan payloads compatible."]);
  assert.equal(legacyPlan.plan.nodes[0].template_hint, "custom");

  const duplicateBranchSuffix = validatePlanDraft(
    {
      nodes: [
        {
          title: "One",
          description: "One",
          role: "one",
          recommended_agent: "codex-cli",
          branch_suffix: "dup",
          deliverable: "One",
          acceptance_criteria: ["One"],
          template_hint: "custom",
        },
        {
          title: "Two",
          description: "Two",
          role: "two",
          recommended_agent: "codex-cli",
          branch_suffix: "dup",
          deliverable: "Two",
          acceptance_criteria: ["Two"],
          template_hint: "custom",
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
      nodes: [
        {
          title: "One",
          description: "One",
          role: "one",
          recommended_agent: "broken-agent",
          branch_suffix: "one",
          deliverable: "One",
          acceptance_criteria: ["One"],
          template_hint: "custom",
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
      nodes: [
        {
          title: "Frontend",
          description: "Build the UI",
          role: "frontend",
          recommended_agent: "codex-cli",
          branch_suffix: "frontend-ui",
          depends_on: ["backend-api"],
          deliverable: "Frontend",
          acceptance_criteria: ["Build passes"],
          template_hint: "react-feature",
        },
        {
          title: "Backend",
          description: "Build the API",
          role: "backend",
          recommended_agent: "codex-cli",
          branch_suffix: "backend-api",
          deliverable: "Backend",
          acceptance_criteria: ["API passes"],
          template_hint: "service-implementation",
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
