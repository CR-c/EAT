export const SESSION_SANDBOX_TYPES = Object.freeze({
  HOST: "HOST",
  DOCKER: "DOCKER",
});

export const ATTACHMENT_TYPES = Object.freeze({
  IMAGE: "IMAGE",
  DOCUMENT: "DOCUMENT",
  CODE: "CODE",
});

export const AGENT_CONTRACT_ERROR_CODES = Object.freeze({
  INVALID_ADAPTER_NAME: "INVALID_ADAPTER_NAME",
  INVALID_CAPABILITIES: "INVALID_CAPABILITIES",
  INVALID_SANDBOX_TYPE: "INVALID_SANDBOX_TYPE",
  INVALID_DESCRIPTION: "INVALID_DESCRIPTION",
  INVALID_ADAPTER_METHOD: "INVALID_ADAPTER_METHOD",
});

export class AgentContractError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "AgentContractError";
    this.code = code;
    this.details = details;
  }
}

export function defineAgentCapabilities(input) {
  if (!input || typeof input !== "object") {
    throw new AgentContractError(
      AGENT_CONTRACT_ERROR_CODES.INVALID_CAPABILITIES,
      "Agent capabilities must be provided as an object.",
    );
  }

  const capabilities = {
    canOrchestrate: readRequiredBoolean(input, "canOrchestrate"),
    canExecute: readRequiredBoolean(input, "canExecute"),
    supportsVision: readRequiredBoolean(input, "supportsVision"),
    supportsInteractiveInput: readRequiredBoolean(input, "supportsInteractiveInput"),
    supportedSandboxTypes: normalizeSandboxTypes(input.supportedSandboxTypes),
    description: normalizeDescription(input.description),
  };

  return Object.freeze(capabilities);
}

export function defineAgentAdapterFactory(factory) {
  if (!factory || typeof factory !== "object") {
    throw new AgentContractError(
      AGENT_CONTRACT_ERROR_CODES.INVALID_ADAPTER_NAME,
      "Agent adapter factory must be provided as an object.",
    );
  }

  const name = normalizeAdapterName(factory.name);
  const capabilities = defineAgentCapabilities(factory.capabilities);
  const healthCheck = readRequiredMethod(factory, "healthCheck");
  const spawnSession = readRequiredMethod(factory, "spawnSession");

  return Object.freeze({
    ...factory,
    name,
    capabilities,
    healthCheck,
    spawnSession,
  });
}

function normalizeAdapterName(name) {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new AgentContractError(
      AGENT_CONTRACT_ERROR_CODES.INVALID_ADAPTER_NAME,
      "Agent adapter factory name must be a non-empty string.",
    );
  }

  return name.trim();
}

function normalizeDescription(description) {
  if (typeof description !== "string" || description.trim().length === 0) {
    throw new AgentContractError(
      AGENT_CONTRACT_ERROR_CODES.INVALID_DESCRIPTION,
      "Agent capability description must be a non-empty string.",
    );
  }

  return description.trim();
}

function normalizeSandboxTypes(sandboxTypes) {
  if (!Array.isArray(sandboxTypes) || sandboxTypes.length === 0) {
    throw new AgentContractError(
      AGENT_CONTRACT_ERROR_CODES.INVALID_CAPABILITIES,
      "supportedSandboxTypes must be a non-empty array.",
    );
  }

  const uniqueSandboxTypes = [];

  for (const sandboxType of sandboxTypes) {
    if (!Object.values(SESSION_SANDBOX_TYPES).includes(sandboxType)) {
      throw new AgentContractError(
        AGENT_CONTRACT_ERROR_CODES.INVALID_SANDBOX_TYPE,
        `Unsupported sandbox type: ${sandboxType}.`,
        { sandboxType },
      );
    }

    if (!uniqueSandboxTypes.includes(sandboxType)) {
      uniqueSandboxTypes.push(sandboxType);
    }
  }

  return Object.freeze([...uniqueSandboxTypes]);
}

function readRequiredBoolean(input, key) {
  if (typeof input[key] !== "boolean") {
    throw new AgentContractError(
      AGENT_CONTRACT_ERROR_CODES.INVALID_CAPABILITIES,
      `Agent capability "${key}" must be a boolean.`,
      { key },
    );
  }

  return input[key];
}

function readRequiredMethod(input, key) {
  if (typeof input[key] !== "function") {
    throw new AgentContractError(
      AGENT_CONTRACT_ERROR_CODES.INVALID_ADAPTER_METHOD,
      `Agent adapter factory must define a ${key}() method.`,
      { key },
    );
  }

  return input[key];
}
