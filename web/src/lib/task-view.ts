import type { TaskRecord } from "@/lib/types"

const activeExecutionTreeStatuses = new Set(["EXECUTING", "REVIEWING", "MERGING"])
const pausedReasonPrefix = "Paused by operator from "

const taskProgressByStatus: Record<string, number> = {
  DRAFT: 6,
  CLARIFYING: 16,
  PLANNING: 24,
  PLAN_REVIEW: 30,
  EXECUTING: 64,
  REVIEWING: 82,
  MERGING: 92,
  ACTION_REQUIRED: 74,
  COMPLETED: 100,
  FAILED: 100,
  CANCELLED: 100,
}

export function getTaskProgress(task: TaskRecord) {
  if (task.archivedAt) {
    return 100
  }
  return taskProgressByStatus[task.status] ?? 18
}

export function isTaskArchived(task: TaskRecord) {
  return Boolean(task.archivedAt)
}

export function isTaskPaused(task: TaskRecord) {
  return (
    task.status === "ACTION_REQUIRED" &&
    typeof task.lastError === "string" &&
    task.lastError.startsWith(pausedReasonPrefix)
  )
}

export function isTaskExecutionTreeActive(task: TaskRecord) {
  return activeExecutionTreeStatuses.has(task.status) || (task.status === "ACTION_REQUIRED" && !isTaskPaused(task))
}

export function isTaskOperational(task: TaskRecord) {
  if (isTaskPaused(task)) {
    return false
  }
  return !["PAUSED", "COMPLETED", "FAILED", "CANCELLED"].includes(task.status)
}

export function getTaskStatusTone(status: string) {
  switch (status) {
    case "EXECUTING":
    case "RUNNING":
    case "READY":
      return "default" as const
    case "ACTION_REQUIRED":
    case "REWORK_REQUIRED":
    case "DISCARD_PENDING":
    case "FAILED":
      return "destructive" as const
    default:
      return "secondary" as const
  }
}
