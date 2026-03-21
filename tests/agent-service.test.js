import test from "node:test";
import assert from "node:assert/strict";

import { buildSelectionCandidates } from "../src/services/agent-service.js";

test("selection candidates only treat real healthy runtimes as selectable", () => {
  const agents = [
    {
      name: "codex-cli",
      runtimeMode: "REAL",
      capabilities: {
        canExecute: true,
        canOrchestrate: true,
      },
    },
    {
      name: "claude-cli",
      runtimeMode: "STUB",
      capabilities: {
        canExecute: true,
        canOrchestrate: true,
      },
    },
  ];

  const candidates = buildSelectionCandidates(agents, {
    "claude-cli": {
      available: false,
      runtimeMode: "STUB",
    },
    "codex-cli": {
      available: true,
      runtimeMode: "REAL",
    },
  }, "lead");

  assert.deepEqual(
    candidates.map((candidate) => ({
      agentName: candidate.agentName,
      runtimeMode: candidate.runtimeMode,
      selectable: candidate.selectable,
    })),
    [
      {
        agentName: "codex-cli",
        runtimeMode: "REAL",
        selectable: true,
      },
      {
        agentName: "claude-cli",
        runtimeMode: "STUB",
        selectable: false,
      },
    ],
  );
});
