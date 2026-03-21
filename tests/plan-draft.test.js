import test from "node:test";
import assert from "node:assert/strict";

import { buildPlanningPrompt, validatePlanDraft } from "../src/services/plan-draft.js";

test("buildPlanningPrompt constrains recommended_agent to real available agent names", () => {
  const prompt = buildPlanningPrompt(
    {
      description: "Implement a todo feature.",
      title: "Todo feature",
    },
    {
      availableAgentNames: ["codex-cli"],
      defaultAgentType: "codex-cli",
    },
  );

  assert.match(prompt, /Use only these exact agent names.*codex-cli/u);
  assert.match(prompt, /If you are unsure.*codex-cli/u);
});

test("buildPlanningPrompt includes agency-inspired role guidance for planning quality", () => {
  const prompt = buildPlanningPrompt(
    {
      description: "Ship a frontend-heavy feature with deployment and review steps.",
      title: "Feature delivery",
    },
    {
      availableAgentNames: ["codex-cli"],
      defaultAgentType: "codex-cli",
    },
  );

  assert.match(prompt, /Planning mode is now active\. Requirements are finalized\./u);
  assert.match(prompt, /Your next response must be a single JSON object only\./u);
  assert.match(prompt, /Plan for a coordinated agent team, not a bag of unrelated tickets\./u);
  assert.match(prompt, /For the `role` field, prefer concise kebab-case specialist roles/u);
  assert.match(prompt, /maximize safe parallel execution/u);
  assert.match(prompt, /include explicit nodes that close the loop: implementation handoff, automated checks, readiness review, and release or smoke validation/u);
  assert.match(prompt, /frontend-developer: UI implementation/u);
  assert.match(prompt, /backend-architect: API contracts/u);
  assert.match(prompt, /devops-automator: CI\/CD/u);
  assert.match(prompt, /code-reviewer: correctness review/u);
  assert.match(prompt, /reality-checker: evidence-based release readiness/u);
});

test("validatePlanDraft normalizes generic planner aliases to the only available agent", () => {
  const validation = validatePlanDraft(
    {
      subtasks: [
        {
          branch_suffix: "plan-discovery",
          description: "Inspect the repository structure.",
          recommended_agent: "default",
          title: "Inspect the repository",
        },
        {
          branch_suffix: "frontend-todo-overview",
          depends_on: ["plan-discovery"],
          description: "Build the overview panel.",
          recommended_agent: "frontend-specialist",
          title: "Build the overview panel",
        },
      ],
    },
    {
      agentHealth: {
        "codex-cli": {
          available: true,
        },
      },
    },
  );

  assert.equal(validation.ok, true);
  assert.deepEqual(
    validation.plan.subtasks.map((subtask) => subtask.recommended_agent),
    ["codex-cli", "codex-cli"],
  );
});

test("validatePlanDraft still rejects unknown unavailable agents when multiple real agents exist", () => {
  const validation = validatePlanDraft(
    {
      subtasks: [
        {
          branch_suffix: "backend-slice",
          description: "Build the backend slice.",
          recommended_agent: "mystery-agent",
          title: "Backend slice",
        },
      ],
    },
    {
      agentHealth: {
        "codex-cli": {
          available: true,
        },
        "claude-cli": {
          available: true,
        },
      },
      defaultAgentType: "codex-cli",
    },
  );

  assert.equal(validation.ok, false);
  assert.equal(validation.error.code, "RECOMMENDED_AGENT_UNHEALTHY");
  assert.equal(validation.error.details.recommendedAgent, "mystery-agent");
});
