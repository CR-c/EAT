export const PLAN_DRAFT_PARSE_ERROR_CODES = Object.freeze({
  EMPTY_OUTPUT: "EMPTY_OUTPUT",
  INVALID_JSON: "INVALID_JSON",
  JSON_NOT_FOUND: "JSON_NOT_FOUND",
});

export const PLAN_VALIDATION_ERROR_CODES = Object.freeze({
  ACCEPTANCE_CRITERIA_REQUIRED: "ACCEPTANCE_CRITERIA_REQUIRED",
  BRANCH_SUFFIX_DUPLICATE: "BRANCH_SUFFIX_DUPLICATE",
  BRANCH_SUFFIX_INVALID: "BRANCH_SUFFIX_INVALID",
  DEPENDS_ON_INVALID: "DEPENDS_ON_INVALID",
  DELIVERABLE_REQUIRED: "DELIVERABLE_REQUIRED",
  PLAN_NOT_OBJECT: "PLAN_NOT_OBJECT",
  RECOMMENDED_AGENT_UNHEALTHY: "RECOMMENDED_AGENT_UNHEALTHY",
  ROLE_REQUIRED: "ROLE_REQUIRED",
  SUBTASK_DESCRIPTION_REQUIRED: "SUBTASK_DESCRIPTION_REQUIRED",
  SUBTASKS_REQUIRED: "SUBTASKS_REQUIRED",
  TEMPLATE_HINT_REQUIRED: "TEMPLATE_HINT_REQUIRED",
  SUBTASK_TITLE_REQUIRED: "SUBTASK_TITLE_REQUIRED",
});

const BRANCH_SUFFIX_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const GENERIC_AGENT_ALIASES = new Set([
  "architect",
  "backend",
  "backend-specialist",
  "codex",
  "default",
  "default-agent",
  "default-lead",
  "default-worker",
  "frontend",
  "frontend-specialist",
  "fullstack-generalist",
  "general-purpose",
  "generalist",
  "integration",
  "leader",
  "qa",
  "qa-specialist",
  "tester",
  "worker",
]);

const AGENCY_INSPIRED_ROLE_GUIDES = Object.freeze([
  {
    role: "frontend-developer",
    scope: "UI implementation, client state wiring, accessibility, responsive behavior, browser performance",
  },
  {
    role: "backend-architect",
    scope: "API contracts, auth, data access, schema changes, validation, security, server-side performance",
  },
  {
    role: "ux-architect",
    scope: "information architecture, interaction structure, CSS systems, design-system alignment, implementation constraints",
  },
  {
    role: "devops-automator",
    scope: "CI/CD, deployment automation, environment wiring, release gates, observability, rollback safety",
  },
  {
    role: "rapid-prototyper",
    scope: "MVP spikes, thin vertical slices, validation scaffolding, fast proof-of-concept work",
  },
  {
    role: "code-reviewer",
    scope: "correctness review, regression risk analysis, security/performance review, test-gap verification",
  },
  {
    role: "senior-developer",
    scope: "cross-cutting refactors, ambiguous implementation slices, legacy modernization, tricky integration work",
  },
  {
    role: "reality-checker",
    scope: "evidence-based release readiness, production gate checks, verification summaries, unresolved-risk surfacing",
  },
]);

export function buildPlanningPrompt(task, options = {}) {
  const availableAgentNames = normalizeAvailableAgentNames(options.availableAgentNames);
  const fallbackAgentName = resolveFallbackAgentName({
    availableAgentNames,
    defaultAgentType: options.defaultAgentType,
  });

  return [
    "Planning mode is now active. Requirements are finalized.",
    "Ignore earlier conversation instructions that said to keep clarifying or wait for more confirmation.",
    "Your next response must be a single JSON object only. Do not output prose, bullet lists, commentary, or role explanations outside the JSON object.",
    "Requirements are confirmed. Generate the execution plan as JSON only.",
    "Return an object with a non-empty `nodes` array.",
    "Each node must include `title`, `description`, `role`, `recommended_agent`, `branch_suffix`, `deliverable`, `acceptance_criteria`, and `template_hint`.",
    "`acceptance_criteria` must be a non-empty string array.",
    "Optional per-node fields: `depends_on` (array of earlier `branch_suffix` values) and `estimated_scope`.",
    "Optional top-level field: `notes`.",
    "For the `role` field, prefer concise kebab-case specialist roles instead of generic labels.",
    "Choose roles so each node has one clear owner, one primary discipline, and one concrete deliverable.",
    "Do not assign build work to review-only roles, and do not assign release or infra work to pure UI roles.",
    buildAgencyInspiredRoleGuidance(),
    availableAgentNames.length > 0
      ? `Use only these exact agent names for every recommended_agent value: ${availableAgentNames.join(", ")}.`
      : null,
    fallbackAgentName
      ? `If you are unsure which agent to use, set recommended_agent to ${fallbackAgentName}.`
      : null,
    "Do not wrap the response in prose outside the JSON payload.",
    `Task title: ${task.title}`,
    `Requirement description: ${task.description}`,
  ].filter(Boolean).join("\n");
}

function buildAgencyInspiredRoleGuidance() {
  const lines = [
    "Agency-inspired role guidance:",
  ];

  for (const guide of AGENCY_INSPIRED_ROLE_GUIDES) {
    lines.push(`- ${guide.role}: ${guide.scope}.`);
  }

  return lines.join("\n");
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

  const rawNodes = Array.isArray(payload.nodes)
    ? payload.nodes
    : Array.isArray(payload.subtasks)
      ? payload.subtasks
      : null;
  const requiresRoleAwareFields = Array.isArray(payload.nodes);

  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    return validationFailure(
      PLAN_VALIDATION_ERROR_CODES.SUBTASKS_REQUIRED,
      "Plan must include at least one executable node.",
    );
  }

  const agentHealth = options.agentHealth ?? {};
  const availableAgentNames = normalizeAvailableAgentNames(Object.entries(agentHealth)
    .filter(([, snapshot]) => snapshot?.available === true)
    .map(([name]) => name));
  const defaultAgentType = resolveFallbackAgentName({
    availableAgentNames,
    defaultAgentType: options.defaultAgentType,
  });
  const seenBranchSuffixes = new Set();
  const duplicates = new Set();
  const subtasks = [];

  for (const [index, rawNode] of rawNodes.entries()) {
    const title = normalizeRequiredString(rawNode?.title);

    if (!title) {
      return validationFailure(
        PLAN_VALIDATION_ERROR_CODES.SUBTASK_TITLE_REQUIRED,
        `Subtask ${index + 1} must include a non-empty title.`,
        { index },
      );
    }

    const description = normalizeRequiredString(rawNode?.description);

    if (!description) {
      return validationFailure(
        PLAN_VALIDATION_ERROR_CODES.SUBTASK_DESCRIPTION_REQUIRED,
        `Subtask ${index + 1} must include a non-empty description.`,
        { index },
      );
    }

    const requestedAgent = normalizeRequiredString(rawNode?.recommended_agent);
    const recommendedAgent = resolveRecommendedAgent(requestedAgent, {
      agentHealth,
      availableAgentNames,
      defaultAgentType,
    });
    const snapshot = recommendedAgent ? agentHealth[recommendedAgent] ?? null : null;

    if (!recommendedAgent || snapshot?.available !== true) {
      return validationFailure(
        PLAN_VALIDATION_ERROR_CODES.RECOMMENDED_AGENT_UNHEALTHY,
        `Subtask ${index + 1} recommends an unavailable agent.`,
        {
          failureReason: snapshot?.failureReason ?? null,
          index,
          recommendedAgent,
          requestedAgent,
        },
      );
    }

    const branchSuffix = normalizeRequiredString(rawNode?.branch_suffix);

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

    const dependencyBranchSuffixes = normalizeDependsOn(rawNode?.depends_on);

    if (!dependencyBranchSuffixes.ok) {
      return validationFailure(
        PLAN_VALIDATION_ERROR_CODES.DEPENDS_ON_INVALID,
        `Subtask ${index + 1} must use a string array for depends_on.`,
        { index },
      );
    }

    for (const dependencyBranchSuffix of dependencyBranchSuffixes.value) {
      if (dependencyBranchSuffix === branchSuffix) {
        return validationFailure(
          PLAN_VALIDATION_ERROR_CODES.DEPENDS_ON_INVALID,
          `Subtask ${index + 1} cannot depend on itself.`,
          {
            branchSuffix,
            dependencyBranchSuffix,
            index,
          },
        );
      }

      if (!seenBranchSuffixes.has(dependencyBranchSuffix)) {
        return validationFailure(
          PLAN_VALIDATION_ERROR_CODES.DEPENDS_ON_INVALID,
          `Subtask ${index + 1} depends_on must reference an earlier branch_suffix.`,
          {
            branchSuffix,
            dependencyBranchSuffix,
            index,
          },
        );
      }
    }

    const role = normalizeRoleAwareString(
      rawNode?.role,
      requiresRoleAwareFields
        ? {
            code: PLAN_VALIDATION_ERROR_CODES.ROLE_REQUIRED,
            index,
            message: `Node ${index + 1} must include a non-empty role.`,
          }
        : null,
      branchSuffix,
    );

    if (!role.ok) {
      return role;
    }

    const deliverable = normalizeRoleAwareString(
      rawNode?.deliverable,
      requiresRoleAwareFields
        ? {
            code: PLAN_VALIDATION_ERROR_CODES.DELIVERABLE_REQUIRED,
            index,
            message: `Node ${index + 1} must include a non-empty deliverable.`,
          }
        : null,
      description,
    );

    if (!deliverable.ok) {
      return deliverable;
    }

    const acceptanceCriteria = normalizeAcceptanceCriteria(
      rawNode?.acceptance_criteria,
      requiresRoleAwareFields
        ? {
            code: PLAN_VALIDATION_ERROR_CODES.ACCEPTANCE_CRITERIA_REQUIRED,
            index,
            message: `Node ${index + 1} must include non-empty acceptance_criteria.`,
          }
        : null,
      [description],
    );

    if (!acceptanceCriteria.ok) {
      return acceptanceCriteria;
    }

    const templateHint = normalizeRoleAwareString(
      rawNode?.template_hint,
      requiresRoleAwareFields
        ? {
            code: PLAN_VALIDATION_ERROR_CODES.TEMPLATE_HINT_REQUIRED,
            index,
            message: `Node ${index + 1} must include a non-empty template_hint.`,
          }
        : null,
      "custom",
    );

    if (!templateHint.ok) {
      return templateHint;
    }

    const estimatedScope = normalizeOptionalString(rawNode?.estimated_scope);

    seenBranchSuffixes.add(branchSuffix);
    subtasks.push({
      acceptance_criteria: acceptanceCriteria.value,
      branch_suffix: branchSuffix,
      ...(dependencyBranchSuffixes.value.length > 0 ? { depends_on: dependencyBranchSuffixes.value } : {}),
      deliverable: deliverable.value,
      description,
      ...(estimatedScope ? { estimated_scope: estimatedScope } : {}),
      recommended_agent: recommendedAgent,
      role: role.value,
      template_hint: templateHint.value,
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
  const templateId = normalizeOptionalString(payload.template_id);
  const templateLabel = normalizeOptionalString(payload.template_label);
  const nodes = subtasks;

  return {
    ok: true,
    plan: {
      ...(notes ? { notes } : {}),
      ...(templateId ? { template_id: templateId } : {}),
      ...(templateLabel ? { template_label: templateLabel } : {}),
      nodes,
      subtasks: nodes,
    },
  };
}

export function getPlanNodes(plan) {
  if (!plan || typeof plan !== "object") {
    return [];
  }

  if (Array.isArray(plan.nodes)) {
    return plan.nodes;
  }

  if (Array.isArray(plan.subtasks)) {
    return plan.subtasks;
  }

  return [];
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

function normalizeAvailableAgentNames(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value
    .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim()))];
}

function normalizeDependsOn(value) {
  if (value === undefined || value === null) {
    return {
      ok: true,
      value: [],
    };
  }

  if (!Array.isArray(value)) {
    return {
      ok: false,
      value: [],
    };
  }

  const normalizedValues = [...new Set(value
    .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim()))];

  if (normalizedValues.length !== value.length && value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    return {
      ok: false,
      value: [],
    };
  }

  return {
    ok: true,
    value: normalizedValues,
  };
}

function normalizeAcceptanceCriteria(value, requiredError, fallback = []) {
  if (value === undefined || value === null) {
    if (requiredError) {
      return validationFailure(requiredError.code, requiredError.message, { index: requiredError.index });
    }

    const normalizedFallback = fallback
      .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => entry.trim());

    return {
      ok: true,
      value: normalizedFallback.length > 0 ? normalizedFallback : ["Reviewable completion evidence is produced."],
    };
  }

  if (!Array.isArray(value)) {
    return validationFailure(
      requiredError?.code ?? PLAN_VALIDATION_ERROR_CODES.ACCEPTANCE_CRITERIA_REQUIRED,
      requiredError?.message ?? "acceptance_criteria must be a non-empty string array.",
      { index: requiredError?.index },
    );
  }

  const normalizedValues = [...new Set(value
    .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim()))];

  if (normalizedValues.length === 0) {
    return validationFailure(
      requiredError?.code ?? PLAN_VALIDATION_ERROR_CODES.ACCEPTANCE_CRITERIA_REQUIRED,
      requiredError?.message ?? "acceptance_criteria must be a non-empty string array.",
      { index: requiredError?.index },
    );
  }

  return {
    ok: true,
    value: normalizedValues,
  };
}

function normalizeRoleAwareString(value, requiredError, fallback) {
  const normalizedValue = normalizeRequiredString(value);

  if (normalizedValue) {
    return {
      ok: true,
      value: normalizedValue,
    };
  }

  if (requiredError) {
    return validationFailure(requiredError.code, requiredError.message, { index: requiredError.index });
  }

  return {
    ok: true,
    value: fallback,
  };
}

function resolveRecommendedAgent(requestedAgent, options) {
  if (!requestedAgent) {
    return null;
  }

  if (options.agentHealth?.[requestedAgent]?.available === true) {
    return requestedAgent;
  }

  const caseInsensitiveMatch = options.availableAgentNames
    .find((agentName) => agentName.toLowerCase() === requestedAgent.toLowerCase());

  if (caseInsensitiveMatch) {
    return caseInsensitiveMatch;
  }

  const fallbackAgentName = resolveFallbackAgentName(options);

  if (!fallbackAgentName) {
    return requestedAgent;
  }

  if (options.availableAgentNames.length === 1) {
    return fallbackAgentName;
  }

  if (GENERIC_AGENT_ALIASES.has(requestedAgent.toLowerCase())) {
    return fallbackAgentName;
  }

  return requestedAgent;
}

function resolveFallbackAgentName(options = {}) {
  const explicitAgentName = normalizeRequiredString(options.defaultAgentType);

  if (explicitAgentName && options.availableAgentNames?.includes(explicitAgentName)) {
    return explicitAgentName;
  }

  return options.availableAgentNames?.[0] ?? null;
}
