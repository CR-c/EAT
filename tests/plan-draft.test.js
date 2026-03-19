import test from "node:test";
import assert from "node:assert/strict";

import {
  PLAN_DRAFT_PARSE_ERROR_CODES,
  buildPlanningPrompt,
  parsePlanDraftText,
} from "../src/services/plan-draft.js";

test("buildPlanningPrompt requests JSON-only plan output", () => {
  const prompt = buildPlanningPrompt({
    description: "Build Phase 05 planning flow.",
    title: "Plan generation",
  });

  assert.match(prompt, /JSON only/i);
  assert.match(prompt, /subtasks/i);
  assert.match(prompt, /branch_suffix/i);
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
