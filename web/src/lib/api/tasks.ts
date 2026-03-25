import { deleteJson, fetchJson, postJson } from "@/lib/api/client"
import type { CreateTaskInput, TaskDetail, TaskRecord } from "@/lib/types"

export function getTask(taskId: string, signal?: AbortSignal) {
  return fetchJson<TaskDetail>(`/api/tasks/${taskId}`, { signal })
}

export function createTask(input: CreateTaskInput) {
  return postJson<{ task: TaskRecord }>("/api/tasks", input)
}

export function archiveTask(taskId: string, deleteBranches = false) {
  return postJson<{ task: TaskRecord }>(`/api/tasks/${taskId}/archive`, { deleteBranches })
}

export function pauseTask(taskId: string) {
  return postJson<{ task: TaskRecord }>(`/api/tasks/${taskId}/pause`)
}

export function resumeTask(taskId: string) {
  return postJson<{ task: TaskRecord }>(`/api/tasks/${taskId}/resume`)
}

export function deleteTask(taskId: string, deleteBranches = true) {
  return deleteJson<{ task?: TaskRecord }>(`/api/tasks/${taskId}`, { deleteBranches })
}
