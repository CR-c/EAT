import { SESSION_SANDBOX_TYPES } from "../agents/agent-contract.js";

const VALID_SANDBOX_TYPES = new Set(Object.values(SESSION_SANDBOX_TYPES));
const VALID_CHECK_STATUSES = new Set(["PASS", "FAIL", "WARN", "SKIP"]);

export const AGENT_HEALTH_FAILURE_CODES = Object.freeze({
  AUTH_MISSING: "AUTH_MISSING",
  BINARY_MISSING: "BINARY_MISSING",
  HEALTH_CHECK_FAILED: "HEALTH_CHECK_FAILED",
  UNSUPPORTED_CAPABILITY: "UNSUPPORTED_CAPABILITY",
  UNSUPPORTED_SANDBOX: "UNSUPPORTED_SANDBOX",
});

const HEALTH_FAILURE_METADATA = Object.freeze({
  [AGENT_HEALTH_FAILURE_CODES.AUTH_MISSING]: {
    category: "AUTH",
    message: "Agent authentication is missing or expired.",
  },
  [AGENT_HEALTH_FAILURE_CODES.BINARY_MISSING]: {
    category: "DEPENDENCY",
    message: "Agent binary is missing or not available on PATH.",
  },
  [AGENT_HEALTH_FAILURE_CODES.HEALTH_CHECK_FAILED]: {
    category: "INTERNAL",
    message: "Agent health check failed unexpectedly.",
  },
  [AGENT_HEALTH_FAILURE_CODES.UNSUPPORTED_CAPABILITY]: {
    category: "CAPABILITY",
    message: "Agent does not support a required capability.",
  },
  [AGENT_HEALTH_FAILURE_CODES.UNSUPPORTED_SANDBOX]: {
    category: "CONFIGURATION",
    message: "Agent does not support the requested sandbox type.",
  },
});

export async function runAgentHealthCheck(factory, options = {}) {
  const checkedAt = options.checkedAt ?? new Date().toISOString();

  try {
    const result = await factory.healthCheck();
    return normalizeAgentHealthSnapshot(factory, result, { checkedAt });
  } catch (error) {
    return normalizeAgentHealthSnapshot(
      factory,
      {
        available: false,
        reason: error,
      },
      { checkedAt },
    );
  }
}

export function normalizeAgentHealthSnapshot(factory, rawResult, options = {}) {
  const checkedAt = options.checkedAt ?? new Date().toISOString();
  const available = rawResult?.available === true;
  const failureReason = normalizeHealthFailureReason(rawResult?.failure ?? rawResult?.reason);
  const normalizedChecks = normalizeHealthChecks(rawResult?.checks);

  if (available && failureReason) {
    throw new Error(`Agent "${factory.name}" returned an inconsistent health result.`);
  }

  if (!available && !failureReason) {
    throw new Error(`Agent "${factory.name}" returned unavailable health without a reason.`);
  }

  return {
    agentName: factory.name,
    available,
    capabilities: { ...factory.capabilities },
    checkedAt,
    checks: withFallbackFailureCheck(normalizedChecks, failureReason),
    failureReason,
    version: normalizeVersion(rawResult?.version),
  };
}

export function normalizeHealthFailureReason(input) {
  if (input === undefined || input === null) {
    return null;
  }

  if (typeof input === "object" && !Array.isArray(input) && typeof input.code === "string") {
    if (Object.hasOwn(HEALTH_FAILURE_METADATA, input.code)) {
      const metadata = HEALTH_FAILURE_METADATA[input.code];
      return {
        category: metadata.category,
        code: input.code,
        details: normalizeDetails(input.details),
        message: normalizeMessage(input.message, metadata.message),
      };
    }
  }

  const details = extractReasonDetails(input);
  const code = inferFailureCode(input, details.message);
  const metadata = HEALTH_FAILURE_METADATA[code];

  return {
    category: metadata.category,
    code,
    details: details.details,
    message: normalizeMessage(details.message, metadata.message),
  };
}

function normalizeHealthChecks(checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    return [];
  }

  return checks.map((check, index) => {
    const name = typeof check?.name === "string" && check.name.trim().length > 0
      ? check.name.trim()
      : `check-${index + 1}`;
    const status = typeof check?.status === "string" ? check.status.trim().toUpperCase() : "PASS";

    if (!VALID_CHECK_STATUSES.has(status)) {
      throw new TypeError(`Health check "${name}" has unsupported status "${status}".`);
    }

    return {
      details: normalizeDetails(check?.details),
      message: normalizeMessage(check?.message, null),
      name,
      status,
    };
  });
}

function withFallbackFailureCheck(checks, failureReason) {
  if (!failureReason) {
    return checks;
  }

  if (checks.some((check) => check.status === "FAIL")) {
    return checks;
  }

  return [
    ...checks,
    {
      details: failureReason.details,
      message: failureReason.message,
      name: "availability",
      status: "FAIL",
    },
  ];
}

function inferFailureCode(input, message) {
  const candidateCode = typeof input?.code === "string" ? input.code : null;

  if (candidateCode && Object.hasOwn(HEALTH_FAILURE_METADATA, candidateCode)) {
    return candidateCode;
  }

  const normalizedText = `${candidateCode ?? ""} ${message ?? ""}`.toLowerCase();

  if (matchesAny(normalizedText, ["enoent", "binary missing", "command not found", "not found in path", "not installed"])) {
    return AGENT_HEALTH_FAILURE_CODES.BINARY_MISSING;
  }

  if (matchesAny(normalizedText, ["auth missing", "authentication", "not logged in", "login required", "api key", "token"])) {
    return AGENT_HEALTH_FAILURE_CODES.AUTH_MISSING;
  }

  if (matchesAny(normalizedText, ["unsupported sandbox", "sandbox not supported", "docker only", "host only"])) {
    return AGENT_HEALTH_FAILURE_CODES.UNSUPPORTED_SANDBOX;
  }

  if (matchesAny(normalizedText, ["unsupported capability", "capability not supported", "vision not supported", "execution not supported", "orchestration not supported"])) {
    return AGENT_HEALTH_FAILURE_CODES.UNSUPPORTED_CAPABILITY;
  }

  return AGENT_HEALTH_FAILURE_CODES.HEALTH_CHECK_FAILED;
}

function extractReasonDetails(input) {
  if (input instanceof Error) {
    return {
      details: compactObject({
        cause: input.cause,
        name: input.name,
        stack: input.stack,
      }),
      message: input.message,
    };
  }

  if (typeof input === "string") {
    return {
      details: null,
      message: input,
    };
  }

  if (input && typeof input === "object" && !Array.isArray(input)) {
    const message = typeof input.message === "string"
      ? input.message
      : typeof input.reason === "string"
        ? input.reason
        : null;

    return {
      details: compactObject({
        ...normalizeDetails(input.details),
        code: typeof input.code === "string" ? input.code : undefined,
      }),
      message,
    };
  }

  return {
    details: null,
    message: null,
  };
}

function normalizeVersion(version) {
  return typeof version === "string" && version.trim().length > 0 ? version.trim() : null;
}

function normalizeMessage(message, fallback) {
  return typeof message === "string" && message.trim().length > 0 ? message.trim() : fallback;
}

function normalizeDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }

  return compactObject(details);
}

function compactObject(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function matchesAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(needle));
}
