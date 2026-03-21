import { createBuiltInAgentRegistry } from "../agents/built-in-agents.js";

export const AGENT_HEALTH_CACHE_TTL_MS = 30_000;

export class AgentService {
  constructor(options = {}) {
    this.agentRegistry = options.agentRegistry ?? createBuiltInAgentRegistry({
      sandboxManager: options.sandboxManager ?? null,
    });
    this.cacheTtlMs = options.cacheTtlMs ?? AGENT_HEALTH_CACHE_TTL_MS;
    this.cachedHealth = null;
  }

  listAgents() {
    return this.agentRegistry.listAll().map((factory) => serializeAgent(factory));
  }

  async getHealth(options = {}) {
    const shouldRefresh = options.force === true
      || !this.cachedHealth
      || Date.now() >= this.cachedHealth.expiresAt;

    if (shouldRefresh) {
      const checkedAt = new Date().toISOString();
      const agents = await this.agentRegistry.healthCheckAll({ checkedAt });

      this.cachedHealth = {
        agents,
        checkedAt,
        expiresAt: Date.now() + this.cacheTtlMs,
      };
    }

    return {
      agents: this.cachedHealth.agents,
      checkedAt: this.cachedHealth.checkedAt,
      staleAt: new Date(this.cachedHealth.expiresAt).toISOString(),
      ttlMs: this.cacheTtlMs,
    };
  }

  async getAgentDirectory(options = {}) {
    const health = await this.getHealth(options);
    const agents = this.listAgents();

    return {
      agents,
      checkedAt: health.checkedAt,
      leadCandidates: buildSelectionCandidates(agents, health.agents, "lead"),
      workerCandidates: buildSelectionCandidates(agents, health.agents, "worker"),
    };
  }
}

export function buildSelectionCandidates(agents, healthSnapshots, role) {
  const predicate = role === "lead"
    ? (agent) => agent.capabilities.canOrchestrate
    : (agent) => agent.capabilities.canExecute;

  return agents
    .filter(predicate)
    .map((agent) => {
      const health = healthSnapshots?.[agent.name] ?? null;
      const runtimeMode = health?.runtimeMode ?? agent.runtimeMode ?? null;
      return {
        agentName: agent.name,
        available: health?.available === true,
        capabilities: agent.capabilities,
        failureReason: health?.failureReason ?? null,
        runtimeMode,
        selectable: health?.available === true && runtimeMode !== "STUB",
      };
    });
}

function serializeAgent(factory) {
  return {
    capabilities: { ...factory.capabilities },
    name: factory.name,
    runtimeMode: factory.runtimeMode ?? null,
    roles: {
      leadCandidate: factory.capabilities.canOrchestrate,
      workerCandidate: factory.capabilities.canExecute,
    },
    usesSandboxManager: factory.usesSandboxManager === true,
  };
}
