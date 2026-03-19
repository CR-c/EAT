export const PLAN_DRAFT_PARSE_ERROR_CODES = Object.freeze({
  EMPTY_OUTPUT: "EMPTY_OUTPUT",
  INVALID_JSON: "INVALID_JSON",
  JSON_NOT_FOUND: "JSON_NOT_FOUND",
});

export const PLAN_VALIDATION_ERROR_CODES = Object.freeze({
  BRANCH_SUFFIX_DUPLICATE: "BRANCH_SUFFIX_DUPLICATE",
  BRANCH_SUFFIX_INVALID: "BRANCH_SUFFIX_INVALID",
  PLAN_NOT_OBJECT: "PLAN_NOT_OBJECT",
  RECOMMENDED_AGENT_UNHEALTHY: "RECOMMENDED_AGENT_UNHEALTHY",
  SUBTASK_DESCRIPTION_REQUIRED: "SUBTASK_DESCRIPTION_REQUIRED",
  SUBTASKS_REQUIRED: "SUBTASKS_REQUIRED",
  SUBTASK_TITLE_REQUIRED: "SUBTASK_TITLE_REQUIRED",
});

const BRANCH_SUFFIX_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

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

export function validatePlanDraft(payload, options = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return validationFailure(
      PLAN_VALIDATION_ERROR_CODES.PLAN_NOT_OBJECT,
      "Plan payload must be a JSON object.",
    );
  }

  if (!Array.isArray(payload.subtasks) || payload.subtasks.length === 0) {
    return validationFailure(
      PLAN_VALIDATION_ERROR_CODES.SUBTASKS_REQUIRED,
      "Plan must include at least one subtask.",
    );
  }

  const agentHealth = options.agentHealth ?? {};
  const seenBranchSuffixes = new Set();
  const duplicates = new Set();
  const subtasks = [];

  for (const [index, subtask] of payload.subtasks.entries()) {
    const title = normalizeRequiredString(subtask?.title);

    if (!title) {
      return validationFailure(
        PLAN_VALIDATION_ERROR_CODES.SUBTASK_TITLE_REQUIRED,
        `Subtask ${index + 1} must include a non-empty title.`,
        { index },
      );
    }

    const description = normalizeRequiredString(subtask?.description);

    if (!description) {
      return validationFailure(
        PLAN_VALIDATION_ERROR_CODES.SUBTASK_DESCRIPTION_REQUIRED,
        `Subtask ${index + 1} must include a non-empty description.`,
        { index },
      );
    }

    const recommendedAgent = normalizeRequiredString(subtask?.recommended_agent);
    const snapshot = recommendedAgent ? agentHealth[recommendedAgent] ?? null : null;

    if (!recommendedAgent || snapshot?.available !== true) {
      return validationFailure(
        PLAN_VALIDATION_ERROR_CODES.RECOMMENDED_AGENT_UNHEALTHY,
        `Subtask ${index + 1} recommends an unavailable agent.`,
        {
          failureReason: snapshot?.failureReason ?? null,
          index,
          recommendedAgent,
        },
      );
    }

    const branchSuffix = normalizeRequiredString(subtask?.branch_suffix);

    if (!branchSuffix || !BRANCH_SUFFIX_PATTERN.test(branchSuffix)) {
      return validationFailure(
        PLAN_VALIDATION_ERROR_CODES.BRANCH_SUFFIX_INVALID,
        `Subtask ${index + 1} must use a slug-safe branch_suffix.`,
        {
          branchSuffix,
          index,
        },
      );
    }

    if (seenBranchSuffixes.has(branchSuffix)) {
      duplicates.add(branchSuffix);
    }

    seenBranchSuffixes.add(branchSuffix);
    subtasks.push({
      branch_suffix: branchSuffix,
      description,
      recommended_agent: recommendedAgent,
      title,
    });
  }

  if (duplicates.size > 0) {
    return validationFailure(
      PLAN_VALIDATION_ERROR_CODES.BRANCH_SUFFIX_DUPLICATE,
      "Plan contains duplicate branch suffixes.",
      {
        duplicates: [...duplicates],
      },
    );
  }

  const notes = normalizeOptionalString(payload.notes);

  return {
    ok: true,
    plan: {
      ...(notes ? { notes } : {}),
      subtasks,
    },
  };
}

export function looksLikeCompletePlanText(text) {
  const normalizedText = normalizePlanText(text);

  if (!normalizedText) {
    return false;
  }

  const fenceMatches = normalizedText.match(/```/g);

  if ((fenceMatches?.length ?? 0) >= 2) {
    return true;
  }

  return normalizedText.endsWith("}");
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

function validationFailure(code, message, details) {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

function normalizeRequiredString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
