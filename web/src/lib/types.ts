export type Locale = "zh-CN" | "en"
export type Pilot = "rei" | "shinji"

export interface ApiErrorPayload {
  error?: {
    code?: string
    message?: string
  }
}

export interface ProjectRecord {
  id: string
  name: string
  path: string
  defaultBranch: string
  createdAt: string
  updatedAt: string
}

export interface RepoStatus {
  defaultBranch?: string | null
  currentBranch?: string | null
  isDirty: boolean
  recentBranches: string[]
}

export interface DirectoryRoot {
  kind: string
  path: string
}

export interface DirectoryEntry {
  name: string
  path: string
  isGitRepository: boolean
  isSymlink: boolean
}

export interface BrowseResult {
  currentPath: string
  entries: DirectoryEntry[]
  isGitRepository: boolean
  parentPath?: string | null
  roots: DirectoryRoot[]
}

export interface TaskRecord {
  id: string
  projectId: string
  title: string
  description: string
  leadAgentType: string
  baseBranch: string
  baseCommitSha: string
  taskBranchName?: string | null
  status: string
  planVersion: number
  currentPlanJson?: string | null
  approvedPlanJson?: string | null
  lastError?: string | null
  archivedAt?: string | null
  createdAt: string
  updatedAt: string
  version: number
}

export interface TaskAttachment {
  id: string
  taskId: string
  fileName: string
  filePath: string
  fileType: string
  mimeType: string
  size: number
  createdAt: string
}

export interface TaskSession {
  id: string
  taskId: string
  subTaskId?: string | null
  agentType: string
  sessionType: string
  sandboxType: string
  containerId?: string | null
  status: string
  pid?: number | null
  startedAt?: string | null
  endedAt?: string | null
  exitCode?: number | null
  logPath?: string | null
  firstOutputAt?: string | null
  outputBuffer: string
  outputBufferMaxBytes: number
  createdAt: string
  updatedAt: string
}

export interface SubTaskRecord {
  id: string
  taskId: string
  title: string
  description: string
  branchSuffix: string
  dependencyBranchSuffixes: string[]
  branchName?: string | null
  startCommitSha?: string | null
  worktreePath?: string | null
  agentType: string
  status: string
  autoAssigned: boolean
  retryCount: number
  lastError?: string | null
  latestReviewDecision?: string | null
  latestReviewPhase?: string | null
  latestReviewSummary?: string | null
  role?: string | null
  displayName?: string | null
  executionOrder?: number | null
  assignmentSource?: string | null
  runSummary?: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface MailboxMessage {
  id: string
  taskId: string
  senderType: string
  senderSubTaskId?: string | null
  targetType: string
  targetSubTaskId?: string | null
  messageType: string
  artifactRefs: string[]
  fileRefs: string[]
  branchRef?: string | null
  schemaJson: Record<string, unknown>
  requiresAck: boolean
  content: string
  createdAt: string
}

export interface TaskDetail {
  task: TaskRecord
  messages: Array<{ id: string; role: string; content: string; createdAt: string }>
  attachments: TaskAttachment[]
  planSnapshots: Array<{ id: string; version: number; source: string; payload: string; createdAt: string }>
  sessions: TaskSession[]
  subTasks: SubTaskRecord[]
  cleanupWarnings: string[]
  mailboxMessages: MailboxMessage[]
  board: Record<string, unknown>
  integration: Record<string, unknown>
  team: Record<string, unknown>
}

export interface SystemHealth {
  status: string
  db: string
  uptime_seconds: number
  goroutines: number
  checked_at: string
  workers: {
    running: number
    pool_size: number
  }
  docker: DockerHealth
}

export interface DockerHealth {
  available: boolean
  reason?: string
  serverVersion?: string
  imageReady?: boolean
}

export interface SandboxPolicy {
  workerDefault: string
  previewDefault: string
}

export interface AgentDescriptor {
  name: string
  runtimeMode: string
  usesSandboxManager: boolean
  capabilities: {
    canOrchestrate: boolean
    canExecute: boolean
    description: string
    supportedSandboxTypes: string[]
    supportsInteractiveInput: boolean
    supportsVision: boolean
  }
  roles: {
    leadCandidate: boolean
    workerCandidate: boolean
  }
}

export interface AgentHealthSnapshot {
  available: boolean
  runtimeMode: string
  version?: string
  checks: Array<{
    name: string
    status: string
    message: string
    details?: Record<string, unknown>
  }>
  failureReason?: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

export interface AgentListResponse {
  agents: AgentDescriptor[]
  checkedAt: string
  leadCandidates: AgentCandidate[]
  workerCandidates: AgentCandidate[]
}

export interface AgentHealthResponse {
  agents: Record<string, AgentHealthSnapshot>
  checkedAt: string
  staleAt: string
  ttlMs: number
  leadCandidates: AgentCandidate[]
  workerCandidates: AgentCandidate[]
}

export interface AgentCandidate {
  agentName: string
  available: boolean
  runtimeMode: string
  selectable: boolean
  failureReason?: {
    code: string
    message: string
  }
  capabilities: AgentDescriptor["capabilities"]
}

export interface MetricsSummaryResponse {
  summary: {
    cleanupWarningCount: number
    completionRateAfterPlanApproval?: number | null
    definitions: Record<string, string>
    earlyReworkAdoptionRate?: number | null
    failedWorkerSessionCount: number
    mergeConflictCount: number
    mergeConflictSurfacingAccuracy?: number | null
    medianPlanApprovalToFirstWorkerOutputMs?: number | null
    rebaseRetryCount: number
    retryToReviewConversionRate?: number | null
    sandboxLaunchFailureCount: number
    tasksCompleted: number
    tasksEnteredExecuting: number
    unavailableMetrics: Array<{
      metric: string
      reason: string
    }>
    workerCrashDetectionRate?: number | null
  }
}

export interface CreateProjectInput {
  path: string
}

export interface CreateTaskInput {
  projectId: string
  title: string
  description: string
  leadAgentType: string
  baseBranch: string
  baseBranchMode?: string
  baseBranchStartPoint?: string
  attachments?: Array<{
    fileName: string
    filePath: string
    fileType: string
    mimeType: string
    contentBase64?: string
  }>
}
