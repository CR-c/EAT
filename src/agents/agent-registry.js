import {
  AgentContractError,
  defineAgentAdapterFactory,
} from "./agent-contract.js";

export const AGENT_REGISTRY_ERROR_CODES = Object.freeze({
  AGENT_ALREADY_REGISTERED: "AGENT_ALREADY_REGISTERED",
  INVALID_AGENT_NAME: "INVALID_AGENT_NAME",
});

export class AgentRegistryError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "AgentRegistryError";
    this.code = code;
    this.details = details;
  }
}

export class AgentRegistry {
  constructor() {
    this.factories = new Map();
  }

  register(factory) {
    const normalizedFactory = defineAgentAdapterFactory(factory);

    if (this.factories.has(normalizedFactory.name)) {
      throw new AgentRegistryError(
        AGENT_REGISTRY_ERROR_CODES.AGENT_ALREADY_REGISTERED,
        `Agent adapter "${normalizedFactory.name}" is already registered.`,
        { name: normalizedFactory.name },
      );
    }

    this.factories.set(normalizedFactory.name, normalizedFactory);
  }

  unregister(name) {
    this.factories.delete(normalizeLookupName(name));
  }

  get(name) {
    return this.factories.get(normalizeLookupName(name)) ?? null;
  }

  listAll() {
    return [...this.factories.values()];
  }

  listLeadCandidates() {
    return this.listAll().filter((factory) => factory.capabilities.canOrchestrate);
  }

  listWorkerCandidates() {
    return this.listAll().filter((factory) => factory.capabilities.canExecute);
  }
}

function normalizeLookupName(name) {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new AgentRegistryError(
      AGENT_REGISTRY_ERROR_CODES.INVALID_AGENT_NAME,
      "Agent name must be a non-empty string.",
    );
  }

  return name.trim();
}

export { AgentContractError };
