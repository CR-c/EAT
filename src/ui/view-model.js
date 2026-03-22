const DEFAULT_LOCALE = "zh-CN";
const SUPPORTED_LOCALES = new Set(["zh-CN", "en"]);

let currentLocale = DEFAULT_LOCALE;

const MESSAGES = {
  "zh-CN": {
    unknownProjectError: "发生了未知的项目错误。",
    unknownTaskError: "发生了未知的任务错误。",
    unknownAgentError: "发生了未知的 Agent 错误。",
    requestFailed: "请求失败。",
    projectAlreadyRegistered: "该仓库已注册在 {path}。",
    pathNotAbsolute: "请输入绝对路径，例如 /home/code/EAT。",
    pathAccessDenied: "没有权限读取所选目录，请改用可访问的路径。",
    pathNotFound: "该路径不存在，请检查后重试。",
    pathNotDirectory: "所选路径必须是目录，不能是文件。",
    notGitRepository: "所选目录不是非裸 Git 仓库。",
    bareGitRepository: "暂不支持裸 Git 仓库注册。",
    projectNotFound: "所选项目已不在本地注册表中。",
    baseBranchCreateFailed: "无法创建新的基线分支 {branch}。",
    baseBranchNotFound: "无法解析所选基线分支 {branch}。",
    leadAgentUnhealthy: "{agent} 当前不可用：{reason}。",
    taskNotDraft: "只有草稿任务才能开始澄清。",
    taskNotClarifying: "该操作仅在需求澄清阶段可用。",
    taskNotPlanReview: "该操作仅在计划审阅阶段可用。",
    planSnapshotNotFound: "所选计划快照已不存在。",
    agentTypeRequired: "请先选择替换的 worker Agent。",
    subtaskChangeAgentNotAllowed: "当前成员状态不允许替换 worker。",
    subtaskCancelNotAllowed: "当前成员状态不允许取消成员。",
    subtaskDiscardNotAllowed: "只有最终审查标记为待丢弃后，才能确认丢弃。",
    subtaskReassignNotAllowed: "当前成员状态不允许重派发成员。",
    subtaskRebaseRetryNotAllowed: "只有最近一次合并尝试发生冲突后，才能执行 Rebase & Retry。",
    subtaskReworkNotAllowed: "只有存在可操作的增量审查意见时，才能立即返工。",
    taskDeleteRequiresPause: "任务需要先暂停，确认已停止后才能删除。",
    taskPauseNotAllowed: "当前任务状态不允许暂停。",
    taskResumeNotAllowed: "只有解决合并阻塞项后，才能恢复合并。",
    attachmentTypeUnsupported: "一个或多个附件类型不受支持。",
    attachmentSizeExceeded: "一个或多个附件超过当前大小限制。",
    attachmentMimeMismatch: "一个或多个附件的类型与 MIME 元数据不匹配。",
    taskMessageRequired: "发送给 lead 之前请先填写消息。",
    taskBranchCleanupFailed: "任务分支或 worktree 清理失败，请先处理占用后重试。",
    invalidPlanFallback: "生成的计划无效，需要重新生成。",
    mailboxMessageRequired: "发送交接说明前请先填写内容。",
    mailboxMessageTypeInvalid: "请选择有效的交接消息类型。",
    mailboxNotAvailable: "只有计划批准后且任务仍处于活动状态时，才能使用信箱说明。",
    mailboxSchemaInvalid: "结构化 schema 必须是合法的 JSON 对象。",
    mailboxTargetRequired: "发送交接说明前请先选择目标子任务。",
    planTemplateRequired: "请先选择一个计划模板。",
    planTemplateNotFound: "所选计划模板已不存在。",
    previewAppRootNotFound: "所选预览目录在当前交付分支中不存在。",
    previewCommandRequired: "当前未检测到可运行的 Web 预览命令。",
    previewSandboxUnavailable: "Docker 预览沙箱当前不可用，无法启动内嵌预览。",
    previewStartFailed: "启动成品预览失败，请检查日志或切换预览目标。",
    previewStopFailed: "停止成品预览失败，请稍后重试。",
    previewTargetNotFound: "当前任务还没有可用的预览目标。",
    dirtyWorkingTree: "工作区有未提交改动",
    cleanWorkingTree: "工作区干净",
    noRecentBranches: "未检测到最近的本地分支。",
    unableToLoadAgents: "无法加载 Agent 注册信息。",
    unknown: "未知",
    unavailable: "不可用",
    degraded: "降级",
    healthy: "健康",
    stubRuntime: "Stub 运行时",
    realRuntime: "真实运行时",
    customRuntime: "自定义运行时",
    ready: "就绪",
    blocked: "阻塞",
    noLeadCandidates: "当前没有已注册的 lead 能力 Agent。",
    leadReady: "{agent} 健康，可用于创建任务。",
    leadBlocked: "{agent} 已被阻止：{reason}",
    leadStubBlocked: "{agent} 当前仍是 Stub 运行时，不计为真实 CLI 候选。",
    statusDraft: "草稿",
    statusClarifying: "澄清中",
    statusPlanning: "规划中",
    statusPlanReview: "计划审阅",
    statusExecuting: "执行中",
    statusReviewing: "审查中",
    statusMerging: "合并中",
    statusCompleted: "已完成",
    statusActionRequired: "需要处理",
    statusFailed: "失败",
    statusCancelled: "已取消",
    subtaskPending: "待执行",
    subtaskBlocked: "阻塞中",
    subtaskReady: "已就绪",
    subtaskRunning: "运行中",
    subtaskReviewPending: "待审查",
    subtaskAccepted: "已接受",
    subtaskReworkRequired: "需要返工",
    subtaskDiscardPending: "待丢弃",
    subtaskMerged: "已合并",
    subtaskFailed: "失败",
    subtaskCancelled: "已取消",
    subtaskDiscarded: "已丢弃",
    reviewAccepted: "已接受",
    reviewRework: "需要返工",
    reviewRejected: "已拒绝",
    reviewPending: "待定",
    reviewIncremental: "增量审查",
    reviewFinal: "最终审查",
    reviewGeneric: "审查",
    unknownAttachment: "未知附件",
    sizeUnknown: "大小未知",
    navDashboard: "控制台",
    navTaskCreate: "任务创建",
    navTasks: "任务列表",
    navPlan: "计划审阅",
    navOps: "运行看板",
    navMetrics: "指标",
    sidebarTitle: "项目",
    sidebarActiveAgents: "{count} Agent",
    sidebarRegisterButton: "注册项目",
    brandName: "EAT Agent Workbench",
    navStatusIdle: "就绪",
    metricsTitle: "指标概览",
    metricsEmpty: "指标视图即将上线。任务执行统计、Agent 利用率和性能数据会在这里显示。",
  },
  en: {
    unknownProjectError: "An unknown project error occurred.",
    unknownTaskError: "An unknown task error occurred.",
    unknownAgentError: "An unknown agent error occurred.",
    requestFailed: "Request failed.",
    projectAlreadyRegistered: "This repository is already registered at {path}.",
    pathNotAbsolute: "Use an absolute path such as /home/code/EAT.",
    pathAccessDenied: "You do not have permission to read that directory. Choose an accessible path instead.",
    pathNotFound: "That path does not exist. Check the directory and try again.",
    pathNotDirectory: "The selected path must be a directory, not a file.",
    notGitRepository: "The selected directory is not a non-bare git repository.",
    bareGitRepository: "Bare git repositories are not supported for project registration.",
    projectNotFound: "The selected project no longer exists in the local registry.",
    baseBranchCreateFailed: "Unable to create the new baseline branch {branch}.",
    baseBranchNotFound: "The selected base branch {branch} could not be resolved.",
    leadAgentUnhealthy: "{agent} is unhealthy: {reason}.",
    taskNotDraft: "Clarification can only start from a draft task.",
    taskNotClarifying: "This action is only available while the task is clarifying.",
    taskNotPlanReview: "This action is only available during plan review.",
    planSnapshotNotFound: "The selected plan snapshot no longer exists.",
    agentTypeRequired: "Select a replacement worker agent before relaunching.",
    subtaskChangeAgentNotAllowed: "Replace worker is not available for the current member state.",
    subtaskCancelNotAllowed: "Cancel member is not available for the current member state.",
    subtaskDiscardNotAllowed: "Discard confirmation is only available after final review marks the subtask for discard.",
    subtaskReassignNotAllowed: "Reassign member is not available for the current member state.",
    subtaskRebaseRetryNotAllowed: "Rebase & Retry is only available after the latest merge attempt conflicts.",
    subtaskReworkNotAllowed: "Rework Now is only available for subtasks with an actionable incremental review.",
    taskDeleteRequiresPause: "Pause the task and wait for it to stop before deleting it.",
    taskPauseNotAllowed: "The current task state cannot be paused.",
    taskResumeNotAllowed: "Resume merge is only available after merge blockers have been resolved.",
    attachmentTypeUnsupported: "One or more attachments use an unsupported type.",
    attachmentSizeExceeded: "One or more attachments exceed the current size limit.",
    attachmentMimeMismatch: "One or more attachments do not match the supplied type or MIME metadata.",
    taskMessageRequired: "Write a message before sending it to the lead agent.",
    taskBranchCleanupFailed: "Task branch or worktree cleanup failed. Resolve the lock or checkout issue and try again.",
    invalidPlanFallback: "The generated plan is invalid and needs regeneration.",
    mailboxMessageRequired: "Write a handoff note before sending it.",
    mailboxMessageTypeInvalid: "Select a valid handoff message type.",
    mailboxNotAvailable: "Mailbox notes are only available after plan approval while the task is active.",
    mailboxSchemaInvalid: "Structured schema must be a valid JSON object.",
    mailboxTargetRequired: "Select a subtask target before sending a handoff note.",
    planTemplateRequired: "Select a plan template before seeding.",
    planTemplateNotFound: "The selected plan template no longer exists.",
    previewAppRootNotFound: "The selected preview directory does not exist for the current deliverable branch.",
    previewCommandRequired: "No runnable web preview command was detected for the selected deliverable.",
    previewSandboxUnavailable: "The Docker preview sandbox is unavailable, so the embedded preview cannot start.",
    previewStartFailed: "Unable to start the deliverable preview. Check the logs or switch the preview target.",
    previewStopFailed: "Unable to stop the deliverable preview. Try again.",
    previewTargetNotFound: "No preview target is available for this task yet.",
    dirtyWorkingTree: "Dirty working tree",
    cleanWorkingTree: "Clean working tree",
    noRecentBranches: "No recent local branches detected.",
    unableToLoadAgents: "Unable to load agent registry data.",
    unknown: "Unknown",
    unavailable: "Unavailable",
    degraded: "Degraded",
    healthy: "Healthy",
    stubRuntime: "Stub runtime",
    realRuntime: "Real runtime",
    customRuntime: "Custom runtime",
    ready: "Ready",
    blocked: "Blocked",
    noLeadCandidates: "No lead-capable agents are registered yet.",
    leadReady: "{agent} is healthy and ready for task creation.",
    leadBlocked: "{agent} is blocked: {reason}",
    leadStubBlocked: "{agent} is still running in stub mode and is not treated as a real CLI candidate.",
    statusDraft: "Draft",
    statusClarifying: "Clarifying",
    statusPlanning: "Planning",
    statusPlanReview: "Plan review",
    statusExecuting: "Executing",
    statusReviewing: "Reviewing",
    statusMerging: "Merging",
    statusCompleted: "Completed",
    statusActionRequired: "Action required",
    statusFailed: "Failed",
    statusCancelled: "Cancelled",
    subtaskPending: "Pending",
    subtaskBlocked: "Blocked",
    subtaskReady: "Ready",
    subtaskRunning: "Running",
    subtaskReviewPending: "Review pending",
    subtaskAccepted: "Accepted",
    subtaskReworkRequired: "Rework required",
    subtaskDiscardPending: "Discard pending",
    subtaskMerged: "Merged",
    subtaskFailed: "Failed",
    subtaskCancelled: "Cancelled",
    subtaskDiscarded: "Discarded",
    reviewAccepted: "Accepted",
    reviewRework: "Needs rework",
    reviewRejected: "Rejected",
    reviewPending: "Pending",
    reviewIncremental: "Incremental review",
    reviewFinal: "Final review",
    reviewGeneric: "Review",
    unknownAttachment: "Unknown attachment",
    sizeUnknown: "size unknown",
    navDashboard: "Dashboard",
    navTaskCreate: "Create Task",
    navTasks: "Tasks",
    navPlan: "Plan Review",
    navOps: "Operations",
    navMetrics: "Metrics",
    sidebarTitle: "Projects",
    sidebarActiveAgents: "{count} Agents",
    sidebarRegisterButton: "Register Project",
    brandName: "EAT Agent Workbench",
    navStatusIdle: "Ready",
    metricsTitle: "Metrics Overview",
    metricsEmpty: "Metrics view coming soon. Task execution stats, agent utilization, and performance data will appear here.",
  },
};

const TASK_STATUS_KEYS = {
  ACTION_REQUIRED: "statusActionRequired",
  CANCELLED: "statusCancelled",
  CLARIFYING: "statusClarifying",
  COMPLETED: "statusCompleted",
  DRAFT: "statusDraft",
  EXECUTING: "statusExecuting",
  FAILED: "statusFailed",
  MERGING: "statusMerging",
  PLANNING: "statusPlanning",
  PLAN_REVIEW: "statusPlanReview",
  REVIEWING: "statusReviewing",
};

const SUBTASK_STATUS_KEYS = {
  ACCEPTED: "subtaskAccepted",
  BLOCKED: "subtaskBlocked",
  CANCELLED: "subtaskCancelled",
  DISCARDED: "subtaskDiscarded",
  DISCARD_PENDING: "subtaskDiscardPending",
  FAILED: "subtaskFailed",
  MERGED: "subtaskMerged",
  PENDING: "subtaskPending",
  READY: "subtaskReady",
  REVIEW_PENDING: "subtaskReviewPending",
  REWORK_REQUIRED: "subtaskReworkRequired",
  RUNNING: "subtaskRunning",
};

export function setLocale(locale) {
  currentLocale = SUPPORTED_LOCALES.has(locale) ? locale : DEFAULT_LOCALE;
}

export function getLocale() {
  return currentLocale;
}

export function translate(key, values = {}) {
  return formatMessage(resolveMessage(key), values);
}

export function buildProjectErrorMessage(error) {
  if (!error) {
    return translate("unknownProjectError");
  }

  switch (error.code) {
    case "PROJECT_ALREADY_REGISTERED":
      return translate("projectAlreadyRegistered", {
        path: error.details?.path ?? (currentLocale === "en" ? "the saved path" : "已保存路径"),
      });
    case "PATH_NOT_ABSOLUTE":
      return translate("pathNotAbsolute");
    case "PATH_ACCESS_DENIED":
      return translate("pathAccessDenied");
    case "PATH_NOT_FOUND":
      return translate("pathNotFound");
    case "PATH_NOT_DIRECTORY":
      return translate("pathNotDirectory");
    case "NOT_GIT_REPOSITORY":
      return translate("notGitRepository");
    case "BARE_GIT_REPOSITORY":
      return translate("bareGitRepository");
    case "PROJECT_NOT_FOUND":
      return translate("projectNotFound");
    default:
      return error.message ?? translate("unknownProjectError");
  }
}

export function buildTaskErrorMessage(error) {
  if (!error) {
    return translate("unknownTaskError");
  }

  switch (error.code) {
    case "BASE_BRANCH_CREATE_FAILED":
      return translate("baseBranchCreateFailed", {
        branch: error.details?.baseBranch ?? "",
      });
    case "BASE_BRANCH_NOT_FOUND":
      return translate("baseBranchNotFound", {
        branch: error.details?.baseBranch ?? "",
      });
    case "LEAD_AGENT_UNHEALTHY":
      return translate("leadAgentUnhealthy", {
        agent: error.details?.leadAgentType ?? (currentLocale === "en" ? "Lead agent" : "Lead Agent"),
        reason: error.details?.failureReason?.message ?? (currentLocale === "en" ? "health check failed" : "健康检查失败"),
      });
    case "TASK_NOT_DRAFT":
      return translate("taskNotDraft");
    case "TASK_NOT_CLARIFYING":
      return translate("taskNotClarifying");
    case "TASK_NOT_PLAN_REVIEW":
      return translate("taskNotPlanReview");
    case "PLAN_SNAPSHOT_NOT_FOUND":
      return translate("planSnapshotNotFound");
    case "AGENT_TYPE_REQUIRED":
      return translate("agentTypeRequired");
    case "SUBTASK_CHANGE_AGENT_NOT_ALLOWED":
      return translate("subtaskChangeAgentNotAllowed");
    case "SUBTASK_CANCEL_NOT_ALLOWED":
      return translate("subtaskCancelNotAllowed");
    case "SUBTASK_DISCARD_NOT_ALLOWED":
      return translate("subtaskDiscardNotAllowed");
    case "SUBTASK_REASSIGN_NOT_ALLOWED":
      return translate("subtaskReassignNotAllowed");
    case "SUBTASK_REBASE_RETRY_NOT_ALLOWED":
      return translate("subtaskRebaseRetryNotAllowed");
    case "SUBTASK_REWORK_NOT_ALLOWED":
      return translate("subtaskReworkNotAllowed");
    case "TASK_DELETE_REQUIRES_PAUSE":
      return translate("taskDeleteRequiresPause");
    case "TASK_PAUSE_NOT_ALLOWED":
      return translate("taskPauseNotAllowed");
    case "TASK_RESUME_NOT_ALLOWED":
      return translate("taskResumeNotAllowed");
    case "ATTACHMENT_TYPE_UNSUPPORTED":
      return translate("attachmentTypeUnsupported");
    case "ATTACHMENT_SIZE_EXCEEDED":
      return translate("attachmentSizeExceeded");
    case "ATTACHMENT_MIME_MISMATCH":
      return translate("attachmentMimeMismatch");
    case "TASK_MESSAGE_REQUIRED":
      return translate("taskMessageRequired");
    case "TASK_BRANCH_CLEANUP_FAILED":
      return translate("taskBranchCleanupFailed");
    case "INVALID_PLAN":
      return error.message ?? translate("invalidPlanFallback");
    case "MAILBOX_MESSAGE_REQUIRED":
      return translate("mailboxMessageRequired");
    case "MAILBOX_MESSAGE_TYPE_INVALID":
      return translate("mailboxMessageTypeInvalid");
    case "MAILBOX_NOT_AVAILABLE":
      return translate("mailboxNotAvailable");
    case "MAILBOX_SCHEMA_INVALID":
      return translate("mailboxSchemaInvalid");
    case "MAILBOX_TARGET_REQUIRED":
      return translate("mailboxTargetRequired");
    case "PLAN_TEMPLATE_REQUIRED":
      return translate("planTemplateRequired");
    case "PLAN_TEMPLATE_NOT_FOUND":
      return translate("planTemplateNotFound");
    case "APP_ROOT_NOT_FOUND":
      return translate("previewAppRootNotFound");
    case "PREVIEW_COMMAND_REQUIRED":
      return translate("previewCommandRequired");
    case "PREVIEW_SANDBOX_UNAVAILABLE":
      return translate("previewSandboxUnavailable");
    case "PREVIEW_START_FAILED":
      return translate("previewStartFailed");
    case "PREVIEW_STOP_FAILED":
      return translate("previewStopFailed");
    case "PREVIEW_TARGET_NOT_FOUND":
      return translate("previewTargetNotFound");
    default:
      return error.message ?? translate("unknownTaskError");
  }
}

export function buildCleanlinessLabel(isDirty) {
  return translate(isDirty ? "dirtyWorkingTree" : "cleanWorkingTree");
}

export function buildBranchList(branches) {
  if (!Array.isArray(branches) || branches.length === 0) {
    return [translate("noRecentBranches")];
  }

  return branches;
}

export function buildAgentErrorMessage(error) {
  if (!error) {
    return translate("unknownAgentError");
  }

  return error.message ?? translate("unableToLoadAgents");
}

export function buildAgentStatusLabel(snapshot) {
  if (!snapshot) {
    return translate("unknown");
  }

  if (snapshot.runtimeMode === "STUB") {
    return translate("stubRuntime");
  }

  if (snapshot.available !== true) {
    return translate("unavailable");
  }

  if (Array.isArray(snapshot.checks) && snapshot.checks.some((check) => check.status === "WARN")) {
    return translate("degraded");
  }

  return translate("healthy");
}

export function buildAgentRuntimeModeLabel(agent, snapshot) {
  const runtimeMode = snapshot?.runtimeMode ?? agent?.runtimeMode ?? null;

  if (runtimeMode === "STUB") {
    return translate("stubRuntime");
  }

  if (runtimeMode === "REAL") {
    return translate("realRuntime");
  }

  return translate("customRuntime");
}

export function buildDockerHealthLabel(dockerHealth) {
  if (!dockerHealth) {
    return translate("unknown");
  }

  if (dockerHealth.available) {
    return translate("ready");
  }

  if (dockerHealth.daemonReachable === false) {
    return translate("unavailable");
  }

  return translate("blocked");
}

export function buildLeadSelectionState(candidate) {
  if (!candidate) {
    return {
      disabled: true,
      message: translate("noLeadCandidates"),
      tone: "error",
    };
  }

  if (candidate.selectable) {
    return {
      disabled: false,
      message: translate("leadReady", { agent: candidate.agentName }),
      tone: "success",
    };
  }

  if (candidate.runtimeMode === "STUB") {
    return {
      disabled: true,
      message: translate("leadStubBlocked", { agent: candidate.agentName }),
      tone: "error",
    };
  }

  return {
    disabled: true,
    message: translate("leadBlocked", {
      agent: candidate.agentName,
      reason: candidate.failureReason?.message ?? (currentLocale === "en" ? "Health check failed." : "健康检查失败。"),
    }),
    tone: "error",
  };
}

export function buildTaskStatusLabel(status) {
  return translate(TASK_STATUS_KEYS[status] ?? "unknown");
}

export function buildSubTaskStatusLabel(status) {
  return translate(SUBTASK_STATUS_KEYS[status] ?? "unknown");
}

export function buildReviewDecisionLabel(decision) {
  switch (decision) {
    case "ACCEPTED":
      return translate("reviewAccepted");
    case "REWORK":
      return translate("reviewRework");
    case "REJECTED":
      return translate("reviewRejected");
    default:
      return translate("reviewPending");
  }
}

export function buildReviewPhaseLabel(phase) {
  switch (phase) {
    case "INCREMENTAL":
      return translate("reviewIncremental");
    case "FINAL":
      return translate("reviewFinal");
    default:
      return translate("reviewGeneric");
  }
}

export function buildAttachmentCaption(attachment) {
  if (!attachment) {
    return translate("unknownAttachment");
  }

  const size = typeof attachment.size === "number"
    ? `${Math.max(1, Math.round(attachment.size / 1024))} KB`
    : translate("sizeUnknown");

  return `${attachment.fileType} · ${attachment.mimeType} · ${size}`;
}

function resolveMessage(key) {
  return MESSAGES[currentLocale]?.[key]
    ?? MESSAGES.en[key]
    ?? key;
}

function formatMessage(template, values) {
  return String(template).replaceAll(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}
