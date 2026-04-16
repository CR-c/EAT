import { fetchJson } from "@/lib/api/client"
import type {
  AgentHealthResponse,
  AgentListResponse,
  DockerHealth,
  ExecutionBackendsResponse,
  MetricsSummaryResponse,
  SandboxPolicy,
  SystemHealth,
} from "@/lib/types"

export function getSystemHealth(signal?: AbortSignal) {
  return fetchJson<SystemHealth>("/api/system/health", { signal })
}

export function getDockerHealth(signal?: AbortSignal) {
  return fetchJson<DockerHealth>("/api/system/docker", { signal })
}

export function getExecutionBackends(signal?: AbortSignal) {
  return fetchJson<ExecutionBackendsResponse>("/api/system/execution-backends", { signal })
}

export function getSandboxPolicy(signal?: AbortSignal) {
  return fetchJson<SandboxPolicy>("/api/system/sandbox-policy", { signal })
}

export function getAgents(signal?: AbortSignal) {
  return fetchJson<AgentListResponse>("/api/agents", { signal })
}

export function getAgentHealth(signal?: AbortSignal) {
  return fetchJson<AgentHealthResponse>("/api/agents/health", { signal })
}

export function getMetricsSummary(signal?: AbortSignal) {
  return fetchJson<MetricsSummaryResponse>("/api/metrics/summary", { signal })
}
