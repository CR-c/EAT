export const PLAN_DRAFT_PARSE_ERROR_CODES = Object.freeze({
  EMPTY_OUTPUT: "EMPTY_OUTPUT",
  INVALID_JSON: "INVALID_JSON",
  JSON_NOT_FOUND: "JSON_NOT_FOUND",
});

export function buildPlanningPrompt(task) {
  return [
    "Requirements are confirmed. Generate the execution plan as JSON only.",
    "Return an object with a non-empty `subtasks` array.",
    "Each subtask must include `title`, `description`, `recommended_agent`, and `branch_suffix`.",
    "Optional top-level field: `notes`.",
    "Do not wrap the response in prose outside the JSON payload.",
    `Task title: ${task.title}`,
    `Requirement description: ${task.description}`,
  ].join("\n");
}

export function parsePlanDraftText(text) {
  const normalizedText = normalizePlanText(text);

  if (!normalizedText) {
    return failure(PLAN_DRAFT_PARSE_ERROR_CODES.EMPTY_OUTPUT, "Lead planning output was empty.");
  }

  const jsonText = extractJsonCandidate(normalizedText);

  if (!jsonText) {
    return failure(PLAN_DRAFT_PARSE_ERROR_CODES.JSON_NOT_FOUND, "Lead planning output did not contain JSON.");
  }

  try {
    return {
      ok: true,
      jsonText,
      payload: JSON.parse(jsonText),
    };
  } catch (error) {
    return failure(
      PLAN_DRAFT_PARSE_ERROR_CODES.INVALID_JSON,
      "Lead planning output contained invalid JSON.",
      {
        cause: error.message,
      },
    );
  }
}

function normalizePlanText(text) {
  if (typeof text !== "string") {
    return null;
  }

  const normalized = text.replaceAll(/\r\n/g, "\n").trim();
  return normalized.length > 0 ? normalized : null;
}

function extractJsonCandidate(text) {
  const fencedBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/iu);

  if (fencedBlockMatch?.[1]?.trim()) {
    return fencedBlockMatch[1].trim();
  }

  const firstBraceIndex = text.indexOf("{");
  const lastBraceIndex = text.lastIndexOf("}");

  if (firstBraceIndex === -1 || lastBraceIndex === -1 || firstBraceIndex > lastBraceIndex) {
    return null;
  }

  return text.slice(firstBraceIndex, lastBraceIndex + 1).trim();
}

function failure(code, message, details) {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}
