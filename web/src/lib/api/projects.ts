import { fetchJson, postJson } from "@/lib/api/client"
import type {
  BrowseResult,
  CreateProjectInput,
  ProjectRecord,
  RepoStatus,
  TaskRecord,
} from "@/lib/types"

export function listProjects(signal?: AbortSignal) {
  return fetchJson<{ projects: ProjectRecord[] }>("/api/projects", { signal })
}

export function getProject(projectId: string, signal?: AbortSignal) {
  return fetchJson<{ project: ProjectRecord; repoStatus: RepoStatus }>(`/api/projects/${projectId}`, {
    signal,
  })
}

export function getProjectRepoStatus(projectId: string, signal?: AbortSignal) {
  return fetchJson<{ projectId: string; repoStatus: RepoStatus }>(
    `/api/projects/${projectId}/repo-status`,
    { signal },
  )
}

export function browseDirectories(path: string, signal?: AbortSignal) {
  const query = new URLSearchParams()
  if (path) {
    query.set("path", path)
  }
  return fetchJson<BrowseResult>(`/api/projects/browse?${query.toString()}`, { signal })
}

export function createProject(input: CreateProjectInput) {
  return postJson<{ project: ProjectRecord; repoStatus: RepoStatus }>("/api/projects", input)
}

export function deleteProject(projectId: string) {
  return fetchJson<{ project: ProjectRecord }>(`/api/projects/${projectId}`, {
    method: "DELETE",
  })
}

export function listProjectTasks(projectId: string, includeArchived: boolean, signal?: AbortSignal) {
  const query = includeArchived ? "?includeArchived=1" : ""
  return fetchJson<{ tasks: TaskRecord[] }>(`/api/projects/${projectId}/tasks${query}`, { signal })
}
