import { deleteJson, fetchJson, postJson, putJson } from "@/lib/api/client"
import type {
  CreateGuidedTaskInput,
  CreateTaskInput,
  ReplanRequestInput,
  SessionOutput,
  TaskDiff,
  SendTaskMessageInput,
  StartClarificationInput,
  TaskDetail,
  TaskMessageResponse,
  TaskPreview,
  TaskRecord,
  TaskRuntime,
  TaskTemplateSummary,
} from "@/lib/types"

export function getTask(taskId: string, signal?: AbortSignal) {
  return fetchJson<TaskDetail>(`/api/tasks/${taskId}`, { signal })
}

export function createTask(input: CreateTaskInput) {
  return postJson<{ task: TaskRecord }>("/api/tasks", input)
}

export function createGuidedTask(input: CreateGuidedTaskInput) {
  return postJson<{ task: TaskRecord; currentPlan: Record<string, unknown> }>("/api/guided-tasks", input)
}

export function listTaskTemplates(signal?: AbortSignal) {
  return fetchJson<{ templates: TaskTemplateSummary[] }>("/api/task-templates", { signal })
}

export function startClarification(taskId: string, input: StartClarificationInput) {
  return postJson<{ task: TaskRecord }>(`/api/tasks/${taskId}/clarification-sessions`, input)
}

export function sendTaskMessage(taskId: string, input: SendTaskMessageInput) {
  return postJson<TaskMessageResponse>(`/api/tasks/${taskId}/messages`, input)
}

export function confirmRequirements(taskId: string) {
  return postJson<{ task: TaskRecord }>(`/api/tasks/${taskId}/requirement-confirmations`)
}

export function approvePlan(taskId: string) {
  return postJson<{ task: TaskRecord }>(`/api/tasks/${taskId}/plan-approvals`)
}

export function updateCurrentPlan(taskId: string, currentPlan: Record<string, unknown>) {
  return putJson<{ task: TaskRecord; currentPlan: Record<string, unknown> }>(
    `/api/tasks/${taskId}/plan`,
    currentPlan,
  )
}

export function requestTaskReplan(taskId: string, input: ReplanRequestInput) {
  return postJson<{ task: TaskRecord; currentPlan: Record<string, unknown> }>(
    `/api/tasks/${taskId}/replan-requests`,
    input,
  )
}

export function getTaskRuntime(taskId: string, signal?: AbortSignal) {
  return fetchJson<TaskRuntime>(`/api/tasks/${taskId}/runtime`, { signal })
}

export function getTaskDiff(taskId: string, signal?: AbortSignal) {
  return fetchJson<TaskDiff>(`/api/tasks/${taskId}/diff`, { signal })
}

export function getTaskPreview(taskId: string, signal?: AbortSignal) {
  return fetchJson<TaskPreview>(`/api/tasks/${taskId}/preview`, { signal })
}

export function getSessionOutput(sessionId: string, options: { signal?: AbortSignal; taskId?: string } = {}) {
  const search = options.taskId ? `?taskId=${encodeURIComponent(options.taskId)}` : ""
  return fetchJson<SessionOutput>(`/api/sessions/${sessionId}/output${search}`, { signal: options.signal })
}

export function startTaskPreview(
  taskId: string,
  body?: { appRoot?: string; command?: string; path?: string; port?: number; targetId?: string },
) {
  return postJson<TaskPreview>(`/api/tasks/${taskId}/preview-sessions`, body)
}

export function stopTaskPreview(taskId: string) {
  return fetchJson<TaskPreview>(`/api/tasks/${taskId}/preview-sessions/current`, { method: "DELETE" })
}

export function archiveTask(taskId: string, deleteBranches = false) {
  return postJson<{ task: TaskRecord }>(`/api/tasks/${taskId}/archives`, { deleteBranches })
}

export function pauseTask(taskId: string) {
  return postJson<{ task: TaskRecord }>(`/api/tasks/${taskId}/pauses`)
}

export function resumeTask(taskId: string) {
  return fetchJson<{ task: TaskRecord }>(`/api/tasks/${taskId}/pauses/current`, { method: "DELETE" })
}

export function deleteTask(taskId: string, deleteBranches = true) {
  return deleteJson<{ task?: TaskRecord }>(`/api/tasks/${taskId}`, { deleteBranches })
}
