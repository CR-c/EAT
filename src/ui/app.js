import {
  buildAgentErrorMessage,
  buildAgentRuntimeModeLabel,
  buildReviewDecisionLabel,
  buildReviewPhaseLabel,
  buildAgentStatusLabel,
  buildAttachmentCaption,
  buildBranchList,
  buildCleanlinessLabel,
  buildDockerHealthLabel,
  buildLeadSelectionState,
  buildProjectErrorMessage,
  buildSubTaskStatusLabel,
  buildTaskErrorMessage,
  buildTaskStatusLabel,
  setLocale,
  translate,
} from "./view-model.js";

const STORAGE_KEYS = {
  draftPrefix: "eat.phase06.planDraft",
  locale: "eat.ui.locale",
  selectedProjectId: "eat.phase04.selectedProjectId",
  selectedTaskId: "eat.phase04.selectedTaskId",
};
const DEFAULT_OUTPUT_BUFFER_MAX_BYTES = 65_536;
const UI_MESSAGES = {
  "zh-CN": {
    heroEyebrow: "EAT 控制台",
    heroTitle: "可通过 Web 操控的 Agent 编排",
    heroSummary: "从浏览器中创建任务、审阅计划、启动真实 Codex worker，并在隔离 worktree 间完成交接协作。",
    heroPanelLabel: "当前能力",
    heroCapabilityLead: "真实 Codex lead 与 worker 执行",
    heroCapabilityScheduling: "具备依赖感知的多 worktree 调度",
    heroCapabilityMailbox: "通过 Web 信箱完成 lead 与子任务交接",
    registerEyebrow: "注册",
    registerTitle: "添加本地仓库",
    projectPathLabel: "仓库绝对路径",
    projectPathHint: "创建任务前请先注册本地 Git 仓库。允许脏工作区，但会在下方明确提示。",
    registerProjectButton: "注册项目",
    projectsEyebrow: "项目",
    projectsTitle: "已注册仓库",
    refreshListButton: "刷新列表",
    projectsEmpty: "还没有已注册项目。请先添加一个仓库，再继续创建任务。",
    detailEyebrow: "详情",
    projectStatusTitle: "项目状态",
    refreshStatusButton: "刷新状态",
    projectDetailEmpty: "选择一个项目以查看分支、工作区清洁度和最近任务活动。",
    dirtyBannerEyebrow: "脏工作区",
    dirtyBannerTitle: "存在未提交改动",
    dirtyBannerBody: "创建任务时仍会快照所选基线分支提交，但 lead 和 worker 会话不应依赖当前 checkout 状态。",
    registeredProjectEyebrow: "已注册项目",
    defaultBranchStat: "默认分支",
    currentBranchStat: "当前分支",
    projectNameStat: "项目名称",
    savedPathStat: "保存路径",
    branchChoicesEyebrow: "分支选项",
    recentBranchesTitle: "最近本地分支",
    agentsEyebrow: "Agent",
    agentHealthTitle: "注册表与健康状态",
    refreshHealthButton: "刷新健康状态",
    agentHealthSummary: "只有所选 lead agent 健康时，才会开始需求澄清。创建任务前会持续显示同样的保护信息。",
    registeredAgentsStat: "已注册 Agent",
    healthyLeadStat: "健康的 lead 候选",
    healthyWorkerStat: "健康的 worker 候选",
    healthCheckedAtStat: "上次健康检查",
    defaultRuntimeStat: "默认运行时",
    dockerSandboxStat: "Docker 沙箱",
    dockerHealthReasonDefault: "Docker 沙箱健康状态会随 Agent 目录一并加载。",
    agentHealthEmpty: "没有找到已注册 Agent。",
    createEyebrow: "创建",
    taskFormTitle: "新建需求澄清任务",
    baseBranchLabel: "基线分支",
    leadAgentLabel: "Lead Agent",
    taskTitleLabel: "任务标题",
    taskDescriptionLabel: "需求描述",
    attachmentsLabelStatic: "附件",
    attachmentsHint: "支持图片、PDF/Markdown/文本文件，以及基于文本的代码文件。不支持或超限文件会在任务创建完成前被拒绝。",
    createTaskButton: "创建任务",
    tasksEyebrow: "任务",
    taskListTitle: "项目任务",
    refreshTasksButton: "刷新任务",
    taskListEmpty: "当前所选项目还没有任务。",
    clarificationEyebrow: "澄清",
    clarificationTitle: "Lead 会话转录",
    refreshTaskButton: "刷新任务",
    taskDetailEmpty: "选择一个任务以查看附件、实时转录与澄清状态。",
    selectedTaskEyebrow: "当前任务",
    cleanupWarningsEyebrow: "清理警告",
    cleanupWarningsTitle: "可能仍需手动清理",
    leadAgentStat: "Lead Agent",
    baseCommitStat: "基线提交",
    latestSessionStat: "最近会话",
    messagesPersistedStat: "已持久化消息",
    planVersionStat: "计划版本",
    snapshotsStat: "快照数",
    leaderOrchestrationEyebrow: "Leader 编排",
    teamLifecycleTitle: "Lead 与团队生命周期",
    teamLifecycleSummary: "先查看 lead 协调者和所有具名 worker，再进入聚焦执行与恢复操作。",
    teamEmpty: "计划批准并物化为可执行子任务后，团队成员会显示在这里。",
    leadEyebrow: "Lead",
    coordinatorTitle: "协调者",
    attachmentsEyebrow: "附件",
    taskAttachmentsTitle: "任务范围文件",
    taskAttachmentsEmpty: "这个任务没有附加文件。",
    executionEyebrow: "执行",
    executionBoardTitle: "摘要优先的 worker 看板",
    executionBoardSummary: "先通过紧凑摘要监控全部子任务，再在需要时聚焦某个会话流获取更深层输出。",
    executionEmpty: "计划批准后，已批准的子任务和 worker 会话会显示在这里。",
    focusedSessionEyebrow: "聚焦会话",
    selectSubtaskTitle: "选择一个子任务",
    reworkDescriptionLabel: "返工描述",
    reworkDescriptionPlaceholder: "可选：在重新启动前进一步细化子任务描述。",
    replacementAgentLabel: "替换 Agent",
    rebaseRetryButton: "Rebase 并重试",
    resumeMergeButton: "恢复合并",
    reworkNowButton: "立即返工",
    reassignMemberButton: "重新派发成员",
    cancelMemberButton: "取消成员",
    replaceWorkerButton: "替换 worker",
    confirmDiscardButton: "确认丢弃",
    mergeHistoryEyebrow: "合并历史",
    attemptTimelineTitle: "尝试时间线",
    mergeHistoryEmpty: "这个子任务还没有记录任何 merge 或 rebase 尝试。",
    mailboxEyebrow: "信箱",
    handoffNotesTitle: "交接说明",
    mailboxEmpty: "目前还没有发往这个子任务的信箱说明。",
    sendLeadHandoffLabel: "向该子任务发送 lead 交接说明",
    sendLeadHandoffPlaceholder: "补充约束、上游预期或集成细节。",
    sendHandoffNoteButton: "发送交接说明",
    executionFocusEmpty: "选择一个子任务摘要，即可查看最新 worker 会话，而不必同时挂载所有终端。",
    planDraftEyebrow: "计划草稿",
    currentPlanDraftTitle: "当前计划草稿",
    planEmpty: "确认需求后会触发计划生成、校验与草稿持久化。",
    planEditorHint: "批准前可先编辑草稿。变更仅保存在当前浏览器，直到草稿同步功能上线。",
    planViewLabel: "计划视图",
    planGraphViewButton: "图谱视图",
    planListViewButton: "列表视图",
    planTemplateLabel: "模板种子",
    applyTemplateButton: "应用模板",
    planTemplateHint: "用常见团队骨架快速初始化 DAG 草稿，之后仍需人工审阅和批准。",
    saveDraftButton: "保存草稿",
    addSubtaskButton: "添加子任务",
    resetLocalEditsButton: "重置本地修改",
    approveDraftButton: "批准草稿",
    planningNotesLabel: "规划备注",
    planningNotesPlaceholder: "可选：为当前草稿补充执行备注。",
    roleField: "角色",
    deliverableField: "交付物",
    acceptanceCriteriaField: "验收标准",
    acceptanceCriteriaPlaceholder: "每行一条验收标准",
    templateHintField: "模板提示",
    estimatedScopeField: "预估范围",
    deliverableLabel: "交付物",
    acceptanceCriteriaTitle: "验收标准",
    templateHintLabel: "模板提示",
    roleLabel: "角色",
    noDependenciesLabel: "无依赖",
    noAcceptanceCriteria: "尚未定义验收标准。",
    graphColumnLabel: "阶段 {count}",
    nodeCountOne: "{count} 个节点",
    nodeCountOther: "{count} 个节点",
    templateSummary: "模板 {template}",
    applyTemplateConfirm: "应用模板会覆盖当前未保存的 DAG 草稿，是否继续？",
    historyEyebrow: "历史",
    planSnapshotsTitle: "计划快照",
    planHistoryEmpty: "暂无可恢复的历史快照。",
    transcriptEyebrow: "转录",
    transcriptTitle: "已持久化的澄清消息",
    transcriptEmpty: "开始澄清后，这里会创建首个 lead 会话和转录消息。",
    startClarificationButton: "开始澄清",
    confirmRequirementsButton: "已确认需求",
    sendClarificationReplyLabel: "发送澄清回复",
    sendClarificationReplyPlaceholder: "补充需求、约束条件或验收标准。",
    sendMessageButton: "发送消息",
    documentTitle: "EAT 编排控制台",
    switchToEnglish: "切换到英文界面",
    switchToChinese: "切换到中文界面",
    registering: "注册中...",
    projectRegistered: "已注册项目 {name}。",
    creating: "创建中...",
    taskCreated: "已创建任务 {title}。准备好后即可开始澄清。",
    starting: "启动中...",
    sending: "发送中...",
    confirming: "确认中...",
    refreshing: "刷新中...",
    checking: "检查中...",
    saving: "保存中...",
    restoring: "恢复中...",
    relaunching: "重新启动中...",
    switching: "切换中...",
    reassigning: "重新派发中...",
    cancelling: "取消中...",
    rebasing: "Rebase 中...",
    resuming: "恢复中...",
    applying: "应用中...",
    notConfigured: "未配置",
    notYetChecked: "尚未检查",
    dockerReadyReason: "Docker 沙箱健康，可供 worker 会话使用。",
    capabilityLead: "Lead",
    capabilityWorker: "Worker",
    capabilityVision: "视觉",
    capabilityNoVision: "无视觉",
    capabilityInteractive: "交互式",
    capabilityOneShot: "单次执行",
    sandboxCapability: "{type} 沙箱",
    runtimeLabel: "运行时",
    capabilitiesLabel: "能力",
    failureReasonLabel: "失败原因",
    none: "无",
    noLeadAgentsAvailableOption: "没有可用的 lead Agent",
    unsupportedAttachmentNamed: "{name} 不是受支持的附件类型。",
    pathMetaLabel: "路径",
    baseBranchMetaLabel: "基线分支",
    detachedHead: "游离 HEAD",
    latestSessionNone: "无",
    teamMemberCountOne: "{count} 个成员",
    teamMemberCountOther: "{count} 个成员",
    leadSessionPending: "待定",
    leadSessionNotStarted: "Lead 会话尚未开始。",
    leadVisibleSummary: "随着澄清、规划和审查流程推进，lead agent 会显示在这里。",
    sessionPending: "会话待启动",
    sessionIdLabel: "会话 {id}",
    leadAttentionNeeded: "Lead 需要关注：{error}",
    leadCoordinatorSummary: "Lead 会作为规划、审查和编排决策中的可见协调者持续存在。",
    teamMemberFallback: "团队成员",
    unknownAgent: "未知 Agent",
    waitingTeamLifecycle: "等待团队生命周期事件。",
    branchLabel: "分支",
    worktreeLabel: "Worktree",
    selectMemberHint: "选择该成员即可查看会话或在下方执行运维操作。",
    cleanupWarningSummaryOne: "记录了 {count} 条 worktree 清理警告。任务虽已结束，但你可能仍需手动删除残留路径。",
    cleanupWarningSummaryOther: "记录了 {count} 条 worktree 清理警告。任务虽已结束，但你可能仍需手动删除残留路径。",
    unknownPath: "未知路径",
    cleanupFailed: "清理失败。",
    latestSessionLabel: "最近会话",
    retriesLabel: "重试次数",
    sessionsLabelOne: "{count} 次会话",
    sessionsLabelOther: "{count} 次会话",
    mergeAttemptsLabel: "合并尝试",
    latestMergeLabel: "最近合并",
    attachmentsLabel: "附件",
    includedCount: "{count} 个纳入",
    excludedCount: "{count} 个排除",
    planDraftReady: "计划草稿已可审阅。版本 {version} 已保存，可进入下一阶段。",
    planTemplateApplied: "模板骨架已写入当前计划草稿，可继续编辑后再批准。",
    planningRetryingOne: "计划正在重试，此前已有 {count} 次校验失败。",
    planningRetryingOther: "计划正在重试，此前已有 {count} 次校验失败。",
    planningInProgress: "规划进行中，正在等待 lead agent 输出有效的 JSON 草稿。",
    staleDraftNotice: "服务端草稿已在其他标签页或恢复操作后变更。继续前请先重置本地修改。",
    saveBeforeApprovalButton: "先保存再批准",
    agentMetaLabel: "Agent",
    dependsOnLabel: "依赖于",
    restoreSnapshotButton: "恢复快照",
    subtaskNumberLabel: "子任务 {count}",
    removeButton: "移除",
    titleField: "标题",
    workerAgentField: "Worker Agent",
    descriptionField: "描述",
    branchSuffixField: "分支后缀",
    missingSuffix: "缺少后缀",
    dependsOnField: "依赖项",
    dependsOnPlaceholder: "backend-contract, auth-api",
    transcriptRoleOperator: "操作员",
    transcriptRoleLead: "Lead",
    transcriptRoleSystem: "系统",
    latestServerDraftFirst: "请先重置本地修改，再查看最新服务端草稿。",
    draftSaved: "草稿已保存，服务端校验通过。",
    latestServerDraftBeforeApproval: "批准前请先将本地修改重置为最新服务端草稿。",
    saveDraftBeforeApproval: "请先保存草稿，再执行批准。",
    planApprovedIdempotent: "计划此前已批准，现复用已物化的子任务。",
    planApprovedNew: "计划已批准，子任务已物化并准备进入执行。",
    restoreSnapshotConfirm: "将此快照恢复到当前草稿吗？此标签页中未保存的本地修改将被替换。",
    snapshotRestored: "快照已恢复到当前草稿。",
    snapshotRestoredNotice: "快照 {snapshotId} 已恢复到当前草稿。",
    reworkRelaunched: "已在相同分支与 worktree 上重新启动返工。",
    workerChangedRelaunched: "已切换 worker agent，并在相同分支与 worktree 上重新启动。",
    memberReassignedRelaunched: "成员已重新派发并重新启动。",
    memberReassignedQueued: "成员已重新派发。依赖解除后会自动开始。",
    memberCancelled: "成员已取消。",
    discardConfirmed: "已确认丢弃该子任务。",
    rebaseRetrySucceeded: "Rebase 重试成功，合并流程已恢复。",
    rebaseRetryConflict: "Rebase 重试后仍有冲突，请查看更新后的冲突摘要。",
    mergeResumed: "合并流程已恢复。",
    leadHandoffSent: "已发送 lead 交接说明。",
    readFileError: "无法读取 {name}。",
    noBranchesAvailable: "没有可用分支",
    workerCurrentlyAssigned: "{name}（当前已分配）",
    recoveryDecision: "恢复",
    launchRecoveryPhase: "启动恢复",
    replacementWorkerNeeded: "该子任务需要先替换 worker，之后才能重新启动。",
    sessionTabLabel: "会话 {index} · {status}",
    waitingWorkerOutput: "等待 worker 输出...",
    attemptCountOne: "{count} 次尝试",
    attemptCountOther: "{count} 次尝试",
    noteCountOne: "{count} 条说明",
    noteCountOther: "{count} 条说明",
    snapshotCountOne: "{count} 个快照",
    snapshotCountOther: "{count} 个快照",
    regenerationCountOne: "{count} 次重新生成",
    regenerationCountOther: "{count} 次重新生成",
    versionSummary: "版本 {version}",
    notesSummary: "备注：{notes}",
    unknownSource: "未知来源",
    unknownTarget: "未知目标",
    mergeStatusSucceeded: "成功",
    mergeStatusConflict: "冲突",
    mergeStatusAborted: "已中止",
    mergeStatusPending: "待定",
    mergeOperationMerge: "合并",
    mergeOperationRebase: "Rebase",
    mergeNone: "无",
    resultCommitSummary: "结果提交 {sha}。",
    mergeFinishedSummary: "{operation} 已结束，状态为{status}。",
    rebaseSucceededSummary: "{name} 的 Rebase 已成功，系统会自动重试合并。",
    mergeSucceededSummary: "已将 {name} 合并到任务基线分支。",
    reviewAcceptedSummary: "最终审查已接受该子任务，可进入合并集合。",
    reviewReworkSummary: "最终审查要求该子任务再执行一次 worker 返工后才能合并。",
    reviewDiscardSummary: "最终审查已将该子任务标记为待丢弃。任务继续前需要先确认。",
    reviewPendingSummary: "worker 成功运行后，这里会出现增量审查结果。",
    reviewUnavailableSummary: "暂无审查摘要。",
    mailboxSenderSubtask: "子任务",
    mailboxSenderSystem: "系统",
    mailboxSenderLead: "Lead",
    mailboxLeadTarget: "Lead",
    assignmentOperator: "操作员指派",
    assignmentLead: "Lead 指派",
    logPending: "日志待生成",
    logPathLabel: "日志 {path}",
    errorMetaLabel: "错误：{error}",
    unknownTime: "未知时间",
    snapshotSourceRestored: "已恢复",
    snapshotSourceApproved: "已批准",
    snapshotSourceLeadGenerated: "Lead 生成",
    snapshotVersionLabel: "版本 {version} · {source}",
  },
  en: {
    heroEyebrow: "EAT Console",
    heroTitle: "Web-Controlled Agent Orchestration",
    heroSummary: "Create tasks, review plans, launch real Codex workers, and coordinate handoffs across isolated worktrees from the browser.",
    heroPanelLabel: "Current capabilities",
    heroCapabilityLead: "Real Codex lead and worker execution",
    heroCapabilityScheduling: "Dependency-aware multi-worktree scheduling",
    heroCapabilityMailbox: "Web mailbox handoff between lead and subtasks",
    registerEyebrow: "Register",
    registerTitle: "Add a local repository",
    projectPathLabel: "Absolute repository path",
    projectPathHint: "Register a local git repository before creating a task. Dirty working trees are allowed, but clearly flagged below.",
    registerProjectButton: "Register project",
    projectsEyebrow: "Projects",
    projectsTitle: "Registered repositories",
    refreshListButton: "Refresh list",
    projectsEmpty: "No projects are registered yet. Add one first, then continue with task creation.",
    detailEyebrow: "Detail",
    projectStatusTitle: "Project status",
    refreshStatusButton: "Refresh status",
    projectDetailEmpty: "Select a project to inspect branches, cleanliness, and recent task activity.",
    dirtyBannerEyebrow: "Dirty working tree",
    dirtyBannerTitle: "Uncommitted changes are present",
    dirtyBannerBody: "Task creation still snapshots the selected base branch commit, but lead and worker sessions should not depend on the current checkout state.",
    registeredProjectEyebrow: "Registered project",
    defaultBranchStat: "Default branch",
    currentBranchStat: "Current branch",
    projectNameStat: "Project name",
    savedPathStat: "Saved path",
    branchChoicesEyebrow: "Branch choices",
    recentBranchesTitle: "Recent local branches",
    agentsEyebrow: "Agents",
    agentHealthTitle: "Registry and health status",
    refreshHealthButton: "Refresh health",
    agentHealthSummary: "Lead clarification only starts when the selected lead agent is healthy. The same guard remains visible before task creation.",
    registeredAgentsStat: "Registered agents",
    healthyLeadStat: "Healthy lead candidates",
    healthyWorkerStat: "Healthy worker candidates",
    healthCheckedAtStat: "Last health refresh",
    defaultRuntimeStat: "Default runtime",
    dockerSandboxStat: "Docker sandbox",
    dockerHealthReasonDefault: "Docker sandbox health is loaded with the agent directory.",
    agentHealthEmpty: "No registered agents were found.",
    createEyebrow: "Create",
    taskFormTitle: "New clarification task",
    baseBranchLabel: "Base branch",
    leadAgentLabel: "Lead agent",
    taskTitleLabel: "Task title",
    taskDescriptionLabel: "Requirement description",
    attachmentsLabelStatic: "Attachments",
    attachmentsHint: "Supported types: images, PDF/Markdown/text documents, and text-based code files. Unsupported or oversized files are rejected before task creation finishes.",
    createTaskButton: "Create task",
    tasksEyebrow: "Tasks",
    taskListTitle: "Project tasks",
    refreshTasksButton: "Refresh tasks",
    taskListEmpty: "No tasks exist for the selected project yet.",
    clarificationEyebrow: "Clarification",
    clarificationTitle: "Lead session transcript",
    refreshTaskButton: "Refresh task",
    taskDetailEmpty: "Select a task to inspect attachments, live transcript, and clarification state.",
    selectedTaskEyebrow: "Selected task",
    cleanupWarningsEyebrow: "Cleanup warnings",
    cleanupWarningsTitle: "Manual cleanup may still be required",
    leadAgentStat: "Lead agent",
    baseCommitStat: "Base commit",
    latestSessionStat: "Latest session",
    messagesPersistedStat: "Messages persisted",
    planVersionStat: "Plan version",
    snapshotsStat: "Snapshots",
    leaderOrchestrationEyebrow: "Leader orchestration",
    teamLifecycleTitle: "Lead and team lifecycle",
    teamLifecycleSummary: "See the lead coordinator and every named worker before drilling into focused execution and recovery actions.",
    teamEmpty: "Team members will appear here after plan approval materializes executable subtasks.",
    leadEyebrow: "Lead",
    coordinatorTitle: "Coordinator",
    attachmentsEyebrow: "Attachments",
    taskAttachmentsTitle: "Task-scoped files",
    taskAttachmentsEmpty: "No attachments were added for this task.",
    executionEyebrow: "Execution",
    executionBoardTitle: "Summary-first worker board",
    executionBoardSummary: "Monitor every subtask from compact live summaries, then focus a single session stream when you need deeper output.",
    executionEmpty: "Approved subtasks and worker sessions will appear here after plan approval.",
    focusedSessionEyebrow: "Focused session",
    selectSubtaskTitle: "Select a subtask",
    reworkDescriptionLabel: "Rework description",
    reworkDescriptionPlaceholder: "Optionally refine the subtask description before relaunch.",
    replacementAgentLabel: "Replacement agent",
    rebaseRetryButton: "Rebase & retry",
    resumeMergeButton: "Resume merge",
    reworkNowButton: "Rework now",
    reassignMemberButton: "Reassign member",
    cancelMemberButton: "Cancel member",
    replaceWorkerButton: "Replace worker",
    confirmDiscardButton: "Confirm discard",
    mergeHistoryEyebrow: "Merge history",
    attemptTimelineTitle: "Attempt timeline",
    mergeHistoryEmpty: "No merge or rebase attempts have been recorded for this subtask yet.",
    mailboxEyebrow: "Mailbox",
    handoffNotesTitle: "Handoff notes",
    mailboxEmpty: "No mailbox notes are targeting this subtask yet.",
    sendLeadHandoffLabel: "Send a lead handoff note to this subtask",
    sendLeadHandoffPlaceholder: "Share constraints, upstream expectations, or integration details.",
    sendHandoffNoteButton: "Send handoff note",
    executionFocusEmpty: "Pick a subtask summary to inspect the latest worker session without mounting every terminal at once.",
    planDraftEyebrow: "Plan draft",
    currentPlanDraftTitle: "Current plan draft",
    planEmpty: "Confirm requirements to trigger plan generation, validation, and draft persistence.",
    planEditorHint: "Edit the draft before approval. Changes stay in this browser until plan draft sync is enabled.",
    planViewLabel: "Plan view",
    planGraphViewButton: "Graph view",
    planListViewButton: "List view",
    planTemplateLabel: "Template seed",
    applyTemplateButton: "Apply template",
    planTemplateHint: "Start from a common team DAG skeleton, then keep review and approval under operator control.",
    saveDraftButton: "Save draft",
    addSubtaskButton: "Add subtask",
    resetLocalEditsButton: "Reset local edits",
    approveDraftButton: "Approve draft",
    planningNotesLabel: "Planning notes",
    planningNotesPlaceholder: "Optional execution notes for the current draft.",
    roleField: "Role",
    deliverableField: "Deliverable",
    acceptanceCriteriaField: "Acceptance criteria",
    acceptanceCriteriaPlaceholder: "One acceptance criterion per line",
    templateHintField: "Template hint",
    estimatedScopeField: "Estimated scope",
    deliverableLabel: "Deliverable",
    acceptanceCriteriaTitle: "Acceptance criteria",
    templateHintLabel: "Template hint",
    roleLabel: "Role",
    noDependenciesLabel: "No dependencies",
    noAcceptanceCriteria: "No acceptance criteria defined yet.",
    graphColumnLabel: "Stage {count}",
    nodeCountOne: "{count} node",
    nodeCountOther: "{count} nodes",
    templateSummary: "Template {template}",
    applyTemplateConfirm: "Applying a template will replace the current unsaved DAG draft. Continue?",
    historyEyebrow: "History",
    planSnapshotsTitle: "Plan snapshots",
    planHistoryEmpty: "No historical snapshots are available for restore yet.",
    transcriptEyebrow: "Transcript",
    transcriptTitle: "Persisted clarification messages",
    transcriptEmpty: "Start clarification to create the first lead session and transcript entries.",
    startClarificationButton: "Start clarification",
    confirmRequirementsButton: "Requirements confirmed",
    sendClarificationReplyLabel: "Send a clarification reply",
    sendClarificationReplyPlaceholder: "Clarify requirements, constraints, or acceptance criteria.",
    sendMessageButton: "Send message",
    documentTitle: "EAT Orchestration Console",
    switchToEnglish: "Switch to English",
    switchToChinese: "Switch to Chinese",
    registering: "Registering...",
    projectRegistered: "Registered {name}.",
    creating: "Creating...",
    taskCreated: "Created task {title}. Start clarification when you are ready.",
    starting: "Starting...",
    sending: "Sending...",
    confirming: "Confirming...",
    refreshing: "Refreshing...",
    checking: "Checking...",
    saving: "Saving...",
    restoring: "Restoring...",
    relaunching: "Relaunching...",
    switching: "Switching...",
    reassigning: "Reassigning...",
    cancelling: "Cancelling...",
    rebasing: "Rebasing...",
    resuming: "Resuming...",
    applying: "Applying...",
    notConfigured: "Not configured",
    notYetChecked: "Not yet checked",
    dockerReadyReason: "Docker sandbox health is ready for worker sessions.",
    capabilityLead: "Lead",
    capabilityWorker: "Worker",
    capabilityVision: "Vision",
    capabilityNoVision: "No vision",
    capabilityInteractive: "Interactive",
    capabilityOneShot: "One-shot",
    sandboxCapability: "{type} sandbox",
    runtimeLabel: "Runtime",
    capabilitiesLabel: "Capabilities",
    failureReasonLabel: "Failure reason",
    none: "None",
    noLeadAgentsAvailableOption: "No lead agents available",
    unsupportedAttachmentNamed: "{name} is not a supported attachment type.",
    pathMetaLabel: "Path",
    baseBranchMetaLabel: "Base branch",
    detachedHead: "Detached HEAD",
    latestSessionNone: "None",
    teamMemberCountOne: "{count} member",
    teamMemberCountOther: "{count} members",
    leadSessionPending: "Pending",
    leadSessionNotStarted: "Lead session has not started yet.",
    leadVisibleSummary: "The lead agent becomes visible here as clarification, planning, and review runs happen.",
    sessionPending: "session pending",
    sessionIdLabel: "session {id}",
    leadAttentionNeeded: "Lead attention needed: {error}",
    leadCoordinatorSummary: "Lead remains the visible coordinator for planning, review, and orchestration decisions.",
    teamMemberFallback: "Team member",
    unknownAgent: "unknown agent",
    waitingTeamLifecycle: "Waiting for team lifecycle events.",
    branchLabel: "Branch",
    worktreeLabel: "Worktree",
    selectMemberHint: "Select this member to inspect sessions or run operator actions below.",
    cleanupWarningSummaryOne: "{count} worktree cleanup warning was recorded. The task is terminal, but you may still need to remove stale paths manually.",
    cleanupWarningSummaryOther: "{count} worktree cleanup warnings were recorded. The task is terminal, but you may still need to remove stale paths manually.",
    unknownPath: "Unknown path",
    cleanupFailed: "Cleanup failed.",
    latestSessionLabel: "Latest session",
    retriesLabel: "Retries",
    sessionsLabelOne: "{count} session",
    sessionsLabelOther: "{count} sessions",
    mergeAttemptsLabel: "Merge attempts",
    latestMergeLabel: "Latest merge",
    attachmentsLabel: "Attachments",
    includedCount: "{count} included",
    excludedCount: "{count} excluded",
    planDraftReady: "Plan draft ready for review. Version {version} is saved and available for the next phase.",
    planTemplateApplied: "Template skeleton applied to the current plan draft. Edit it before approval.",
    planningRetryingOne: "Planning is retrying after {count} validation failure.",
    planningRetryingOther: "Planning is retrying after {count} validation failures.",
    planningInProgress: "Planning is in progress. Waiting for a valid JSON draft from the lead agent.",
    staleDraftNotice: "Server draft changed in another tab or after a restore. Reset local edits before continuing.",
    saveBeforeApprovalButton: "Save before approval",
    agentMetaLabel: "Agent",
    dependsOnLabel: "Depends on",
    restoreSnapshotButton: "Restore snapshot",
    subtaskNumberLabel: "Subtask {count}",
    removeButton: "Remove",
    titleField: "Title",
    workerAgentField: "Worker agent",
    descriptionField: "Description",
    branchSuffixField: "Branch suffix",
    missingSuffix: "missing-suffix",
    dependsOnField: "Depends on",
    dependsOnPlaceholder: "backend-contract, auth-api",
    transcriptRoleOperator: "Operator",
    transcriptRoleLead: "Lead",
    transcriptRoleSystem: "System",
    latestServerDraftFirst: "Reset local edits to review the latest server draft first.",
    draftSaved: "Draft saved. Server validation passed.",
    latestServerDraftBeforeApproval: "Reset local edits to the latest server draft before approval.",
    saveDraftBeforeApproval: "Save the draft before approval.",
    planApprovedIdempotent: "Plan was already approved. Materialized subtasks were reused.",
    planApprovedNew: "Plan approved. Subtasks are materialized and ready for execution.",
    restoreSnapshotConfirm: "Restore this snapshot into the current draft? Unsaved local edits in this tab will be replaced.",
    snapshotRestored: "Snapshot restored into the current draft.",
    snapshotRestoredNotice: "Snapshot {snapshotId} was restored into the current draft.",
    reworkRelaunched: "Rework relaunched on the same branch and worktree.",
    workerChangedRelaunched: "Worker agent changed and relaunched on the same branch and worktree.",
    memberReassignedRelaunched: "Member reassigned and relaunched.",
    memberReassignedQueued: "Member reassigned. It will start automatically after dependencies clear.",
    memberCancelled: "Member cancelled.",
    discardConfirmed: "Subtask discard confirmed.",
    rebaseRetrySucceeded: "Rebase retry succeeded. Merge flow resumed.",
    rebaseRetryConflict: "Rebase retry still conflicted. Review the updated conflict summary.",
    mergeResumed: "Merge flow resumed.",
    leadHandoffSent: "Lead handoff note sent.",
    readFileError: "Unable to read {name}.",
    noBranchesAvailable: "No branches available",
    workerCurrentlyAssigned: "{name} (currently assigned)",
    recoveryDecision: "Recovery",
    launchRecoveryPhase: "Launch recovery",
    replacementWorkerNeeded: "This subtask needs a replacement worker before it can relaunch.",
    sessionTabLabel: "Session {index} · {status}",
    waitingWorkerOutput: "Waiting for worker output...",
    attemptCountOne: "{count} attempt",
    attemptCountOther: "{count} attempts",
    noteCountOne: "{count} note",
    noteCountOther: "{count} notes",
    snapshotCountOne: "{count} snapshot",
    snapshotCountOther: "{count} snapshots",
    regenerationCountOne: "{count} regeneration",
    regenerationCountOther: "{count} regenerations",
    versionSummary: "Version {version}",
    notesSummary: "Notes: {notes}",
    unknownSource: "unknown source",
    unknownTarget: "unknown target",
    mergeStatusSucceeded: "Succeeded",
    mergeStatusConflict: "Conflict",
    mergeStatusAborted: "Aborted",
    mergeStatusPending: "Pending",
    mergeOperationMerge: "Merge",
    mergeOperationRebase: "Rebase",
    mergeNone: "None",
    resultCommitSummary: "Result commit {sha}.",
    mergeFinishedSummary: "{operation} finished with {status}.",
    rebaseSucceededSummary: "Rebase succeeded for {name}. Merge will retry automatically.",
    mergeSucceededSummary: "Merged {name} into the task base branch.",
    reviewAcceptedSummary: "Final review accepted this subtask for the merge set.",
    reviewReworkSummary: "Final review requires another worker pass before this subtask can merge.",
    reviewDiscardSummary: "Final review marked this subtask for discard. Confirm before the task can continue.",
    reviewPendingSummary: "Incremental review will appear after a successful worker run.",
    reviewUnavailableSummary: "No review summary available.",
    mailboxSenderSubtask: "Subtask",
    mailboxSenderSystem: "System",
    mailboxSenderLead: "Lead",
    mailboxLeadTarget: "Lead",
    assignmentOperator: "Operator assigned",
    assignmentLead: "Lead assigned",
    logPending: "log pending",
    logPathLabel: "log {path}",
    errorMetaLabel: "error: {error}",
    unknownTime: "Unknown time",
    snapshotSourceRestored: "Restored",
    snapshotSourceApproved: "Approved",
    snapshotSourceLeadGenerated: "Lead generated",
    snapshotVersionLabel: "Version {version} · {source}",
  },
};

const PLAN_TEMPLATE_COPY = {
  "full-stack-web-app": {
    "zh-CN": {
      description: "适合带认证、数据库、前端和测试协作的全栈需求。",
      title: "全栈 Web 应用",
    },
    en: {
      description: "Best for full-stack tasks with auth, data, frontend, and end-to-end validation.",
      title: "Full-stack web app",
    },
  },
  "backend-api-service": {
    "zh-CN": {
      description: "面向 API、数据库和服务测试的后端任务骨架。",
      title: "后端 API 服务",
    },
    en: {
      description: "A backend service skeleton for API, database, and service validation work.",
      title: "Backend API service",
    },
  },
  "frontend-feature": {
    "zh-CN": {
      description: "适合前端功能、集成接线与体验验收。",
      title: "前端功能开发",
    },
    en: {
      description: "Suited to frontend feature delivery, integration, and UX validation.",
      title: "Frontend feature",
    },
  },
};

const state = {
  agentHealth: {},
  agents: [],
  executionDrafts: new Map(),
  healthCheckedAt: null,
  leadCandidates: [],
  locale: normalizeLocale(readStorage(STORAGE_KEYS.locale)),
  liveSessionOutputs: new Map(),
  planTemplates: [],
  projectDetail: null,
  projects: [],
  selectedBaseBranch: null,
  selectedExecutionSessionId: null,
  selectedExecutionSubTaskId: null,
  selectedLeadAgentName: null,
  selectedProjectId: readStorage(STORAGE_KEYS.selectedProjectId),
  selectedTaskId: readStorage(STORAGE_KEYS.selectedTaskId),
  systemDockerHealth: null,
  systemSandboxPolicy: null,
  taskDetail: null,
  taskPlanDraft: null,
  taskPlanDraftState: null,
  taskPlanNotice: null,
  taskPlanView: "graph",
  tasks: [],
  taskStream: null,
  workerCandidates: [],
};

const elements = {
  agentCount: document.querySelector("#agent-count"),
  agentHealthCheckedAt: document.querySelector("#agent-health-checked-at"),
  agentRuntimeSummary: document.querySelector("#agent-runtime-summary"),
  agentHealthEmpty: document.querySelector("#agent-health-empty"),
  agentHealthFeedback: document.querySelector("#agent-health-feedback"),
  agentHealthList: document.querySelector("#agent-health-list"),
  dockerHealthBadge: document.querySelector("#docker-health-badge"),
  dockerHealthReason: document.querySelector("#docker-health-reason"),
  baseBranchSelect: document.querySelector("#base-branch-select"),
  cleanlinessBadge: document.querySelector("#cleanliness-badge"),
  confirmRequirementsButton: document.querySelector("#confirm-requirements-button"),
  createTaskButton: document.querySelector("#create-task-button"),
  currentBranch: document.querySelector("#current-branch"),
  defaultBranch: document.querySelector("#default-branch"),
  dirtyWarningBanner: document.querySelector("#dirty-warning-banner"),
  healthyLeadCount: document.querySelector("#healthy-lead-count"),
  healthyWorkerCount: document.querySelector("#healthy-worker-count"),
  languageToggle: document.querySelector("#language-toggle"),
  leadAgentFeedback: document.querySelector("#lead-agent-feedback"),
  leadAgentSelect: document.querySelector("#lead-agent-select"),
  projectDetail: document.querySelector("#project-detail"),
  projectDetailEmpty: document.querySelector("#project-detail-empty"),
  projectDetailFeedback: document.querySelector("#project-detail-feedback"),
  projectList: document.querySelector("#project-list"),
  projectListEmpty: document.querySelector("#project-list-empty"),
  projectListFeedback: document.querySelector("#project-list-feedback"),
  projectName: document.querySelector("#project-name"),
  projectPath: document.querySelector("#project-path"),
  projectRegistrationForm: document.querySelector("#project-registration-form"),
  projectPathInput: document.querySelector("#project-path-input"),
  recentBranches: document.querySelector("#recent-branches"),
  refreshAgentHealthButton: document.querySelector("#refresh-agent-health-button"),
  refreshProjectDetailButton: document.querySelector("#refresh-project-detail-button"),
  refreshProjectsButton: document.querySelector("#refresh-projects-button"),
  refreshTaskDetailButton: document.querySelector("#refresh-task-detail-button"),
  refreshTasksButton: document.querySelector("#refresh-tasks-button"),
  registerProjectButton: document.querySelector("#register-project-button"),
  registeredName: document.querySelector("#registered-name"),
  registeredPath: document.querySelector("#registered-path"),
  registrationFeedback: document.querySelector("#registration-feedback"),
  sendTaskMessageButton: document.querySelector("#send-task-message-button"),
  startClarificationButton: document.querySelector("#start-clarification-button"),
  taskAttachmentFeedback: document.querySelector("#task-attachment-feedback"),
  taskAttachmentList: document.querySelector("#task-attachment-list"),
  taskAttachmentsEmpty: document.querySelector("#task-attachments-empty"),
  taskAttachmentsList: document.querySelector("#task-attachments-list"),
  taskBaseBranchBadge: document.querySelector("#task-base-branch-badge"),
  taskBaseCommit: document.querySelector("#task-base-commit"),
  taskCleanupWarningList: document.querySelector("#task-cleanup-warning-list"),
  taskCleanupWarningSummary: document.querySelector("#task-cleanup-warning-summary"),
  taskCleanupWarnings: document.querySelector("#task-cleanup-warnings"),
  taskCreationForm: document.querySelector("#task-creation-form"),
  taskDescriptionInput: document.querySelector("#task-description-input"),
  taskDetail: document.querySelector("#task-detail"),
  taskDetailDescription: document.querySelector("#task-detail-description"),
  taskDetailEmpty: document.querySelector("#task-detail-empty"),
  taskDetailFeedback: document.querySelector("#task-detail-feedback"),
  taskDetailTitle: document.querySelector("#task-detail-title"),
  taskExecutionBoard: document.querySelector("#task-execution-board"),
  taskExecutionEmpty: document.querySelector("#task-execution-empty"),
  taskExecutionFocus: document.querySelector("#task-execution-focus"),
  taskExecutionFocusBadge: document.querySelector("#task-execution-focus-badge"),
  taskExecutionFocusEmpty: document.querySelector("#task-execution-focus-empty"),
  taskExecutionFocusMeta: document.querySelector("#task-execution-focus-meta"),
  taskExecutionFocusPreview: document.querySelector("#task-execution-focus-preview"),
  taskExecutionAgentField: document.querySelector("#task-execution-agent-field"),
  taskExecutionAgentSelect: document.querySelector("#task-execution-agent-select"),
  taskExecutionChangeAgentButton: document.querySelector("#task-execution-change-agent-button"),
  taskExecutionCancelButton: document.querySelector("#task-execution-cancel-button"),
  taskExecutionConfirmDiscardButton: document.querySelector("#task-execution-confirm-discard-button"),
  taskExecutionReworkButton: document.querySelector("#task-execution-rework-button"),
  taskExecutionRebaseRetryButton: document.querySelector("#task-execution-rebase-retry-button"),
  taskExecutionReassignButton: document.querySelector("#task-execution-reassign-button"),
  taskExecutionReworkDescription: document.querySelector("#task-execution-rework-description"),
  taskExecutionReworkField: document.querySelector("#task-execution-rework-field"),
  taskExecutionResumeMergeButton: document.querySelector("#task-execution-resume-merge-button"),
  taskExecutionMergeHistory: document.querySelector("#task-execution-merge-history"),
  taskExecutionMergeHistoryCount: document.querySelector("#task-execution-merge-history-count"),
  taskExecutionMergeHistoryEmpty: document.querySelector("#task-execution-merge-history-empty"),
  taskExecutionMergeHistoryList: document.querySelector("#task-execution-merge-history-list"),
  taskExecutionMailbox: document.querySelector("#task-execution-mailbox"),
  taskExecutionMailboxCount: document.querySelector("#task-execution-mailbox-count"),
  taskExecutionMailboxEmpty: document.querySelector("#task-execution-mailbox-empty"),
  taskExecutionMailboxFeedback: document.querySelector("#task-execution-mailbox-feedback"),
  taskExecutionMailboxForm: document.querySelector("#task-execution-mailbox-form"),
  taskExecutionMailboxInput: document.querySelector("#task-execution-mailbox-input"),
  taskExecutionMailboxList: document.querySelector("#task-execution-mailbox-list"),
  taskExecutionMailboxSendButton: document.querySelector("#task-execution-mailbox-send-button"),
  taskExecutionReviewActions: document.querySelector("#task-execution-review-actions"),
  taskExecutionReview: document.querySelector("#task-execution-review"),
  taskExecutionReviewDecision: document.querySelector("#task-execution-review-decision"),
  taskExecutionReviewFeedback: document.querySelector("#task-execution-review-feedback"),
  taskExecutionReviewPhase: document.querySelector("#task-execution-review-phase"),
  taskExecutionReviewSummary: document.querySelector("#task-execution-review-summary"),
  taskExecutionFocusTitle: document.querySelector("#task-execution-focus-title"),
  taskExecutionSessionList: document.querySelector("#task-execution-session-list"),
  taskExecutionList: document.querySelector("#task-execution-list"),
  taskTeamEmpty: document.querySelector("#task-team-empty"),
  taskTeamLeadMeta: document.querySelector("#task-team-lead-meta"),
  taskTeamLeadStatus: document.querySelector("#task-team-lead-status"),
  taskTeamLeadSummary: document.querySelector("#task-team-lead-summary"),
  taskTeamMemberCount: document.querySelector("#task-team-member-count"),
  taskTeamMemberList: document.querySelector("#task-team-member-list"),
  taskTeamShell: document.querySelector("#task-team-shell"),
  taskFormFeedback: document.querySelector("#task-form-feedback"),
  taskLeadAgent: document.querySelector("#task-lead-agent"),
  taskList: document.querySelector("#task-list"),
  taskListEmpty: document.querySelector("#task-list-empty"),
  taskListFeedback: document.querySelector("#task-list-feedback"),
  taskMessageCount: document.querySelector("#task-message-count"),
  taskMessageForm: document.querySelector("#task-message-form"),
  taskMessageInput: document.querySelector("#task-message-input"),
  taskPlanDetail: document.querySelector("#task-plan-detail"),
  taskPlanEditor: document.querySelector("#task-plan-editor"),
  taskPlanGraph: document.querySelector("#task-plan-graph"),
  taskPlanHistory: document.querySelector("#task-plan-history"),
  taskPlanHistoryEmpty: document.querySelector("#task-plan-history-empty"),
  taskPlanHistoryList: document.querySelector("#task-plan-history-list"),
  taskPlanApproveButton: document.querySelector("#task-plan-approve-button"),
  taskPlanEmpty: document.querySelector("#task-plan-empty"),
  taskPlanFeedback: document.querySelector("#task-plan-feedback"),
  taskPlanAddSubtaskButton: document.querySelector("#task-plan-add-subtask-button"),
  taskPlanApplyTemplateButton: document.querySelector("#task-plan-apply-template-button"),
  taskPlanGraphViewButton: document.querySelector("#task-plan-graph-view-button"),
  taskPlanList: document.querySelector("#task-plan-list"),
  taskPlanListViewButton: document.querySelector("#task-plan-list-view-button"),
  taskPlanNotesInput: document.querySelector("#task-plan-notes-input"),
  taskPlanResetDraftButton: document.querySelector("#task-plan-reset-draft-button"),
  taskPlanSaveDraftButton: document.querySelector("#task-plan-save-draft-button"),
  taskPlanSnapshotCount: document.querySelector("#task-plan-snapshot-count"),
  taskPlanSummary: document.querySelector("#task-plan-summary"),
  taskPlanTemplateSelect: document.querySelector("#task-plan-template-select"),
  taskPlanVersion: document.querySelector("#task-plan-version"),
  taskSessionStatus: document.querySelector("#task-session-status"),
  taskStatusBadge: document.querySelector("#task-status-badge"),
  taskTitleInput: document.querySelector("#task-title-input"),
  taskTranscript: document.querySelector("#task-transcript"),
  taskTranscriptEmpty: document.querySelector("#task-transcript-empty"),
  taskAttachmentsInput: document.querySelector("#task-attachments-input"),
};

setLocale(state.locale);

elements.projectRegistrationForm.addEventListener("submit", onRegisterProject);
elements.refreshProjectsButton.addEventListener("click", () => {
  void loadProjects({ preserveSelection: true });
});
elements.refreshProjectDetailButton.addEventListener("click", () => {
  if (state.selectedProjectId) {
    void selectProject(state.selectedProjectId, { preserveTask: true });
  }
});
elements.refreshAgentHealthButton.addEventListener("click", () => {
  void loadAgents({ force: true });
});
elements.languageToggle?.addEventListener("click", onToggleLanguage);
elements.leadAgentSelect.addEventListener("change", (event) => {
  state.selectedLeadAgentName = event.target.value || null;
  renderLeadSelector();
});
elements.baseBranchSelect.addEventListener("change", (event) => {
  state.selectedBaseBranch = event.target.value || null;
});
elements.taskAttachmentsInput.addEventListener("change", renderDraftAttachments);
elements.taskCreationForm.addEventListener("submit", onCreateTask);
elements.refreshTasksButton.addEventListener("click", () => {
  if (state.selectedProjectId) {
    void loadProjectTasks(state.selectedProjectId, { preserveSelection: true });
  }
});
elements.refreshTaskDetailButton.addEventListener("click", () => {
  if (state.selectedTaskId) {
    void loadTaskDetail(state.selectedTaskId);
  }
});
elements.startClarificationButton.addEventListener("click", onStartClarification);
elements.confirmRequirementsButton.addEventListener("click", onConfirmRequirements);
elements.taskMessageForm.addEventListener("submit", onSendTaskMessage);
elements.taskPlanAddSubtaskButton.addEventListener("click", onAddPlanSubtask);
elements.taskPlanApplyTemplateButton.addEventListener("click", onApplyPlanTemplate);
elements.taskPlanApproveButton.addEventListener("click", onApprovePlanDraft);
elements.taskPlanGraphViewButton.addEventListener("click", () => onSetPlanView("graph"));
elements.taskPlanListViewButton.addEventListener("click", () => onSetPlanView("list"));
elements.taskPlanResetDraftButton.addEventListener("click", onResetPlanDraft);
elements.taskPlanSaveDraftButton.addEventListener("click", onSavePlanDraft);
elements.taskPlanNotesInput.addEventListener("input", onPlanNotesInput);
elements.taskExecutionAgentSelect.addEventListener("change", onExecutionDraftAgentInput);
elements.taskExecutionChangeAgentButton.addEventListener("click", onChangeSubTaskAgent);
elements.taskExecutionCancelButton.addEventListener("click", onCancelSubTask);
elements.taskExecutionConfirmDiscardButton.addEventListener("click", onConfirmDiscardSubTask);
elements.taskExecutionRebaseRetryButton.addEventListener("click", onRebaseRetrySubTask);
elements.taskExecutionReassignButton.addEventListener("click", onReassignSubTask);
elements.taskExecutionReworkButton.addEventListener("click", onReworkSubTask);
elements.taskExecutionResumeMergeButton.addEventListener("click", onResumeTaskMerge);
elements.taskExecutionReworkDescription.addEventListener("input", onExecutionDraftDescriptionInput);
elements.taskExecutionMailboxForm.addEventListener("submit", onSendMailboxMessage);

renderLocale();
void Promise.all([loadProjects({ preserveSelection: true }), loadAgents(), loadTaskTemplates()]);

async function onRegisterProject(event) {
  event.preventDefault();
  clearFeedback(elements.registrationFeedback);
  setButtonBusy(elements.registerProjectButton, true, t("registering"));

  try {
    const response = await fetchJson("/api/projects", {
      body: { path: elements.projectPathInput.value.trim() },
      method: "POST",
    });

    showFeedback(
      elements.registrationFeedback,
      "success",
      t("projectRegistered", { name: response.project.name }),
    );

    elements.projectRegistrationForm.reset();
    await loadProjects({ selectedProjectId: response.project.id });
  } catch (error) {
    showFeedback(elements.registrationFeedback, "error", buildProjectErrorMessage(error));
  } finally {
    setButtonBusy(elements.registerProjectButton, false, t("registerProjectButton"));
  }
}

async function onCreateTask(event) {
  event.preventDefault();
  clearFeedback(elements.taskFormFeedback);
  clearFeedback(elements.taskAttachmentFeedback);
  setButtonBusy(elements.createTaskButton, true, t("creating"));

  try {
    const attachments = await readDraftAttachments();

    const response = await fetchJson("/api/tasks", {
      body: {
        attachments,
        baseBranch: state.selectedBaseBranch,
        description: elements.taskDescriptionInput.value.trim(),
        leadAgentType: state.selectedLeadAgentName,
        projectId: state.selectedProjectId,
        title: elements.taskTitleInput.value.trim(),
      },
      method: "POST",
    });

    showFeedback(
      elements.taskFormFeedback,
      "success",
      t("taskCreated", { title: response.task.title }),
    );

    elements.taskCreationForm.reset();
    elements.taskAttachmentList.replaceChildren();
    state.selectedTaskId = response.task.id;
    writeStorage(STORAGE_KEYS.selectedTaskId, response.task.id);
    await loadProjectTasks(state.selectedProjectId, { selectedTaskId: response.task.id });
    await loadTaskDetail(response.task.id);
  } catch (error) {
    const message = buildTaskErrorMessage(error);
    const feedbackTarget = String(error?.code ?? "").startsWith("ATTACHMENT_")
      ? elements.taskAttachmentFeedback
      : elements.taskFormFeedback;

    showFeedback(feedbackTarget, "error", message);
  } finally {
    setButtonBusy(elements.createTaskButton, false, t("createTaskButton"));
  }
}

async function onStartClarification() {
  if (!state.selectedTaskId) {
    return;
  }

  clearFeedback(elements.taskDetailFeedback);
  setButtonBusy(elements.startClarificationButton, true, t("starting"));

  try {
    connectTaskStream(state.selectedTaskId);
    const response = await fetchJson(`/api/tasks/${encodeURIComponent(state.selectedTaskId)}/start-clarification`, {
      method: "POST",
    });
    state.taskDetail = {
      ...state.taskDetail,
      sessions: [response.session],
      task: response.task,
    };
    renderTaskDetail();
  } catch (error) {
    showFeedback(elements.taskDetailFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.startClarificationButton, false, t("startClarificationButton"));
  }
}

async function onSendTaskMessage(event) {
  event.preventDefault();

  if (!state.selectedTaskId) {
    return;
  }

  clearFeedback(elements.taskDetailFeedback);
  setButtonBusy(elements.sendTaskMessageButton, true, t("sending"));

  try {
    await fetchJson(`/api/tasks/${encodeURIComponent(state.selectedTaskId)}/messages`, {
      body: { content: elements.taskMessageInput.value.trim() },
      method: "POST",
    });
    elements.taskMessageInput.value = "";
    await loadTaskDetail(state.selectedTaskId, { preserveStream: true });
  } catch (error) {
    showFeedback(elements.taskDetailFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.sendTaskMessageButton, false, t("sendMessageButton"));
  }
}

async function onConfirmRequirements() {
  if (!state.selectedTaskId) {
    return;
  }

  clearFeedback(elements.taskDetailFeedback);
  setButtonBusy(elements.confirmRequirementsButton, true, t("confirming"));

  try {
    const response = await fetchJson(
      `/api/tasks/${encodeURIComponent(state.selectedTaskId)}/confirm-requirements`,
      { method: "POST" },
    );
    state.taskDetail = {
      ...state.taskDetail,
      task: response.task,
    };
    await loadTaskDetail(state.selectedTaskId, { preserveStream: true });
  } catch (error) {
    showFeedback(elements.taskDetailFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.confirmRequirementsButton, false, t("confirmRequirementsButton"));
  }
}

async function loadProjects(options = {}) {
  clearFeedback(elements.projectListFeedback);
  setButtonBusy(elements.refreshProjectsButton, true, t("refreshing"));

  try {
    const response = await fetchJson("/api/projects");
    state.projects = response.projects ?? [];

    const nextProjectId = options.selectedProjectId
      ?? (options.preserveSelection ? state.selectedProjectId : null)
      ?? state.projects[0]?.id
      ?? null;

    renderProjectList();

    if (nextProjectId) {
      await selectProject(nextProjectId, { preserveTask: options.preserveSelection });
    } else {
      state.selectedProjectId = null;
      writeStorage(STORAGE_KEYS.selectedProjectId, "");
      clearProjectDetail();
      clearTaskList();
      clearTaskDetail();
    }
  } catch (error) {
    state.projects = [];
    renderProjectList();
    clearProjectDetail();
    clearTaskList();
    clearTaskDetail();
    showFeedback(elements.projectListFeedback, "error", buildProjectErrorMessage(error));
  } finally {
    setButtonBusy(elements.refreshProjectsButton, false, t("refreshListButton"));
  }
}

async function selectProject(projectId, options = {}) {
  state.selectedProjectId = projectId;
  writeStorage(STORAGE_KEYS.selectedProjectId, projectId);
  renderProjectList();
  await loadProjectDetail(projectId);
  await loadProjectTasks(projectId, {
    selectedTaskId: options.preserveTask ? state.selectedTaskId : null,
    preserveSelection: options.preserveTask,
  });
}

async function loadProjectDetail(projectId) {
  clearFeedback(elements.projectDetailFeedback);
  setButtonBusy(elements.refreshProjectDetailButton, true, t("refreshing"));

  try {
    const response = await fetchJson(`/api/projects/${encodeURIComponent(projectId)}`);
    state.projectDetail = response;
    syncBranchChoices();
    renderProjectDetail();
  } catch (error) {
    state.projectDetail = null;
    clearProjectDetail();
    showFeedback(elements.projectDetailFeedback, "error", buildProjectErrorMessage(error));
  } finally {
    setButtonBusy(elements.refreshProjectDetailButton, false, t("refreshStatusButton"));
  }
}

async function loadProjectTasks(projectId, options = {}) {
  clearFeedback(elements.taskListFeedback);
  setButtonBusy(elements.refreshTasksButton, true, t("refreshing"));

  try {
    const response = await fetchJson(`/api/projects/${encodeURIComponent(projectId)}/tasks`);
    state.tasks = response.tasks ?? [];

    const nextTaskId = options.selectedTaskId
      ?? (options.preserveSelection ? state.selectedTaskId : null)
      ?? state.tasks[0]?.id
      ?? null;

    renderTaskList();

    if (nextTaskId) {
      await loadTaskDetail(nextTaskId);
    } else {
      clearTaskDetail();
    }
  } catch (error) {
    state.tasks = [];
    renderTaskList();
    clearTaskDetail();
    showFeedback(elements.taskListFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.refreshTasksButton, false, t("refreshTasksButton"));
  }
}

async function loadTaskDetail(taskId, options = {}) {
  if (!taskId) {
    clearTaskDetail();
    return;
  }

  clearFeedback(elements.taskDetailFeedback);
  setButtonBusy(elements.refreshTaskDetailButton, true, t("refreshing"));

  try {
    const response = await fetchJson(`/api/tasks/${encodeURIComponent(taskId)}`);
    state.selectedTaskId = taskId;
    state.taskDetail = response;
    hydrateExecutionState(response);
    writeStorage(STORAGE_KEYS.selectedTaskId, taskId);
    renderTaskList();
    renderTaskDetail();

    if (options.preserveStream !== true) {
      connectTaskStream(taskId);
    }
  } catch (error) {
    clearTaskDetail();
    showFeedback(elements.taskDetailFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.refreshTaskDetailButton, false, t("refreshTaskButton"));
  }
}

async function loadAgents(options = {}) {
  clearFeedback(elements.agentHealthFeedback);
  setButtonBusy(elements.refreshAgentHealthButton, true, t("refreshing"));

  try {
    const refreshSuffix = options.force ? "?refresh=1" : "";
    const [directory, health, dockerHealth, sandboxPolicy] = await Promise.all([
      fetchJson(`/api/agents${refreshSuffix}`),
      fetchJson(`/api/agents/health${refreshSuffix}`),
      fetchJson("/api/system/docker-health"),
      fetchJson("/api/system/sandbox-policy"),
    ]);

    state.agents = directory.agents ?? [];
    state.agentHealth = health.agents ?? {};
    state.healthCheckedAt = health.checkedAt ?? null;
    state.leadCandidates = health.leadCandidates ?? [];
    state.systemDockerHealth = dockerHealth;
    state.systemSandboxPolicy = sandboxPolicy.policy ?? null;
    state.workerCandidates = health.workerCandidates ?? [];

    if (!state.leadCandidates.some((candidate) => candidate.agentName === state.selectedLeadAgentName)) {
      state.selectedLeadAgentName = state.leadCandidates[0]?.agentName ?? null;
    }

    renderAgentHealth();
    renderLeadSelector();
  } catch (error) {
    state.agents = [];
    state.agentHealth = {};
    state.leadCandidates = [];
    state.systemDockerHealth = null;
    state.systemSandboxPolicy = null;
    state.workerCandidates = [];
    state.selectedLeadAgentName = null;
    renderAgentHealth();
    renderLeadSelector();
    showFeedback(elements.agentHealthFeedback, "error", buildAgentErrorMessage(error));
  } finally {
    setButtonBusy(elements.refreshAgentHealthButton, false, t("refreshHealthButton"));
  }
}

async function loadTaskTemplates() {
  try {
    const response = await fetchJson("/api/task-templates");
    state.planTemplates = response.templates ?? [];

    if (state.taskDetail) {
      renderTaskDetail();
    }
  } catch {
    state.planTemplates = [];
  }
}

function renderProjectList() {
  elements.projectList.replaceChildren();
  elements.projectListEmpty.hidden = state.projects.length > 0;

  for (const project of state.projects) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "project-list__item";
    button.dataset.projectId = project.id;

    if (project.id === state.selectedProjectId) {
      button.classList.add("is-selected");
    }

    button.innerHTML = `
      <div class="project-list__topline">
        <p class="project-list__title">${escapeHtml(project.name)}</p>
        <span class="badge badge--clean">${escapeHtml(project.defaultBranch ?? t("unknown"))}</span>
      </div>
      <p class="project-list__meta"><strong>${escapeHtml(t("pathMetaLabel"))}:</strong> <span class="project-list__path">${escapeHtml(project.path)}</span></p>
    `;

    button.addEventListener("click", () => {
      void selectProject(project.id);
    });

    elements.projectList.append(button);
  }
}

function renderProjectDetail() {
  const detail = state.projectDetail;

  if (!detail?.project || !detail.repoStatus) {
    clearProjectDetail();
    return;
  }

  const { project, repoStatus } = detail;
  elements.projectDetail.hidden = false;
  elements.projectDetailEmpty.hidden = true;
  elements.projectName.textContent = project.name;
  elements.projectPath.textContent = project.path;
  elements.registeredName.textContent = project.name;
  elements.registeredPath.textContent = project.path;
  elements.defaultBranch.textContent = repoStatus.defaultBranch ?? t("unknown");
  elements.currentBranch.textContent = repoStatus.currentBranch ?? t("detachedHead");
  elements.cleanlinessBadge.textContent = buildCleanlinessLabel(repoStatus.isDirty);
  elements.cleanlinessBadge.className = `badge ${repoStatus.isDirty ? "badge--dirty" : "badge--clean"}`;
  elements.dirtyWarningBanner.hidden = !repoStatus.isDirty;

  const branches = buildBranchList(repoStatus.recentBranches);
  elements.recentBranches.replaceChildren(...branches.map((branchName) => {
    const item = document.createElement("span");
    item.className = "branches-list__item";
    item.textContent = branchName;
    return item;
  }));
}

function renderAgentHealth() {
  elements.agentHealthList.replaceChildren();
  elements.agentCount.textContent = String(state.agents.length);
  elements.healthyLeadCount.textContent = String(state.leadCandidates.filter((candidate) => candidate.selectable).length);
  elements.healthyWorkerCount.textContent = String(state.workerCandidates.filter((candidate) => candidate.selectable).length);
  elements.agentRuntimeSummary.textContent = state.systemSandboxPolicy?.defaultWorkerImage
    ? `${state.systemSandboxPolicy.defaultSandboxType} · ${state.systemSandboxPolicy.defaultWorkerImage}`
    : t("notConfigured");
  elements.agentHealthCheckedAt.textContent = state.healthCheckedAt
    ? new Date(state.healthCheckedAt).toLocaleString(state.locale)
    : t("notYetChecked");
  elements.dockerHealthBadge.textContent = buildDockerHealthLabel(state.systemDockerHealth);
  elements.dockerHealthBadge.className = `badge ${state.systemDockerHealth?.available ? "badge--clean" : "badge--dirty"}`;
  elements.dockerHealthReason.textContent = state.systemDockerHealth?.reason
    ?? t("dockerReadyReason");
  elements.agentHealthEmpty.hidden = state.agents.length > 0;

  for (const agent of state.agents) {
    const snapshot = state.agentHealth[agent.name];
    const capabilityBadges = [
      agent.roles.leadCandidate ? t("capabilityLead") : null,
      agent.roles.workerCandidate ? t("capabilityWorker") : null,
      agent.capabilities.supportsVision ? t("capabilityVision") : t("capabilityNoVision"),
      agent.capabilities.supportsInteractiveInput ? t("capabilityInteractive") : t("capabilityOneShot"),
      ...(agent.capabilities.supportedSandboxTypes ?? []).map((sandboxType) => t("sandboxCapability", { type: sandboxType })),
    ].filter(Boolean);
    const article = document.createElement("article");
    article.className = "agent-card";

    article.innerHTML = `
      <div class="agent-card__topline">
        <div>
          <p class="agent-card__title">${escapeHtml(agent.name)}</p>
          <p class="agent-card__description">${escapeHtml(agent.capabilities.description)}</p>
        </div>
        <span class="badge ${snapshot?.available ? "badge--clean" : "badge--dirty"}">${escapeHtml(buildAgentStatusLabel(snapshot))}</span>
      </div>
      <p class="agent-card__meta"><strong>${escapeHtml(t("runtimeLabel"))}:</strong> ${escapeHtml(buildAgentRuntimeModeLabel(agent, snapshot))}</p>
      <p class="agent-card__meta"><strong>${escapeHtml(t("capabilitiesLabel"))}:</strong> ${escapeHtml(capabilityBadges.join(" · "))}</p>
      <p class="agent-card__meta"><strong>${escapeHtml(t("failureReasonLabel"))}:</strong> ${escapeHtml(snapshot?.failureReason?.message ?? t("none"))}</p>
    `;

    elements.agentHealthList.append(article);
  }
}

function renderLeadSelector() {
  elements.leadAgentSelect.replaceChildren();

  if (state.leadCandidates.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("noLeadAgentsAvailableOption");
    elements.leadAgentSelect.append(option);
    elements.leadAgentSelect.disabled = true;
    elements.createTaskButton.disabled = true;
    showFeedback(elements.leadAgentFeedback, "error", translate("noLeadCandidates"));
    return;
  }

  for (const candidate of state.leadCandidates) {
    const option = document.createElement("option");
    option.value = candidate.agentName;
    option.selected = candidate.agentName === state.selectedLeadAgentName;
    option.textContent = candidate.selectable
      ? candidate.agentName
      : `${candidate.agentName} (${translate("unavailable")})`;
    elements.leadAgentSelect.append(option);
  }

  const selectedCandidate = state.leadCandidates.find((candidate) => candidate.agentName === state.selectedLeadAgentName) ?? null;
  const gate = buildLeadSelectionState(selectedCandidate);

  elements.leadAgentSelect.disabled = false;
  elements.createTaskButton.disabled = gate.disabled || !state.selectedProjectId;
  showFeedback(elements.leadAgentFeedback, gate.tone, gate.message);
}

function renderDraftAttachments() {
  elements.taskAttachmentList.replaceChildren();
  clearFeedback(elements.taskAttachmentFeedback);

  const files = [...elements.taskAttachmentsInput.files];

  if (files.length === 0) {
    return;
  }

  const invalidFile = files.find((file) => !inferAttachmentType(file.name, file.type));

  if (invalidFile) {
    showFeedback(
      elements.taskAttachmentFeedback,
      "error",
      t("unsupportedAttachmentNamed", { name: invalidFile.name }),
    );
  }

  for (const file of files) {
    const item = document.createElement("li");
    item.className = "attachment-list__item";
    item.innerHTML = `
      <span class="attachment-list__name">${escapeHtml(file.name)}</span>
      <span class="attachment-list__meta">${escapeHtml(buildAttachmentCaption({
        fileType: inferAttachmentType(file.name, file.type) ?? "UNSUPPORTED",
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      }))}</span>
    `;
    elements.taskAttachmentList.append(item);
  }
}

function renderTaskList() {
  elements.taskList.replaceChildren();
  elements.taskListEmpty.hidden = state.tasks.length > 0;

  for (const task of state.tasks) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "task-list__item";

    if (task.id === state.selectedTaskId) {
      button.classList.add("is-selected");
    }

    button.innerHTML = `
      <div class="task-list__topline">
        <p class="task-list__title">${escapeHtml(task.title)}</p>
        <span class="badge ${task.status === "CLARIFYING" ? "badge--accent-soft" : task.status === "PLANNING" ? "badge--clean" : "badge--outline"}">${escapeHtml(buildTaskStatusLabel(task.status))}</span>
      </div>
      <p class="task-list__meta"><strong>${escapeHtml(t("baseBranchMetaLabel"))}:</strong> ${escapeHtml(task.baseBranch)}</p>
    `;
    button.addEventListener("click", () => {
      void loadTaskDetail(task.id);
    });
    elements.taskList.append(button);
  }
}

function renderTaskDetail() {
  const detail = state.taskDetail;

  if (!detail?.task) {
    clearTaskDetail();
    return;
  }

  const latestSession = detail.sessions?.at(-1) ?? null;
  elements.taskDetail.hidden = false;
  elements.taskDetailEmpty.hidden = true;
  elements.taskDetailTitle.textContent = detail.task.title;
  elements.taskDetailDescription.textContent = detail.task.description;
  elements.taskStatusBadge.textContent = buildTaskStatusLabel(detail.task.status);
  elements.taskStatusBadge.className = `badge ${detail.task.status === "CLARIFYING" ? "badge--accent-soft" : detail.task.status === "PLANNING" ? "badge--clean" : detail.task.status === "ACTION_REQUIRED" ? "badge--dirty" : "badge--outline"}`;
  elements.taskBaseBranchBadge.textContent = detail.task.baseBranch;
  elements.taskLeadAgent.textContent = detail.task.leadAgentType;
  elements.taskBaseCommit.textContent = detail.task.baseCommitSha;
  elements.taskSessionStatus.textContent = latestSession
    ? `${translateSessionType(latestSession.sessionType)} · ${translateStatusLabel(latestSession.status)}`
    : t("latestSessionNone");
  elements.taskMessageCount.textContent = String(detail.messages?.length ?? 0);
  elements.taskPlanVersion.textContent = String(detail.task.planVersion ?? 0);
  elements.taskPlanSnapshotCount.textContent = String(detail.planSnapshots?.length ?? 0);

  syncEditablePlanDraft(detail);
  renderCleanupWarnings(detail.cleanupWarnings ?? []);
  renderTeamView(detail);
  renderTaskAttachments(detail.attachments ?? []);
  renderPlanDraft(detail);
  renderSubTaskExecution(detail);
  renderTranscript(detail.messages ?? []);

  const canStartClarification = detail.task.status === "DRAFT";
  const canConfirmRequirements = detail.task.status === "CLARIFYING";

  elements.startClarificationButton.hidden = !canStartClarification;
  elements.confirmRequirementsButton.hidden = !canConfirmRequirements;
  elements.taskMessageForm.hidden = !canConfirmRequirements;
}

function renderTeamView(detail) {
  const leadSessions = (detail.sessions ?? []).filter((session) => session.sessionType === "LEAD");
  const latestLeadSession = leadSessions.at(-1) ?? null;
  const lead = {
    ...(detail.team?.lead ?? {}),
    agentType: detail.team?.lead?.agentType ?? detail.task.leadAgentType,
    sessionId: latestLeadSession?.id ?? detail.team?.lead?.sessionId ?? null,
    status: latestLeadSession?.status ?? detail.team?.lead?.status ?? "PENDING",
  };
  const members = (detail.subTasks ?? []).map((subTask, index) => {
    const latestWorkerSession = (detail.sessions ?? [])
      .filter((session) => session.sessionType === "WORKER" && session.subTaskId === subTask.id)
      .at(-1) ?? null;

    return {
      ...subTask,
      assignmentSource: subTask.assignmentSource ?? (subTask.autoAssigned ? "LEAD" : "OPERATOR"),
      displayName: subTask.displayName ?? subTask.title,
      executionOrder: subTask.executionOrder ?? index + 1,
      latestSessionStatus: latestWorkerSession?.status ?? null,
      role: subTask.role ?? subTask.branchSuffix ?? t("capabilityWorker").toLowerCase(),
      runSummary: subTask.runSummary ?? t("waitingTeamLifecycle"),
      subtaskId: subTask.id,
    };
  });

  elements.taskTeamMemberList.replaceChildren();
  elements.taskTeamMemberCount.textContent = countLabel(members.length, "teamMemberCountOne", "teamMemberCountOther");
  elements.taskTeamEmpty.hidden = members.length > 0;
  elements.taskTeamShell.hidden = members.length === 0;

  if (!lead) {
    elements.taskTeamLeadStatus.textContent = t("leadSessionPending");
    elements.taskTeamLeadStatus.className = "badge badge--outline";
    elements.taskTeamLeadMeta.textContent = t("leadSessionNotStarted");
    elements.taskTeamLeadSummary.textContent = t("leadVisibleSummary");
  } else {
    elements.taskTeamLeadStatus.textContent = translateStatusLabel(lead.status ?? "PENDING");
    elements.taskTeamLeadStatus.className = `badge ${lead.status === "RUNNING" ? "badge--accent-soft" : lead.status === "FAILED" ? "badge--dirty" : "badge--outline"}`;
    elements.taskTeamLeadMeta.textContent = [
      lead.agentType ?? detail.task.leadAgentType,
      lead.sessionId ? t("sessionIdLabel", { id: lead.sessionId }) : t("sessionPending"),
    ].join(" · ");
    elements.taskTeamLeadSummary.textContent = lead.lastError
      ? t("leadAttentionNeeded", { error: lead.lastError })
      : t("leadCoordinatorSummary");
  }

  for (const member of members) {
    const card = document.createElement("button");
    const isSelected = member.subtaskId === state.selectedExecutionSubTaskId;

    card.type = "button";
    card.className = `team-member-card${isSelected ? " is-selected" : ""}`;
    card.innerHTML = `
      <div class="team-member-card__header">
        <div>
          <div class="team-member-card__topline">
            <p class="team-member-card__title">${escapeHtml(member.displayName ?? member.title ?? t("teamMemberFallback"))}</p>
            <span class="badge badge--outline">${escapeHtml(buildAssignmentSourceLabel(member.assignmentSource))}</span>
          </div>
          <p class="team-member-card__meta">${escapeHtml([
            member.role ?? t("capabilityWorker").toLowerCase(),
            member.agentType ?? t("unknownAgent"),
            translateStatusLabel(member.latestSessionStatus ?? member.status ?? "PENDING"),
          ].join(" · "))}</p>
        </div>
        <span class="badge ${buildExecutionStatusBadgeClass(member.status)}">${escapeHtml(buildSubTaskStatusLabel(member.status))}</span>
      </div>
      <p class="team-member-card__summary">${escapeHtml(member.runSummary ?? t("waitingTeamLifecycle"))}</p>
      <dl class="team-member-card__facts">
        <div>
          <dt>${escapeHtml(t("branchLabel"))}</dt>
          <dd>${escapeHtml(member.branchName ?? member.branchSuffix ?? t("leadSessionPending"))}</dd>
        </div>
        <div>
          <dt>${escapeHtml(t("worktreeLabel"))}</dt>
          <dd>${escapeHtml(member.worktreePath ?? t("leadSessionPending"))}</dd>
        </div>
      </dl>
      <p class="team-member-card__hint">${escapeHtml(t("selectMemberHint"))}</p>
    `;
    card.addEventListener("click", () => {
      state.selectedExecutionSubTaskId = member.subtaskId;
      state.selectedExecutionSessionId = resolveFocusedSession(detail, member.subtaskId)?.id ?? null;
      renderTaskDetail();
    });
    elements.taskTeamMemberList.append(card);
  }
}

function renderTaskAttachments(attachments) {
  elements.taskAttachmentsList.replaceChildren();
  elements.taskAttachmentsEmpty.hidden = attachments.length > 0;

  for (const attachment of attachments) {
    const item = document.createElement("li");
    item.className = "attachment-list__item";
    item.innerHTML = `
      <span class="attachment-list__name">${escapeHtml(attachment.fileName)}</span>
      <span class="attachment-list__meta">${escapeHtml(buildAttachmentCaption(attachment))}</span>
    `;
    elements.taskAttachmentsList.append(item);
  }
}

function renderCleanupWarnings(cleanupWarnings) {
  elements.taskCleanupWarningList.replaceChildren();
  elements.taskCleanupWarnings.hidden = cleanupWarnings.length === 0;

  if (cleanupWarnings.length === 0) {
    elements.taskCleanupWarningSummary.textContent = "";
    return;
  }

  elements.taskCleanupWarningSummary.textContent = countLabel(
    cleanupWarnings.length,
    "cleanupWarningSummaryOne",
    "cleanupWarningSummaryOther",
  );

  for (const warning of cleanupWarnings) {
    const item = document.createElement("article");
    item.className = "cleanup-warning-list__item";
    item.innerHTML = `
      <p class="cleanup-warning-list__path">${escapeHtml(warning.worktreePath ?? t("unknownPath"))}</p>
      <p class="cleanup-warning-list__reason">${escapeHtml(warning.reason ?? t("cleanupFailed"))}</p>
      <p class="cleanup-warning-list__meta">${escapeHtml(formatTimestamp(warning.createdAt))}</p>
    `;
    elements.taskCleanupWarningList.append(item);
  }
}

function renderSubTaskExecution(detail) {
  const subTasks = detail.subTasks ?? [];
  const sessionsBySubTaskId = new Map();

  for (const session of detail.sessions ?? []) {
    if (!session.subTaskId) {
      continue;
    }

    const entry = sessionsBySubTaskId.get(session.subTaskId) ?? [];
    entry.push(session);
    sessionsBySubTaskId.set(session.subTaskId, entry);
  }

  elements.taskExecutionList.replaceChildren();
  elements.taskExecutionEmpty.hidden = subTasks.length > 0;
  elements.taskExecutionBoard.hidden = subTasks.length === 0;

  if (subTasks.length === 0) {
    elements.taskExecutionFocus.hidden = true;
    return;
  }

  for (const subTask of subTasks) {
    const sessions = sessionsBySubTaskId.get(subTask.id) ?? [];
    const latestSession = sessions.at(-1) ?? null;
    const mergeRecords = Array.isArray(subTask.mergeRecords) ? subTask.mergeRecords : [];
    const latestMergeRecord = mergeRecords.at(-1) ?? null;
    const includedAttachments = subTask.launchMetadata?.included?.map((attachment) => attachment.fileName) ?? [];
    const excludedAttachments = subTask.launchMetadata?.excluded?.map((attachment) => (
      `${attachment.fileName} (${attachment.reason})`
    )) ?? [];
    const previewText = stripAnsi(latestSession?.outputBuffer ?? "");
    const reviewDecision = buildReviewDecisionLabel(subTask.latestReviewDecision);
    const reviewPhase = buildReviewPhaseLabel(subTask.latestReviewPhase);
    const reviewSummary = buildExecutionReviewSummary(subTask);
    const isSelected = subTask.id === state.selectedExecutionSubTaskId;
    const card = document.createElement("button");

    card.type = "button";
    card.className = `execution-card${isSelected ? " is-selected" : ""}`;
    card.innerHTML = `
      <div class="execution-card__header">
        <div>
          <p class="execution-card__title">${escapeHtml(subTask.title)}</p>
          <p class="execution-card__meta">${escapeHtml(`${subTask.agentType} · ${buildSubTaskStatusLabel(subTask.status)}`)}</p>
        </div>
        <span class="badge ${buildExecutionStatusBadgeClass(subTask.status)}">${escapeHtml(buildSubTaskStatusLabel(subTask.status))}</span>
      </div>
      <div class="execution-card__summary">
        <p class="execution-card__summary-line"><strong>${escapeHtml(t("latestSessionLabel"))}:</strong> ${escapeHtml(latestSession ? `${latestSession.agentType} · ${translateStatusLabel(latestSession.status)}` : t("latestSessionNone"))}</p>
        <p class="execution-card__summary-line"><strong>${escapeHtml(t("retriesLabel"))}:</strong> ${escapeHtml(String(subTask.retryCount ?? 0))} · <strong>${escapeHtml(t("sessionsLabelOther", { count: sessions.length }).replace(`${sessions.length} `, ""))}:</strong> ${escapeHtml(String(sessions.length))}</p>
        <p class="execution-card__summary-line"><strong>${escapeHtml(t("mergeAttemptsLabel"))}:</strong> ${escapeHtml(String(mergeRecords.length))} · <strong>${escapeHtml(t("latestMergeLabel"))}:</strong> ${escapeHtml(buildMergeHistoryHeadline(latestMergeRecord))}</p>
        <p class="execution-card__summary-line"><strong>${escapeHtml(t("attachmentsLabel"))}:</strong> ${escapeHtml(`${t("includedCount", { count: includedAttachments.length })} · ${t("excludedCount", { count: excludedAttachments.length })}`)}</p>
      </div>
      <div class="execution-card__review">
        <p class="execution-card__review-title">${escapeHtml(`${reviewPhase} · ${reviewDecision}`)}</p>
        <p class="execution-card__review-summary">${escapeHtml(reviewSummary)}</p>
      </div>
      <dl class="execution-card__facts">
        <div>
          <dt>${escapeHtml(t("branchLabel"))}</dt>
          <dd>${escapeHtml(subTask.branchName ?? t("leadSessionPending"))}</dd>
        </div>
        <div>
          <dt>${escapeHtml(t("worktreeLabel"))}</dt>
          <dd>${escapeHtml(subTask.worktreePath ?? t("leadSessionPending"))}</dd>
        </div>
      </dl>
      <pre class="execution-card__preview">${escapeHtml(previewText || t("waitingWorkerOutput"))}</pre>
    `;

    card.addEventListener("click", () => {
      const nextSession = resolveFocusedSession(detail, subTask.id);
      state.selectedExecutionSubTaskId = subTask.id;
      state.selectedExecutionSessionId = nextSession?.id ?? null;
      renderTaskDetail();
    });

    elements.taskExecutionList.append(card);
  }

  renderFocusedExecution(detail, sessionsBySubTaskId);
}

function renderPlanDraft(detail) {
  elements.taskPlanList.replaceChildren();
  elements.taskPlanGraph.replaceChildren();
  clearFeedback(elements.taskPlanFeedback);

  const parsedPlan = normalizePlanDraft(parseCurrentPlanJson(detail.task.currentPlanJson));
  const editableDraft = detail.task.status === "PLAN_REVIEW" ? state.taskPlanDraft : null;
  const failedAttempts = countPlanValidationFailures(detail.messages ?? []);
  const hasPlanningState = detail.task.status === "PLANNING"
    || detail.task.status === "PLAN_REVIEW"
    || parsedPlan
    || (detail.task.planVersion ?? 0) > 0;

  elements.taskPlanEmpty.hidden = hasPlanningState;

  if (!hasPlanningState) {
    elements.taskPlanDetail.hidden = true;
    return;
  }

  if (detail.task.status === "PLAN_REVIEW" && parsedPlan) {
    showFeedback(
      elements.taskPlanFeedback,
      "success",
      t("planDraftReady", { version: detail.task.planVersion }),
    );
  } else if (failedAttempts > 0) {
    showFeedback(
      elements.taskPlanFeedback,
      "error",
      countLabel(failedAttempts, "planningRetryingOne", "planningRetryingOther"),
    );
  } else if (detail.task.status === "PLANNING") {
    showFeedback(
      elements.taskPlanFeedback,
      "success",
      t("planningInProgress"),
    );
  }

  if (state.taskPlanNotice) {
    showFeedback(elements.taskPlanFeedback, state.taskPlanNotice.tone, state.taskPlanNotice.message);
    state.taskPlanNotice = null;
  }

  elements.taskPlanDetail.hidden = false;
  elements.taskPlanEditor.hidden = detail.task.status !== "PLAN_REVIEW" || !editableDraft;
  elements.taskPlanSummary.textContent = buildPlanSummary(detail, failedAttempts, editableDraft ?? parsedPlan);
  renderPlanHistory(detail);
  renderPlanTemplateOptions(editableDraft ?? parsedPlan);
  updatePlanViewToggle();

  if (editableDraft) {
    elements.taskPlanNotesInput.value = editableDraft.notes ?? "";
  }

  const planNodes = getPlanNodes(editableDraft ?? parsedPlan);
  const hasUnsavedDraft = editableDraft ? isEditablePlanDirty(detail) : false;
  const hasStaleDraft = state.taskPlanDraftState?.stale === true;

  if (hasStaleDraft) {
    showFeedback(
      elements.taskPlanFeedback,
      "error",
      t("staleDraftNotice"),
    );
  }

  elements.taskPlanSaveDraftButton.disabled = !editableDraft || !hasUnsavedDraft || hasStaleDraft;
  elements.taskPlanApproveButton.disabled = !editableDraft || hasUnsavedDraft || hasStaleDraft;
  elements.taskPlanApproveButton.textContent = hasUnsavedDraft ? t("saveBeforeApprovalButton") : t("approveDraftButton");
  elements.taskPlanApplyTemplateButton.disabled = detail.task.status !== "PLAN_REVIEW" || state.planTemplates.length === 0;
  elements.taskPlanTemplateSelect.disabled = detail.task.status !== "PLAN_REVIEW" || state.planTemplates.length === 0;
  elements.taskPlanList.hidden = state.taskPlanView === "graph";
  elements.taskPlanGraph.hidden = state.taskPlanView !== "graph";

  if (!planNodes.length) {
    return;
  }

  if (state.taskPlanView === "graph") {
    renderPlanGraph(planNodes, Boolean(editableDraft));
    return;
  }

  for (const [index, node] of planNodes.entries()) {
    if (editableDraft) {
      elements.taskPlanList.append(renderEditablePlanNodeCard(index, node));
      continue;
    }

    elements.taskPlanList.append(renderReadonlyPlanNodeCard(index, node));
  }
}

function renderPlanTemplateOptions(activePlan) {
  const selectedTemplateId = activePlan?.template_id ?? "";
  const options = [
    `<option value="">${escapeHtml(t("planTemplateLabel"))}</option>`,
    ...state.planTemplates.map((template) => {
      const copy = getPlanTemplateCopy(template.id);
      const suffix = template.nodeCount ? ` · ${template.nodeCount}` : "";

      return `<option value="${escapeHtmlAttribute(template.id)}"${template.id === selectedTemplateId ? " selected" : ""}>${escapeHtml(copy.title + suffix)}</option>`;
    }),
  ];

  elements.taskPlanTemplateSelect.innerHTML = options.join("");
}

function updatePlanViewToggle() {
  elements.taskPlanGraphViewButton.classList.toggle("is-active", state.taskPlanView === "graph");
  elements.taskPlanListViewButton.classList.toggle("is-active", state.taskPlanView === "list");
  elements.taskPlanGraphViewButton.setAttribute("aria-pressed", state.taskPlanView === "graph" ? "true" : "false");
  elements.taskPlanListViewButton.setAttribute("aria-pressed", state.taskPlanView === "list" ? "true" : "false");
}

function renderPlanHistory(detail) {
  const snapshots = detail.planSnapshots ?? [];
  const showHistory = detail.task.status === "PLAN_REVIEW" || snapshots.length > 0;

  elements.taskPlanHistoryList.replaceChildren();
  elements.taskPlanHistory.hidden = !showHistory;
  elements.taskPlanHistoryEmpty.hidden = snapshots.length > 0;

  if (!showHistory || snapshots.length === 0) {
    return;
  }

  for (const snapshot of snapshots) {
    const article = document.createElement("article");
    article.className = "plan-history__item";
    article.innerHTML = `
      <div class="plan-history__meta">
        <div>
          <p class="plan-history__caption">${escapeHtml(buildPlanSnapshotLabel(snapshot))}</p>
          <p class="plan-history__caption">${escapeHtml(new Date(snapshot.createdAt).toLocaleString(state.locale))}</p>
        </div>
        <button class="button button--secondary" type="button" data-restore-snapshot-id="${snapshot.id}">
          ${escapeHtml(t("restoreSnapshotButton"))}
        </button>
      </div>
    `;

    article.querySelector("[data-restore-snapshot-id]")?.addEventListener("click", onRestorePlanSnapshot);
    elements.taskPlanHistoryList.append(article);
  }
}

function renderPlanGraph(planNodes, editable) {
  const columns = buildPlanGraphColumns(planNodes);

  for (const column of columns) {
    const section = document.createElement("section");
    section.className = "plan-graph__column";
    section.innerHTML = `
      <div class="plan-graph__column-header">
        <p class="panel__eyebrow">${escapeHtml(t("graphColumnLabel", { count: column.level + 1 }))}</p>
        <span class="badge badge--outline">${escapeHtml(countLabel(column.nodes.length, "nodeCountOne", "nodeCountOther"))}</span>
      </div>
    `;

    const list = document.createElement("div");
    list.className = "plan-graph__column-list";

    for (const entry of column.nodes) {
      list.append(editable
        ? renderEditablePlanNodeCard(entry.index, entry.node, true)
        : renderReadonlyPlanNodeCard(entry.index, entry.node, true));
    }

    section.append(list);
    elements.taskPlanGraph.append(section);
  }
}

function renderEditablePlanNodeCard(index, node, graphMode = false) {
  const article = document.createElement("article");
  article.className = graphMode ? "plan-subtask plan-subtask--graph" : "plan-subtask";

  article.innerHTML = `
    <div class="plan-subtask__header">
      <div>
        <p class="plan-subtask__index">${escapeHtml(t("subtaskNumberLabel", { count: index + 1 }))}</p>
        <p class="plan-card__meta">${escapeHtml(`${t("roleLabel")}: ${node.role ?? node.branch_suffix}`)}</p>
      </div>
      <button class="button button--ghost" type="button" data-remove-subtask="${index}">
        ${escapeHtml(t("removeButton"))}
      </button>
    </div>
    <div class="plan-subtask__grid">
      <label class="field">
        <span class="field__label">${escapeHtml(t("titleField"))}</span>
        <input type="text" value="${escapeHtmlAttribute(node.title ?? "")}" data-plan-field="title" data-subtask-index="${index}">
      </label>
      <label class="field">
        <span class="field__label">${escapeHtml(t("roleField"))}</span>
        <input type="text" value="${escapeHtmlAttribute(node.role ?? "")}" data-plan-field="role" data-subtask-index="${index}">
      </label>
      <label class="field">
        <span class="field__label">${escapeHtml(t("workerAgentField"))}</span>
        <select class="field__control" data-plan-field="recommended_agent" data-subtask-index="${index}">
          ${buildWorkerAgentOptions(node.recommended_agent)}
        </select>
      </label>
      <label class="field">
        <span class="field__label">${escapeHtml(t("descriptionField"))}</span>
        <textarea rows="4" data-plan-field="description" data-subtask-index="${index}">${escapeHtml(node.description ?? "")}</textarea>
      </label>
      <label class="field">
        <span class="field__label">${escapeHtml(t("deliverableField"))}</span>
        <textarea rows="3" data-plan-field="deliverable" data-subtask-index="${index}">${escapeHtml(node.deliverable ?? "")}</textarea>
      </label>
      <label class="field">
        <span class="field__label">${escapeHtml(t("acceptanceCriteriaField"))}</span>
        <textarea
          rows="4"
          placeholder="${escapeHtmlAttribute(t("acceptanceCriteriaPlaceholder"))}"
          data-plan-field="acceptance_criteria"
          data-subtask-index="${index}"
        >${escapeHtml(Array.isArray(node.acceptance_criteria) ? node.acceptance_criteria.join("\n") : "")}</textarea>
      </label>
      <label class="field">
        <span class="field__label">${escapeHtml(t("branchSuffixField"))}</span>
        <div class="plan-subtask__branch">
          <input type="text" value="${escapeHtmlAttribute(node.branch_suffix ?? "")}" data-plan-field="branch_suffix" data-subtask-index="${index}">
          <span class="badge badge--outline">${escapeHtml(node.branch_suffix ?? t("missingSuffix"))}</span>
        </div>
      </label>
      <label class="field">
        <span class="field__label">${escapeHtml(t("dependsOnField"))}</span>
        <input
          type="text"
          value="${escapeHtmlAttribute(Array.isArray(node.depends_on) ? node.depends_on.join(", ") : "")}"
          placeholder="${escapeHtmlAttribute(t("dependsOnPlaceholder"))}"
          data-plan-field="depends_on"
          data-subtask-index="${index}"
        >
      </label>
      <label class="field">
        <span class="field__label">${escapeHtml(t("templateHintField"))}</span>
        <input type="text" value="${escapeHtmlAttribute(node.template_hint ?? "")}" data-plan-field="template_hint" data-subtask-index="${index}">
      </label>
      <label class="field">
        <span class="field__label">${escapeHtml(t("estimatedScopeField"))}</span>
        <input type="text" value="${escapeHtmlAttribute(node.estimated_scope ?? "")}" data-plan-field="estimated_scope" data-subtask-index="${index}">
      </label>
    </div>
  `;

  article.querySelectorAll("[data-plan-field]").forEach((input) => {
    input.addEventListener("input", onPlanSubtaskInput);
    input.addEventListener("change", onPlanSubtaskInput);
  });
  article.querySelector("[data-remove-subtask]")?.addEventListener("click", onRemovePlanSubtask);

  return article;
}

function renderReadonlyPlanNodeCard(index, node, graphMode = false) {
  const article = document.createElement("article");
  article.className = graphMode ? "plan-card plan-card--graph" : "plan-card";
  article.innerHTML = `
    <div class="plan-card__header">
      <div>
        <p class="plan-card__title">${escapeHtml(`${index + 1}. ${node.title}`)}</p>
        <p class="plan-card__meta">${escapeHtml(`${t("roleLabel")}: ${node.role ?? node.branch_suffix}`)}</p>
        <p class="plan-card__meta">${escapeHtml(`${t("agentMetaLabel")}: ${node.recommended_agent}`)}</p>
        <p class="plan-card__meta">${escapeHtml(`${t("deliverableLabel")}: ${node.deliverable ?? node.description}`)}</p>
      </div>
      <div class="plan-card__badges">
        <span class="badge badge--outline">${escapeHtml(node.branch_suffix)}</span>
        <span class="badge badge--outline">${escapeHtml(node.template_hint ?? "custom")}</span>
      </div>
    </div>
    <p class="plan-card__description">${escapeHtml(node.description)}</p>
    <div class="plan-card__stack">
      <p class="plan-card__meta">${escapeHtml(`${t("dependsOnLabel")}: ${Array.isArray(node.depends_on) && node.depends_on.length > 0 ? node.depends_on.join(", ") : t("noDependenciesLabel")}`)}</p>
      <div class="plan-card__criteria">
        <p class="plan-card__meta">${escapeHtml(t("acceptanceCriteriaTitle"))}</p>
        <ul class="plan-card__criteria-list">
          ${buildPlanAcceptanceCriteriaItems(node.acceptance_criteria)}
        </ul>
      </div>
    </div>
  `;

  return article;
}

function renderTranscript(messages) {
  elements.taskTranscript.replaceChildren();
  elements.taskTranscriptEmpty.hidden = messages.length > 0;

  for (const message of messages) {
    const article = document.createElement("article");
    article.className = `transcript__message transcript__message--${message.role.toLowerCase().replaceAll("_", "-")}`;
    article.innerHTML = `
      <div class="transcript__meta">
        <span>${escapeHtml(buildTranscriptRoleLabel(message.role))}</span>
        <span>${escapeHtml(new Date(message.createdAt).toLocaleString(state.locale))}</span>
      </div>
      <p class="transcript__content">${escapeHtml(message.content)}</p>
    `;
    elements.taskTranscript.append(article);
  }
}

function clearProjectDetail() {
  elements.projectDetail.hidden = true;
  elements.projectDetailEmpty.hidden = false;
  elements.dirtyWarningBanner.hidden = true;
  elements.recentBranches.replaceChildren();
  state.projectDetail = null;
  syncBranchChoices();
}

function clearTaskList() {
  state.tasks = [];
  state.selectedTaskId = null;
  writeStorage(STORAGE_KEYS.selectedTaskId, "");
  renderTaskList();
}

function clearTaskDetail() {
  state.executionDrafts = new Map();
  state.liveSessionOutputs = new Map();
  state.selectedExecutionSessionId = null;
  state.selectedExecutionSubTaskId = null;
  state.taskDetail = null;
  state.taskPlanDraft = null;
  state.taskPlanDraftState = null;
  state.taskPlanNotice = null;
  state.selectedTaskId = null;
  writeStorage(STORAGE_KEYS.selectedTaskId, "");
  disconnectTaskStream();
  elements.taskDetail.hidden = true;
  elements.taskDetailEmpty.hidden = false;
  elements.taskCleanupWarnings.hidden = true;
  elements.taskCleanupWarningList.replaceChildren();
  elements.taskCleanupWarningSummary.textContent = "";
  elements.taskTranscript.replaceChildren();
  elements.taskAttachmentsList.replaceChildren();
  elements.taskExecutionList.replaceChildren();
  elements.taskExecutionBoard.hidden = true;
  elements.taskTeamEmpty.hidden = false;
  elements.taskTeamLeadMeta.textContent = "";
  elements.taskTeamLeadSummary.textContent = "";
  elements.taskTeamLeadStatus.textContent = t("leadSessionPending");
  elements.taskTeamLeadStatus.className = "badge badge--outline";
  elements.taskTeamMemberCount.textContent = countLabel(0, "teamMemberCountOne", "teamMemberCountOther");
  elements.taskTeamMemberList.replaceChildren();
  elements.taskTeamShell.hidden = true;
  elements.taskExecutionFocus.hidden = true;
  elements.taskExecutionFocusPreview.hidden = true;
  elements.taskExecutionMailbox.hidden = true;
  elements.taskExecutionReview.hidden = true;
  elements.taskExecutionAgentField.hidden = true;
  elements.taskExecutionReviewActions.hidden = true;
  elements.taskExecutionReworkField.hidden = true;
  elements.taskExecutionMailboxList.replaceChildren();
  elements.taskExecutionMailboxInput.value = "";
  elements.taskExecutionSessionList.replaceChildren();
  elements.taskPlanHistoryList.replaceChildren();
  elements.taskPlanGraph.replaceChildren();
  elements.taskPlanList.replaceChildren();
}

function syncBranchChoices() {
  const repoStatus = state.projectDetail?.repoStatus;
  const branchChoices = uniqueBranches([
    repoStatus?.defaultBranch,
    repoStatus?.currentBranch,
    ...(repoStatus?.recentBranches ?? []),
  ]);

  elements.baseBranchSelect.replaceChildren();

  if (branchChoices.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("noBranchesAvailable");
    elements.baseBranchSelect.append(option);
    elements.baseBranchSelect.disabled = true;
    state.selectedBaseBranch = null;
    return;
  }

  state.selectedBaseBranch = branchChoices.includes(state.selectedBaseBranch)
    ? state.selectedBaseBranch
    : branchChoices[0];

  for (const branchName of branchChoices) {
    const option = document.createElement("option");
    option.value = branchName;
    option.selected = branchName === state.selectedBaseBranch;
    option.textContent = branchName;
    elements.baseBranchSelect.append(option);
  }

  elements.baseBranchSelect.disabled = false;
}

function connectTaskStream(taskId) {
  disconnectTaskStream();

  if (!taskId) {
    return;
  }

  const stream = new EventSource(`/api/tasks/${encodeURIComponent(taskId)}/events`);
  stream.addEventListener("task:status", (event) => {
    const payload = JSON.parse(event.data);

    if (state.taskDetail?.task?.id === payload.taskId) {
      state.taskDetail.task.status = payload.status;
      state.taskDetail.task.lastError = payload.reason ?? null;
      renderTaskDetail();
    }

    const task = state.tasks.find((entry) => entry.id === payload.taskId);

    if (task) {
      task.status = payload.status;
      renderTaskList();
    }
  });
  stream.addEventListener("task:lead-message", () => {
    void loadTaskDetail(taskId, { preserveStream: true });
  });
  stream.addEventListener("task:plan-generated", () => {
    void loadTaskDetail(taskId, { preserveStream: true });
  });
  stream.addEventListener("task:plan-seeded", () => {
    void loadTaskDetail(taskId, { preserveStream: true });
  });
  stream.addEventListener("task:plan-restored", (event) => {
    const payload = JSON.parse(event.data);

    state.taskPlanNotice = {
      message: t("snapshotRestoredNotice", { snapshotId: payload.snapshotId }),
      tone: "success",
    };
    void loadTaskDetail(taskId, { preserveStream: true });
  });
  stream.addEventListener("team:updated", () => {
    void loadTaskDetail(taskId, { preserveStream: true });
  });
  stream.addEventListener("subtask:assigned", () => {
    void loadTaskDetail(taskId, { preserveStream: true });
  });
  stream.addEventListener("subtask:cancelled", () => {
    void loadTaskDetail(taskId, { preserveStream: true });
  });
  stream.addEventListener("subtask:status", (event) => {
    applySubTaskStatusEvent(JSON.parse(event.data));
  });
  stream.addEventListener("subtask:review", (event) => {
    applySubTaskReviewEvent(JSON.parse(event.data));
  });
  stream.addEventListener("subtask:confirm-discard", () => {
    void loadTaskDetail(taskId, { preserveStream: true });
  });
  stream.addEventListener("subtask:agent-changed", (event) => {
    applySubTaskAgentChangedEvent(JSON.parse(event.data));
  });
  stream.addEventListener("merge:status", () => {
    void loadTaskDetail(taskId, { preserveStream: true });
  });
  stream.addEventListener("task:cleanup-warning", () => {
    void loadTaskDetail(taskId, { preserveStream: true });
  });
  stream.addEventListener("mailbox:message", () => {
    void loadTaskDetail(taskId, { preserveStream: true });
  });
  stream.addEventListener("session:started", (event) => {
    applySessionStartedEvent(JSON.parse(event.data));
  });
  stream.addEventListener("session:output", (event) => {
    applySessionOutputEvent(JSON.parse(event.data));
  });
  stream.addEventListener("session:ended", (event) => {
    applySessionEndedEvent(JSON.parse(event.data));
  });
  stream.onerror = () => {
    stream.close();
  };

  state.taskStream = stream;
}

function disconnectTaskStream() {
  if (state.taskStream) {
    state.taskStream.close();
    state.taskStream = null;
  }
}

function syncEditablePlanDraft(detail) {
  if (detail?.task?.status !== "PLAN_REVIEW") {
    state.taskPlanDraft = null;
    state.taskPlanDraftState = null;
    return;
  }

  const serverPlan = parseCurrentPlanJson(detail.task.currentPlanJson);

  if (!serverPlan) {
    state.taskPlanDraft = null;
    state.taskPlanDraftState = null;
    return;
  }

  const storageKey = getTaskDraftStorageKey(detail.task.id);
  const persistedDraft = readStoredPlanDraft(storageKey);
  const serverFingerprint = detail.task.currentPlanJson;
  const canReusePersistedDraft = persistedDraft
    && persistedDraft.serverFingerprint === serverFingerprint
    && persistedDraft.taskUpdatedAt === detail.task.updatedAt;

  const hasUnsavedPersistedDraft = persistedDraft
    && JSON.stringify(normalizePlanDraft(persistedDraft.draft)) !== persistedDraft.serverFingerprint;

  if (canReusePersistedDraft) {
    state.taskPlanDraft = normalizePlanDraft(persistedDraft.draft);
    state.taskPlanDraftState = {
      stale: false,
    };
  } else if (hasUnsavedPersistedDraft) {
    state.taskPlanDraft = normalizePlanDraft(persistedDraft.draft);
    state.taskPlanDraftState = {
      stale: true,
    };
  } else {
    state.taskPlanDraft = normalizePlanDraft(serverPlan);
    state.taskPlanDraftState = {
      stale: false,
    };
  }

  persistCurrentTaskDraft();
}

function onPlanNotesInput(event) {
  if (!state.taskPlanDraft) {
    return;
  }

  const value = normalizeOptionalText(event.target.value);
  const nextDraft = normalizePlanDraft(state.taskPlanDraft);

  if (value) {
    nextDraft.notes = value;
  } else {
    delete nextDraft.notes;
  }

  state.taskPlanDraft = nextDraft;
  persistCurrentTaskDraft();
  renderPlanDraft(state.taskDetail);
}

function onPlanSubtaskInput(event) {
  if (!state.taskPlanDraft) {
    return;
  }

  const index = Number.parseInt(event.target.dataset.subtaskIndex ?? "", 10);
  const field = event.target.dataset.planField;
  const currentNodes = getPlanNodes(state.taskPlanDraft);

  if (!Number.isInteger(index) || !field || !currentNodes[index]) {
    return;
  }

  const nextNodes = currentNodes.map((subtask, subtaskIndex) => (
    subtaskIndex === index
      ? {
          ...subtask,
          [field]: field === "depends_on"
            ? splitPlanDependencies(event.target.value)
            : field === "acceptance_criteria"
              ? splitAcceptanceCriteria(event.target.value)
              : event.target.value,
        }
      : subtask
  ));
  state.taskPlanDraft = updatePlanNodes(state.taskPlanDraft, nextNodes);
  persistCurrentTaskDraft();
  renderPlanDraft(state.taskDetail);
}

function onAddPlanSubtask() {
  if (!state.taskPlanDraft) {
    return;
  }

  const currentNodes = getPlanNodes(state.taskPlanDraft);
  state.taskPlanDraft = updatePlanNodes(state.taskPlanDraft, [
    ...currentNodes,
    createDefaultPlanNode(currentNodes.length),
  ]);
  persistCurrentTaskDraft();
  renderPlanDraft(state.taskDetail);
}

function onRemovePlanSubtask(event) {
  if (!state.taskPlanDraft) {
    return;
  }

  const index = Number.parseInt(event.currentTarget.dataset.removeSubtask ?? "", 10);

  if (!Number.isInteger(index)) {
    return;
  }

  state.taskPlanDraft = updatePlanNodes(
    state.taskPlanDraft,
    getPlanNodes(state.taskPlanDraft).filter((_, subtaskIndex) => subtaskIndex !== index),
  );
  persistCurrentTaskDraft();
  renderPlanDraft(state.taskDetail);
}

function onSetPlanView(view) {
  if (!["graph", "list"].includes(view)) {
    return;
  }

  state.taskPlanView = view;
  renderPlanDraft(state.taskDetail);
}

function onResetPlanDraft() {
  if (!state.taskDetail?.task?.id) {
    return;
  }

  removeStorage(getTaskDraftStorageKey(state.taskDetail.task.id));
  syncEditablePlanDraft(state.taskDetail);
  renderPlanDraft(state.taskDetail);
}

async function onSavePlanDraft() {
  if (!state.taskDetail?.task?.id || !state.taskPlanDraft) {
    return;
  }

  clearFeedback(elements.taskPlanFeedback);

  if (state.taskPlanDraftState?.stale) {
    showFeedback(elements.taskPlanFeedback, "error", t("latestServerDraftFirst"));
    return;
  }

  setButtonBusy(elements.taskPlanSaveDraftButton, true, t("saving"));

  try {
    const response = await fetchJson(
      `/api/tasks/${encodeURIComponent(state.taskDetail.task.id)}/current-plan`,
      {
        body: state.taskPlanDraft,
        method: "PUT",
      },
    );

    state.taskDetail.task = response.task;
    syncEditablePlanDraft(state.taskDetail);
    renderTaskDetail();
    showFeedback(elements.taskPlanFeedback, "success", t("draftSaved"));
  } catch (error) {
    showFeedback(elements.taskPlanFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.taskPlanSaveDraftButton, false, t("saveDraftButton"));
  }
}

async function onApplyPlanTemplate() {
  if (!state.taskDetail?.task?.id) {
    return;
  }

  const templateId = elements.taskPlanTemplateSelect.value;

  if (!templateId) {
    showFeedback(elements.taskPlanFeedback, "error", buildTaskErrorMessage({ code: "PLAN_TEMPLATE_REQUIRED" }));
    return;
  }

  if (state.taskPlanDraft && isEditablePlanDirty(state.taskDetail)) {
    const confirmed = window.confirm(t("applyTemplateConfirm"));

    if (!confirmed) {
      return;
    }
  }

  clearFeedback(elements.taskPlanFeedback);
  setButtonBusy(elements.taskPlanApplyTemplateButton, true, t("applying"));

  try {
    const response = await fetchJson(
      `/api/tasks/${encodeURIComponent(state.taskDetail.task.id)}/plan-seed`,
      {
        body: { templateId },
        method: "POST",
      },
    );

    state.taskDetail.task = response.task;
    await loadTaskDetail(state.taskDetail.task.id, { preserveStream: true });
    showFeedback(elements.taskPlanFeedback, "success", t("planTemplateApplied"));
  } catch (error) {
    showFeedback(elements.taskPlanFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.taskPlanApplyTemplateButton, false, t("applyTemplateButton"));
  }
}

async function onApprovePlanDraft() {
  if (!state.taskDetail?.task?.id || !state.taskPlanDraft) {
    return;
  }

  clearFeedback(elements.taskPlanFeedback);

  if (state.taskPlanDraftState?.stale) {
    showFeedback(elements.taskPlanFeedback, "error", t("latestServerDraftBeforeApproval"));
    return;
  }

  if (isEditablePlanDirty(state.taskDetail)) {
    showFeedback(elements.taskPlanFeedback, "error", t("saveDraftBeforeApproval"));
    return;
  }

  setButtonBusy(elements.taskPlanApproveButton, true, t("checking"));

  try {
    const response = await fetchJson(
      `/api/tasks/${encodeURIComponent(state.taskDetail.task.id)}/approve-plan`,
      { method: "POST" },
    );

    state.taskDetail.task = response.task;
    await loadTaskDetail(state.taskDetail.task.id, { preserveStream: true });
    showFeedback(
      elements.taskPlanFeedback,
      "success",
      response.idempotent
        ? t("planApprovedIdempotent")
        : t("planApprovedNew"),
    );
  } catch (error) {
    showFeedback(elements.taskPlanFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.taskPlanApproveButton, false, t("approveDraftButton"));
  }
}

async function onRestorePlanSnapshot(event) {
  if (!state.taskDetail?.task?.id) {
    return;
  }

  const button = event.currentTarget;
  const snapshotId = button.dataset.restoreSnapshotId;

  if (!snapshotId) {
    return;
  }

  clearFeedback(elements.taskPlanFeedback);
  if (!window.confirm(t("restoreSnapshotConfirm"))) {
    return;
  }
  setButtonBusy(button, true, t("restoring"));

  try {
    const response = await fetchJson(
      `/api/tasks/${encodeURIComponent(state.taskDetail.task.id)}/restore-plan-snapshot`,
      {
        body: { snapshotId },
        method: "POST",
      },
    );

    state.taskDetail.task = response.task;
    await loadTaskDetail(state.taskDetail.task.id, { preserveStream: true });
    showFeedback(elements.taskPlanFeedback, "success", t("snapshotRestored"));
  } catch (error) {
    showFeedback(elements.taskPlanFeedback, "error", buildTaskErrorMessage(error));
    setButtonBusy(button, false, t("restoreSnapshotButton"));
  }
}

async function onReworkSubTask() {
  const selectedSubTask = getSelectedExecutionSubTask();

  if (!state.selectedTaskId || !selectedSubTask) {
    return;
  }

  const draft = getExecutionDraft(selectedSubTask);
  clearFeedback(elements.taskExecutionReviewFeedback);
  setButtonBusy(elements.taskExecutionReworkButton, true, t("relaunching"));

  try {
    const response = await fetchJson(`/api/subtasks/${encodeURIComponent(selectedSubTask.id)}/rework`, {
      body: {
        description: draft.description,
      },
      method: "POST",
    });

    if (state.taskDetail) {
      state.taskDetail.task = response.task ?? state.taskDetail.task;
      state.taskDetail.subTasks = upsertRecord(state.taskDetail.subTasks, response.subTask);
      state.taskDetail.sessions = upsertRecord(state.taskDetail.sessions, response.session);
      state.liveSessionOutputs.set(response.session.id, response.session.outputBuffer ?? "");
    }

    state.executionDrafts.set(selectedSubTask.id, {
      ...draft,
      description: response.subTask.description ?? draft.description,
    });
    renderTaskDetail();
    showFeedback(elements.taskExecutionReviewFeedback, "success", t("reworkRelaunched"));
  } catch (error) {
    showFeedback(elements.taskExecutionReviewFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.taskExecutionReworkButton, false, t("reworkNowButton"));
  }
}

async function onChangeSubTaskAgent() {
  const selectedSubTask = getSelectedExecutionSubTask();

  if (!state.selectedTaskId || !selectedSubTask) {
    return;
  }

  const draft = getExecutionDraft(selectedSubTask);
  clearFeedback(elements.taskExecutionReviewFeedback);
  setButtonBusy(elements.taskExecutionChangeAgentButton, true, t("switching"));

  try {
    const response = await fetchJson(`/api/subtasks/${encodeURIComponent(selectedSubTask.id)}/change-agent`, {
      body: {
        agentType: draft.agentType,
        description: draft.description,
      },
      method: "POST",
    });

    if (state.taskDetail) {
      state.taskDetail.task = response.task ?? state.taskDetail.task;
      state.taskDetail.subTasks = upsertRecord(state.taskDetail.subTasks, response.subTask);
      state.taskDetail.sessions = upsertRecord(state.taskDetail.sessions, response.session);
      state.liveSessionOutputs.set(response.session.id, response.session.outputBuffer ?? "");
    }

    state.executionDrafts.set(selectedSubTask.id, {
      ...draft,
      agentType: response.subTask.agentType ?? draft.agentType,
      description: response.subTask.description ?? draft.description,
    });
    renderTaskDetail();
    showFeedback(elements.taskExecutionReviewFeedback, "success", t("workerChangedRelaunched"));
  } catch (error) {
    showFeedback(elements.taskExecutionReviewFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.taskExecutionChangeAgentButton, false, t("replaceWorkerButton"));
  }
}

async function onReassignSubTask() {
  const selectedSubTask = getSelectedExecutionSubTask();

  if (!state.selectedTaskId || !selectedSubTask) {
    return;
  }

  const draft = getExecutionDraft(selectedSubTask);
  clearFeedback(elements.taskExecutionReviewFeedback);
  setButtonBusy(elements.taskExecutionReassignButton, true, t("reassigning"));

  try {
    const response = await fetchJson(`/api/subtasks/${encodeURIComponent(selectedSubTask.id)}/reassign`, {
      body: {
        agentType: draft.agentType,
        description: draft.description,
      },
      method: "POST",
    });

    if (state.taskDetail) {
      state.taskDetail.task = response.task ?? state.taskDetail.task;
      state.taskDetail.subTasks = upsertRecord(state.taskDetail.subTasks, response.subTask);

      if (response.session) {
        state.taskDetail.sessions = upsertRecord(state.taskDetail.sessions, response.session);
        state.liveSessionOutputs.set(response.session.id, response.session.outputBuffer ?? "");
      }
    }

    await loadTaskDetail(state.selectedTaskId, { preserveStream: true });
    showFeedback(
      elements.taskExecutionReviewFeedback,
      "success",
      response.session
        ? t("memberReassignedRelaunched")
        : t("memberReassignedQueued"),
    );
  } catch (error) {
    showFeedback(elements.taskExecutionReviewFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.taskExecutionReassignButton, false, t("reassignMemberButton"));
  }
}

async function onCancelSubTask() {
  const selectedSubTask = getSelectedExecutionSubTask();

  if (!state.selectedTaskId || !selectedSubTask) {
    return;
  }

  clearFeedback(elements.taskExecutionReviewFeedback);
  setButtonBusy(elements.taskExecutionCancelButton, true, t("cancelling"));

  try {
    const response = await fetchJson(`/api/subtasks/${encodeURIComponent(selectedSubTask.id)}/cancel`, {
      method: "POST",
    });

    if (state.taskDetail) {
      state.taskDetail.task = response.task ?? state.taskDetail.task;
      state.taskDetail.subTasks = upsertRecord(state.taskDetail.subTasks, response.subTask);

      if (response.session) {
        state.taskDetail.sessions = upsertRecord(state.taskDetail.sessions, response.session);
      }
    }

    await loadTaskDetail(state.selectedTaskId, { preserveStream: true });
    showFeedback(elements.taskExecutionReviewFeedback, "success", t("memberCancelled"));
  } catch (error) {
    showFeedback(elements.taskExecutionReviewFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.taskExecutionCancelButton, false, t("cancelMemberButton"));
  }
}

async function onConfirmDiscardSubTask() {
  const selectedSubTask = getSelectedExecutionSubTask();

  if (!state.selectedTaskId || !selectedSubTask) {
    return;
  }

  clearFeedback(elements.taskExecutionReviewFeedback);
  setButtonBusy(elements.taskExecutionConfirmDiscardButton, true, t("confirming"));

  try {
    const response = await fetchJson(
      `/api/subtasks/${encodeURIComponent(selectedSubTask.id)}/confirm-discard`,
      { method: "POST" },
    );

    if (state.taskDetail) {
      state.taskDetail.task = response.task ?? state.taskDetail.task;
      state.taskDetail.subTasks = upsertRecord(state.taskDetail.subTasks, response.subTask);
    }

    renderTaskDetail();
    showFeedback(elements.taskExecutionReviewFeedback, "success", t("discardConfirmed"));
  } catch (error) {
    showFeedback(elements.taskExecutionReviewFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.taskExecutionConfirmDiscardButton, false, t("confirmDiscardButton"));
  }
}

async function onRebaseRetrySubTask() {
  const selectedSubTask = getSelectedExecutionSubTask();

  if (!state.selectedTaskId || !selectedSubTask) {
    return;
  }

  clearFeedback(elements.taskExecutionReviewFeedback);
  setButtonBusy(elements.taskExecutionRebaseRetryButton, true, t("rebasing"));

  try {
    const response = await fetchJson(
      `/api/subtasks/${encodeURIComponent(selectedSubTask.id)}/rebase-retry`,
      { method: "POST" },
    );

    if (state.taskDetail) {
      state.taskDetail.task = response.task ?? state.taskDetail.task;
      state.taskDetail.subTasks = upsertRecord(state.taskDetail.subTasks, response.subTask);
    }

    await loadTaskDetail(state.selectedTaskId, { preserveStream: true });
    showFeedback(
      elements.taskExecutionReviewFeedback,
      response.mergeStatus === "SUCCEEDED" ? "success" : "error",
      response.mergeStatus === "SUCCEEDED"
        ? t("rebaseRetrySucceeded")
        : t("rebaseRetryConflict"),
    );
  } catch (error) {
    showFeedback(elements.taskExecutionReviewFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.taskExecutionRebaseRetryButton, false, t("rebaseRetryButton"));
  }
}

async function onResumeTaskMerge() {
  if (!state.selectedTaskId) {
    return;
  }

  clearFeedback(elements.taskExecutionReviewFeedback);
  setButtonBusy(elements.taskExecutionResumeMergeButton, true, t("resuming"));

  try {
    const response = await fetchJson(
      `/api/tasks/${encodeURIComponent(state.selectedTaskId)}/resume`,
      { method: "POST" },
    );

    if (state.taskDetail) {
      state.taskDetail.task = response.task ?? state.taskDetail.task;
    }

    await loadTaskDetail(state.selectedTaskId, { preserveStream: true });
    showFeedback(elements.taskExecutionReviewFeedback, "success", t("mergeResumed"));
  } catch (error) {
    showFeedback(elements.taskExecutionReviewFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.taskExecutionResumeMergeButton, false, t("resumeMergeButton"));
  }
}

async function onSendMailboxMessage(event) {
  event.preventDefault();

  const selectedSubTask = getSelectedExecutionSubTask();

  if (!state.selectedTaskId || !selectedSubTask) {
    return;
  }

  clearFeedback(elements.taskExecutionMailboxFeedback);
  setButtonBusy(elements.taskExecutionMailboxSendButton, true, t("sending"));

  try {
    const response = await fetchJson(`/api/tasks/${encodeURIComponent(state.selectedTaskId)}/mailbox`, {
      body: {
        content: elements.taskExecutionMailboxInput.value.trim(),
        targetSubTaskId: selectedSubTask.id,
      },
      method: "POST",
    });

    if (state.taskDetail) {
      state.taskDetail.mailboxMessages = upsertRecord(state.taskDetail.mailboxMessages, response.message);
    }

    elements.taskExecutionMailboxInput.value = "";
    renderTaskDetail();
    showFeedback(elements.taskExecutionMailboxFeedback, "success", t("leadHandoffSent"));
  } catch (error) {
    showFeedback(elements.taskExecutionMailboxFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.taskExecutionMailboxSendButton, false, t("sendHandoffNoteButton"));
  }
}

function onExecutionDraftDescriptionInput(event) {
  const selectedSubTask = getSelectedExecutionSubTask();

  if (!selectedSubTask) {
    return;
  }

  state.executionDrafts.set(selectedSubTask.id, {
    ...getExecutionDraft(selectedSubTask),
    description: event.target.value,
  });
}

function onExecutionDraftAgentInput(event) {
  const selectedSubTask = getSelectedExecutionSubTask();

  if (!selectedSubTask) {
    return;
  }

  state.executionDrafts.set(selectedSubTask.id, {
    ...getExecutionDraft(selectedSubTask),
    agentType: event.target.value || selectedSubTask.agentType,
  });
}

async function readDraftAttachments() {
  const attachments = [];

  for (const file of [...elements.taskAttachmentsInput.files]) {
    const fileType = inferAttachmentType(file.name, file.type);

    if (!fileType) {
      throw {
        code: "ATTACHMENT_TYPE_UNSUPPORTED",
        message: t("unsupportedAttachmentNamed", { name: file.name }),
      };
    }

    attachments.push({
      contentBase64: await readFileAsBase64(file),
      fileName: file.name,
      fileType,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    });
  }

  return attachments;
}

function inferAttachmentType(fileName, mimeType) {
  const extension = `.${String(fileName).split(".").pop()?.toLowerCase() ?? ""}`;
  const normalizedMimeType = String(mimeType ?? "").toLowerCase();

  if ([".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"].includes(extension) || normalizedMimeType.startsWith("image/")) {
    return "IMAGE";
  }

  if ([".md", ".pdf", ".txt"].includes(extension) || ["application/pdf", "text/markdown", "text/plain"].includes(normalizedMimeType)) {
    return "DOCUMENT";
  }

  if (
    [".c", ".cc", ".cpp", ".css", ".go", ".html", ".java", ".js", ".json", ".jsx", ".mjs", ".py", ".rs", ".sh", ".sql", ".ts", ".tsx", ".vue", ".xml", ".yaml", ".yml"].includes(extension)
    || normalizedMimeType.startsWith("text/")
    || normalizedMimeType.includes("json")
    || normalizedMimeType.includes("javascript")
    || normalizedMimeType.includes("xml")
  ) {
    return "CODE";
  }

  return null;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers: options.body ? { "content-type": "application/json" } : undefined,
    method: options.method ?? "GET",
  });
  const payload = await response.json();

  if (!response.ok) {
    throw payload.error ?? { code: "REQUEST_FAILED", message: translate("requestFailed") };
  }

  return payload;
}

function t(key, values) {
  const template = UI_MESSAGES[state.locale]?.[key] ?? UI_MESSAGES.en[key];

  if (template) {
    return formatUiMessage(template, values);
  }

  return translate(key, values);
}

function getPlanTemplateCopy(templateId) {
  return PLAN_TEMPLATE_COPY[templateId]?.[state.locale]
    ?? PLAN_TEMPLATE_COPY[templateId]?.en
    ?? {
      description: templateId,
      title: templateId,
    };
}

function onToggleLanguage() {
  state.locale = state.locale === "zh-CN" ? "en" : "zh-CN";
  setLocale(state.locale);
  writeStorage(STORAGE_KEYS.locale, state.locale);
  renderLocale();
  renderLeadSelector();
  renderProjectList();
  renderTaskList();

  if (state.projectDetail) {
    renderProjectDetail();
  }

  if (state.taskDetail) {
    renderTaskDetail();
  }
}

function renderLocale() {
  document.documentElement.lang = state.locale;
  document.title = t("documentTitle");
  elements.languageToggle.textContent = state.locale === "zh-CN" ? "English" : "中文";
  elements.languageToggle.setAttribute("aria-label", state.locale === "zh-CN" ? t("switchToEnglish") : t("switchToChinese"));

  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }

  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  }

  for (const node of document.querySelectorAll("[data-i18n-html]")) {
    node.innerHTML = t(node.dataset.i18nHtml);
  }
}

function showFeedback(element, tone, message) {
  element.textContent = message;
  element.className = `feedback feedback--${tone} is-visible`;
}

function clearFeedback(element) {
  element.textContent = "";
  element.className = "feedback";
}

function setButtonBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = label;
}

function formatUiMessage(template, values = {}) {
  return String(template).replaceAll(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

function countLabel(count, singularKey, pluralKey) {
  return t(count === 1 ? singularKey : pluralKey, { count });
}

function translateSessionType(sessionType) {
  switch (sessionType) {
    case "WORKER":
      return t("capabilityWorker");
    case "LEAD":
      return t("mailboxSenderLead");
    default:
      return sessionType ?? t("unknown");
  }
}

function translateStatusLabel(status) {
  if (!status) {
    return t("leadSessionPending");
  }

  if (["PENDING", "BLOCKED", "READY", "RUNNING", "ACCEPTED", "FAILED", "CANCELLED", "DISCARDED", "DISCARD_PENDING", "REVIEW_PENDING", "REWORK_REQUIRED", "MERGED"].includes(status)) {
    return buildSubTaskStatusLabel(status);
  }

  return status;
}

function buildTranscriptRoleLabel(role) {
  switch (role) {
    case "SYSTEM":
      return t("transcriptRoleSystem");
    case "USER":
      return t("transcriptRoleOperator");
    case "ASSISTANT":
      return t("transcriptRoleLead");
    default:
      return role.replaceAll("_", " ");
  }
}

function uniqueBranches(branches) {
  return [...new Set(branches.filter(Boolean))];
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => {
      reject(new Error(t("readFileError", { name: file.name })));
    };
    reader.readAsDataURL(file);
  });
}

function writeStorage(key, value) {
  try {
    if (!value) {
      window.localStorage.removeItem(key);
      return;
    }

    window.localStorage.setItem(key, value);
  } catch {
    // Local storage is optional for reload persistence.
  }
}

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeStorage(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Local storage is optional for reload persistence.
  }
}

function normalizeLocale(value) {
  return value === "en" ? "en" : "zh-CN";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function parseCurrentPlanJson(currentPlanJson) {
  if (typeof currentPlanJson !== "string" || currentPlanJson.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(currentPlanJson);
    return parsed && typeof parsed === "object" ? normalizePlanDraft(parsed) : null;
  } catch {
    return null;
  }
}

function countPlanValidationFailures(messages) {
  return messages.filter((message) => (
    message.role === "SYSTEM" && message.content.startsWith("Plan validation failed:")
  )).length;
}

function buildPlanSummary(detail, failedAttempts, parsedPlan) {
  const snapshotCount = detail.planSnapshots?.length ?? 0;
  const nodeCount = getPlanNodes(parsedPlan).length;
  const summaryParts = [
    t("versionSummary", { version: detail.task.planVersion ?? 0 }),
    countLabel(snapshotCount, "snapshotCountOne", "snapshotCountOther"),
    countLabel(nodeCount, "nodeCountOne", "nodeCountOther"),
  ];

  if (failedAttempts > 0) {
    summaryParts.push(countLabel(failedAttempts, "regenerationCountOne", "regenerationCountOther"));
  }

  if (parsedPlan?.notes) {
    summaryParts.push(t("notesSummary", { notes: parsedPlan.notes }));
  }

  if (parsedPlan?.template_id) {
    const copy = getPlanTemplateCopy(parsedPlan.template_id);
    summaryParts.push(t("templateSummary", { template: copy.title }));
  }

  return summaryParts.join(" · ");
}

function buildWorkerAgentOptions(selectedAgentName) {
  const options = [];
  const selectableCandidates = state.workerCandidates.filter((candidate) => candidate.selectable);
  const knownNames = new Set(selectableCandidates.map((candidate) => candidate.agentName));

  if (selectedAgentName && !knownNames.has(selectedAgentName)) {
    options.push(
      `<option value="${escapeHtmlAttribute(selectedAgentName)}" selected>${escapeHtml(t("workerCurrentlyAssigned", { name: selectedAgentName }))}</option>`,
    );
  }

  for (const candidate of selectableCandidates) {
    options.push(
      `<option value="${escapeHtmlAttribute(candidate.agentName)}"${candidate.agentName === selectedAgentName ? " selected" : ""}>${escapeHtml(candidate.agentName)}</option>`,
    );
  }

  return options.join("");
}

function createDefaultPlanNode(index) {
  return {
    acceptance_criteria: [],
    branch_suffix: `draft-subtask-${index + 1}`,
    deliverable: "",
    depends_on: [],
    description: "",
    estimated_scope: "",
    recommended_agent: state.workerCandidates.find((candidate) => candidate.selectable)?.agentName
      ?? state.taskDetail?.task?.leadAgentType
      ?? "",
    role: `worker-${index + 1}`,
    template_hint: "custom",
    title: "",
  };
}

function clonePlanDraft(plan) {
  return normalizePlanDraft(JSON.parse(JSON.stringify(plan)));
}

function getTaskDraftStorageKey(taskId) {
  return `${STORAGE_KEYS.draftPrefix}.${taskId}`;
}

function persistCurrentTaskDraft() {
  if (!state.taskDetail?.task?.id || !state.taskPlanDraft) {
    return;
  }

  writeStorage(getTaskDraftStorageKey(state.taskDetail.task.id), JSON.stringify({
    draft: state.taskPlanDraft,
    serverFingerprint: state.taskDetail.task.currentPlanJson,
    taskUpdatedAt: state.taskDetail.task.updatedAt,
  }));
}

function readStoredPlanDraft(storageKey) {
  const rawValue = readStorage(storageKey);

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function getPlanNodes(plan) {
  if (!plan || typeof plan !== "object") {
    return [];
  }

  if (Array.isArray(plan.nodes)) {
    return plan.nodes;
  }

  if (Array.isArray(plan.subtasks)) {
    return plan.subtasks;
  }

  return [];
}

function normalizePlanDraft(plan) {
  if (!plan || typeof plan !== "object") {
    return null;
  }

  const normalizedNodes = getPlanNodes(plan).map((node, index) => ({
    acceptance_criteria: Array.isArray(node?.acceptance_criteria)
      ? node.acceptance_criteria.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean)
      : [],
    branch_suffix: normalizeOptionalText(node?.branch_suffix) ?? `draft-subtask-${index + 1}`,
    deliverable: normalizeOptionalText(node?.deliverable) ?? "",
    depends_on: Array.isArray(node?.depends_on)
      ? node.depends_on.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean)
      : [],
    description: normalizeOptionalText(node?.description) ?? "",
    estimated_scope: normalizeOptionalText(node?.estimated_scope) ?? "",
    recommended_agent: normalizeOptionalText(node?.recommended_agent) ?? "",
    role: normalizeOptionalText(node?.role) ?? normalizeOptionalText(node?.branch_suffix) ?? `worker-${index + 1}`,
    template_hint: normalizeOptionalText(node?.template_hint) ?? "custom",
    title: normalizeOptionalText(node?.title) ?? "",
  }));

  return {
    ...(normalizeOptionalText(plan.notes) ? { notes: normalizeOptionalText(plan.notes) } : {}),
    ...(normalizeOptionalText(plan.template_id) ? { template_id: normalizeOptionalText(plan.template_id) } : {}),
    ...(normalizeOptionalText(plan.template_label) ? { template_label: normalizeOptionalText(plan.template_label) } : {}),
    nodes: normalizedNodes,
    subtasks: normalizedNodes,
  };
}

function updatePlanNodes(plan, nodes) {
  const nextPlan = normalizePlanDraft({
    ...plan,
    nodes,
  });

  if (!nextPlan) {
    return plan;
  }

  return nextPlan;
}

function splitPlanDependencies(value) {
  return String(value ?? "")
    .split(/[\n,]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function splitAcceptanceCriteria(value) {
  return String(value ?? "")
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildPlanGraphColumns(planNodes) {
  const nodesByBranchSuffix = new Map(planNodes.map((node) => [node.branch_suffix, node]));
  const levelCache = new Map();

  const resolveLevel = (node) => {
    if (levelCache.has(node.branch_suffix)) {
      return levelCache.get(node.branch_suffix);
    }

    const dependencies = Array.isArray(node.depends_on) ? node.depends_on : [];
    const level = dependencies.length === 0
      ? 0
      : Math.max(...dependencies.map((dependency) => resolveLevel(nodesByBranchSuffix.get(dependency) ?? { branch_suffix: dependency, depends_on: [] }))) + 1;

    levelCache.set(node.branch_suffix, level);
    return level;
  };

  const columns = new Map();

  planNodes.forEach((node, index) => {
    const level = resolveLevel(node);

    if (!columns.has(level)) {
      columns.set(level, []);
    }

    columns.get(level).push({ index, node });
  });

  return [...columns.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([level, nodes]) => ({ level, nodes }));
}

function buildPlanAcceptanceCriteriaItems(criteria) {
  if (!Array.isArray(criteria) || criteria.length === 0) {
    return `<li>${escapeHtml(t("noAcceptanceCriteria"))}</li>`;
  }

  return criteria.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function hydrateExecutionState(detail) {
  state.liveSessionOutputs = new Map(
    (detail?.sessions ?? []).map((session) => [session.id, session.outputBuffer ?? ""]),
  );
  syncExecutionDrafts(detail);
  syncExecutionSelection(detail);
}

function applySubTaskStatusEvent(payload) {
  if (!matchesSelectedTask(payload?.taskId)) {
    return;
  }

  ensureExecutionCollections();

  const nextSubTask = {
    ...findRecordById(state.taskDetail.subTasks, payload.id ?? payload.subtaskId),
    ...payload,
    id: payload.id ?? payload.subtaskId,
    launchMetadata: payload.launchMetadata ?? payload.attachments ?? null,
  };

  state.taskDetail.subTasks = upsertRecord(state.taskDetail.subTasks, nextSubTask);
  syncExecutionSelection(state.taskDetail);
  renderTaskDetail();
}

function applySubTaskReviewEvent(payload) {
  if (!matchesSelectedTask(payload?.taskId)) {
    return;
  }

  ensureExecutionCollections();

  const existingSubTask = findRecordById(state.taskDetail.subTasks, payload.id ?? payload.subtaskId);

  if (!existingSubTask) {
    return;
  }

  const nextSubTask = {
    ...existingSubTask,
    latestReviewDecision: payload.decision ?? existingSubTask.latestReviewDecision ?? null,
    latestReviewPhase: payload.phase ?? existingSubTask.latestReviewPhase ?? null,
    latestReviewSummary: payload.summary ?? existingSubTask.latestReviewSummary ?? null,
  };

  state.taskDetail.subTasks = upsertRecord(state.taskDetail.subTasks, nextSubTask);
  renderTaskDetail();
}

function applySubTaskAgentChangedEvent(payload) {
  if (!matchesSelectedTask(payload?.taskId)) {
    return;
  }

  ensureExecutionCollections();

  const existingSubTask = findRecordById(state.taskDetail.subTasks, payload.id ?? payload.subtaskId);

  if (!existingSubTask) {
    return;
  }

  const nextSubTask = {
    ...existingSubTask,
    agentType: payload.newAgentType ?? existingSubTask.agentType,
  };

  state.taskDetail.subTasks = upsertRecord(state.taskDetail.subTasks, nextSubTask);
  state.executionDrafts.set(nextSubTask.id, {
    ...getExecutionDraft(nextSubTask),
    agentType: nextSubTask.agentType,
  });
  renderTaskDetail();
}

function applySessionStartedEvent(payload) {
  if (!matchesSelectedTask(payload?.taskId)) {
    return;
  }

  ensureExecutionCollections();

  const nextSession = normalizeSessionEventPayload(payload);
  state.taskDetail.sessions = upsertRecord(state.taskDetail.sessions, nextSession);

  if (!state.liveSessionOutputs.has(nextSession.id)) {
    state.liveSessionOutputs.set(nextSession.id, nextSession.outputBuffer ?? "");
  }

  syncExecutionSelection(state.taskDetail);
  renderTaskDetail();
}

function applySessionOutputEvent(payload) {
  if (!matchesSelectedTask(payload?.taskId)) {
    return;
  }

  ensureExecutionCollections();

  const sessionId = payload.sessionId;
  const existingSession = findRecordById(state.taskDetail.sessions, sessionId) ?? {
    id: sessionId,
    outputBuffer: "",
    outputBufferMaxBytes: DEFAULT_OUTPUT_BUFFER_MAX_BYTES,
    sessionType: payload.subtaskId ? "WORKER" : "LEAD",
    status: "RUNNING",
    subTaskId: payload.subtaskId ?? null,
    taskId: payload.taskId,
  };
  const nextVisibleOutput = `${existingSession.outputBuffer ?? ""}${payload.chunk ?? ""}`;
  const nextLiveOutput = `${state.liveSessionOutputs.get(sessionId) ?? existingSession.outputBuffer ?? ""}${payload.chunk ?? ""}`;
  const outputBufferMaxBytes = existingSession.outputBufferMaxBytes ?? DEFAULT_OUTPUT_BUFFER_MAX_BYTES;
  const nextSession = {
    ...existingSession,
    outputBuffer: tailUtf8(nextVisibleOutput, outputBufferMaxBytes),
    outputBufferMaxBytes,
    subTaskId: existingSession.subTaskId ?? payload.subtaskId ?? null,
  };

  state.liveSessionOutputs.set(sessionId, nextLiveOutput);
  state.taskDetail.sessions = upsertRecord(state.taskDetail.sessions, nextSession);
  syncExecutionSelection(state.taskDetail);
  renderTaskDetail();
}

function applySessionEndedEvent(payload) {
  if (!matchesSelectedTask(payload?.taskId)) {
    return;
  }

  ensureExecutionCollections();

  const nextSession = normalizeSessionEventPayload(payload);
  state.taskDetail.sessions = upsertRecord(state.taskDetail.sessions, nextSession);
  syncExecutionSelection(state.taskDetail);
  renderTaskDetail();
}

function matchesSelectedTask(taskId) {
  return state.taskDetail?.task?.id && state.taskDetail.task.id === taskId;
}

function ensureExecutionCollections() {
  if (!state.taskDetail) {
    return;
  }

  state.taskDetail.sessions = Array.isArray(state.taskDetail.sessions)
    ? state.taskDetail.sessions
    : [];
  state.taskDetail.subTasks = Array.isArray(state.taskDetail.subTasks)
    ? state.taskDetail.subTasks
    : [];
}

function normalizeSessionEventPayload(payload) {
  const sessionId = payload.id ?? payload.sessionId;
  const existingSession = findRecordById(state.taskDetail?.sessions, sessionId);

  return {
    ...existingSession,
    ...payload,
    id: sessionId,
    launchMetadata: payload.launchMetadata ?? payload.attachments ?? existingSession?.launchMetadata ?? null,
    subTaskId: payload.subTaskId ?? payload.subtaskId ?? existingSession?.subTaskId ?? null,
  };
}

function findRecordById(records, recordId) {
  if (!Array.isArray(records) || !recordId) {
    return null;
  }

  return records.find((record) => record.id === recordId) ?? null;
}

function upsertRecord(records, nextRecord) {
  const collection = Array.isArray(records) ? records : [];
  const existingIndex = collection.findIndex((record) => record.id === nextRecord.id);

  if (existingIndex < 0) {
    return [...collection, nextRecord];
  }

  return collection.map((record, index) => (
    index === existingIndex ? nextRecord : record
  ));
}

function tailUtf8(value, maxBytes) {
  const bytes = new TextEncoder().encode(value);
  return new TextDecoder().decode(bytes.slice(-maxBytes));
}

function syncExecutionSelection(detail) {
  const subTasks = detail?.subTasks ?? [];

  if (subTasks.length === 0) {
    state.selectedExecutionSubTaskId = null;
    state.selectedExecutionSessionId = null;
    return;
  }

  const selectedSubTask = subTasks.find((subTask) => subTask.id === state.selectedExecutionSubTaskId) ?? null;
  const nextSubTask = selectedSubTask
    ?? subTasks.find((subTask) => subTask.status === "RUNNING")
    ?? subTasks.at(0)
    ?? null;

  state.selectedExecutionSubTaskId = nextSubTask?.id ?? null;
  state.selectedExecutionSessionId = resolveFocusedSession(detail, state.selectedExecutionSubTaskId)?.id ?? null;
}

function syncExecutionDrafts(detail) {
  const subTasks = detail?.subTasks ?? [];
  const knownSubTaskIds = new Set(subTasks.map((subTask) => subTask.id));

  state.executionDrafts = new Map(
    [...state.executionDrafts.entries()].filter(([subTaskId]) => knownSubTaskIds.has(subTaskId)),
  );

  for (const subTask of subTasks) {
    if (!state.executionDrafts.has(subTask.id)) {
      state.executionDrafts.set(subTask.id, {
        agentType: subTask.agentType ?? "",
        description: subTask.description ?? "",
      });
    }
  }
}

function getSelectedExecutionSubTask(detail = state.taskDetail) {
  return detail?.subTasks?.find((subTask) => subTask.id === state.selectedExecutionSubTaskId) ?? null;
}

function getExecutionDraft(subTask) {
  if (!subTask) {
    return { agentType: "", description: "" };
  }

  const existingDraft = state.executionDrafts.get(subTask.id);

  if (existingDraft) {
    return existingDraft;
  }

  const nextDraft = {
    agentType: subTask.agentType ?? "",
    description: subTask.description ?? "",
  };
  state.executionDrafts.set(subTask.id, nextDraft);
  return nextDraft;
}

function resolveFocusedSession(detail, subTaskId) {
  if (!subTaskId) {
    return null;
  }

  const sessions = (detail?.sessions ?? []).filter((session) => session.subTaskId === subTaskId);

  if (sessions.length === 0) {
    return null;
  }

  return sessions.find((session) => session.id === state.selectedExecutionSessionId)
    ?? sessions.find((session) => session.status === "RUNNING")
    ?? sessions.at(-1)
    ?? null;
}

function renderFocusedExecution(detail, sessionsBySubTaskId) {
  const selectedSubTask = getSelectedExecutionSubTask(detail);
  const focusedSession = resolveFocusedSession(detail, selectedSubTask?.id ?? null);
  const focusedSessions = selectedSubTask ? (sessionsBySubTaskId.get(selectedSubTask.id) ?? []) : [];

  elements.taskExecutionFocus.hidden = !selectedSubTask;

  if (!selectedSubTask) {
    elements.taskExecutionMergeHistory.hidden = true;
    elements.taskExecutionMailbox.hidden = true;
    return;
  }

  state.selectedExecutionSessionId = focusedSession?.id ?? null;
  elements.taskExecutionFocusTitle.textContent = selectedSubTask.title;
  elements.taskExecutionFocusBadge.textContent = focusedSession
    ? translateStatusLabel(focusedSession.status)
    : t("leadSessionPending");
  elements.taskExecutionFocusBadge.className = `badge ${focusedSession?.status === "FAILED" ? "badge--dirty" : focusedSession?.status === "RUNNING" ? "badge--accent-soft" : "badge--outline"}`;
  elements.taskExecutionFocusMeta.textContent = [
    `${selectedSubTask.agentType} · ${countLabel(focusedSessions.length, "sessionsLabelOne", "sessionsLabelOther")}`,
    focusedSession?.logPath ? t("logPathLabel", { path: focusedSession.logPath }) : t("logPending"),
    selectedSubTask.lastError ? t("errorMetaLabel", { error: selectedSubTask.lastError }) : null,
  ].filter(Boolean).join(" · ");
  const draft = getExecutionDraft(selectedSubTask);
  const mergeRecords = Array.isArray(selectedSubTask.mergeRecords) ? selectedSubTask.mergeRecords : [];
  const latestMergeRecord = mergeRecords.at(-1) ?? null;
  const canReworkNow = selectedSubTask.status === "REVIEW_PENDING"
    && ["REJECTED", "REWORK"].includes(selectedSubTask.latestReviewDecision);
  const canReassign = canReassignMember(detail.task, selectedSubTask);
  const canCancel = canCancelMember(detail.task, selectedSubTask);
  const canChangeAgent = canReplaceWorker(detail.task, selectedSubTask);
  const canConfirmDiscard = selectedSubTask.status === "DISCARD_PENDING";
  const canRebaseRetry = detail.task.status === "ACTION_REQUIRED"
    && selectedSubTask.status === "ACCEPTED"
    && latestMergeRecord?.operation === "MERGE"
    && latestMergeRecord?.status === "CONFLICT";
  const canResumeMerge = detail.task.status === "ACTION_REQUIRED"
    && detail.subTasks?.some((subTask) => subTask.status === "ACCEPTED");
  const hasRecoveryPanel = canChangeAgent
    || canReassign
    || canCancel
    || canConfirmDiscard
    || canRebaseRetry
    || canResumeMerge
    || selectedSubTask.latestReviewDecision
    || selectedSubTask.latestReviewSummary
    || mergeRecords.length > 0
    || ["ACCEPTED", "DISCARD_PENDING", "REWORK_REQUIRED"].includes(selectedSubTask.status);

  elements.taskExecutionReview.hidden = !hasRecoveryPanel;
  elements.taskExecutionReworkField.hidden = !canReworkNow;
  elements.taskExecutionAgentField.hidden = !canChangeAgent;
  elements.taskExecutionCancelButton.hidden = !canCancel;
  elements.taskExecutionConfirmDiscardButton.hidden = !canConfirmDiscard;
  elements.taskExecutionRebaseRetryButton.hidden = !canRebaseRetry;
  elements.taskExecutionReassignButton.hidden = !canReassign;
  elements.taskExecutionReworkButton.hidden = !canReworkNow;
  elements.taskExecutionResumeMergeButton.hidden = !canResumeMerge;
  elements.taskExecutionChangeAgentButton.hidden = !canChangeAgent;
  elements.taskExecutionReviewActions.hidden = !canReworkNow
    && !canChangeAgent
    && !canReassign
    && !canCancel
    && !canConfirmDiscard
    && !canRebaseRetry
    && !canResumeMerge;

  if (!elements.taskExecutionReview.hidden) {
    if (latestMergeRecord) {
      elements.taskExecutionReviewDecision.textContent = buildMergeStatusLabel(latestMergeRecord.status);
      elements.taskExecutionReviewPhase.textContent = buildMergeOperationLabel(latestMergeRecord.operation);
      elements.taskExecutionReviewSummary.textContent = buildExecutionMergeSummary(selectedSubTask, latestMergeRecord);
    } else if (selectedSubTask.latestReviewDecision || selectedSubTask.latestReviewSummary) {
      elements.taskExecutionReviewDecision.textContent = buildReviewDecisionLabel(selectedSubTask.latestReviewDecision);
      elements.taskExecutionReviewPhase.textContent = buildReviewPhaseLabel(selectedSubTask.latestReviewPhase);
      elements.taskExecutionReviewSummary.textContent = buildExecutionReviewSummary(selectedSubTask);
    } else {
      elements.taskExecutionReviewDecision.textContent = t("recoveryDecision");
      elements.taskExecutionReviewPhase.textContent = t("launchRecoveryPhase");
      elements.taskExecutionReviewSummary.textContent = selectedSubTask.lastError
        ?? t("replacementWorkerNeeded");
    }
  }

  if (canReworkNow) {
    elements.taskExecutionReworkDescription.value = draft.description;
  }

  if (canChangeAgent) {
    elements.taskExecutionAgentSelect.innerHTML = buildWorkerAgentOptions(draft.agentType);
    elements.taskExecutionAgentSelect.value = draft.agentType || selectedSubTask.agentType;
  } else {
    elements.taskExecutionAgentSelect.innerHTML = "";
  }

  if (!canReworkNow) {
    elements.taskExecutionReworkDescription.value = "";
  }

  if (!canReworkNow && !canChangeAgent && !canReassign && !canCancel && !canConfirmDiscard && !canRebaseRetry && !canResumeMerge) {
    clearFeedback(elements.taskExecutionReviewFeedback);
  }

  renderMergeHistory(selectedSubTask);
  renderMailbox(detail, selectedSubTask);

  const previewOutput = focusedSession
    ? stripAnsi(state.liveSessionOutputs.get(focusedSession.id) ?? focusedSession.outputBuffer ?? "")
    : "";

  elements.taskExecutionSessionList.replaceChildren(...focusedSessions.map((session, index) => {
    const button = document.createElement("button");
    const isSelected = session.id === focusedSession?.id;

    button.type = "button";
    button.className = `button ${isSelected ? "button--primary" : "button--secondary"}`;
    button.textContent = t("sessionTabLabel", {
      index: index + 1,
      status: translateStatusLabel(session.status),
    });
    button.addEventListener("click", () => {
      state.selectedExecutionSessionId = session.id;
      renderTaskDetail();
    });

    return button;
  }));

  elements.taskExecutionFocusEmpty.hidden = Boolean(focusedSession);
  elements.taskExecutionFocusPreview.hidden = !focusedSession;

  if (focusedSession) {
    elements.taskExecutionFocusPreview.textContent = previewOutput || t("waitingWorkerOutput");
  } else {
    elements.taskExecutionFocusPreview.textContent = "";
  }
}

function renderMergeHistory(subTask) {
  const mergeRecords = Array.isArray(subTask?.mergeRecords) ? subTask.mergeRecords : [];

  elements.taskExecutionMergeHistory.hidden = !subTask;
  elements.taskExecutionMergeHistoryCount.textContent = countLabel(mergeRecords.length, "attemptCountOne", "attemptCountOther");
  elements.taskExecutionMergeHistoryEmpty.hidden = mergeRecords.length > 0;
  elements.taskExecutionMergeHistoryList.replaceChildren();

  for (const mergeRecord of [...mergeRecords].reverse()) {
    const item = document.createElement("article");
    item.className = "merge-history__item";
    item.innerHTML = `
      <div class="merge-history__header">
        <div>
          <p class="merge-history__title">${escapeHtml(buildMergeOperationLabel(mergeRecord.operation))} · ${escapeHtml(countLabel(mergeRecord.attemptNumber ?? 0, "attemptCountOne", "attemptCountOther"))}</p>
          <p class="merge-history__meta">${escapeHtml([
            mergeRecord.sourceBranch ?? t("unknownSource"),
            mergeRecord.targetBranch ?? t("unknownTarget"),
            mergeRecord.completedAt ? formatTimestamp(mergeRecord.completedAt) : t("mergeStatusPending"),
          ].join(" · "))}</p>
        </div>
        <span class="badge ${buildMergeStatusBadgeClass(mergeRecord.status)}">${escapeHtml(buildMergeStatusLabel(mergeRecord.status))}</span>
      </div>
      <p class="merge-history__summary">${escapeHtml(buildMergeRecordSummary(mergeRecord))}</p>
    `;
    elements.taskExecutionMergeHistoryList.append(item);
  }
}

function renderMailbox(detail, subTask) {
  const mailboxMessages = (detail.mailboxMessages ?? []).filter((message) => (
    message.targetSubTaskId === subTask.id || message.senderSubTaskId === subTask.id
  ));
  const canSendMailbox = ["ACTION_REQUIRED", "EXECUTING", "MERGING", "REVIEWING"].includes(detail.task?.status);

  elements.taskExecutionMailbox.hidden = !subTask;
  elements.taskExecutionMailboxForm.hidden = !canSendMailbox;
  elements.taskExecutionMailboxCount.textContent = countLabel(mailboxMessages.length, "noteCountOne", "noteCountOther");
  elements.taskExecutionMailboxEmpty.hidden = mailboxMessages.length > 0;
  elements.taskExecutionMailboxList.replaceChildren();

  for (const mailboxMessage of [...mailboxMessages].reverse()) {
    const item = document.createElement("article");
    item.className = "mailbox-item";
    item.innerHTML = `
      <div class="mailbox-item__header">
        <div>
          <p class="mailbox-item__title">${escapeHtml(buildMailboxDirectionLabel(detail, mailboxMessage))}</p>
          <p class="mailbox-item__meta">${escapeHtml(formatTimestamp(mailboxMessage.createdAt))}</p>
        </div>
        <span class="badge badge--outline">${escapeHtml(buildMailboxSenderTypeLabel(mailboxMessage.senderType))}</span>
      </div>
      <p class="mailbox-item__content">${escapeHtml(mailboxMessage.content ?? "")}</p>
    `;
    elements.taskExecutionMailboxList.append(item);
  }
}

function buildExecutionStatusBadgeClass(status) {
  switch (status) {
    case "ACCEPTED":
    case "MERGED":
      return "badge--clean";
    case "FAILED":
    case "REWORK_REQUIRED":
    case "DISCARD_PENDING":
      return "badge--dirty";
    case "RUNNING":
    case "REVIEW_PENDING":
      return "badge--accent-soft";
    default:
      return "badge--outline";
  }
}

function buildMergeStatusBadgeClass(status) {
  switch (status) {
    case "SUCCEEDED":
      return "badge--clean";
    case "CONFLICT":
    case "ABORTED":
      return "badge--dirty";
    default:
      return "badge--outline";
  }
}

function buildMergeStatusLabel(status) {
  switch (status) {
    case "SUCCEEDED":
      return t("mergeStatusSucceeded");
    case "CONFLICT":
      return t("mergeStatusConflict");
    case "ABORTED":
      return t("mergeStatusAborted");
    case "PENDING":
      return t("mergeStatusPending");
    default:
      return status ?? t("unknown");
  }
}

function buildMergeOperationLabel(operation) {
  switch (operation) {
    case "MERGE":
      return t("mergeOperationMerge");
    case "REBASE":
      return t("mergeOperationRebase");
    default:
      return operation ?? t("mergeOperationMerge");
  }
}

function buildMergeHistoryHeadline(mergeRecord) {
  if (!mergeRecord) {
    return t("mergeNone");
  }

  return `${buildMergeOperationLabel(mergeRecord.operation)} · ${buildMergeStatusLabel(mergeRecord.status)}`;
}

function buildMergeRecordSummary(mergeRecord) {
  if (mergeRecord.conflictSummary) {
    return mergeRecord.conflictSummary;
  }

  if (mergeRecord.resultCommitSha) {
    return t("resultCommitSummary", { sha: mergeRecord.resultCommitSha.slice(0, 12) });
  }

  return t("mergeFinishedSummary", {
    operation: buildMergeOperationLabel(mergeRecord.operation),
    status: buildMergeStatusLabel(mergeRecord.status).toLowerCase(),
  });
}

function buildExecutionMergeSummary(subTask, mergeRecord) {
  if (mergeRecord.conflictSummary) {
    return mergeRecord.conflictSummary;
  }

  if (mergeRecord.status === "SUCCEEDED" && mergeRecord.operation === "REBASE") {
    return t("rebaseSucceededSummary", { name: subTask.branchName ?? subTask.title });
  }

  if (mergeRecord.status === "SUCCEEDED" && mergeRecord.operation === "MERGE") {
    return t("mergeSucceededSummary", { name: subTask.branchName ?? subTask.title });
  }

  return buildMergeRecordSummary(mergeRecord);
}

function buildExecutionReviewSummary(subTask) {
  if (subTask.latestReviewSummary) {
    return subTask.latestReviewSummary;
  }

  switch (subTask.status) {
    case "ACCEPTED":
      return t("reviewAcceptedSummary");
    case "REWORK_REQUIRED":
      return t("reviewReworkSummary");
    case "DISCARD_PENDING":
      return t("reviewDiscardSummary");
    case "REVIEW_PENDING":
      return t("reviewPendingSummary");
    default:
      return t("reviewUnavailableSummary");
  }
}

function buildMailboxSenderTypeLabel(senderType) {
  switch (senderType) {
    case "SUBTASK":
      return t("mailboxSenderSubtask");
    case "SYSTEM":
      return t("mailboxSenderSystem");
    default:
      return t("mailboxSenderLead");
  }
}

function buildMailboxDirectionLabel(detail, mailboxMessage) {
  const subTaskIndex = new Map((detail?.subTasks ?? []).map((subTask) => [subTask.id, subTask]));
  const senderSubTask = mailboxMessage.senderSubTaskId
    ? subTaskIndex.get(mailboxMessage.senderSubTaskId)
    : null;
  const targetSubTask = mailboxMessage.targetSubTaskId
    ? subTaskIndex.get(mailboxMessage.targetSubTaskId)
    : null;
  const senderLabel = senderSubTask
    ? senderSubTask.title
    : buildMailboxSenderTypeLabel(mailboxMessage.senderType);
  const targetLabel = targetSubTask ? targetSubTask.title : t("mailboxLeadTarget");

  return `${senderLabel} -> ${targetLabel}`;
}

function buildAssignmentSourceLabel(source) {
  switch (source) {
    case "OPERATOR":
      return t("assignmentOperator");
    default:
      return t("assignmentLead");
  }
}

function canReassignMember(task, subTask) {
  return ["ACTION_REQUIRED", "EXECUTING"].includes(task?.status)
    && ["BLOCKED", "CANCELLED", "FAILED", "PENDING", "READY", "REVIEW_PENDING", "REWORK_REQUIRED"].includes(subTask?.status);
}

function canCancelMember(task, subTask) {
  return ["ACTION_REQUIRED", "EXECUTING"].includes(task?.status)
    && ["BLOCKED", "FAILED", "PENDING", "READY", "REVIEW_PENDING", "REWORK_REQUIRED", "RUNNING"].includes(subTask?.status);
}

function canReplaceWorker(task, subTask) {
  return ["ACTION_REQUIRED", "EXECUTING"].includes(task?.status)
    && ["CANCELLED", "FAILED", "REVIEW_PENDING", "REWORK_REQUIRED"].includes(subTask?.status)
    && state.workerCandidates.length > 0;
}

function stripAnsi(value) {
  return String(value ?? "").replaceAll(
    /\u001B(?:\][^\u0007]*(?:\u0007|\u001B\\)|\[[0-?]*[ -/]*[@-~])/g,
    "",
  );
}

function normalizeOptionalText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? t("unknownTime") : date.toLocaleString(state.locale);
}

function isEditablePlanDirty(detail) {
  if (!detail?.task?.currentPlanJson || !state.taskPlanDraft) {
    return false;
  }

  return JSON.stringify(state.taskPlanDraft) !== detail.task.currentPlanJson;
}

function buildPlanSnapshotLabel(snapshot) {
  const sourceLabel = snapshot.source === "RESTORED_FROM_HISTORY"
    ? t("snapshotSourceRestored")
    : snapshot.source === "APPROVED"
      ? t("snapshotSourceApproved")
      : t("snapshotSourceLeadGenerated");

  return t("snapshotVersionLabel", { source: sourceLabel, version: snapshot.version });
}
