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
  navCollapsed: "eat.ui.navCollapsed",
  selectedProjectId: "eat.phase04.selectedProjectId",
  selectedTaskId: "eat.phase04.selectedTaskId",
  sidebarCollapsed: "eat.ui.sidebarCollapsed",
};
const DEFAULT_OUTPUT_BUFFER_MAX_BYTES = 65_536;
const LIVE_STATUS_REFRESH_INTERVAL_MS = 30_000;
const TASK_DOCUMENT_SNAPSHOT_MESSAGE_PREFIX = "Task document snapshot: ";
const TASK_PAUSED_REASON_PREFIX = "Paused by operator from ";
const LEADER_CHAT_SENDABLE_STATUSES = new Set([
  "ACTION_REQUIRED",
  "CLARIFYING",
  "DRAFT",
  "EXECUTING",
  "MERGING",
  "PLANNING",
  "PLAN_REVIEW",
  "REVIEWING",
]);
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
    projectPickerEyebrow: "注册",
    projectPickerTitle: "选择项目路径",
    projectPickerSummary: "通过系统目录树浏览仓库位置，或直接输入绝对路径。最终仍会按 Git 仓库规则校验。",
    projectPickerCancelButton: "取消",
    projectPickerBrowserEyebrow: "浏览",
    projectPickerBrowserTitle: "系统文件树",
    projectPickerManualEyebrow: "输入",
    projectPickerManualTitle: "直接输入路径",
    projectPickerShortcutLabel: "快速跳转",
    projectPickerFilterLabel: "筛选目录",
    projectPickerFilterPlaceholder: "按目录名筛选",
    projectPickerShowHiddenLabel: "显示隐藏目录",
    projectPickerCurrentLabel: "当前目录",
    projectPickerUseCurrentButton: "使用当前目录",
    projectPickerParentButton: "返回上一级",
    projectPickerDirectoryEmpty: "当前目录下没有可浏览的子目录。",
    projectPickerLoading: "目录加载中...",
    projectPickerNoMatch: "没有匹配当前筛选条件的目录。",
    projectPickerBrowseInputButton: "浏览该路径",
    projectPickerSelectedPathLabel: "准备注册",
    projectPickerNoSelection: "尚未选择路径",
    projectPickerRootRoot: "系统根目录",
    projectPickerRootHome: "主目录",
    projectPickerRootWorkspace: "当前工作区",
    projectPickerEntryOpen: "进入",
    projectPickerEntrySelect: "选择",
    projectPickerEntryRepo: "Git 仓库",
    projectPickerEntryFolder: "目录",
    projectPickerEntrySymlink: "符号链接",
    projectPickerPathPlaceholder: "/home/code/EAT",
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
    dashboardTeamEyebrow: "团队",
    dashboardTeamTitle: "Agent Teams",
    dashboardTeamSummary: "按 Agent 团队查看当前任务里的工作区、子分支与运行节奏。",
    dashboardTeamEmpty: "选择一个任务后，这里会按 Agent 团队展示工作区与子分支。",
    dashboardTeamTaskBadge: "当前任务",
    dashboardTeamTaskIdle: "暂无任务",
    dashboardTeamRuntimeMode: "运行模式",
    dashboardTeamMembers: "成员",
    dashboardTeamWorkspaceCount: "工作区",
    dashboardTeamBranchCount: "子分支",
    dashboardTeamWorkingLine: "RUNNING ACTIVE WORKLOAD CLUSTER",
    dashboardTeamStandbyLine: "WAITING FOR NEXT INSTRUCTION CLUSTER",
    dashboardTeamRestingLine: "TEAM IN REST CYCLE",
    dashboardTeamFaultLine: "OPERATOR REVIEW REQUIRED",
    dashboardTeamOpenTask: "查看执行",
    agentCompactActive: "Active Now",
    agentCompactDegraded: "Need Attention",
    agentCompactOffline: "Offline",
    agentCompactStub: "Stub Blocked",
    agentCompactReadySummary: "真实 CLI 已连接，可参与当前调度。",
    agentCompactStubSummary: "未接入真实 CLI，已从可选运行时中排除。",
    agentCompactOfflineSummary: "运行时不可用，当前不参与任务编排。",
    agentCompactDegradedSummary: "运行时可见，但有检查项需要人工关注。",
    createEyebrow: "创建",
    taskFormTitle: "引导式任务创建",
    taskFormTitleSimple: "创建任务",
    taskFormSummary: "选择黄金路径模板后，系统会直接生成一个可审阅的 DAG 草稿；不选模板则保留自定义草稿创建方式。",
    showJourneyButton: "查看执行主线",
    closeButton: "关闭",
    helpBaselineTitle: "基线分支是任务的起点，所有子任务都从这里派生。",
    helpStartPointLabel: "选择一个已有分支作为新基线的起始点。",
    helpLeadAgentLabel: "Lead 负责需求澄清和任务拆分，是你的主要对话对象。",
    helpTaskTitleLabel: "简明描述任务目标，160 字以内。",
    helpTaskDescriptionLabel: "详细说明需求、约束条件和验收标准。",
    helpAttachmentsLabel: "支持图片、PDF、Markdown、代码文件。不支持或超限文件会被拒绝。",
    taskCreateJourneyEyebrow: "执行主线",
    taskCreateJourneyTitle: "创建后系统会怎么引导你",
    taskCreateJourneyStandardBadge: "标准路径",
    taskCreateJourneyGuidedBadge: "模板加速",
    taskCreateJourneySummaryStandard: "创建后会先进入任务列表，与 lead 澄清需求，再进入计划审阅。",
    taskCreateJourneySummaryGuided: "模板会先帮你搭好起点。创建后仍会进入任务列表；如果模板已生成草稿，界面会直接提示你去计划审阅。",
    taskJourneyStepRegister: "注册项目",
    taskJourneyStepTemplate: "选择模板",
    taskJourneyStepCreate: "创建任务",
    taskJourneyStepClarify: "与 Lead 对话",
    taskJourneyStepPlanReview: "计划审阅",
    taskJourneyStepExecute: "执行与集成",
    taskJourneyStateDone: "已完成",
    taskJourneyStateCurrent: "当前",
    taskJourneyStateNext: "下一步",
    taskJourneyStateLater: "后续",
    taskJourneyStateAttention: "待接管",
    guidedFlowEyebrow: "黄金路径",
    guidedFlowTitle: "模板与引导步骤",
    guidedFlowEmpty: "模板列表暂时不可用，仍可继续创建自定义任务。",
    guidedTemplateCustomTitle: "自定义任务",
    guidedTemplateCustomDescription: "从空白任务开始，先澄清需求，再由 lead 生成执行计划。",
    guidedTemplateSelectedLabel: "当前选择",
    guidedTemplateRolesLabel: "建议角色",
    guidedTemplateStepsLabel: "推荐步骤",
    guidedTemplateScenarioLabel: "推荐场景",
    guidedTemplateClearButton: "切换为自定义草稿",
    guidedDemoTitle: "Todo 演示建议",
    guidedDemoBody: "推荐先选择“全栈 Web 应用”，再使用类似“做一个全栈 Todo 应用，包含认证、数据库和 React 前端。”的标题和描述。",
    guidedDemoHint: "引导任务会更快到达计划审阅，但不会绕过后续的审批、执行监督和 integration gate。",
    taskCreateBaselineEyebrow: "执行基线",
    taskCreateBaselineTitle: "基线与 Lead",
    taskCreateBriefEyebrow: "任务范围",
    taskCreateBriefTitle: "任务说明与附件",
    baseBranchLabel: "基线分支",
    baseBranchModeNewBadge: "新建基线",
    baseBranchModeExistingBadge: "已有分支",
    baseBranchModeNewLabel: "默认新建基线分支",
    baseBranchModeExistingLabel: "直接使用已有分支",
    baseBranchStartPointLabel: "起始分支",
    baseBranchNewNameLabel: "新基线分支名",
    baseBranchNewNamePlaceholder: "task/main/workspace",
    baseBranchExistingLabel: "已有基线分支",
    baseBranchSummaryPlaceholder: "将从当前分支派生新的任务基线。",
    taskCreateFlowSummaryDraft: "创建后会先进入草稿任务，你可以先和 lead 澄清，再进入计划审阅。",
    taskCreateFlowSummaryGuided: "创建后会先进入任务列表；如果模板已生成草稿，界面会直接提示你去计划审阅。",
    taskCreateFlowSummaryExisting: "当前将直接使用已有分支 {branch} 作为任务基线。",
    taskCreateFlowSummaryNew: "将从 {source} 派生新的任务基线 {branch}。",
    leadAgentLabel: "Lead Agent",
    taskTitleLabel: "任务标题",
    taskDescriptionLabel: "需求描述",
    attachmentsLabelStatic: "附件",
    attachmentsHint: "支持图片、PDF/Markdown/文本文件，以及基于文本的代码文件。不支持或超限文件会在任务创建完成前被拒绝。",
    createTaskButton: "创建任务",
    createGuidedTaskButton: "创建引导任务",
    tasksEyebrow: "工作区",
    taskListTitle: "工作区",
    taskListSummary: "先与 Lead 对齐任务文档，再确认 agent 分工，最后批准执行方案。",
    workspaceTaskRailTitle: "任务工作台",
    showArchivedTasksButton: "显示归档",
    hideArchivedTasksButton: "隐藏归档",
    taskListArchivedTitle: "已归档",
    taskListArchivedBadge: "已归档",
    taskListEmptyArchived: "当前所选项目还没有任务。",
    taskListEmptyActiveOnly: "当前没有未归档任务。打开“显示归档”可以查看历史任务。",
    taskArchiveButton: "归档",
    taskUnarchiveButton: "恢复",
    taskPauseButton: "暂停",
    taskDeleteButton: "删除",
    taskActionDialogEyebrow: "任务操作",
    taskActionArchiveTitle: "归档任务",
    taskActionPauseTitle: "暂停任务",
    taskActionDeleteTitle: "删除任务",
    taskActionArchiveSummary: "已归档任务会从默认列表隐藏，但仍保留记录，之后可以恢复。",
    taskActionPauseSummary: "暂停会停止当前任务的实时会话，并将任务切换到可安全检查或删除的状态。",
    taskActionDeleteSummary: "删除任务会移除本地任务记录。若任务仍在推进，必须先暂停并确认会话已停止。",
    taskActionDeleteBranchesLabel: "同时删除任务相关分支和 worktree",
    taskActionDeleteBranchesHint: "默认不勾选。仅会清理任务主线分支和子任务分支，不会删除项目原始主分支。",
    taskActionDeleteBranchesActiveHint: "进行中的任务需要先暂停；暂停后删除时，才会按勾选结果清理任务分支和 worktree。",
    taskActionArchiveConfirmButton: "确认归档",
    taskActionPauseConfirmButton: "确认暂停",
    taskActionDeleteConfirmButton: "确认删除",
    taskArchivedHint: "已归档，可恢复或删除。",
    taskPausedStatusLabel: "已暂停",
    taskPausedHint: "已暂停，可删除或保留等待后续处理。",
    taskDeleteRequiresPauseHint: "进行中的任务需要先暂停，确认停止后才能删除。",
    refreshTasksButton: "刷新任务",
    taskListEmpty: "当前所选项目还没有任务。",
    clarificationEyebrow: "澄清",
    clarificationTitle: "Leader 对话",
    leaderConversationEyebrow: "Leader 对话",
    leaderConversationTitle: "Leader 实时会话",
    leaderConversationDraftSummary: "你只和 Leader 对话。先发送第一条任务说明，Lead 会开始整理可确认的任务文档草稿。",
    leaderConversationClarifyingSummary: "当前正在围绕任务文档草稿继续澄清。把范围、约束和验收标准补齐，确认右侧文档无误后再点“已确认任务文档”。",
    leaderConversationPlanningSummary: "任务文档已确认。Leader 正在根据文档生成 agent 分工、依赖关系和执行方案。",
    leaderConversationPlanReadySummary: "执行方案已经生成。先确认右侧 agent 分配和依赖无误，再进入计划审阅并批准执行方案。",
    leaderConversationPausedSummary: "任务已被暂停，实时会话已停止。确认无误后才能删除，或保留当前任务稍后处理。",
    leaderConversationExecutionSummary: "需求和分配已确认。后续由 Leader 继续编排执行，操作员不直接和子 agent 对话。",
    leaderConversationEmptyOutput: "这里会显示 Leader 的实时输出。",
    taskMessageBranchHint: "当前分支 · {branch}",
    taskMessageQueueIdle: "当前空闲",
    taskMessageQueueRunning: "Leader 正在处理当前消息",
    taskMessageQueueQueued: "{count} 条消息排队中，空闲后自动发送",
    taskMessageQueuePaused: "队列已暂停，确认后可重新发送",
    taskMessageQueuedLabel: "排队中",
    taskMessageRunningLabel: "执行中",
    taskMessageStoppedLabel: "已中止",
    taskMessageWithdrawButton: "撤回",
    taskMessageStopButton: "中止执行",
    taskMessageStopping: "正在中止...",
    sendMessageHotkey: "Alt+Enter",
    sendMessageQueuedButton: "加入排队",
    sendPlanFeedbackLabel: "继续和 Leader 调整分配",
    sendPlanFeedbackPlaceholder: "指出需要调整的任务拆分、依赖关系、分支策略或验收方式。",
    sendPlanningMessageLabel: "补充新的计划约束",
    sendPlanningMessagePlaceholder: "继续补充会影响任务拆分或计划生成的条件。",
    sendExecutionMessageLabel: "向 Leader 发送执行调整",
    sendExecutionMessagePlaceholder: "补充执行中的变更、优先级调整、风险说明或临时决策。",
    sendReadonlyMessageLabel: "Leader 对话只读",
    sendReadonlyMessagePlaceholder: "当前任务已结束，Leader 对话已切换为只读。",
    leaderPlanArtifactTitle: "Leader 输出了计划草稿",
    leaderPlanArtifactHint: "点击展开查看原始内容",
    leaderLongOutputTitle: "Leader 长输出",
    leaderLongOutputHint: "展开查看完整内容",
    leaderPlanEyebrow: "Leader 规划",
    leaderPlanTitle: "分配预览",
    leaderPlanEmpty: "还没有可展示的分配方案。",
    leaderPlanSummaryDraft: "确认需求后，Leader 会在这里给出任务拆分、依赖关系和推荐执行成员。",
    leaderPlanSummaryReady: "以下是 Leader 当前给出的任务拆分预览。你只需要和 Leader 确认，不直接和子 agent 对话。",
    leaderPlanWaitingBadge: "待生成",
    leaderPlanReadyBadge: "已生成",
    leaderPlanTaskLabel: "任务 {index}",
    leaderPlanDependsLabel: "依赖",
    leaderPlanDependsNone: "无依赖",
    leaderPlanBranchLabel: "分支",
    leaderPlanAgentLabel: "执行成员",
    leaderPlanRoleLabel: "角色",
    executionPlanEyebrow: "执行方案",
    executionPlanTitle: "分配预览",
    executionPlanEmpty: "执行方案还在生成中。",
    executionPlanSummaryGenerating: "任务文档已确认。Leader 正在整理执行成员、依赖和分支策略。",
    executionPlanSummaryReady: "以下是当前执行拆分。点击条目查看细节，确认无误后再进入计划审阅。",
    executionPlanWaitingBadge: "生成中",
    executionPlanReadyBadge: "待执行确认",
    executionPlanLoadingLabel: "执行方案生成中",
    workspacePreviewCountDocument: "{count} 个章节",
    workspacePreviewCountPlan: "{count} 个执行单元",
    workspacePreviewGuideTaskDoc: "左侧澄清会实时沉淀到这里。",
    workspacePreviewGuideTaskDocConfirmed: "这份文档已锁定，等待执行方案生成。",
    workspacePreviewGuideExecutionPlanPending: "生成完成后，可逐条查看拆分和依赖。",
    workspacePreviewGuideExecutionPlan: "点击条目查看拆分、依赖和执行成员。",
    taskDocEyebrow: "任务文档",
    taskDocTitle: "任务文档",
    taskDocEmpty: "Lead 会先围绕需求整理一份可确认的任务文档草稿。",
    taskDocSummaryDraft: "这里展示任务文档的基础信息。",
    taskDocSummaryClarifying: "这里实时汇总当前已确认的任务基础信息。",
    taskDocSummaryConfirmed: "任务文档已确认，这里固定展示基础信息。",
    taskDocLoadingLabel: "任务文档整理中",
    taskDocBadgeDraft: "草稿中",
    taskDocBadgeReady: "待确认",
    taskDocBadgeConfirmed: "已确认",
    taskDocGoalLabel: "任务目标",
    taskDocScopeLabel: "工作范围",
    taskDocClarificationLabel: "补充约束",
    taskDocAcceptanceLabel: "验收与验证",
    taskDocContextLabel: "上下文",
    taskDocConfirmLabel: "确认后动作",
    taskDocProjectLabel: "项目",
    taskDocBaseBranchLabel: "基线分支",
    taskDocAttachmentsSummaryLabel: "附件",
    taskDocClarificationEmpty: "还没有补充约束。继续在左侧对话里补齐范围、字段、交互和验收标准。",
    taskDocScopeEmpty: "工作范围还没有稳定下来。继续补齐涉及页面、接口、数据、交互边界和不做什么。",
    taskDocAcceptanceEmpty: "验收与验证方式还没有明确下来。继续补齐测试、检查点、交付物和完成标准。",
    taskDocContextEmpty: "无附件；将基于当前项目和任务基线分支继续澄清。",
    taskDocConfirmHint: "确认这份任务文档无误后，点击“已确认任务文档”。系统随后才会进入 agent 分工与执行方案生成。",
    taskStageEyebrow: "主线",
    taskStageTitle: "当前阶段与下一步",
    taskNextActionEyebrow: "当前阶段与下一步",
    taskNextDraftTitle: "先写给 Lead 的第一条消息",
    taskNextDraftSummary: "任务还没有启动真实 Lead 会话。先在下方写清你要做什么、限制条件和期望结果，再开始澄清。",
    taskNextClarifyingTitle: "先把任务文档和 Lead 对齐",
    taskNextClarifyingSummary: "继续把范围、约束和验收标准聊清楚，确认右侧任务文档无误后，再点击“已确认任务文档”。",
    taskNextPlanningTitle: "等待执行方案生成完成",
    taskNextPlanningSummary: "系统正在根据已确认的任务文档生成并校验 agent 分工。生成完成后，这个任务会自动进入计划审阅。",
    taskNextPlanReviewTitle: "确认 agent 分工后再批准执行方案",
    taskNextPlanReviewSummary: "执行方案已经准备好。先检查分支、依赖和执行成员，再批准执行方案。",
    taskNextPausedTitle: "任务已暂停，可删除或保留",
    taskNextPausedSummary: "所有实时会话都已停止。确认不再需要后再删除；若要继续推进，需要后续恢复方案。",
    taskNextExecutingTitle: "去运行看板跟进执行状态",
    taskNextExecutingSummary: "当前任务已经进入执行或审查阶段。下一步应在运行看板里查看团队状态和阻塞。",
    taskNextActionRequiredTitle: "先处理阻塞，再恢复推进",
    taskNextActionRequiredSummary: "当前任务存在失败、冲突或人工决策项。先去运行看板处理，再继续推进。",
    taskNextCompletedTitle: "任务已完成，可回看执行结果",
    taskNextCompletedSummary: "主线已经走完。你可以去运行看板回看执行、审查和集成结果。",
    taskNextFailedTitle: "任务已中断，需要先排查原因",
    taskNextFailedSummary: "当前任务未能正常推进。先去运行看板查看失败原因和恢复入口。",
    taskDecisionEyebrow: "当前决策",
    taskDecisionTitleIdle: "等待自动推进",
    taskDecisionSummaryIdle: "系统会在条件满足时继续推进，你只需要盯住阻塞和最终验收。",
    taskDecisionBadgeIdle: "等待中",
    taskDecisionTitleBlocked: "先处理人工阻塞",
    taskDecisionTitleReady: "可以进入验收预览",
    taskDecisionTitleLive: "正在网页内验收成品",
    taskDecisionTitleConverging: "等待链路自动收敛",
    taskDecisionBadgeBlocked: "需接管",
    taskDecisionBadgeReady: "可验收",
    taskDecisionBadgeLive: "预览中",
    taskDecisionBadgeConverging: "自动推进",
    taskDecisionSummaryBlocked: "当前有 {count} 个阻塞需要人工接管，处理后系统才会继续推进。",
    taskDecisionSummaryReady: "预览目标、应用入口和最终审查已经就绪，现在可以直接在网页内查看成品。",
    taskDecisionSummaryLive: "预览已经启动，可以在当前工作区直接完成最终成品验收。",
    taskDecisionSummaryConverging: "系统正在自动推进执行、审查和集成，你只需要关注异常与最终验收。",
    taskDecisionPillManual: "人工阻塞 · {count}",
    taskDecisionPillSystem: "Leader / 系统 · {count}",
    taskDecisionPillPreview: "预览目标 · {status}",
    taskDecisionPillReview: "最终审查 · {status}",
    taskDecisionPillRuntime: "网页预览 · {status}",
    taskListHintDraft: "下一步：先写开场消息",
    startClarificationDraftLabel: "发送给 Lead 的第一条消息",
    startClarificationDraftPlaceholder: "先告诉 Lead 你要做什么、范围边界、约束条件和验收标准，再启动澄清。",
    startClarificationDraftButton: "发送并开始澄清",
    taskListHintClarifying: "下一步：继续与 Lead 对话",
    taskListHintPlanning: "下一步：等待计划生成",
    taskListHintPlanReview: "下一步：去计划审阅",
    taskListHintPaused: "已暂停，可删除",
    taskListHintExecuting: "下一步：去运行看板",
    taskListHintActionRequired: "下一步：处理阻塞",
    taskListHintCompleted: "已完成",
    taskListHintFailed: "需要排查",
    refreshTaskButton: "刷新任务",
    taskDetailEmpty: "选择一个任务进入工作区，与 Leader 对话并确认后续分配。",
    selectedTaskEyebrow: "任务概览",
    workspaceOverviewProjectLabel: "项目",
    workspaceOverviewLeadLabel: "Lead",
    workspaceOverviewSessionLabel: "会话",
    cleanupWarningsEyebrow: "清理警告",
    cleanupWarningsTitle: "可能仍需手动清理",
    leadAgentStat: "Lead Agent",
    baseCommitStat: "基线提交",
    latestSessionStat: "最近会话",
    messagesPersistedStat: "已持久化消息",
    planVersionStat: "计划版本",
    snapshotsStat: "快照数",
    leaderOrchestrationEyebrow: "Leader 编排",
    agentStatusEyebrow: "执行态势",
    agentStatusTitle: "执行态势",
    agentStatusSummary: "展示 Lead、执行成员和当前分支。",
    teamLifecycleTitle: "Leader 编排",
    teamLifecycleSummary: "先查看 lead 协调者和所有具名 worker，再进入聚焦执行与恢复操作。",
    teamEmpty: "计划批准并物化为可执行子任务后，团队成员会显示在这里。",
    leadEyebrow: "Lead",
    coordinatorTitle: "协调者",
    attachmentsEyebrow: "附件",
    taskAttachmentsTitle: "任务范围文件",
    taskAttachmentsEmpty: "这个任务没有附加文件。",
    executionEyebrow: "执行",
    executionBoardTitle: "监督式实时运行看板",
    executionBoardSummary: "执行阶段默认切换到 board-first，总览团队状态、阻塞链路、风险聚合，再深入聚焦单个会话。",
    executionEmpty: "计划批准后，已批准的子任务和 worker 会话会显示在这里。",
    operationsPriorityEyebrow: "执行主线",
    operationsPriorityRunningTitle: "{name} 正在推进",
    operationsPriorityRunningSummary: "当前有 {count} 个子任务在执行。优先关注正在运行的成员，其他节点会按依赖自动推进。",
    operationsPriorityReviewTitle: "Leader 正在收敛已完成结果",
    operationsPriorityReviewSummary: "已有 {count} 个子任务完成执行，系统会自动交给 Leader 审查并决定是否进入合并。",
    operationsPriorityLeaderTitle: "Leader 正在处理中间结果",
    operationsPriorityLeaderSummary: "当前有 {count} 个中间项由 Leader 或系统继续处理，你只需要在最后统一审核。",
    operationsPriorityBlockedTitle: "自动流程正在等待上游",
    operationsPriorityBlockedSummary: "仍有 {count} 个节点在等待依赖完成。上游结果进入主线后，下游会自动启动。",
    operationsPriorityManualTitle: "自动流程被阻塞",
    operationsPriorityManualSummary: "出现 {count} 个无法自动恢复的问题，需要人工接管后才能继续。",
    operationsPriorityMergingTitle: "正在整理合并结果",
    operationsPriorityMergingSummary: "Leader 已完成审查，系统正在把被接受的结果收敛到任务主线。",
    operationsPriorityCompletedTitle: "执行链路已收敛",
    operationsPriorityCompletedSummary: "所有中间流程已经结束，现在只需要你做最后审核。",
    operationsPriorityIdleTitle: "等待新的执行事件",
    operationsPriorityIdleSummary: "当前没有活动中的 worker，系统会在条件满足时继续推进。",
    operationsPriorityAutoBadge: "自动推进中",
    operationsPriorityLeaderBadge: "Leader 处理中",
    operationsPriorityManualBadge: "需要人工接管",
    operationsPriorityFinalBadge: "等待最终审核",
    operationsPriorityDoneBadge: "流程已收敛",
    operationsPriorityAutoCaption: "除最终审核外，无需用户中途介入。",
    operationsPriorityLeaderCaption: "中间审查、返工判断和合并决策都会先交给 Leader 处理。",
    operationsPriorityManualCaption: "只有自动流程无法继续时，才需要用户接管。",
    operationsPriorityFinalCaption: "现在不需要再盯住子任务，只需在最后统一审核结果。",
    operationsBoardEyebrow: "运行看板",
    operationsBoardTitle: "实时运行总览",
    operationsHealthTitle: "运行时与健康",
    operationsRiskTitle: "风险聚合",
    operationsActionEyebrow: "待处理",
    operationsActionTitle: "需要人处理的事项",
    operationsActionEmpty: "当前没有需要人工处理的事项。",
    operationsQueueAutoTitle: "Leader / 系统队列",
    operationsQueueManualTitle: "阻塞与接管",
    operationsQueueAutoSummary: "这些事项会由 Leader 或系统继续处理，你只需要在最后统一审核。",
    operationsQueueManualSummary: "这些问题会阻塞自动推进，需要人工接管后才能继续。",
    operationsQueueCleanSummary: "当前没有额外处理项，系统会继续自动推进。",
    operationsModeLabel: "看板视图",
    operationsGraphButton: "图谱",
    operationsListButton: "列表",
    operationsActivityButton: "活动",
    operationsActivityEmpty: "当前还没有可展示的运行活动。",
    operationsSummaryRunning: "运行中",
    operationsSummaryWaiting: "等待链路",
    operationsSummaryCompleted: "已完成",
    operationsSummaryManual: "人工阻塞",
    operationsSummarySystem: "Leader / 系统",
    operationsSummaryNoAction: "无需",
    operationsSummaryFinalReview: "最终审核",
    operationsSummaryAttention: "接管中",
    operationsHealthLead: "Lead 健康",
    operationsHealthWorkers: "Worker 健康",
    operationsHealthSandbox: "Docker 沙箱",
    operationsHealthRuntime: "运行时模式",
    operationsRiskMailbox: "Mailbox blocker",
    operationsRiskReview: "审查风险",
    operationsRiskMerge: "Merge 冲突",
    operationsRiskIntegration: "Integration 失败",
    operationsRiskLaunch: "启动失败",
    operationsRiskAck: "待确认 handoff",
    operationsModeGraphBadge: "图谱",
    operationsModeListBadge: "列表",
    operationsModeActivityBadge: "活动",
    operationsGraphNoDependencies: "当前执行计划没有依赖边。",
    operationsGraphDependencies: "依赖边",
    operationsGraphMailbox: "Handoff",
    operationsGraphBlocking: "阻塞",
    operationsGraphSatisfied: "已满足",
    operationsGraphAttention: "需关注",
    operationsGraphReady: "已交接",
    operationsGraphLatestEvent: "最近事件",
    operationsActionOpenButton: "打开",
    operationsActionReworkButton: "返工",
    operationsActionDiscardButton: "丢弃",
    operationsActionRebaseButton: "Rebase",
    operationsActionResumeButton: "恢复合并",
    operationsActionReassignButton: "重派发",
    operationsActionReplaceButton: "替换 Agent",
    operationsActionSendNoteButton: "发消息",
    operationsActionViewContext: "查看上下文",
    operationsQueueManualGroupTitle: "需要我处理",
    operationsQueueManualGroupEmpty: "当前没有需要人工接管的阻塞。",
    operationsQueueSystemGroupTitle: "Leader / 系统继续处理",
    operationsQueueSystemGroupEmpty: "当前没有待 Leader 或系统继续收敛的事项。",
    operationsActionContextLead: "Lead",
    operationsActionContextTask: "任务主线",
    operationsActivitySessionStarted: "会话启动",
    operationsActivitySessionEnded: "会话结束",
    operationsActivityMailbox: "Mailbox",
    operationsActivityReview: "审查",
    operationsActivityMerge: "合并",
    operationsActivityFailure: "失败",
    operationsActivityUnknown: "事件",
    operationsActionKindMergeConflict: "Merge 冲突",
    operationsActionKindDiscardPending: "待确认丢弃",
    operationsActionKindReworkRequired: "需要返工",
    operationsActionKindFailedSubtask: "执行失败",
    operationsActionKindSandboxLaunchFailure: "沙箱启动失败",
    operationsActionKindWorkerLaunchFailure: "Worker 启动失败",
    operationsActionKindBlocker: "阻塞",
    operationsActionKindReviewRequest: "审查请求",
    operationsActionKindTestRequest: "测试请求",
    operationsActionKindTaskResumeMerge: "恢复合并",
    operationsActionKindIntegrationAttention: "集成待处理",
    operationsOwnerLeader: "Leader",
    operationsOwnerSystem: "系统",
    operationsOwnerUser: "用户",
    operationsHighlightProgress: "进度",
    operationsHighlightFlow: "流程状态",
    operationsHighlightNext: "当前焦点",
    operationsHighlightNoNext: "等待下一步自动推进",
    operationsRiskAllClear: "当前没有关键风险。",
    integrationEyebrow: "集成发布",
    integrationTitle: "Integration Queue 与 Gate",
    integrationEmpty: "当前还没有 integration run。",
    integrationQueueTitle: "Merge Queue",
    integrationGateTitle: "Release Gates",
    integrationStartButton: "启动集成",
    integrationRetryButton: "重试 Gate",
    integrationRollbackButton: "回退 Run",
    integrationQueueEmpty: "当前没有待集成的队列项。",
    integrationGateEmpty: "当前还没有 gate 结果。",
    integrationMetaBranch: "集成分支",
    integrationMetaRun: "Run 状态",
    integrationMetaQueue: "队列项",
    integrationMetaReleased: "已发布",
    integrationRunQueued: "排队中",
    integrationRunRunning: "运行中",
    integrationRunActionRequired: "待处理",
    integrationRunCompleted: "已完成",
    integrationRunRolledBack: "已回退",
    integrationRunFailed: "失败",
    integrationQueueQueued: "待集成",
    integrationQueueMerged: "已并入集成分支",
    integrationQueueReleased: "已发布到基线",
    integrationQueueDequeued: "已移出队列",
    integrationQueueRolledBack: "已回退",
    integrationQueueFailed: "集成失败",
    integrationGatePassed: "通过",
    integrationGateFailed: "失败",
    integrationDequeueButton: "移出队列",
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
    mailboxInboxTitle: "收件箱",
    mailboxInboxEmpty: "当前节点还没有收到结构化交接。",
    mailboxOutboxTitle: "发件箱",
    mailboxOutboxEmpty: "当前节点还没有主动发出结构化交接。",
    mailboxContractsTitle: "合同与接口",
    mailboxContractsEmpty: "当前没有合同类 handoff。",
    mailboxBlockersTitle: "阻塞与请求",
    mailboxBlockersEmpty: "当前没有 blocker 或 review/test 请求。",
    mailboxSenderLabel: "发送方",
    mailboxTargetLabel: "接收方",
    mailboxMessageTypeLabel: "消息类型",
    mailboxBranchRefLabel: "分支引用",
    mailboxArtifactRefsLabel: "Artifact 引用",
    mailboxArtifactRefsPlaceholder: "例如 contract:auth-api, build:test-report",
    mailboxFileRefsLabel: "文件引用",
    mailboxFileRefsPlaceholder: "例如 src/api/auth.js, docs/contracts/auth.md",
    mailboxSchemaJsonLabel: "结构化 Schema",
    mailboxSchemaJsonPlaceholder: '例如 {"route":"POST /api/auth/login"}',
    mailboxRequiresAckLabel: "需要确认",
    sendStructuredHandoffLabel: "发送结构化交接说明",
    sendStructuredHandoffPlaceholder: "补充合同摘要、阻塞原因、交付完成说明或请求事项。",
    mailboxMessageTypeNote: "备注",
    mailboxMessageTypeBlocker: "阻塞",
    mailboxMessageTypeDeliverableReady: "交付完成",
    mailboxMessageTypeApiContract: "API 合同",
    mailboxMessageTypeDbContract: "数据库合同",
    mailboxMessageTypeTestRequest: "测试请求",
    mailboxMessageTypeReviewRequest: "审查请求",
    mailboxArtifactRefChip: "Artifact",
    mailboxFileRefChip: "文件",
    mailboxBranchRefChip: "分支",
    mailboxSchemaChip: "Schema",
    mailboxAckRequiredChip: "需确认",
    mailboxToLeadOption: "Lead",
    sendHandoffNoteButton: "发送交接说明",
    executionFocusEmpty: "选择一个子任务摘要，即可查看最新 worker 会话，而不必同时挂载所有终端。",
    planDraftEyebrow: "执行方案",
    currentPlanDraftTitle: "当前计划草稿",
    planEmpty: "确认任务文档后会触发执行方案生成、校验与草稿持久化。",
    planEditorHint: "批准执行方案前可先编辑草稿。变更仅保存在当前浏览器，直到草稿同步功能上线。",
    planViewLabel: "计划视图",
    planGraphViewButton: "图谱视图",
    planListViewButton: "列表视图",
    planTemplateLabel: "模板种子",
    applyTemplateButton: "应用模板",
    planTemplateHint: "用常见团队骨架快速初始化执行方案，之后仍需人工审阅并批准。",
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
    graphColumnLabel: "步骤 {count}",
    planNodeDetailTitle: "子任务详情",
    planNodeDetailSummary: "主区只保留摘要卡片，完整字段在这里查看和编辑。",
    planNodeRoleAgentMeta: "{role} · {agent}",
    planNodeNoAgent: "未分配 Agent",
    planSequenceParallelLabel: "并行 {count}",
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
    confirmRequirementsButton: "已确认任务文档",
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
    archiving: "归档中...",
    deleting: "删除中...",
    restoring: "恢复中...",
    relaunching: "重新启动中...",
    switching: "切换中...",
    reassigning: "重新派发中...",
    cancelling: "取消中...",
    rebasing: "Rebase 中...",
    pausing: "暂停中...",
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
    agentCheckAvailability: "可用性",
    agentCheckAuth: "认证",
    agentCheckBinary: "二进制",
    agentCheckRuntime: "运行时模式",
    agentCheckWorkerSandbox: "Worker 沙箱",
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
    teamStateWorking: "工作中",
    teamStateStandby: "待命",
    teamStateResting: "休息中",
    teamStateFault: "故障",
    teamBranchListLabel: "子分支",
    teamWorkspaceListLabel: "工作区",
    teamPilotDeckLabel: "团队成员",
    teamRuntimeSummaryLabel: "真实状态",
    teamBranchesSummary: "{count} 个分支",
    teamWorkspacesSummary: "{count} 个工作区",
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
    planDraftReady: "执行方案草稿已可审阅。版本 {version} 已保存，可进入下一阶段。",
    planTemplateApplied: "模板骨架已写入当前执行方案草稿，可继续编辑后再批准。",
    planningRetryingOne: "计划正在重试，此前已有 {count} 次校验失败。",
    planningRetryingOther: "计划正在重试，此前已有 {count} 次校验失败。",
    planningInProgress: "执行方案生成中，正在等待 lead agent 输出有效的 JSON 草稿。",
    staleDraftNotice: "服务端草稿已在其他标签页或恢复操作后变更。继续前请先重置本地修改。",
    saveBeforeApprovalButton: "先保存再批准执行方案",
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
    latestServerDraftBeforeApproval: "批准执行方案前请先将本地修改重置为最新服务端草稿。",
    saveDraftBeforeApproval: "请先保存草稿，再批准执行方案。",
    planApprovedIdempotent: "执行方案此前已批准，现复用已物化的子任务。",
    planApprovedNew: "执行方案已批准，子任务已物化并进入执行阶段。",
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
    structuredHandoffSent: "已发送结构化交接说明。",
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
    navDashboard: "控制台",
    navTaskCreate: "任务创建",
    navTasks: "任务列表",
    navWorkspace: "工作区",
    navPlan: "计划审阅",
    navOps: "运行看板",
    navMetrics: "指标",
    sidebarTitle: "项目",
    sidebarActiveAgents: "{count} Agent",
    sidebarRegisterButton: "注册项目",
    brandName: "EAT Agent Workbench",
    navStatusIdle: "就绪",
    collapseNavButton: "收起顶部导航",
    expandNavButton: "展开顶部导航",
    collapseSidebarButton: "收起项目栏",
    expandSidebarButton: "展开项目栏",
    workspaceCommandCenterEyebrow: "任务中心",
    workspaceCommandCenterTitle: "少切页完成计划、交付和验收",
    workspaceCommandCenterBadge: "工作台优先",
    workspaceCommandCenterSummary: "对于全栈工程师，工作区先给你最关键的计划、交付和成品预览入口，复杂情况再展开深层页面。",
    workspaceHubPlanEyebrow: "计划与审批",
    workspaceHubPlanTitleIdle: "等待生成执行计划",
    workspaceHubPlanTitlePlanning: "Leader 正在整理 DAG 草稿",
    workspaceHubPlanTitleReady: "已有可审阅的计划草稿",
    workspaceHubPlanTitleReview: "当前计划等待批准",
    workspaceHubPlanSummaryIdle: "需求确认后，Leader 生成可编辑的 DAG 草稿；只有批准后才会开始执行。",
    workspaceHubPlanSummaryPlanning: "先在工作区确认需求边界，系统会自动继续生成可编辑草稿。",
    workspaceHubPlanSummaryReady: "这里先看摘要；需要改子任务、依赖和角色时，再进入完整计划编辑器。",
    workspaceHubPlanSummaryReview: "计划已经可以批准。只有要修改节点、依赖或分工时，才需要打开完整编辑视图。",
    workspaceHubPlanNote: "需要细改时再进入完整计划编辑器。",
    workspaceHubPlanButton: "展开计划详情",
    workspaceHubPlanCount: "{count} 个子任务",
    workspaceHubDeliveryEyebrow: "运行与交付",
    workspaceHubDeliveryTitleIdle: "等待执行成员物化",
    workspaceHubDeliveryTitleActive: "系统正在自动推进交付链路",
    workspaceHubDeliveryTitleCompleted: "交付链路已完成",
    workspaceHubDeliverySummaryIdle: "批准后系统会自动推进成员执行、Leader 审查和集成；只有异常和最终验收才需要你介入。",
    workspaceHubDeliverySummaryAttention: "当前有 {count} 个需要人工处理的异常或阻塞。正常链路仍会继续由系统和 Leader 推进。",
    workspaceHubDeliverySummaryActive: "当前 {running} 个成员在执行，{waiting} 个在等待，已完成 {completed}/{total} 个子任务。",
    workspaceHubDeliveryNote: "复杂问题仍可进入完整运行看板查看图谱、风险和信箱。",
    workspaceHubDeliveryButton: "展开运行看板",
    workspaceHubDeliveryCount: "{count} 个成员",
    workspaceHubPreviewEyebrow: "最终成品验收",
    workspaceHubPreviewTitleIdle: "还没有启动 Web 预览",
    workspaceHubPreviewTitleStarting: "正在准备可验收预览",
    workspaceHubPreviewTitleRunning: "成品预览已可直接验收",
    workspaceHubPreviewSummaryIdle: "针对全栈仓库自动推荐可预览的应用根和启动命令，也支持你覆盖为自定义命令。",
    workspaceHubPreviewSummaryStarting: "系统正在准备候选分支和应用入口，成功后会直接嵌入当前工作区。",
    workspaceHubPreviewSummaryRunning: "预览已启动，你可以直接在当前页面完成最终成品验收。",
    workspaceHubPreviewNote: "启动后可直接在工作区内进行成品验收，不必跳出到外部浏览器。",
    workspaceHubPreviewButton: "进入成品预览",
    workspaceHubPreviewTargetLabel: "默认目标",
    workspaceHubPreviewTargetFallback: "任务主线",
    previewStudioEyebrow: "Preview Studio",
    previewStudioTitle: "最终成品 Web 预览",
    previewStudioSummary: "用于全栈任务的最终验收：先选取候选交付分支，再快速启动预览，并在当前网页内查看成品效果。",
    previewTargetLabel: "预览目标",
    previewAppRootLabel: "应用根目录",
    previewCommandLabel: "启动命令",
    previewPortLabel: "端口",
    previewPathLabel: "预览路径",
    previewDetectedLabel: "检测结果",
    previewDetectedEmpty: "系统会优先推荐最像可交付页面的应用入口。",
    previewDetectedSummary: "{framework} · {path} · {packageManager}",
    previewStartButton: "启动预览",
    previewRestartButton: "重启预览",
    previewStopButton: "停止预览",
    previewOpenButton: "在新窗口打开",
    previewTargetBadgeLabel: "目标分支",
    previewAppBadgeLabel: "应用目录",
    previewUrlBadgeLabel: "访问地址",
    previewEmpty: "启动后将在这里显示可交互的成品页面预览。",
    previewEmptyFailed: "预览启动失败。请检查命令、应用根目录或日志输出。",
    previewLogsTitle: "预览日志",
    previewLogsIdle: "等待启动",
    previewLogsEmpty: "预览日志会显示在这里。",
    previewStatusIdle: "待启动",
    previewStatusStarting: "启动中",
    previewStatusRunning: "运行中",
    previewStatusStopped: "已停止",
    previewStatusFailed: "失败",
    automationBadgeAuto: "系统推进",
    automationBadgeGate: "人工关卡",
    automationBadgeAccept: "验收就绪",
    automationBadgeDone: "已完成",
    automationSummaryAuto: "系统会继续自动推进执行、审查和集成，你只需要关注少数人工关卡。",
    automationSummaryGate: "当前仍有 {count} 个需要人工接管的节点，处理后系统会继续自动推进。",
    automationSummaryAccept: "代码链路已基本收敛，可以切到预览完成最终成品验收。",
    automationSummaryDone: "代码链路已完成，建议在工作区回看最终交付与成品效果。",
    automationStepIntake: "任务创建",
    automationStepClarify: "Lead 澄清",
    automationStepScope: "范围锁定",
    automationStepPlan: "计划草稿",
    automationStepApprove: "计划批准",
    automationStepMaterialize: "成员物化",
    automationStepExecute: "自动执行",
    automationStepFinalReview: "最终审查",
    automationStepMerge: "集成合并",
    automationStepAcceptance: "Web 验收",
    automationStateDone: "已完成",
    automationStateActive: "系统推进",
    automationStateGate: "待人工关卡",
    automationStateWaiting: "等待上游",
    automationStateReady: "可进入",
    previewReadinessEyebrow: "Acceptance readiness",
    previewReadinessTitle: "最终验收就绪度",
    previewReadinessSummary: "系统会把预览目标、评审收敛和集成状态压缩成验收清单，方便你判断是否可以进入最终验收。",
    previewReadinessProgress: "已满足 {done}/{total} 项",
    previewReadinessPending: "还差 {count} 项即可进入最终验收。",
    previewReadinessReady: "最终验收条件已基本就绪，可以直接启动或查看预览。",
    previewReadinessBlockedBy: "当前还不能验收：{label}",
    previewReadinessBlockedReady: "当前可以验收：{label}",
    previewReadinessBlockedWaiting: "当前仍在等待验收前置条件收敛。",
    previewReadinessItemTargets: "可预览目标已准备",
    previewReadinessItemAppRoots: "应用入口已检测",
    previewReadinessItemManual: "无待接管人工事项",
    previewReadinessItemReview: "最终审查已收敛",
    previewReadinessItemMerge: "集成合并链路可追踪",
    previewReadinessItemRunning: "预览已在工作区内运行",
    previewReadinessHintTargets: "当前任务还没有候选交付分支可供预览。",
    previewReadinessHintAppRoots: "当前仓库还没有检测到可启动的 Web 应用入口。",
    previewReadinessHintManual: "仍有人工关卡未处理，建议先在运行看板中收敛异常。",
    previewReadinessHintReview: "仍有子任务未完成最终审查或仍在执行。",
    previewReadinessHintMerge: "最终审查后，系统会把被接受的结果收敛到任务主线和集成链路。",
    previewReadinessHintRunning: "启动预览后，就可以直接在当前工作区进行成品验收。",
    previewReadinessHintTargetsReady: "已推荐 {label} 作为当前候选交付分支。",
    previewReadinessHintAppRootsReady: "已检测到 {label}，可直接作为预览入口。",
    previewReadinessHintManualReady: "当前没有必须人工接管的阻塞。",
    previewReadinessHintReviewReady: "最终审查已收敛到可合并或可验收状态。",
    previewReadinessHintMergeReady: "当前交付链路已进入 {status}。",
    previewReadinessHintRunningReady: "预览当前正在 {status}，可直接进入成品查看。",
    metricsTitle: "指标概览",
    metricsEmpty: "指标视图即将上线。任务执行统计、Agent 利用率和性能数据会在这里显示。",
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
    projectPickerEyebrow: "Register",
    projectPickerTitle: "Choose a project path",
    projectPickerSummary: "Browse the system directory tree or type an absolute path directly. The final selection is still validated as a Git repository.",
    projectPickerCancelButton: "Cancel",
    projectPickerBrowserEyebrow: "Browse",
    projectPickerBrowserTitle: "System file tree",
    projectPickerManualEyebrow: "Input",
    projectPickerManualTitle: "Enter a path directly",
    projectPickerShortcutLabel: "Shortcuts",
    projectPickerFilterLabel: "Filter directories",
    projectPickerFilterPlaceholder: "Filter by directory name",
    projectPickerShowHiddenLabel: "Show hidden directories",
    projectPickerCurrentLabel: "Current directory",
    projectPickerUseCurrentButton: "Use current directory",
    projectPickerParentButton: "Go to parent",
    projectPickerDirectoryEmpty: "There are no child directories to browse here.",
    projectPickerLoading: "Loading directories...",
    projectPickerNoMatch: "No directories match the current filter.",
    projectPickerBrowseInputButton: "Browse this path",
    projectPickerSelectedPathLabel: "Ready to register",
    projectPickerNoSelection: "No path selected yet",
    projectPickerRootRoot: "System root",
    projectPickerRootHome: "Home",
    projectPickerRootWorkspace: "Current workspace",
    projectPickerEntryOpen: "Open",
    projectPickerEntrySelect: "Select",
    projectPickerEntryRepo: "Git repository",
    projectPickerEntryFolder: "Directory",
    projectPickerEntrySymlink: "Symlink",
    projectPickerPathPlaceholder: "/home/code/EAT",
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
    dashboardTeamEyebrow: "Teams",
    dashboardTeamTitle: "Agent Teams",
    dashboardTeamSummary: "View workspaces, sub-branches, and activity rhythm grouped by Agent team for the current task.",
    dashboardTeamEmpty: "Pick a task to show grouped Agent teams, workspaces, and branches here.",
    dashboardTeamTaskBadge: "Current task",
    dashboardTeamTaskIdle: "No task selected",
    dashboardTeamRuntimeMode: "Runtime",
    dashboardTeamMembers: "Members",
    dashboardTeamWorkspaceCount: "Workspaces",
    dashboardTeamBranchCount: "Branches",
    dashboardTeamWorkingLine: "RUNNING ACTIVE WORKLOAD CLUSTER",
    dashboardTeamStandbyLine: "WAITING FOR NEXT INSTRUCTION CLUSTER",
    dashboardTeamRestingLine: "TEAM IN REST CYCLE",
    dashboardTeamFaultLine: "OPERATOR REVIEW REQUIRED",
    dashboardTeamOpenTask: "Open execution",
    agentCompactActive: "Active Now",
    agentCompactDegraded: "Need Attention",
    agentCompactOffline: "Offline",
    agentCompactStub: "Stub Blocked",
    agentCompactReadySummary: "Real CLI runtime is connected and can participate in orchestration.",
    agentCompactStubSummary: "This runtime is still a stub and is excluded from selectable orchestration.",
    agentCompactOfflineSummary: "Runtime is unavailable and not participating in task orchestration.",
    agentCompactDegradedSummary: "Runtime is visible, but at least one check needs attention.",
    createEyebrow: "Create",
    taskFormTitle: "Guided task creation",
    taskFormTitleSimple: "Create Task",
    taskFormSummary: "Choose a golden-path template to open directly in plan review with a seeded DAG draft, or leave templates unselected to create a custom draft.",
    showJourneyButton: "View Flow",
    closeButton: "Close",
    helpBaselineTitle: "The baseline branch is the starting point for the task; all subtasks branch off from here.",
    helpStartPointLabel: "Select an existing branch as the starting point for the new baseline.",
    helpLeadAgentLabel: "The Lead handles requirement clarification and task breakdown.",
    helpTaskTitleLabel: "Briefly describe the task goal, up to 160 characters.",
    helpTaskDescriptionLabel: "Describe requirements, constraints, and acceptance criteria in detail.",
    helpAttachmentsLabel: "Supports images, PDF, Markdown, and code files. Unsupported or oversized files will be rejected.",
    taskCreateJourneyEyebrow: "Flow",
    taskCreateJourneyTitle: "What happens after you create the task",
    taskCreateJourneyStandardBadge: "Standard path",
    taskCreateJourneyGuidedBadge: "Template accelerated",
    taskCreateJourneySummaryStandard: "After creation, you land in the task list, clarify with the lead, and then move into plan review.",
    taskCreateJourneySummaryGuided: "Templates give you a stronger starting point. You still land in the task list first; if a draft already exists, the UI will point you straight to plan review.",
    taskJourneyStepRegister: "Register project",
    taskJourneyStepTemplate: "Choose template",
    taskJourneyStepCreate: "Create task",
    taskJourneyStepClarify: "Talk to lead",
    taskJourneyStepPlanReview: "Plan review",
    taskJourneyStepExecute: "Execute and integrate",
    taskJourneyStateDone: "Done",
    taskJourneyStateCurrent: "Current",
    taskJourneyStateNext: "Next",
    taskJourneyStateLater: "Later",
    guidedFlowEyebrow: "Golden path",
    guidedFlowTitle: "Templates and guided steps",
    guidedFlowEmpty: "Templates are temporarily unavailable. You can still create a custom task draft.",
    guidedTemplateCustomTitle: "Custom task",
    guidedTemplateCustomDescription: "Start from a blank task, clarify requirements, and let the lead generate the execution plan.",
    guidedTemplateSelectedLabel: "Selected",
    guidedTemplateRolesLabel: "Suggested roles",
    guidedTemplateStepsLabel: "Suggested steps",
    guidedTemplateScenarioLabel: "Best for",
    guidedTemplateClearButton: "Switch to custom draft",
    guidedDemoTitle: "Todo demo suggestion",
    guidedDemoBody: "Start with “Full-stack web app” and use a title/description similar to “Build a full-stack Todo app with auth, database, and a React frontend.”",
    guidedDemoHint: "Guided tasks get to plan review faster, but they still keep approval, supervision, and integration gates intact.",
    taskCreateBaselineEyebrow: "Execution baseline",
    taskCreateBaselineTitle: "Baseline and lead",
    taskCreateBriefEyebrow: "Task scope",
    taskCreateBriefTitle: "Task brief and attachments",
    baseBranchLabel: "Base branch",
    baseBranchModeNewBadge: "New baseline",
    baseBranchModeExistingBadge: "Existing branch",
    baseBranchModeNewLabel: "Create a fresh baseline branch",
    baseBranchModeExistingLabel: "Use an existing branch directly",
    baseBranchStartPointLabel: "Start from",
    baseBranchNewNameLabel: "New baseline branch name",
    baseBranchNewNamePlaceholder: "task/main/workspace",
    baseBranchExistingLabel: "Existing baseline branch",
    baseBranchSummaryPlaceholder: "A fresh task baseline branch will be created from the current branch.",
    taskCreateFlowSummaryDraft: "After creation the task starts as a draft, then moves into clarification before plan review.",
    taskCreateFlowSummaryGuided: "After creation you land in the task list first; if a draft already exists, the UI points you to plan review immediately.",
    taskCreateFlowSummaryExisting: "The task will use the existing branch {branch} as its baseline.",
    taskCreateFlowSummaryNew: "A new task baseline {branch} will be created from {source}.",
    leadAgentLabel: "Lead agent",
    taskTitleLabel: "Task title",
    taskDescriptionLabel: "Requirement description",
    attachmentsLabelStatic: "Attachments",
    attachmentsHint: "Supported types: images, PDF/Markdown/text documents, and text-based code files. Unsupported or oversized files are rejected before task creation finishes.",
    createTaskButton: "Create task",
    createGuidedTaskButton: "Create guided task",
    tasksEyebrow: "Workspace",
    taskListTitle: "Workspace",
    taskListSummary: "Pick a task, finish the task document with the lead, then review agent allocation before approving the execution plan.",
    workspaceTaskRailTitle: "Task desk",
    showArchivedTasksButton: "Show archived",
    hideArchivedTasksButton: "Hide archived",
    taskListArchivedTitle: "Archived",
    taskListArchivedBadge: "Archived",
    taskListEmptyArchived: "There are no tasks for the selected project yet.",
    taskListEmptyActiveOnly: "There are no active tasks right now. Turn on archived tasks to review history.",
    taskArchiveButton: "Archive",
    taskUnarchiveButton: "Restore",
    taskPauseButton: "Pause",
    taskDeleteButton: "Delete",
    taskActionDialogEyebrow: "Task action",
    taskActionArchiveTitle: "Archive task",
    taskActionPauseTitle: "Pause task",
    taskActionDeleteTitle: "Delete task",
    taskActionArchiveSummary: "Archived tasks are hidden from the default list but stay restorable later.",
    taskActionPauseSummary: "Pausing stops the live task sessions and moves the task into a safe, operator-held state.",
    taskActionDeleteSummary: "Deleting a task removes its local record. Active tasks must be paused first and confirmed stopped.",
    taskActionDeleteBranchesLabel: "Also delete task branches and worktrees",
    taskActionDeleteBranchesHint: "Unchecked by default. This only removes the task mainline and subtask branches, not the project's original base branch.",
    taskActionDeleteBranchesActiveHint: "Active tasks must be paused first. Cleanup only runs after the task is already stopped.",
    taskActionArchiveConfirmButton: "Archive task",
    taskActionPauseConfirmButton: "Pause task",
    taskActionDeleteConfirmButton: "Delete task",
    taskArchivedHint: "Archived. Restore or delete when you no longer need it.",
    taskPausedStatusLabel: "Paused",
    taskPausedHint: "Paused. Delete it now or keep it for later inspection.",
    taskDeleteRequiresPauseHint: "Active tasks must be paused before they can be deleted.",
    refreshTasksButton: "Refresh tasks",
    taskListEmpty: "No tasks exist for the selected project yet.",
    clarificationEyebrow: "Clarification",
    clarificationTitle: "Leader conversation",
    leaderConversationEyebrow: "Leader conversation",
    leaderConversationTitle: "Leader live session",
    leaderConversationDraftSummary: "You only talk to the leader. After your first brief, the lead starts shaping a confirmable task document draft.",
    leaderConversationClarifyingSummary: "The lead is still refining the task document draft with you. Keep adding scope, constraints, and acceptance criteria, then confirm the document when it is accurate.",
    leaderConversationPlanningSummary: "The task document is confirmed. The leader is now generating executor allocation, dependencies, and the execution plan.",
    leaderConversationPlanReadySummary: "The execution plan is ready. Confirm the executor split and dependencies before moving into plan review and approval.",
    leaderConversationPausedSummary: "The task is paused and live sessions have stopped. Delete it only after you confirm the current state is safe.",
    leaderConversationExecutionSummary: "Requirements and allocation are already confirmed. The leader continues orchestrating execution; the operator does not chat with sub-agents directly.",
    leaderConversationEmptyOutput: "The leader's live output will appear here.",
    taskMessageBranchHint: "Current branch · {branch}",
    taskMessageQueueIdle: "Idle",
    taskMessageQueueRunning: "The leader is processing the current message",
    taskMessageQueueQueued: "{count} queued and will send automatically when idle",
    taskMessageQueuePaused: "Queue paused. Review and send again when ready.",
    taskMessageQueuedLabel: "Queued",
    taskMessageRunningLabel: "Running",
    taskMessageStoppedLabel: "Stopped",
    taskMessageWithdrawButton: "Withdraw",
    taskMessageStopButton: "Stop",
    taskMessageStopping: "Stopping...",
    sendMessageHotkey: "Alt+Enter",
    sendMessageQueuedButton: "Queue",
    sendPlanFeedbackLabel: "Adjust with the leader",
    sendPlanFeedbackPlaceholder: "Describe the task split, dependencies, branch strategy, or acceptance changes you want.",
    sendPlanningMessageLabel: "Add planning constraints",
    sendPlanningMessagePlaceholder: "Add any new constraints that should affect the plan.",
    sendExecutionMessageLabel: "Send execution updates to the leader",
    sendExecutionMessagePlaceholder: "Add scope changes, priority updates, risks, or execution-time decisions.",
    sendReadonlyMessageLabel: "Leader conversation is read-only",
    sendReadonlyMessagePlaceholder: "This task is finished, so the leader conversation is now read-only.",
    leaderPlanArtifactTitle: "Leader emitted a plan draft",
    leaderPlanArtifactHint: "Expand to inspect the raw content",
    leaderLongOutputTitle: "Leader long output",
    leaderLongOutputHint: "Expand to inspect the full content",
    leaderPlanEyebrow: "Leader planning",
    leaderPlanTitle: "Allocation preview",
    leaderPlanEmpty: "No assignment preview is available yet.",
    leaderPlanSummaryDraft: "After requirements are confirmed, the leader will show task splits, dependencies, and recommended executors here.",
    leaderPlanSummaryReady: "This is the current allocation preview from the leader. You confirm with the leader only; you do not talk to sub-agents directly.",
    leaderPlanWaitingBadge: "Waiting",
    leaderPlanReadyBadge: "Ready",
    leaderPlanTaskLabel: "Task {index}",
    leaderPlanDependsLabel: "Depends on",
    leaderPlanDependsNone: "No dependencies",
    leaderPlanBranchLabel: "Branch",
    leaderPlanAgentLabel: "Executor",
    leaderPlanRoleLabel: "Role",
    executionPlanEyebrow: "Execution plan",
    executionPlanTitle: "Allocation preview",
    executionPlanEmpty: "The execution plan is still being generated.",
    executionPlanSummaryGenerating: "The task document is confirmed. The leader is now shaping executors, dependencies, and branch strategy.",
    executionPlanSummaryReady: "This is the current execution split. Open an item to inspect the detail before moving into plan review.",
    executionPlanWaitingBadge: "Generating",
    executionPlanReadyBadge: "Awaiting execution approval",
    executionPlanLoadingLabel: "Execution plan is being generated",
    workspacePreviewCountDocument: "{count} sections",
    workspacePreviewCountPlan: "{count} execution items",
    workspacePreviewGuideTaskDoc: "Clarification on the left keeps feeding this document.",
    workspacePreviewGuideTaskDocConfirmed: "This document is locked while the execution plan is being generated.",
    workspacePreviewGuideExecutionPlanPending: "Once ready, open each item to inspect split and dependencies.",
    workspacePreviewGuideExecutionPlan: "Open an item to inspect split, dependencies, and executor.",
    taskDocEyebrow: "Task document",
    taskDocTitle: "Task document",
    taskDocEmpty: "The lead will first shape a confirmable task document here.",
    taskDocSummaryDraft: "This panel shows the basic task document information.",
    taskDocSummaryClarifying: "This panel keeps the currently confirmed basics in sync.",
    taskDocSummaryConfirmed: "The task document is confirmed and pinned here as basic information.",
    taskDocLoadingLabel: "Task document is being prepared",
    taskDocBadgeDraft: "Drafting",
    taskDocBadgeReady: "Awaiting confirmation",
    taskDocBadgeConfirmed: "Confirmed",
    taskDocGoalLabel: "Goal",
    taskDocScopeLabel: "Scope",
    taskDocClarificationLabel: "Constraints",
    taskDocAcceptanceLabel: "Acceptance",
    taskDocContextLabel: "Context",
    taskDocConfirmLabel: "After confirmation",
    taskDocProjectLabel: "Project",
    taskDocBaseBranchLabel: "Base branch",
    taskDocAttachmentsSummaryLabel: "Attachments",
    taskDocClarificationEmpty: "No extra constraints yet. Keep using the conversation to pin down scope, data, interactions, and acceptance criteria.",
    taskDocScopeEmpty: "The working scope is not stable yet. Keep clarifying affected pages, APIs, data, interaction boundaries, and what stays out of scope.",
    taskDocAcceptanceEmpty: "Acceptance and verification are still incomplete. Keep clarifying tests, checks, deliverables, and the definition of done.",
    taskDocContextEmpty: "No attachments yet. Clarification will continue from the current project and task base branch.",
    taskDocConfirmHint: "Once this task document looks correct, click “Task document confirmed”. Only then should the system move on to executor allocation.",
    taskStageEyebrow: "Flow",
    taskStageTitle: "Current stage and next step",
    taskNextActionEyebrow: "Current Stage and Next Step",
    taskNextDraftTitle: "Write the first message to the lead",
    taskNextDraftSummary: "A real lead session has not started yet. First write what you want built, the constraints, and the expected outcome, then start clarification.",
    taskNextClarifyingTitle: "Finish the task document with the lead",
    taskNextClarifyingSummary: "Only confirm once the task document is accurate about scope, constraints, and acceptance criteria.",
    taskNextPlanningTitle: "Wait for executor allocation to finish",
    taskNextPlanningSummary: "The system is generating and validating executor allocation from the confirmed task document.",
    taskNextPlanReviewTitle: "Review executor allocation before approval",
    taskNextPlanReviewSummary: "The execution draft is ready. Check branches, dependencies, and executors before approving the execution plan.",
    taskNextPausedTitle: "Task paused. Delete it or keep it",
    taskNextPausedSummary: "All live sessions are stopped. Delete only when you are sure the task is no longer needed.",
    taskNextExecutingTitle: "Open operations and track execution",
    taskNextExecutingSummary: "The task is now executing or under review. The next step is to inspect team state and blockers in operations.",
    taskNextActionRequiredTitle: "Handle blockers before resuming",
    taskNextActionRequiredSummary: "This task needs operator attention because something failed, conflicted, or needs a decision.",
    taskNextCompletedTitle: "The task is complete",
    taskNextCompletedSummary: "The main flow is finished. You can review execution, review, and integration history in operations.",
    taskNextFailedTitle: "The task stopped and needs diagnosis",
    taskNextFailedSummary: "The task did not progress cleanly. Open operations to inspect the failure and recovery controls.",
    taskDecisionEyebrow: "Decision",
    taskDecisionTitleIdle: "Waiting for automatic progress",
    taskDecisionSummaryIdle: "The system keeps moving when conditions are met. You only need to watch blockers and final acceptance.",
    taskDecisionBadgeIdle: "Waiting",
    taskDecisionTitleBlocked: "Resolve manual blockers first",
    taskDecisionTitleReady: "Acceptance preview is ready",
    taskDecisionTitleLive: "Reviewing the product in-browser",
    taskDecisionTitleConverging: "Waiting for the flow to converge",
    taskDecisionBadgeBlocked: "Takeover",
    taskDecisionBadgeReady: "Acceptable",
    taskDecisionBadgeLive: "Preview live",
    taskDecisionBadgeConverging: "Auto flow",
    taskDecisionSummaryBlocked: "{count} blockers need manual takeover before the system can continue.",
    taskDecisionSummaryReady: "Preview targets, app entry, and final review are ready, so you can inspect the product directly in the browser.",
    taskDecisionSummaryLive: "The preview is running, so final product acceptance can happen inside this workspace.",
    taskDecisionSummaryConverging: "Execution, review, and integration are still converging automatically. Focus only on exceptions and final acceptance.",
    taskDecisionPillManual: "Manual blockers · {count}",
    taskDecisionPillSystem: "Lead / system · {count}",
    taskDecisionPillPreview: "Preview target · {status}",
    taskDecisionPillReview: "Final review · {status}",
    taskDecisionPillRuntime: "Web preview · {status}",
    taskListHintDraft: "Next: write the opening message",
    startClarificationDraftLabel: "First message to the lead",
    startClarificationDraftPlaceholder: "Tell the lead what to build, the scope boundaries, constraints, and acceptance criteria before starting clarification.",
    startClarificationDraftButton: "Send and start clarification",
    taskListHintClarifying: "Next: keep talking to the lead",
    taskListHintPlanning: "Next: wait for plan generation",
    taskListHintPlanReview: "Next: open plan review",
    taskListHintPaused: "Paused. Ready to delete",
    taskListHintExecuting: "Next: open operations",
    taskListHintActionRequired: "Next: handle blockers",
    taskListHintCompleted: "Completed",
    taskListHintFailed: "Needs diagnosis",
    refreshTaskButton: "Refresh task",
    taskDetailEmpty: "Select a task to enter the workspace and continue the leader conversation.",
    selectedTaskEyebrow: "Task overview",
    workspaceOverviewProjectLabel: "Project",
    workspaceOverviewLeadLabel: "Lead",
    workspaceOverviewSessionLabel: "Session",
    cleanupWarningsEyebrow: "Cleanup warnings",
    cleanupWarningsTitle: "Manual cleanup may still be required",
    leadAgentStat: "Lead agent",
    baseCommitStat: "Base commit",
    latestSessionStat: "Latest session",
    messagesPersistedStat: "Messages persisted",
    planVersionStat: "Plan version",
    snapshotsStat: "Snapshots",
    leaderOrchestrationEyebrow: "Leader orchestration",
    agentStatusEyebrow: "Execution status",
    agentStatusTitle: "Execution status",
    agentStatusSummary: "Shows the lead, executors, and current branch.",
    teamLifecycleTitle: "Leader orchestration",
    teamLifecycleSummary: "See the lead coordinator and every named worker before drilling into focused execution and recovery actions.",
    teamEmpty: "Team members will appear here after plan approval materializes executable subtasks.",
    leadEyebrow: "Lead",
    coordinatorTitle: "Coordinator",
    attachmentsEyebrow: "Attachments",
    taskAttachmentsTitle: "Task-scoped files",
    taskAttachmentsEmpty: "No attachments were added for this task.",
    executionEyebrow: "Execution",
    executionBoardTitle: "Supervised live operations board",
    executionBoardSummary: "Execution now defaults to a board-first view: inspect team state, blockers, and risk hotspots before drilling into one focused session.",
    executionEmpty: "Approved subtasks and worker sessions will appear here after plan approval.",
    operationsPriorityEyebrow: "Execution lane",
    operationsPriorityRunningTitle: "{name} is moving",
    operationsPriorityRunningSummary: "{count} subtasks are currently running. Focus on active members first; the rest of the graph advances automatically.",
    operationsPriorityReviewTitle: "The lead is converging finished work",
    operationsPriorityReviewSummary: "{count} subtasks have finished execution. The system now routes them to the lead automatically for review and merge decisions.",
    operationsPriorityLeaderTitle: "The lead is handling intermediate outcomes",
    operationsPriorityLeaderSummary: "{count} intermediate items are still being processed by the lead or the system. You only need to review the final result.",
    operationsPriorityBlockedTitle: "The flow is waiting on upstream work",
    operationsPriorityBlockedSummary: "{count} nodes are still waiting on dependencies. Downstream work will start automatically once upstream progress lands.",
    operationsPriorityManualTitle: "Automatic flow is blocked",
    operationsPriorityManualSummary: "{count} problems cannot be recovered automatically and need manual takeover before the flow can continue.",
    operationsPriorityMergingTitle: "Merge results are being consolidated",
    operationsPriorityMergingSummary: "Lead review is done and the system is now collecting accepted work onto the task mainline.",
    operationsPriorityCompletedTitle: "The execution lane has converged",
    operationsPriorityCompletedSummary: "All intermediate work is done. Only the final user review remains.",
    operationsPriorityIdleTitle: "Waiting for the next execution event",
    operationsPriorityIdleSummary: "There are no active workers right now. The system will continue automatically when the next condition is met.",
    operationsPriorityAutoBadge: "Auto advancing",
    operationsPriorityLeaderBadge: "Lead handling",
    operationsPriorityManualBadge: "Manual takeover",
    operationsPriorityFinalBadge: "Final review",
    operationsPriorityDoneBadge: "Converged",
    operationsPriorityAutoCaption: "No user action is needed in the middle of the flow.",
    operationsPriorityLeaderCaption: "Intermediate review, rework calls, and merge decisions are routed through the lead first.",
    operationsPriorityManualCaption: "The user only needs to step in when automatic recovery is no longer possible.",
    operationsPriorityFinalCaption: "You do not need to watch every subtask anymore. Review the final result at the end.",
    operationsBoardEyebrow: "Operations board",
    operationsBoardTitle: "Live execution overview",
    operationsHealthTitle: "Runtime and health",
    operationsRiskTitle: "Risk aggregation",
    operationsActionEyebrow: "Action queue",
    operationsActionTitle: "Human decisions required",
    operationsActionEmpty: "No operator action is required right now.",
    operationsQueueAutoTitle: "Lead / system queue",
    operationsQueueManualTitle: "Blockers and takeover",
    operationsQueueAutoSummary: "These items keep moving through the lead or the system. You only need to review the final result.",
    operationsQueueManualSummary: "These issues block automatic progress and require manual takeover before the flow can continue.",
    operationsQueueCleanSummary: "There are no extra queue items right now. The system keeps advancing automatically.",
    operationsModeLabel: "Board mode",
    operationsGraphButton: "Graph",
    operationsListButton: "List",
    operationsActivityButton: "Activity",
    operationsActivityEmpty: "No live execution activity is available yet.",
    operationsSummaryRunning: "Running",
    operationsSummaryWaiting: "Waiting",
    operationsSummaryCompleted: "Completed",
    operationsSummaryManual: "Manual blockers",
    operationsSummarySystem: "Lead / system",
    operationsSummaryNoAction: "None",
    operationsSummaryFinalReview: "Final review",
    operationsSummaryAttention: "Takeover",
    operationsHealthLead: "Lead health",
    operationsHealthWorkers: "Worker health",
    operationsHealthSandbox: "Docker sandbox",
    operationsHealthRuntime: "Runtime mode",
    operationsRiskMailbox: "Mailbox blockers",
    operationsRiskReview: "Review risk",
    operationsRiskMerge: "Merge conflicts",
    operationsRiskIntegration: "Integration failures",
    operationsRiskLaunch: "Launch failures",
    operationsRiskAck: "Ack-required handoffs",
    operationsModeGraphBadge: "Graph",
    operationsModeListBadge: "List",
    operationsModeActivityBadge: "Activity",
    operationsGraphNoDependencies: "The current execution plan has no dependency edges.",
    operationsGraphDependencies: "Dependencies",
    operationsGraphMailbox: "Handoff",
    operationsGraphBlocking: "Blocking",
    operationsGraphSatisfied: "Satisfied",
    operationsGraphAttention: "Needs attention",
    operationsGraphReady: "Handoff ready",
    operationsGraphLatestEvent: "Latest event",
    operationsActionOpenButton: "Open",
    operationsActionReworkButton: "Rework",
    operationsActionDiscardButton: "Discard",
    operationsActionRebaseButton: "Rebase",
    operationsActionResumeButton: "Resume merge",
    operationsActionReassignButton: "Reassign",
    operationsActionReplaceButton: "Replace agent",
    operationsActionSendNoteButton: "Send note",
    operationsActionViewContext: "View context",
    operationsQueueManualGroupTitle: "Needs my action",
    operationsQueueManualGroupEmpty: "There are no blockers that need manual takeover right now.",
    operationsQueueSystemGroupTitle: "Lead / system queue",
    operationsQueueSystemGroupEmpty: "There is nothing left for the lead or system to keep processing right now.",
    operationsActionContextLead: "Lead",
    operationsActionContextTask: "Task mainline",
    operationsActivitySessionStarted: "Session started",
    operationsActivitySessionEnded: "Session ended",
    operationsActivityMailbox: "Mailbox",
    operationsActivityReview: "Review",
    operationsActivityMerge: "Merge",
    operationsActivityFailure: "Failure",
    operationsActivityUnknown: "Event",
    operationsActionKindMergeConflict: "Merge conflict",
    operationsActionKindDiscardPending: "Discard pending",
    operationsActionKindReworkRequired: "Rework required",
    operationsActionKindFailedSubtask: "Execution failed",
    operationsActionKindSandboxLaunchFailure: "Sandbox launch failure",
    operationsActionKindWorkerLaunchFailure: "Worker launch failure",
    operationsActionKindBlocker: "Blocker",
    operationsActionKindReviewRequest: "Review request",
    operationsActionKindTestRequest: "Test request",
    operationsActionKindTaskResumeMerge: "Resume merge",
    operationsActionKindIntegrationAttention: "Integration attention",
    operationsOwnerLeader: "Lead",
    operationsOwnerSystem: "System",
    operationsOwnerUser: "User",
    operationsHighlightProgress: "Progress",
    operationsHighlightFlow: "Flow state",
    operationsHighlightNext: "Current focus",
    operationsHighlightNoNext: "Waiting for the next automatic step",
    operationsRiskAllClear: "No critical risk is active right now.",
    integrationEyebrow: "Release",
    integrationTitle: "Integration Queue and Gates",
    integrationEmpty: "No integration run has been created yet.",
    integrationQueueTitle: "Merge queue",
    integrationGateTitle: "Release gates",
    integrationStartButton: "Start integration",
    integrationRetryButton: "Retry gates",
    integrationRollbackButton: "Rollback run",
    integrationQueueEmpty: "No queue items are waiting for integration.",
    integrationGateEmpty: "No gate results are available yet.",
    integrationMetaBranch: "Integration branch",
    integrationMetaRun: "Run status",
    integrationMetaQueue: "Queue items",
    integrationMetaReleased: "Released",
    integrationRunQueued: "Queued",
    integrationRunRunning: "Running",
    integrationRunActionRequired: "Action required",
    integrationRunCompleted: "Completed",
    integrationRunRolledBack: "Rolled back",
    integrationRunFailed: "Failed",
    integrationQueueQueued: "Queued",
    integrationQueueMerged: "Merged into integration branch",
    integrationQueueReleased: "Released to base branch",
    integrationQueueDequeued: "Dequeued",
    integrationQueueRolledBack: "Rolled back",
    integrationQueueFailed: "Integration failed",
    integrationGatePassed: "Passed",
    integrationGateFailed: "Failed",
    integrationDequeueButton: "Dequeue",
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
    mailboxInboxTitle: "Inbox",
    mailboxInboxEmpty: "No structured handoff has reached this node yet.",
    mailboxOutboxTitle: "Outbox",
    mailboxOutboxEmpty: "This node has not sent any structured handoff yet.",
    mailboxContractsTitle: "Contracts",
    mailboxContractsEmpty: "No contract handoffs are recorded yet.",
    mailboxBlockersTitle: "Blockers and requests",
    mailboxBlockersEmpty: "No blockers, review requests, or test requests are recorded yet.",
    mailboxSenderLabel: "Sender",
    mailboxTargetLabel: "Target",
    mailboxMessageTypeLabel: "Message type",
    mailboxBranchRefLabel: "Branch ref",
    mailboxArtifactRefsLabel: "Artifact refs",
    mailboxArtifactRefsPlaceholder: "For example contract:auth-api, build:test-report",
    mailboxFileRefsLabel: "File refs",
    mailboxFileRefsPlaceholder: "For example src/api/auth.js, docs/contracts/auth.md",
    mailboxSchemaJsonLabel: "Structured schema",
    mailboxSchemaJsonPlaceholder: 'For example {"route":"POST /api/auth/login"}',
    mailboxRequiresAckLabel: "Requires acknowledgement",
    sendStructuredHandoffLabel: "Send a structured handoff",
    sendStructuredHandoffPlaceholder: "Summarize the contract, blocker, deliverable, or request.",
    mailboxMessageTypeNote: "Note",
    mailboxMessageTypeBlocker: "Blocker",
    mailboxMessageTypeDeliverableReady: "Deliverable ready",
    mailboxMessageTypeApiContract: "API contract",
    mailboxMessageTypeDbContract: "DB contract",
    mailboxMessageTypeTestRequest: "Test request",
    mailboxMessageTypeReviewRequest: "Review request",
    mailboxArtifactRefChip: "Artifact",
    mailboxFileRefChip: "File",
    mailboxBranchRefChip: "Branch",
    mailboxSchemaChip: "Schema",
    mailboxAckRequiredChip: "Ack required",
    mailboxToLeadOption: "Lead",
    sendHandoffNoteButton: "Send handoff note",
    executionFocusEmpty: "Pick a subtask summary to inspect the latest worker session without mounting every terminal at once.",
    planDraftEyebrow: "Execution plan",
    currentPlanDraftTitle: "Current plan draft",
    planEmpty: "Confirm the task document to trigger execution-plan generation, validation, and draft persistence.",
    planEditorHint: "Edit the draft before approving the execution plan. Changes stay in this browser until plan draft sync is enabled.",
    planViewLabel: "Plan view",
    planGraphViewButton: "Graph view",
    planListViewButton: "List view",
    planTemplateLabel: "Template seed",
    applyTemplateButton: "Apply template",
    planTemplateHint: "Start from a common team DAG skeleton, then keep review and execution approval under operator control.",
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
    graphColumnLabel: "Step {count}",
    planNodeDetailTitle: "Subtask detail",
    planNodeDetailSummary: "The main area only shows summary cards. Open full fields and edit here.",
    planNodeRoleAgentMeta: "{role} · {agent}",
    planNodeNoAgent: "Unassigned agent",
    planSequenceParallelLabel: "Parallel {count}",
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
    confirmRequirementsButton: "Task document confirmed",
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
    archiving: "Archiving...",
    deleting: "Deleting...",
    restoring: "Restoring...",
    relaunching: "Relaunching...",
    switching: "Switching...",
    reassigning: "Reassigning...",
    cancelling: "Cancelling...",
    rebasing: "Rebasing...",
    pausing: "Pausing...",
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
    agentCheckAvailability: "Availability",
    agentCheckAuth: "Auth",
    agentCheckBinary: "Binary",
    agentCheckRuntime: "Runtime mode",
    agentCheckWorkerSandbox: "Worker sandbox",
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
    teamStateWorking: "Working",
    teamStateStandby: "Standby",
    teamStateResting: "Resting",
    teamStateFault: "Fault",
    teamBranchListLabel: "Branches",
    teamWorkspaceListLabel: "Workspaces",
    teamPilotDeckLabel: "Team members",
    teamRuntimeSummaryLabel: "Live status",
    teamBranchesSummary: "{count} branches",
    teamWorkspacesSummary: "{count} workspaces",
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
    planDraftReady: "Execution-plan draft ready for review. Version {version} is saved and available for the next phase.",
    planTemplateApplied: "Template skeleton applied to the current execution-plan draft. Edit it before approval.",
    planningRetryingOne: "Planning is retrying after {count} validation failure.",
    planningRetryingOther: "Planning is retrying after {count} validation failures.",
    planningInProgress: "Execution-plan generation is in progress. Waiting for a valid JSON draft from the lead agent.",
    staleDraftNotice: "Server draft changed in another tab or after a restore. Reset local edits before continuing.",
    saveBeforeApprovalButton: "Save before approving execution",
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
    latestServerDraftBeforeApproval: "Reset local edits to the latest server draft before approving the execution plan.",
    saveDraftBeforeApproval: "Save the draft before approving the execution plan.",
    planApprovedIdempotent: "The execution plan was already approved. Materialized subtasks were reused.",
    planApprovedNew: "The execution plan is approved. Subtasks are materialized and the task has entered execution.",
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
    structuredHandoffSent: "Structured handoff sent.",
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
    navDashboard: "Dashboard",
    navTaskCreate: "Create Task",
    navTasks: "Task List",
    navWorkspace: "Workspace",
    navPlan: "Plan Review",
    navOps: "Operations",
    navMetrics: "Metrics",
    sidebarTitle: "Projects",
    sidebarActiveAgents: "{count} Agents",
    sidebarRegisterButton: "Register Project",
    brandName: "EAT Agent Workbench",
    navStatusIdle: "Ready",
    collapseNavButton: "Collapse top navigation",
    expandNavButton: "Expand top navigation",
    collapseSidebarButton: "Collapse project sidebar",
    expandSidebarButton: "Expand project sidebar",
    workspaceCommandCenterEyebrow: "Task hub",
    workspaceCommandCenterTitle: "Plan, delivery, and acceptance without hopping views",
    workspaceCommandCenterBadge: "Workspace first",
    workspaceCommandCenterSummary: "For full-stack engineers, the workspace now surfaces the shortest route to plan approval, delivery supervision, and final product preview.",
    workspaceHubPlanEyebrow: "Plan and approval",
    workspaceHubPlanTitleIdle: "Waiting for an execution plan",
    workspaceHubPlanTitlePlanning: "The leader is drafting the DAG",
    workspaceHubPlanTitleReady: "A draft plan is ready to inspect",
    workspaceHubPlanTitleReview: "The current plan is waiting for approval",
    workspaceHubPlanSummaryIdle: "After requirements are confirmed, the leader produces an editable DAG draft. Execution only starts after approval.",
    workspaceHubPlanSummaryPlanning: "Confirm scope in the workspace first. The system will continue generating the editable draft automatically.",
    workspaceHubPlanSummaryReady: "Use this summary first. Open the full plan editor only when you need to change nodes, dependencies, or roles.",
    workspaceHubPlanSummaryReview: "The plan is ready to approve. Open the full editor only when you need to adjust nodes, dependencies, or ownership.",
    workspaceHubPlanNote: "Only open the full plan editor when you need fine-grained changes.",
    workspaceHubPlanButton: "Open plan detail",
    workspaceHubPlanCount: "{count} subtasks",
    workspaceHubDeliveryEyebrow: "Delivery flow",
    workspaceHubDeliveryTitleIdle: "Waiting for members to materialize",
    workspaceHubDeliveryTitleActive: "The system is advancing delivery automatically",
    workspaceHubDeliveryTitleCompleted: "The delivery flow is complete",
    workspaceHubDeliverySummaryIdle: "After approval, the system advances worker execution, leader review, and integration automatically. You only step in for exceptions and final acceptance.",
    workspaceHubDeliverySummaryAttention: "There are currently {count} issues or blockers that need manual attention. The normal flow still remains leader and system owned.",
    workspaceHubDeliverySummaryActive: "{running} members are running, {waiting} are waiting, and {completed}/{total} subtasks are complete.",
    workspaceHubDeliveryNote: "Open the full operations board only when you need graph, risk, or mailbox depth.",
    workspaceHubDeliveryButton: "Open operations board",
    workspaceHubDeliveryCount: "{count} members",
    workspaceHubPreviewEyebrow: "Final acceptance",
    workspaceHubPreviewTitleIdle: "No web preview is running yet",
    workspaceHubPreviewTitleStarting: "Preparing an acceptance preview",
    workspaceHubPreviewTitleRunning: "The product preview is ready for review",
    workspaceHubPreviewSummaryIdle: "The system recommends likely app roots and startup commands for full-stack repos, while still allowing custom overrides.",
    workspaceHubPreviewSummaryStarting: "The system is preparing the candidate branch and app root. When it succeeds, the preview will embed directly in this workspace.",
    workspaceHubPreviewSummaryRunning: "The preview is live. You can complete final product acceptance without leaving the page.",
    workspaceHubPreviewNote: "Launch the preview and review the product inside the workspace instead of bouncing to an external browser.",
    workspaceHubPreviewButton: "Open product preview",
    workspaceHubPreviewTargetLabel: "Default target",
    workspaceHubPreviewTargetFallback: "Task mainline",
    previewStudioEyebrow: "Preview Studio",
    previewStudioTitle: "Final product web preview",
    previewStudioSummary: "Use this for full-stack task acceptance: choose the candidate delivery branch, launch the preview quickly, and review the product inside the current page.",
    previewTargetLabel: "Preview target",
    previewAppRootLabel: "App root",
    previewCommandLabel: "Start command",
    previewPortLabel: "Port",
    previewPathLabel: "Preview path",
    previewDetectedLabel: "Detection",
    previewDetectedEmpty: "The system will recommend the app entry that most likely represents the shipped surface.",
    previewDetectedSummary: "{framework} · {path} · {packageManager}",
    previewStartButton: "Start preview",
    previewRestartButton: "Restart preview",
    previewStopButton: "Stop preview",
    previewOpenButton: "Open in new window",
    previewTargetBadgeLabel: "Target branch",
    previewAppBadgeLabel: "App root",
    previewUrlBadgeLabel: "URL",
    previewEmpty: "An interactive product preview will appear here after startup.",
    previewEmptyFailed: "Preview startup failed. Check the command, app root, or logs.",
    previewLogsTitle: "Preview logs",
    previewLogsIdle: "Waiting to start",
    previewLogsEmpty: "Preview logs will appear here.",
    previewStatusIdle: "Idle",
    previewStatusStarting: "Starting",
    previewStatusRunning: "Running",
    previewStatusStopped: "Stopped",
    previewStatusFailed: "Failed",
    automationBadgeAuto: "System owned",
    automationBadgeGate: "Manual gate",
    automationBadgeAccept: "Acceptance ready",
    automationBadgeDone: "Completed",
    automationSummaryAuto: "The system is still advancing execution, review, and integration automatically. Only a small set of gates should need human takeover.",
    automationSummaryGate: "{count} items still need manual takeover. Once resolved, the automated flow can continue.",
    automationSummaryAccept: "The code path is converging cleanly. Switch to preview to complete final product acceptance.",
    automationSummaryDone: "The delivery path is complete. Use the workspace to review the shipped result and product preview.",
    automationStepIntake: "Task created",
    automationStepClarify: "Lead clarification",
    automationStepScope: "Scope lock",
    automationStepPlan: "Plan draft",
    automationStepApprove: "Plan approval",
    automationStepMaterialize: "Member setup",
    automationStepExecute: "Automated delivery",
    automationStepFinalReview: "Final review",
    automationStepMerge: "Merge and integration",
    automationStepAcceptance: "Web acceptance",
    automationStateDone: "Done",
    automationStateActive: "System running",
    automationStateGate: "Manual gate",
    automationStateWaiting: "Waiting",
    automationStateReady: "Ready",
    previewReadinessEyebrow: "Acceptance readiness",
    previewReadinessTitle: "Final acceptance readiness",
    previewReadinessSummary: "The workspace compresses preview targeting, review convergence, and integration state into an acceptance checklist.",
    previewReadinessProgress: "{done}/{total} ready",
    previewReadinessPending: "{count} checks still need to land before final acceptance.",
    previewReadinessReady: "Final acceptance is mostly ready. Start or inspect the preview directly.",
    previewReadinessBlockedBy: "Not ready for acceptance yet: {label}",
    previewReadinessBlockedReady: "Acceptance is ready: {label}",
    previewReadinessBlockedWaiting: "Acceptance prerequisites are still converging.",
    previewReadinessItemTargets: "Preview targets are ready",
    previewReadinessItemAppRoots: "App entry detected",
    previewReadinessItemManual: "No manual takeover items",
    previewReadinessItemReview: "Final review converged",
    previewReadinessItemMerge: "Merge and integration traceable",
    previewReadinessItemRunning: "Preview is running in workspace",
    previewReadinessHintTargets: "No candidate delivery branch is available for preview yet.",
    previewReadinessHintAppRoots: "No runnable web app entry has been detected yet.",
    previewReadinessHintManual: "Manual gates are still open. Resolve them in operations first.",
    previewReadinessHintReview: "Some subtasks are still executing or have not settled final review yet.",
    previewReadinessHintMerge: "After final review, accepted work is collected onto the task mainline and integration path.",
    previewReadinessHintRunning: "Once preview starts, final product acceptance happens directly inside this workspace.",
    previewReadinessHintTargetsReady: "{label} is currently recommended as the delivery candidate.",
    previewReadinessHintAppRootsReady: "{label} has been detected as the preview entry.",
    previewReadinessHintManualReady: "There are no blockers that require manual takeover right now.",
    previewReadinessHintReviewReady: "Final review has converged to a mergeable or acceptable state.",
    previewReadinessHintMergeReady: "The delivery path is currently in {status}.",
    previewReadinessHintRunningReady: "Preview is currently {status}, so product review can happen immediately.",
    metricsTitle: "Metrics Overview",
    metricsEmpty: "Metrics view coming soon. Task execution stats, agent utilization, and performance data will appear here.",
  },
};

const PLAN_TEMPLATE_COPY = {
  "full-stack-web-app": {
    "zh-CN": {
      description: "适合带认证、数据库、前端和测试协作的全栈需求。",
      scenario: "全栈 Todo、内部工具、带认证的 CRUD 应用",
      starterDescription: "做一个全栈 Todo 应用，包含认证、数据库和 React 前端。",
      starterTitle: "全栈 Todo 应用",
      steps: ["选择模板并确认基线分支", "检查自动生成的 DAG 与角色分工", "批准计划后观察执行、handoff 与 integration"],
      title: "全栈 Web 应用",
    },
    en: {
      description: "Best for full-stack tasks with auth, data, frontend, and end-to-end validation.",
      scenario: "Full-stack Todo apps, internal tools, authenticated CRUD systems",
      starterDescription: "Build a full-stack Todo app with auth, a database, and a React frontend.",
      starterTitle: "Full-stack Todo app",
      steps: ["Pick the template and base branch", "Review the seeded DAG and role split", "Approve the plan and watch execution, handoffs, and integration"],
      title: "Full-stack web app",
    },
  },
  "backend-api": {
    "zh-CN": {
      description: "面向 API、数据库和服务测试的后端任务骨架。",
      scenario: "REST API、认证服务、数据服务",
      starterDescription: "实现一个后端 API，包含核心业务接口、数据库访问层和发布前验证。",
      starterTitle: "后端 API 服务",
      steps: ["先确认接口契约与数据模型", "按后端、数据库、测试和发布验证拆分", "在计划审阅中补齐验收标准后批准"],
      title: "后端 API",
    },
    en: {
      description: "A backend service skeleton for API, database, and service validation work.",
      scenario: "REST APIs, auth services, data services",
      starterDescription: "Build a backend API with the core service layer, database access, and release verification.",
      starterTitle: "Backend API service",
      steps: ["Confirm the API contract and data model", "Split work into backend, database, test, and release verification", "Polish acceptance criteria in plan review before approval"],
      title: "Backend API",
    },
  },
  "frontend-feature": {
    "zh-CN": {
      description: "适合前端功能、集成接线与体验验收。",
      scenario: "React 页面功能、复杂交互、前后端联调",
      starterDescription: "实现一个前端功能，从交互设计到接口接线与体验验收全链路完成。",
      starterTitle: "前端功能开发",
      steps: ["先确认页面结构与接口依赖", "实现前端功能并补齐集成接线", "在验收节点聚焦空态、错误态和响应式表现"],
      title: "前端功能开发",
    },
    en: {
      description: "Suited to frontend feature delivery, integration, and UX validation.",
      scenario: "React feature work, complex interaction flows, frontend-backend integration",
      starterDescription: "Build a frontend feature from interaction design to API wiring and UX validation.",
      starterTitle: "Frontend feature delivery",
      steps: ["Confirm the page structure and API dependencies", "Implement the feature and integration wiring", "Use the acceptance step to review empty, error, and responsive states"],
      title: "Frontend feature",
    },
  },
  "repo-wide-refactor": {
    "zh-CN": {
      description: "适合跨模块重构、命名统一和大范围结构整理。",
      scenario: "目录重构、接口统一、技术债治理",
      starterDescription: "对仓库做一次跨模块重构，要求保留可审查切片、回归验证和集成回滚说明。",
      starterTitle: "仓库级重构任务",
      steps: ["先定义重构边界与回滚策略", "把主改造与回归验证分离", "让 integration 节点整理最终合并注意事项"],
      title: "仓库级重构",
    },
    en: {
      description: "Best for cross-module refactors, naming alignment, and large repository cleanups.",
      scenario: "Directory refactors, interface alignment, tech-debt cleanup",
      starterDescription: "Run a repository-wide refactor with reviewable slices, regression verification, and integration rollback notes.",
      starterTitle: "Repository-wide refactor",
      steps: ["Define the refactor boundary and rollback plan first", "Separate the main rewrite from regression verification", "Use the integration node to summarize final merge considerations"],
      title: "Repository-wide refactor",
    },
  },
};

const MAILBOX_MESSAGE_TYPE_OPTIONS = [
  "NOTE",
  "BLOCKER",
  "DELIVERABLE_READY",
  "API_CONTRACT",
  "DB_CONTRACT",
  "TEST_REQUEST",
  "REVIEW_REQUEST",
];
const MAILBOX_CONTRACT_MESSAGE_TYPES = new Set(["API_CONTRACT", "DB_CONTRACT"]);
const MAILBOX_BLOCKER_MESSAGE_TYPES = new Set(["BLOCKER", "TEST_REQUEST", "REVIEW_REQUEST"]);

const VIEW_IDS = ["dashboard", "task-create", "tasks", "workspace", "plan", "ops", "metrics"];

const state = {
  agentHealth: {},
  agents: [],
  currentView: "dashboard",
  focusWorkspaceStageOnNextRender: false,
  executionDrafts: new Map(),
  healthCheckedAt: null,
  leadCandidates: [],
  locale: normalizeLocale(readStorage(STORAGE_KEYS.locale)),
  liveSessionOutputs: new Map(),
  navCollapsed: readBooleanStorage(STORAGE_KEYS.navCollapsed, true),
  expandedTaskCards: new Set(),
  leaderPlanDetailState: null,
  taskPlanNodeDetailState: null,
  taskMessageInFlight: null,
  taskMessageQueue: [],
  taskMessageQueuePaused: false,
  planTemplates: [],
  projectDetail: null,
  projectPathBrowserCurrent: null,
  projectPathBrowserEntries: [],
  projectPathBrowserFilter: "",
  projectPathBrowserLoading: false,
  projectPathBrowserParent: null,
  projectPathBrowserRoots: [],
  projectPathCurrentIsRepo: false,
  projectPathIncludeHidden: false,
  projects: [],
  baseBranchDraftManual: false,
  baseBranchDraftName: "",
  baseBranchMode: "new",
  baseBranchStartPoint: null,
  selectedExistingBaseBranch: null,
  selectedBaseBranch: null,
  selectedExecutionSessionId: null,
  selectedExecutionSubTaskId: null,
  selectedGuidedTemplateId: null,
  selectedLeadAgentName: null,
  selectedProjectId: readStorage(STORAGE_KEYS.selectedProjectId),
  selectedTaskId: readStorage(STORAGE_KEYS.selectedTaskId),
  showArchivedTasks: false,
  sidebarCollapsed: readBooleanStorage(STORAGE_KEYS.sidebarCollapsed, true),
  systemDockerHealth: null,
  taskActionDialogState: null,
  taskListSearch: "",
  systemSandboxPolicy: null,
  taskDetail: null,
  taskPreview: null,
  taskPreviewPollTimer: null,
  taskPlanDraft: null,
  taskPlanDraftState: null,
  taskPlanNotice: null,
  taskPlanView: "graph",
  taskOperationsView: "graph",
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
  dashboardTeamBranchBadge: document.querySelector("#dashboard-team-branch-badge"),
  dashboardTeamEmpty: document.querySelector("#dashboard-team-empty"),
  dashboardTeamList: document.querySelector("#dashboard-team-list"),
  dashboardTeamTaskBadge: document.querySelector("#dashboard-team-task-badge"),
  dockerHealthBadge: document.querySelector("#docker-health-badge"),
  dockerHealthReason: document.querySelector("#docker-health-reason"),
  baseBranchExistingPanel: document.querySelector("#base-branch-existing-panel"),
  baseBranchInput: document.querySelector("#base-branch-input"),
  baseBranchModeBadge: document.querySelector("#task-create-branch-mode-badge"),
  baseBranchModeExistingInput: document.querySelector("#base-branch-mode-existing"),
  baseBranchModeExistingLabel: document.querySelector("#base-branch-mode-existing-label"),
  baseBranchModeNewInput: document.querySelector("#base-branch-mode-new"),
  baseBranchModeNewLabel: document.querySelector("#base-branch-mode-new-label"),
  baseBranchNewPanel: document.querySelector("#base-branch-new-panel"),
  baseBranchSelect: document.querySelector("#base-branch-select"),
  baseBranchStartPointSelect: document.querySelector("#base-branch-start-point-select"),
  cleanlinessBadge: document.querySelector("#cleanliness-badge"),
  confirmRequirementsButton: document.querySelector("#confirm-requirements-button"),
  createTaskButton: document.querySelector("#create-task-button"),
  currentBranch: document.querySelector("#current-branch"),
  defaultBranch: document.querySelector("#default-branch"),
  dirtyWarningBanner: document.querySelector("#dirty-warning-banner"),
  showJourneyButton: document.querySelector("#show-journey-button"),
  taskJourneyDialog: document.querySelector("#task-journey-dialog"),
  taskJourneyDialogCloseButton: document.querySelector("#task-journey-dialog-close-button"),
  healthyLeadCount: document.querySelector("#healthy-lead-count"),
  healthyWorkerCount: document.querySelector("#healthy-worker-count"),
  languageToggle: document.querySelector("#language-toggle"),
  leadAgentFeedback: document.querySelector("#lead-agent-feedback"),
  leadAgentSelect: document.querySelector("#lead-agent-select"),
  projectDetail: document.querySelector("#project-detail"),
  projectDetailEmpty: document.querySelector("#project-detail-empty"),
  projectDetailFeedback: document.querySelector("#project-detail-feedback"),
  projectCurrentBranchBadge: document.querySelector("#project-current-branch-badge"),
  projectPathBreadcrumb: document.querySelector("#project-path-breadcrumb"),
  projectPathBrowserFeedback: document.querySelector("#project-path-browser-feedback"),
  projectPathBrowserFilter: document.querySelector("#project-path-browser-filter"),
  projectPathBrowseInputButton: document.querySelector("#project-path-browse-input-button"),
  projectPathCurrent: document.querySelector("#project-path-current"),
  projectPathCurrentBadge: document.querySelector("#project-path-current-badge"),
  projectPathDirectoryEmpty: document.querySelector("#project-path-directory-empty"),
  projectPathDirectoryList: document.querySelector("#project-path-directory-list"),
  projectPathHiddenToggle: document.querySelector("#project-path-hidden-toggle"),
  projectList: document.querySelector("#project-list"),
  projectListEmpty: document.querySelector("#project-list-empty"),
  projectListFeedback: document.querySelector("#project-list-feedback"),
  projectName: document.querySelector("#project-name"),
  projectPathParentButton: document.querySelector("#project-path-parent-button"),
  projectPath: document.querySelector("#project-path"),
  projectRegistrationForm: document.querySelector("#project-registration-form"),
  projectRegistrationDialog: document.querySelector("#project-registration-dialog"),
  projectPathInput: document.querySelector("#project-path-input"),
  projectPathRootList: document.querySelector("#project-path-root-list"),
  projectPathSelection: document.querySelector("#project-path-selection"),
  projectPathSelectionBadge: document.querySelector("#project-path-selection-badge"),
  projectPathUseCurrentButton: document.querySelector("#project-path-use-current-button"),
  projectPickerCloseButton: document.querySelector("#project-picker-close-button"),
  recentBranches: document.querySelector("#recent-branches"),
  refreshAgentHealthButton: document.querySelector("#refresh-agent-health-button"),
  refreshProjectDetailButton: document.querySelector("#refresh-project-detail-button"),
  refreshProjectsButton: document.querySelector("#refresh-projects-button"),
  refreshTaskDetailButton: document.querySelector("#refresh-task-detail-button"),
  refreshTaskPageButton: document.querySelector("#refresh-task-page-button"),
  refreshTasksButton: document.querySelector("#refresh-tasks-button"),
  registerProjectButton: document.querySelector("#register-project-button"),
  registeredName: document.querySelector("#registered-name"),
  registeredPath: document.querySelector("#registered-path"),
  registrationFeedback: document.querySelector("#registration-feedback"),
  sendTaskMessageButton: document.querySelector("#send-task-message-button"),
  startClarificationButton: document.querySelector("#start-clarification-button"),
  taskAttachmentFeedback: document.querySelector("#task-attachment-feedback"),
  taskAttachmentList: document.querySelector("#task-attachment-list"),
  taskActions: document.querySelector(".task-actions"),
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
  taskExecutionActivityButton: document.querySelector("#task-operations-activity-button"),
  taskExecutionActivityEmpty: document.querySelector("#task-operations-activity-empty"),
  taskExecutionActivityList: document.querySelector("#task-operations-activity-list"),
  taskExecutionActivityPanel: document.querySelector("#task-operations-activity-panel"),
  taskExecutionActionCount: document.querySelector("#task-operations-action-count"),
  taskExecutionActionEmpty: document.querySelector("#task-operations-action-empty"),
  taskExecutionActionList: document.querySelector("#task-operations-action-list"),
  taskExecutionActionSummary: document.querySelector("#task-operations-action-summary"),
  taskExecutionActionTitle: document.querySelector("#task-operations-action-title"),
  taskExecutionEmpty: document.querySelector("#task-execution-empty"),
  taskExecutionFocus: document.querySelector("#task-execution-focus"),
  taskExecutionFocusBadge: document.querySelector("#task-execution-focus-badge"),
  taskExecutionFocusEmpty: document.querySelector("#task-execution-focus-empty"),
  taskExecutionFocusMeta: document.querySelector("#task-execution-focus-meta"),
  taskExecutionFocusPreview: document.querySelector("#task-execution-focus-preview"),
  taskExecutionGraphButton: document.querySelector("#task-operations-graph-button"),
  taskExecutionGraphPanel: document.querySelector("#task-operations-graph-panel"),
  taskExecutionGraphView: document.querySelector("#task-operations-graph"),
  taskExecutionHealthList: document.querySelector("#task-operations-health-list"),
  taskExecutionHighlightList: document.querySelector("#task-operations-highlight-list"),
  taskIntegrationEmpty: document.querySelector("#task-integration-empty"),
  taskIntegrationGateEmpty: document.querySelector("#task-integration-gate-empty"),
  taskIntegrationGateList: document.querySelector("#task-integration-gate-list"),
  taskIntegrationMetaList: document.querySelector("#task-integration-meta-list"),
  taskIntegrationQueueEmpty: document.querySelector("#task-integration-queue-empty"),
  taskIntegrationQueueList: document.querySelector("#task-integration-queue-list"),
  taskIntegrationRetryButton: document.querySelector("#task-integration-retry-button"),
  taskIntegrationRollbackButton: document.querySelector("#task-integration-rollback-button"),
  taskIntegrationShell: document.querySelector("#task-integration-shell"),
  taskIntegrationStartButton: document.querySelector("#task-integration-start-button"),
  taskIntegrationStatusBadge: document.querySelector("#task-integration-status-badge"),
  taskHubDeliveryBadge: document.querySelector("#task-hub-delivery-badge"),
  taskHubDeliveryCard: document.querySelector("#task-hub-delivery-card"),
  taskHubDeliveryCount: document.querySelector("#task-hub-delivery-count"),
  taskHubDeliveryNote: document.querySelector("#task-hub-delivery-note"),
  taskHubDeliveryOpenButton: document.querySelector("#task-hub-delivery-open-button"),
  taskHubDeliverySummary: document.querySelector("#task-hub-delivery-summary"),
  taskHubDeliveryTitle: document.querySelector("#task-hub-delivery-title"),
  taskHubPlanBadge: document.querySelector("#task-hub-plan-badge"),
  taskHubPlanCard: document.querySelector("#task-hub-plan-card"),
  taskHubPlanCount: document.querySelector("#task-hub-plan-count"),
  taskHubPlanNote: document.querySelector("#task-hub-plan-note"),
  taskHubPlanOpenButton: document.querySelector("#task-hub-plan-open-button"),
  taskHubPlanSummary: document.querySelector("#task-hub-plan-summary"),
  taskHubPlanTitle: document.querySelector("#task-hub-plan-title"),
  taskHubPreviewBadge: document.querySelector("#task-hub-preview-badge"),
  taskHubPreviewCard: document.querySelector("#task-hub-preview-card"),
  taskHubPreviewFocusButton: document.querySelector("#task-hub-preview-focus-button"),
  taskHubPreviewNote: document.querySelector("#task-hub-preview-note"),
  taskHubPreviewSummary: document.querySelector("#task-hub-preview-summary"),
  taskHubPreviewTarget: document.querySelector("#task-hub-preview-target"),
  taskHubPreviewTitle: document.querySelector("#task-hub-preview-title"),
  taskExecutionAgentField: document.querySelector("#task-execution-agent-field"),
  taskExecutionAgentSelect: document.querySelector("#task-execution-agent-select"),
  taskExecutionChangeAgentButton: document.querySelector("#task-execution-change-agent-button"),
  taskExecutionCancelButton: document.querySelector("#task-execution-cancel-button"),
  taskExecutionConfirmDiscardButton: document.querySelector("#task-execution-confirm-discard-button"),
  taskExecutionListButton: document.querySelector("#task-operations-list-button"),
  taskExecutionListPanel: document.querySelector("#task-operations-list-panel"),
  taskExecutionModeBadge: document.querySelector("#task-operations-mode-badge"),
  taskExecutionPriorityBadge: document.querySelector("#task-operations-priority-badge"),
  taskExecutionPriorityCaption: document.querySelector("#task-operations-priority-caption"),
  taskExecutionPriorityEyebrow: document.querySelector("#task-operations-priority-eyebrow"),
  taskExecutionPrioritySummary: document.querySelector("#task-operations-priority-summary"),
  taskExecutionPriorityTitle: document.querySelector("#task-operations-priority-title"),
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
  taskExecutionMailboxArtifactRefsInput: document.querySelector("#task-execution-mailbox-artifact-refs-input"),
  taskExecutionMailboxBlockersEmpty: document.querySelector("#task-execution-mailbox-blockers-empty"),
  taskExecutionMailboxBlockersList: document.querySelector("#task-execution-mailbox-blockers-list"),
  taskExecutionMailboxBranchRefInput: document.querySelector("#task-execution-mailbox-branch-ref-input"),
  taskExecutionMailboxCount: document.querySelector("#task-execution-mailbox-count"),
  taskExecutionMailboxContractsEmpty: document.querySelector("#task-execution-mailbox-contracts-empty"),
  taskExecutionMailboxContractsList: document.querySelector("#task-execution-mailbox-contracts-list"),
  taskExecutionMailboxEmpty: document.querySelector("#task-execution-mailbox-empty"),
  taskExecutionMailboxFeedback: document.querySelector("#task-execution-mailbox-feedback"),
  taskExecutionMailboxFileRefsInput: document.querySelector("#task-execution-mailbox-file-refs-input"),
  taskExecutionMailboxForm: document.querySelector("#task-execution-mailbox-form"),
  taskExecutionMailboxInboxEmpty: document.querySelector("#task-execution-mailbox-inbox-empty"),
  taskExecutionMailboxInboxList: document.querySelector("#task-execution-mailbox-inbox-list"),
  taskExecutionMailboxInput: document.querySelector("#task-execution-mailbox-input"),
  taskExecutionMailboxMessageTypeSelect: document.querySelector("#task-execution-mailbox-message-type-select"),
  taskExecutionMailboxOutboxEmpty: document.querySelector("#task-execution-mailbox-outbox-empty"),
  taskExecutionMailboxOutboxList: document.querySelector("#task-execution-mailbox-outbox-list"),
  taskExecutionMailboxRequiresAckInput: document.querySelector("#task-execution-mailbox-requires-ack-input"),
  taskExecutionMailboxSchemaInput: document.querySelector("#task-execution-mailbox-schema-input"),
  taskExecutionMailboxSendButton: document.querySelector("#task-execution-mailbox-send-button"),
  taskExecutionMailboxSenderSelect: document.querySelector("#task-execution-mailbox-sender-select"),
  taskExecutionMailboxTargetSelect: document.querySelector("#task-execution-mailbox-target-select"),
  taskExecutionReviewActions: document.querySelector("#task-execution-review-actions"),
  taskExecutionReview: document.querySelector("#task-execution-review"),
  taskExecutionReviewDecision: document.querySelector("#task-execution-review-decision"),
  taskExecutionReviewFeedback: document.querySelector("#task-execution-review-feedback"),
  taskExecutionReviewPhase: document.querySelector("#task-execution-review-phase"),
  taskExecutionReviewSummary: document.querySelector("#task-execution-review-summary"),
  taskExecutionRiskList: document.querySelector("#task-operations-risk-list"),
  taskExecutionFocusTitle: document.querySelector("#task-execution-focus-title"),
  taskExecutionSessionList: document.querySelector("#task-execution-session-list"),
  taskExecutionList: document.querySelector("#task-execution-list"),
  taskExecutionSummaryList: document.querySelector("#task-operations-summary-list"),
  taskLeadSessionBadge: document.querySelector("#task-lead-session-badge"),
  taskLeadSessionOutput: document.querySelector("#task-lead-session-output"),
  taskLeadSessionSummary: document.querySelector("#task-lead-session-summary"),
  taskMessageBranchHint: document.querySelector("#task-message-branch-hint"),
  taskCreateBranchSummary: document.querySelector("#task-create-branch-summary"),
  taskCreateFlowSummary: document.querySelector("#task-create-flow-summary"),
  taskCreateJourneySteps: document.querySelector("#task-create-journey-steps"),
  taskCreateRouteBadge: document.querySelector("#task-create-route-badge"),
  taskCreateRouteSummary: document.querySelector("#task-create-route-summary"),
  taskPageArchivedToggle: document.querySelector("#task-page-archived-toggle"),
  taskPageEmpty: document.querySelector("#task-page-empty"),
  taskPageFeedback: document.querySelector("#task-page-feedback"),
  taskPageList: document.querySelector("#task-page-list"),
  taskPageSearchInput: document.querySelector("#task-page-search-input"),
  taskDocumentBadge: document.querySelector("#task-document-badge"),
  taskDocumentCount: document.querySelector("#task-document-count"),
  taskDocumentEmpty: document.querySelector("#task-document-empty"),
  taskDocumentEyebrow: document.querySelector("#task-document-eyebrow"),
  taskDocumentGuide: document.querySelector("#task-document-guide"),
  taskDocumentList: document.querySelector("#task-document-list"),
  taskDocumentLoading: document.querySelector("#task-document-loading"),
  taskDocumentLoadingLabel: document.querySelector("#task-document-loading-label"),
  taskDocumentPanel: document.querySelector("#task-document-panel"),
  taskDocumentSummary: document.querySelector("#task-document-summary"),
  taskDocumentTitle: document.querySelector("#task-document-title"),
  taskLeaderPlanBadge: document.querySelector("#task-leader-plan-badge"),
  taskLeaderPlanCount: document.querySelector("#task-leader-plan-count"),
  taskLeaderPlanEmpty: document.querySelector("#task-leader-plan-empty"),
  taskLeaderPlanEyebrow: document.querySelector("#task-leader-plan-eyebrow"),
  taskLeaderPlanGuide: document.querySelector("#task-leader-plan-guide"),
  taskLeaderPlanList: document.querySelector("#task-leader-plan-list"),
  taskLeaderPlanLoading: document.querySelector("#task-leader-plan-loading"),
  taskLeaderPlanLoadingLabel: document.querySelector("#task-leader-plan-loading-label"),
  taskLeaderPlanSummary: document.querySelector("#task-leader-plan-summary"),
  taskLeaderPlanTitle: document.querySelector("#task-leader-plan-title"),
  leaderPlanDetailCloseButton: document.querySelector("#leader-plan-detail-close-button"),
  leaderPlanDetailDialog: document.querySelector("#leader-plan-detail-dialog"),
  leaderPlanDetailFacts: document.querySelector("#leader-plan-detail-facts"),
  leaderPlanDetailSummary: document.querySelector("#leader-plan-detail-summary"),
  leaderPlanDetailTitle: document.querySelector("#leader-plan-detail-title"),
  taskTeamEmpty: document.querySelector("#task-team-empty"),
  taskTeamLeadMeta: document.querySelector("#task-team-lead-meta"),
  taskTeamLeadPill: document.querySelector("#task-team-lead-pill"),
  taskTeamLeadStatus: document.querySelector("#task-team-lead-status"),
  taskTeamLeadSummary: document.querySelector("#task-team-lead-summary"),
  taskTeamMemberCount: document.querySelector("#task-team-member-count"),
  taskTeamMemberList: document.querySelector("#task-team-member-list"),
  taskTeamProjectBranch: document.querySelector("#task-team-project-branch"),
  taskTeamWorkerPill: document.querySelector("#task-team-worker-pill"),
  taskTeamShell: document.querySelector("#task-team-shell"),
  taskFormFeedback: document.querySelector("#task-form-feedback"),
  taskLeadAgent: document.querySelector("#task-lead-agent"),
  taskListArchivedToggle: document.querySelector("#task-list-archived-toggle"),
  taskList: document.querySelector("#task-list"),
  taskListEmpty: document.querySelector("#task-list-empty"),
  taskListFeedback: document.querySelector("#task-list-feedback"),
  workspacePickerCloseButton: document.querySelector("#workspace-picker-close-button"),
  workspacePickerCount: document.querySelector("#workspace-picker-count"),
  workspacePickerCurrent: document.querySelector("#workspace-picker-current"),
  workspacePickerDialog: document.querySelector("#workspace-picker-dialog"),
  workspacePickerOpenButton: document.querySelector("#workspace-picker-open-button"),
  workspacePickerSearchInput: document.querySelector("#workspace-picker-search-input"),
  taskActionDialog: document.querySelector("#task-action-dialog"),
  taskActionDialogBranchSummary: document.querySelector("#task-action-dialog-branch-summary"),
  taskActionDialogCancelButton: document.querySelector("#task-action-dialog-cancel-button"),
  taskActionDialogCloseButton: document.querySelector("#task-action-dialog-close-button"),
  taskActionDialogConfirmButton: document.querySelector("#task-action-dialog-confirm-button"),
  taskProjectPill: document.querySelector("#task-project-pill"),
  taskLeadPill: document.querySelector("#task-lead-pill"),
  taskSessionPill: document.querySelector("#task-session-pill"),
  taskActionDialogDeleteBranchesField: document.querySelector("#task-action-dialog-delete-branches-field"),
  taskActionDialogDeleteBranchesInput: document.querySelector("#task-action-delete-branches-input"),
  taskActionDialogEyebrow: document.querySelector("#task-action-dialog-eyebrow"),
  taskActionDialogFeedback: document.querySelector("#task-action-dialog-feedback"),
  taskActionDialogSummary: document.querySelector("#task-action-dialog-summary"),
  taskActionDialogTitle: document.querySelector("#task-action-dialog-title"),
  taskMessageCount: document.querySelector("#task-message-count"),
  taskMessageForm: document.querySelector("#task-message-form"),
  taskPlanNodeAgentSelect: document.querySelector("#task-plan-node-agent-select"),
  taskPlanNodeCloseButton: document.querySelector("#task-plan-node-close-button"),
  taskPlanNodeDependsInput: document.querySelector("#task-plan-node-depends-input"),
  taskPlanNodeDescriptionInput: document.querySelector("#task-plan-node-description-input"),
  taskPlanNodeDeliverableInput: document.querySelector("#task-plan-node-deliverable-input"),
  taskPlanNodeDialog: document.querySelector("#task-plan-node-dialog"),
  taskPlanNodeEditor: document.querySelector("#task-plan-node-editor"),
  taskPlanNodeReadonlyFacts: document.querySelector("#task-plan-node-readonly-facts"),
  taskPlanNodeRemoveButton: document.querySelector("#task-plan-node-remove-button"),
  taskPlanNodeRoleInput: document.querySelector("#task-plan-node-role-input"),
  taskPlanNodeScopeInput: document.querySelector("#task-plan-node-scope-input"),
  taskPlanNodeSummary: document.querySelector("#task-plan-node-summary"),
  taskPlanNodeTemplateInput: document.querySelector("#task-plan-node-template-input"),
  taskPlanNodeTitle: document.querySelector("#task-plan-node-title"),
  taskPlanNodeTitleInput: document.querySelector("#task-plan-node-title-input"),
  taskPlanNodeBranchInput: document.querySelector("#task-plan-node-branch-input"),
  taskPlanNodeCriteriaInput: document.querySelector("#task-plan-node-criteria-input"),
  taskMessageInput: document.querySelector("#task-message-input"),
  taskMessageLabel: document.querySelector("#task-message-label"),
  taskMessageQueueList: document.querySelector("#task-message-queue-list"),
  taskMessageQueueStatus: document.querySelector("#task-message-queue-status"),
  taskMessageStopButton: document.querySelector("#task-message-stop-button"),
  taskWorkspaceActions: document.querySelector("#task-workspace-actions"),
  taskWorkspaceDeleteButton: document.querySelector("#task-workspace-delete-button"),
  taskWorkspacePauseButton: document.querySelector("#task-workspace-pause-button"),
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
  taskPreviewAppBadge: document.querySelector("#task-preview-app-badge"),
  taskPreviewAppRootSelect: document.querySelector("#task-preview-app-root-select"),
  taskPreviewCommandInput: document.querySelector("#task-preview-command-input"),
  taskPreviewDetected: document.querySelector("#task-preview-detected"),
  taskPreviewEmpty: document.querySelector("#task-preview-empty"),
  taskPreviewFeedback: document.querySelector("#task-preview-feedback"),
  taskPreviewForm: document.querySelector("#task-preview-form"),
  taskPreviewFrame: document.querySelector("#task-preview-frame"),
  taskPreviewLog: document.querySelector("#task-preview-log"),
  taskPreviewLogStatus: document.querySelector("#task-preview-log-status"),
  taskPreviewOpenLink: document.querySelector("#task-preview-open-link"),
  taskPreviewPathInput: document.querySelector("#task-preview-path-input"),
  taskPreviewPortInput: document.querySelector("#task-preview-port-input"),
  taskPreviewReadinessBadge: document.querySelector("#task-preview-readiness-badge"),
  taskPreviewReadinessBlocker: document.querySelector("#task-preview-readiness-blocker"),
  taskPreviewReadinessList: document.querySelector("#task-preview-readiness-list"),
  taskPreviewReadinessSummary: document.querySelector("#task-preview-readiness-summary"),
  taskPreviewRestartButton: document.querySelector("#task-preview-restart-button"),
  taskPreviewStartButton: document.querySelector("#task-preview-start-button"),
  taskPreviewStatusBadge: document.querySelector("#task-preview-status-badge"),
  taskPreviewStopButton: document.querySelector("#task-preview-stop-button"),
  taskPreviewStudio: document.querySelector("#task-preview-studio"),
  taskPreviewSummary: document.querySelector("#task-preview-summary"),
  taskPreviewTargetBadge: document.querySelector("#task-preview-target-badge"),
  taskPreviewTargetSelect: document.querySelector("#task-preview-target-select"),
  taskPreviewUrlBadge: document.querySelector("#task-preview-url-badge"),
  taskNextActionBadge: document.querySelector("#task-next-action-badge"),
  taskNextActionButton: document.querySelector("#task-next-action-button"),
  taskNextActionSummary: document.querySelector("#task-next-action-summary"),
  taskNextActionTitle: document.querySelector("#task-next-action-title"),
  taskDecisionBadge: document.querySelector("#task-decision-badge"),
  taskDecisionPillList: document.querySelector("#task-decision-pill-list"),
  taskDecisionSummary: document.querySelector("#task-decision-summary"),
  taskDecisionTitle: document.querySelector("#task-decision-title"),
  taskSessionStatus: document.querySelector("#task-session-status"),
  taskStageRail: document.querySelector("#task-stage-rail"),
  taskStatusBadge: document.querySelector("#task-status-badge"),
  taskTitleInput: document.querySelector("#task-title-input"),
  taskTranscript: document.querySelector("#task-transcript"),
  taskTranscriptEmpty: document.querySelector("#task-transcript-empty"),
  taskAttachmentsInput: document.querySelector("#task-attachments-input"),
  // Sidebar elements
  sidebarAgentCount: document.querySelector("#sidebar-agent-count"),
  sidebarCollapseIcon: document.querySelector("#sidebar-collapse-icon"),
  sidebarCollapseToggle: document.querySelector("#sidebar-collapse-toggle"),
  sidebarProjectList: document.querySelector("#sidebar-project-list"),
  sidebarProjectEmpty: document.querySelector("#sidebar-project-empty"),
  sidebarRegisterToggle: document.querySelector("#sidebar-register-toggle"),
  // TopNav elements
  topnavCollapseIcon: document.querySelector("#topnav-collapse-icon"),
  topnavCollapseToggle: document.querySelector("#topnav-collapse-toggle"),
  topnavStatus: document.querySelector("#topnav-status"),
  topnavTabs: document.querySelectorAll(".topnav__tab"),
  // View containers
  views: Object.fromEntries(VIEW_IDS.map((id) => [id, document.querySelector(`#view-${id}`)])),
};

setLocale(state.locale);
applyLayoutChrome();
mountTaskPlanNodeDrawer();

elements.projectRegistrationForm.addEventListener("submit", onRegisterProject);
elements.refreshProjectsButton?.addEventListener("click", () => {
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
elements.topnavCollapseToggle?.addEventListener("click", () => {
  state.navCollapsed = !state.navCollapsed;
  writeStorage(STORAGE_KEYS.navCollapsed, String(state.navCollapsed));
  applyLayoutChrome();
});
elements.sidebarCollapseToggle?.addEventListener("click", () => {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  writeStorage(STORAGE_KEYS.sidebarCollapsed, String(state.sidebarCollapsed));
  applyLayoutChrome();
});
elements.leadAgentSelect.addEventListener("change", (event) => {
  state.selectedLeadAgentName = event.target.value || null;
  renderLeadSelector();
});
elements.baseBranchModeNewInput?.addEventListener("change", onBaseBranchModeChange);
elements.baseBranchModeExistingInput?.addEventListener("change", onBaseBranchModeChange);
elements.baseBranchSelect.addEventListener("change", (event) => {
  state.selectedExistingBaseBranch = event.target.value || null;
  syncBranchChoices();
});
elements.baseBranchStartPointSelect?.addEventListener("change", (event) => {
  state.baseBranchStartPoint = event.target.value || null;
  if (!state.baseBranchDraftManual) {
    syncBranchChoices();
    return;
  }
  renderBaseBranchComposer();
});
elements.baseBranchInput?.addEventListener("input", (event) => {
  state.baseBranchDraftManual = true;
  state.baseBranchDraftName = event.target.value;
  renderBaseBranchComposer();
});
elements.taskAttachmentsInput.addEventListener("change", renderDraftAttachments);
elements.taskCreationForm.addEventListener("submit", onCreateTask);
elements.showJourneyButton?.addEventListener("click", () => {
  openDialog(elements.taskJourneyDialog);
});
elements.taskJourneyDialogCloseButton?.addEventListener("click", () => {
  if (elements.taskJourneyDialog?.open) {
    if (typeof elements.taskJourneyDialog.close === "function") {
      elements.taskJourneyDialog.close();
    } else {
      elements.taskJourneyDialog.removeAttribute("open");
    }
  }
});
elements.taskJourneyDialog?.addEventListener("click", (event) => {
  if (event.target === elements.taskJourneyDialog) {
    if (typeof elements.taskJourneyDialog.close === "function") {
      elements.taskJourneyDialog.close();
    } else {
      elements.taskJourneyDialog.removeAttribute("open");
    }
  }
});
elements.refreshTasksButton.addEventListener("click", () => {
  if (state.selectedProjectId) {
    void loadProjectTasks(state.selectedProjectId, { preserveSelection: true });
  }
});
elements.refreshTaskPageButton?.addEventListener("click", () => {
  if (state.selectedProjectId) {
    void loadProjectTasks(state.selectedProjectId, { preserveSelection: true });
  }
});
function toggleArchivedTaskVisibility() {
  state.showArchivedTasks = !state.showArchivedTasks;

  if (state.selectedProjectId) {
    void loadProjectTasks(state.selectedProjectId, { preserveSelection: true });
  } else {
    renderTaskCollections();
  }
}
elements.taskListArchivedToggle?.addEventListener("click", () => {
  toggleArchivedTaskVisibility();
});
elements.taskPageArchivedToggle?.addEventListener("click", () => {
  toggleArchivedTaskVisibility();
});
elements.taskPageSearchInput?.addEventListener("input", (event) => {
  state.taskListSearch = event.target.value ?? "";
  renderTaskCollections();
});
elements.workspacePickerSearchInput?.addEventListener("input", (event) => {
  state.taskListSearch = event.target.value ?? "";
  renderTaskCollections();
});
elements.workspacePickerOpenButton?.addEventListener("click", () => {
  openDialog(elements.workspacePickerDialog);
  elements.workspacePickerSearchInput?.focus();
});
elements.workspacePickerCloseButton?.addEventListener("click", closeWorkspacePickerDialog);
elements.workspacePickerDialog?.addEventListener("click", (event) => {
  if (event.target === elements.workspacePickerDialog) {
    closeWorkspacePickerDialog();
  }
});
elements.leaderPlanDetailCloseButton?.addEventListener("click", closeLeaderPlanDetailDialog);
elements.leaderPlanDetailDialog?.addEventListener("click", (event) => {
  if (event.target === elements.leaderPlanDetailDialog) {
    closeLeaderPlanDetailDialog();
  }
});
elements.refreshTaskDetailButton.addEventListener("click", () => {
  if (state.selectedTaskId) {
    void loadTaskDetail(state.selectedTaskId);
  }
});
elements.taskActionDialogCloseButton?.addEventListener("click", closeTaskActionDialog);
elements.taskActionDialogCancelButton?.addEventListener("click", closeTaskActionDialog);
elements.taskActionDialogConfirmButton?.addEventListener("click", () => {
  void onConfirmTaskAction();
});
elements.taskActionDialog?.addEventListener("close", () => {
  clearFeedback(elements.taskActionDialogFeedback);
  state.taskActionDialogState = null;
});
elements.taskActionDialog?.addEventListener("click", (event) => {
  if (event.target === elements.taskActionDialog) {
    closeTaskActionDialog();
  }
});
elements.taskWorkspacePauseButton?.addEventListener("click", () => {
  const task = resolveTaskFromState(state.selectedTaskId);

  if (task) {
    openTaskActionDialog("pause", task);
  }
});
elements.taskWorkspaceDeleteButton?.addEventListener("click", () => {
  const task = resolveTaskFromState(state.selectedTaskId);

  if (task) {
    openTaskActionDialog("delete", task);
  }
});
elements.taskNextActionButton?.addEventListener("click", onTaskNextAction);
elements.startClarificationButton.addEventListener("click", onStartClarification);
elements.confirmRequirementsButton.addEventListener("click", onConfirmRequirements);
elements.taskMessageForm.addEventListener("submit", onSendTaskMessage);
elements.taskMessageInput.addEventListener("input", () => {
  if (state.taskDetail) {
    renderTaskMessageComposer(state.taskDetail);
  }
});
elements.taskMessageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.altKey) {
    event.preventDefault();

    void onSendTaskMessage({
      preventDefault() {},
    });
  }
});
elements.taskMessageStopButton?.addEventListener("click", () => {
  void onStopActiveTaskMessage();
});
elements.taskPlanAddSubtaskButton.addEventListener("click", onAddPlanSubtask);
elements.taskPlanApplyTemplateButton.addEventListener("click", onApplyPlanTemplate);
elements.taskPlanApproveButton.addEventListener("click", onApprovePlanDraft);
elements.taskPlanGraphViewButton?.addEventListener("click", () => onSetPlanView("graph"));
elements.taskPlanListViewButton?.addEventListener("click", () => onSetPlanView("list"));
elements.taskPlanNodeCloseButton?.addEventListener("click", closeTaskPlanNodeDialog);
elements.taskPlanNodeDialog?.addEventListener("click", (event) => {
  if (elements.taskPlanNodeDialog?.tagName === "DIALOG" && event.target === elements.taskPlanNodeDialog) {
    closeTaskPlanNodeDialog();
  }
});
elements.taskPlanNodeDialog?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeTaskPlanNodeDialog();
  }
});
[
  elements.taskPlanNodeTitleInput,
  elements.taskPlanNodeRoleInput,
  elements.taskPlanNodeAgentSelect,
  elements.taskPlanNodeDescriptionInput,
  elements.taskPlanNodeDeliverableInput,
  elements.taskPlanNodeCriteriaInput,
  elements.taskPlanNodeBranchInput,
  elements.taskPlanNodeDependsInput,
  elements.taskPlanNodeTemplateInput,
  elements.taskPlanNodeScopeInput,
].forEach((input) => {
  input?.addEventListener("input", onPlanSubtaskInput);
  input?.addEventListener("change", onPlanSubtaskInput);
});
elements.taskPlanNodeRemoveButton?.addEventListener("click", onRemovePlanSubtask);
elements.taskPlanResetDraftButton.addEventListener("click", onResetPlanDraft);
elements.taskPlanSaveDraftButton.addEventListener("click", onSavePlanDraft);
elements.taskPlanNotesInput.addEventListener("input", onPlanNotesInput);
elements.taskExecutionGraphButton.addEventListener("click", () => onSetTaskOperationsView("graph"));
elements.taskExecutionListButton.addEventListener("click", () => onSetTaskOperationsView("list"));
elements.taskExecutionActivityButton.addEventListener("click", () => onSetTaskOperationsView("activity"));
elements.taskIntegrationStartButton.addEventListener("click", onStartIntegrationRun);
elements.taskIntegrationRetryButton.addEventListener("click", onRetryIntegrationRun);
elements.taskIntegrationRollbackButton.addEventListener("click", onRollbackIntegrationRun);
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
elements.taskHubPlanOpenButton?.addEventListener("click", () => {
  focusTaskPlanPreview();
});
elements.taskHubDeliveryOpenButton?.addEventListener("click", () => {
  focusTaskDeliveryOverview();
});
elements.taskHubPreviewFocusButton?.addEventListener("click", () => {
  focusTaskPreviewStudio();
});
elements.taskPreviewTargetSelect?.addEventListener("change", onTaskPreviewPresetChange);
elements.taskPreviewAppRootSelect?.addEventListener("change", onTaskPreviewPresetChange);
elements.taskPreviewCommandInput?.addEventListener("input", () => {
  elements.taskPreviewCommandInput.dataset.autoFilled = "false";
});
elements.taskPreviewPortInput?.addEventListener("input", () => {
  elements.taskPreviewPortInput.dataset.autoFilled = "false";
});
elements.taskPreviewPathInput?.addEventListener("input", () => {
  elements.taskPreviewPathInput.dataset.autoFilled = "false";
});
elements.taskPreviewForm?.addEventListener("submit", onStartTaskPreview);
elements.taskPreviewRestartButton?.addEventListener("click", onRestartTaskPreview);
elements.taskPreviewStopButton?.addEventListener("click", onStopTaskPreview);
elements.taskTitleInput.addEventListener("input", onTaskTitleInput);
elements.taskExecutionMailboxSenderSelect.addEventListener("change", () => {
  if (state.taskDetail && getSelectedExecutionSubTask()) {
    renderTaskDetail();
  }
});

// ── View routing ──
function switchView(viewId) {
  if (!VIEW_IDS.includes(viewId)) {
    viewId = "dashboard";
  }
  const previousView = state.currentView;
  state.currentView = viewId;
  state.focusWorkspaceStageOnNextRender = viewId === "workspace" && previousView !== "workspace";
  for (const id of VIEW_IDS) {
    const el = elements.views[id];
    if (el) {
      el.hidden = id !== viewId;
    }
  }
  for (const tab of elements.topnavTabs) {
    tab.classList.toggle("is-active", tab.dataset.view === viewId);
  }
  window.location.hash = viewId;

  if (viewId === "workspace" && state.taskDetail?.task) {
    window.requestAnimationFrame(() => {
      focusActiveWorkspaceStageCard();
    });
  }
}

for (const tab of elements.topnavTabs) {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
}

// Restore view from URL hash
const initialHash = window.location.hash.replace("#", "");
if (VIEW_IDS.includes(initialHash)) {
  switchView(initialHash);
}

window.addEventListener("hashchange", () => {
  const hash = window.location.hash.replace("#", "");
  if (VIEW_IDS.includes(hash) && hash !== state.currentView) {
    switchView(hash);
  }
});

// ── Sidebar ──
elements.sidebarRegisterToggle?.addEventListener("click", () => {
  void openProjectRegistrationDialog();
});
elements.projectPickerCloseButton?.addEventListener("click", () => {
  closeProjectRegistrationDialog();
});
elements.projectRegistrationDialog?.addEventListener("close", onProjectRegistrationDialogClosed);
elements.projectRegistrationDialog?.addEventListener("click", (event) => {
  if (event.target === elements.projectRegistrationDialog) {
    closeProjectRegistrationDialog();
  }
});
elements.projectPathUseCurrentButton?.addEventListener("click", () => {
  if (state.projectPathBrowserCurrent) {
    setProjectPathInput(state.projectPathBrowserCurrent);
  }
});
elements.projectPathParentButton?.addEventListener("click", () => {
  if (state.projectPathBrowserParent) {
    void loadProjectDirectoryBrowser(state.projectPathBrowserParent);
  }
});
elements.projectPathBrowseInputButton?.addEventListener("click", () => {
  const requestedPath = elements.projectPathInput.value.trim();
  if (requestedPath) {
    void loadProjectDirectoryBrowser(requestedPath);
  }
});
elements.projectPathBrowserFilter?.addEventListener("input", (event) => {
  state.projectPathBrowserFilter = event.target.value;
  renderProjectRegistrationDialog();
});
elements.projectPathHiddenToggle?.addEventListener("change", (event) => {
  state.projectPathIncludeHidden = event.target.checked;
  void loadProjectDirectoryBrowser(state.projectPathBrowserCurrent ?? getDefaultProjectBrowserPath());
});
elements.projectPathInput?.addEventListener("input", () => {
  renderProjectRegistrationDialog();
});

async function openProjectRegistrationDialog() {
  const dialog = elements.projectRegistrationDialog;

  if (dialog?.open) {
    elements.projectPathInput?.focus();
    return;
  }

  clearFeedback(elements.projectPathBrowserFeedback);
  clearFeedback(elements.registrationFeedback);
  state.projectPathBrowserFilter = "";
  state.projectPathIncludeHidden = false;
  state.projectPathBrowserLoading = false;

  if (elements.projectPathBrowserFilter) {
    elements.projectPathBrowserFilter.value = "";
  }

  if (elements.projectPathHiddenToggle) {
    elements.projectPathHiddenToggle.checked = false;
  }

  if (elements.projectPathInput) {
    elements.projectPathInput.value = "";
  }

  openDialog(dialog);
  renderProjectRegistrationDialog();
  await loadProjectDirectoryBrowser(getDefaultProjectBrowserPath());
  elements.projectPathInput?.focus();
}

function closeProjectRegistrationDialog() {
  const dialog = elements.projectRegistrationDialog;

  if (!dialog?.open) {
    return;
  }

  if (typeof dialog.close === "function") {
    dialog.close();
    return;
  }

  dialog.removeAttribute("open");
  onProjectRegistrationDialogClosed();
}

function onProjectRegistrationDialogClosed() {
  clearFeedback(elements.projectPathBrowserFeedback);
  clearFeedback(elements.registrationFeedback);
}

function getDefaultProjectBrowserPath() {
  const selectedProjectPath = state.projectDetail?.project?.path
    ?? state.projects.find((project) => project.id === state.selectedProjectId)?.path
    ?? null;

  if (selectedProjectPath) {
    return selectedProjectPath;
  }

  return null;
}

async function loadProjectDirectoryBrowser(requestedPath) {
  state.projectPathBrowserLoading = true;
  clearFeedback(elements.projectPathBrowserFeedback);
  renderProjectRegistrationDialog();

  try {
    const params = new URLSearchParams();

    if (requestedPath) {
      params.set("path", requestedPath);
    }

    if (state.projectPathIncludeHidden) {
      params.set("hidden", "1");
    }

    const response = await fetchJson(`/api/projects/browse?${params.toString()}`);
    state.projectPathBrowserCurrent = response.currentPath ?? null;
    state.projectPathBrowserEntries = response.entries ?? [];
    state.projectPathBrowserParent = response.parentPath ?? null;
    state.projectPathBrowserRoots = response.roots ?? [];
    state.projectPathCurrentIsRepo = response.isGitRepository === true;
  } catch (error) {
    showFeedback(elements.projectPathBrowserFeedback, "error", buildProjectErrorMessage(error));
  } finally {
    state.projectPathBrowserLoading = false;
    renderProjectRegistrationDialog();
  }
}

function renderProjectRegistrationDialog() {
  renderProjectPathRoots();
  renderProjectPathBreadcrumb();
  renderProjectPathCurrent();
  renderProjectPathDirectoryList();
  renderProjectPathSelection();
}

function renderProjectPathRoots() {
  const container = elements.projectPathRootList;

  if (!container) {
    return;
  }

  container.replaceChildren();

  for (const root of state.projectPathBrowserRoots) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "project-picker__chip";
    button.textContent = t(resolveProjectRootLabel(root.kind));
    button.addEventListener("click", () => {
      void loadProjectDirectoryBrowser(root.path);
    });
    container.append(button);
  }
}

function renderProjectPathBreadcrumb() {
  const container = elements.projectPathBreadcrumb;

  if (!container) {
    return;
  }

  container.replaceChildren();

  for (const segment of buildPathSegments(state.projectPathBrowserCurrent)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "project-picker__chip";
    button.textContent = segment.label;
    button.addEventListener("click", () => {
      void loadProjectDirectoryBrowser(segment.path);
    });
    container.append(button);
  }
}

function renderProjectPathCurrent() {
  if (elements.projectPathCurrent) {
    elements.projectPathCurrent.textContent = state.projectPathBrowserCurrent ?? t("unknownPath");
  }

  if (elements.projectPathCurrentBadge) {
    elements.projectPathCurrentBadge.textContent = state.projectPathCurrentIsRepo
      ? t("projectPickerEntryRepo")
      : t("projectPickerEntryFolder");
  }

  if (elements.projectPathParentButton) {
    elements.projectPathParentButton.disabled = !state.projectPathBrowserParent;
  }
}

function renderProjectPathDirectoryList() {
  const container = elements.projectPathDirectoryList;
  const emptyState = elements.projectPathDirectoryEmpty;

  if (!container || !emptyState) {
    return;
  }

  container.replaceChildren();

  const filterValue = (state.projectPathBrowserFilter ?? "").trim().toLowerCase();
  const visibleEntries = state.projectPathBrowserEntries.filter((entry) => (
    filterValue.length === 0
      || entry.name.toLowerCase().includes(filterValue)
  ));

  if (state.projectPathBrowserLoading) {
    emptyState.hidden = false;
    emptyState.textContent = t("projectPickerLoading");
    return;
  }

  if (visibleEntries.length === 0) {
    emptyState.hidden = false;
    emptyState.textContent = filterValue ? t("projectPickerNoMatch") : t("projectPickerDirectoryEmpty");
    return;
  }

  emptyState.hidden = true;

  for (const entry of visibleEntries) {
    const item = document.createElement("div");
    item.className = "project-picker__directory-item";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "project-picker__directory-main";
    openButton.addEventListener("click", () => {
      void loadProjectDirectoryBrowser(entry.path);
    });

    const icon = document.createElement("span");
    icon.className = "project-picker__directory-symbol";
    icon.textContent = "folder";
    openButton.append(icon);

    const copy = document.createElement("div");
    copy.className = "project-picker__directory-copy";

    const title = document.createElement("p");
    title.className = "project-picker__directory-name";
    title.textContent = entry.name;
    copy.append(title);

    const meta = document.createElement("p");
    meta.className = "project-picker__directory-meta";
    meta.textContent = buildDirectoryEntryMeta(entry);
    copy.append(meta);
    openButton.append(copy);

    const actions = document.createElement("div");
    actions.className = "project-picker__directory-actions";

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "project-picker__chip";
    selectButton.textContent = t("projectPickerEntrySelect");
    selectButton.addEventListener("click", () => {
      setProjectPathInput(entry.path);
    });
    actions.append(selectButton);

    item.append(openButton, actions);
    container.append(item);
  }
}

function renderProjectPathSelection() {
  if (!elements.projectPathSelection || !elements.projectPathSelectionBadge) {
    return;
  }

  const selectedPath = elements.projectPathInput?.value.trim() ?? "";

  if (!selectedPath) {
    elements.projectPathSelection.textContent = t("projectPickerNoSelection");
    elements.projectPathSelectionBadge.hidden = true;
    return;
  }

  elements.projectPathSelection.textContent = selectedPath;
  elements.projectPathSelectionBadge.hidden = false;
  elements.projectPathSelectionBadge.textContent = selectedPath === state.projectPathBrowserCurrent && state.projectPathCurrentIsRepo
    ? t("projectPickerEntryRepo")
    : t("projectPickerEntryFolder");
}

function setProjectPathInput(nextPath) {
  if (!elements.projectPathInput) {
    return;
  }

  elements.projectPathInput.value = nextPath;
  renderProjectRegistrationDialog();
}

function openDialog(dialog) {
  if (!dialog) {
    return;
  }

  if (dialog.open) {
    return;
  }

  if (typeof dialog.showModal === "function") {
    try {
      dialog.showModal();
      return;
    } catch {
      // Fall back to the open attribute when showModal is unavailable or fails.
    }
  }

  dialog.setAttribute("open", "");
}

function closeWorkspacePickerDialog() {
  const dialog = elements.workspacePickerDialog;

  if (!dialog?.open) {
    return;
  }

  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

function openLeaderPlanDetailDialog(index, node) {
  if (!elements.leaderPlanDetailDialog || !node) {
    return;
  }

  state.leaderPlanDetailState = { index, node };
  renderLeaderPlanDetailDialog();
  openDialog(elements.leaderPlanDetailDialog);
}

function closeLeaderPlanDetailDialog() {
  const dialog = elements.leaderPlanDetailDialog;

  if (dialog?.open) {
    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  state.leaderPlanDetailState = null;
}

function openTaskPlanNodeDialog(index) {
  if (!elements.taskPlanNodeDialog) {
    return;
  }

  state.taskPlanNodeDetailState = { index };
  renderTaskPlanNodeDialog();
  openTaskPlanNodeDrawer(elements.taskPlanNodeDialog);
}

function closeTaskPlanNodeDialog() {
  closeTaskPlanNodeDrawer(elements.taskPlanNodeDialog);
  state.taskPlanNodeDetailState = null;
}

function openTaskPlanNodeDrawer(drawer) {
  if (!drawer) {
    return;
  }

  if (drawer.parentElement !== document.body) {
    document.body.append(drawer);
  }

  drawer.hidden = false;
  drawer.classList.add("is-open");
  drawer.setAttribute("data-open", "true");
  drawer.setAttribute("aria-hidden", "false");
  elements.taskPlanNodeCloseButton?.focus();
}

function closeTaskPlanNodeDrawer(drawer) {
  if (!drawer) {
    return;
  }

  drawer.classList.remove("is-open");
  drawer.hidden = true;
  drawer.removeAttribute("data-open");
  drawer.setAttribute("aria-hidden", "true");
}

function mountTaskPlanNodeDrawer() {
  if (!elements.taskPlanNodeDialog || elements.taskPlanNodeDialog.parentElement === document.body) {
    return;
  }

  document.body.append(elements.taskPlanNodeDialog);
}

function openTaskActionDialog(action, task) {
  if (!task || !elements.taskActionDialog) {
    return;
  }

  state.taskActionDialogState = {
    action,
    taskId: task.id,
  };
  clearFeedback(elements.taskActionDialogFeedback);

  if (elements.taskActionDialogDeleteBranchesInput) {
    elements.taskActionDialogDeleteBranchesInput.checked = false;
  }

  renderTaskActionDialog();
  openDialog(elements.taskActionDialog);
}

function closeTaskActionDialog() {
  const dialog = elements.taskActionDialog;

  if (!dialog?.open) {
    state.taskActionDialogState = null;
    return;
  }

  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }

  clearFeedback(elements.taskActionDialogFeedback);
  state.taskActionDialogState = null;
}

function renderTaskActionDialog() {
  const dialogState = state.taskActionDialogState;
  const task = dialogState ? resolveTaskFromState(dialogState.taskId) : null;

  if (!dialogState || !task) {
    return;
  }

  const isPause = dialogState.action === "pause";
  const isDelete = dialogState.action === "delete";
  const summary = isPause
    ? t("taskActionPauseSummary")
    : isDelete
      ? t("taskActionDeleteSummary")
      : t("taskActionArchiveSummary");
  const branchHint = isTaskLifecycleActive(task.status) && !isPausedTask(task)
    ? `${t("taskActionDeleteBranchesHint")} ${t("taskActionDeleteBranchesActiveHint")}`
    : t("taskActionDeleteBranchesHint");

  if (elements.taskActionDialogEyebrow) {
    elements.taskActionDialogEyebrow.textContent = t("taskActionDialogEyebrow");
  }

  if (elements.taskActionDialogTitle) {
    elements.taskActionDialogTitle.textContent = isPause
      ? `${t("taskActionPauseTitle")} · ${task.title}`
      : isDelete
        ? `${t("taskActionDeleteTitle")} · ${task.title}`
        : `${t("taskActionArchiveTitle")} · ${task.title}`;
  }

  if (elements.taskActionDialogSummary) {
    elements.taskActionDialogSummary.textContent = summary;
  }

  if (elements.taskActionDialogDeleteBranchesField) {
    elements.taskActionDialogDeleteBranchesField.hidden = !isDelete;
  }

  if (elements.taskActionDialogBranchSummary) {
    elements.taskActionDialogBranchSummary.hidden = !isDelete;
    elements.taskActionDialogBranchSummary.textContent = branchHint;
  }

  if (elements.taskActionDialogConfirmButton) {
    elements.taskActionDialogConfirmButton.textContent = isPause
      ? t("taskActionPauseConfirmButton")
      : isDelete
        ? t("taskActionDeleteConfirmButton")
        : t("taskActionArchiveConfirmButton");
    elements.taskActionDialogConfirmButton.className = isDelete
      ? "button task-list__action task-list__action--danger"
      : "button button--primary";
  }
}

async function onConfirmTaskAction() {
  const dialogState = state.taskActionDialogState;
  const task = dialogState ? resolveTaskFromState(dialogState.taskId) : null;

  if (!dialogState || !task) {
    closeTaskActionDialog();
    return;
  }

  const deleteBranches = elements.taskActionDialogDeleteBranchesInput?.checked === true;
  const isPause = dialogState.action === "pause";
  const isDelete = dialogState.action === "delete";
  const method = isDelete ? "DELETE" : "POST";
  const url = isPause
    ? `/api/tasks/${encodeURIComponent(task.id)}/pause`
    : isDelete
    ? `/api/tasks/${encodeURIComponent(task.id)}`
    : `/api/tasks/${encodeURIComponent(task.id)}/archive`;
  const idleLabel = isPause
    ? t("taskActionPauseConfirmButton")
    : isDelete
      ? t("taskActionDeleteConfirmButton")
      : t("taskActionArchiveConfirmButton");
  const busyLabel = isPause ? t("pausing") : isDelete ? t("deleting") : t("archiving");

  clearFeedback(elements.taskActionDialogFeedback);
  setButtonBusy(
    elements.taskActionDialogConfirmButton,
    true,
    busyLabel,
  );

  try {
    await fetchJson(url, {
      body: isDelete ? { deleteBranches } : undefined,
      method,
    });

    if (state.selectedTaskId === task.id && (isDelete || (!isPause && !state.showArchivedTasks))) {
      state.selectedTaskId = null;
      state.taskDetail = null;
      writeStorage(STORAGE_KEYS.selectedTaskId, "");
    }

    closeTaskActionDialog();

    if (state.selectedProjectId) {
      await loadProjectTasks(state.selectedProjectId, {
        preserveSelection: true,
        ...(isPause ? { selectedTaskId: task.id } : {}),
      });
    } else {
      renderTaskList();
    }
  } catch (error) {
    showFeedback(elements.taskActionDialogFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(
      elements.taskActionDialogConfirmButton,
      false,
      idleLabel,
    );
  }
}

function resolveProjectRootLabel(kind) {
  switch (kind) {
    case "home":
      return "projectPickerRootHome";
    case "workspace":
      return "projectPickerRootWorkspace";
    default:
      return "projectPickerRootRoot";
  }
}

function buildPathSegments(currentPath) {
  if (!currentPath) {
    return [];
  }

  const normalizedPath = currentPath.replaceAll("\\", "/");
  const rootPath = pathRoot(normalizedPath);
  const relativePath = normalizedPath.slice(rootPath.length).split("/").filter(Boolean);
  const segments = [{
    label: rootPath || "/",
    path: rootPath || "/",
  }];
  let partialPath = rootPath || "/";

  for (const segment of relativePath) {
    partialPath = partialPath === "/" ? `/${segment}` : `${partialPath}/${segment}`;
    segments.push({
      label: segment,
      path: partialPath,
    });
  }

  return segments;
}

function pathRoot(targetPath) {
  if (!targetPath) {
    return "/";
  }

  const rootMatch = targetPath.match(/^([A-Za-z]:\/|\/)/);
  return rootMatch?.[1] ?? "/";
}

function buildDirectoryEntryMeta(entry) {
  const parts = [entry.isGitRepository ? t("projectPickerEntryRepo") : t("projectPickerEntryFolder")];

  if (entry.isSymlink) {
    parts.push(t("projectPickerEntrySymlink"));
  }

  return parts.join(" · ");
}

function renderSidebarProjects() {
  const container = elements.sidebarProjectList;
  const empty = elements.sidebarProjectEmpty;
  if (!container) return;

  if (state.projects.length === 0) {
    container.innerHTML = "";
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;
  container.innerHTML = state.projects.map((project) => {
    const isSelected = project.id === state.selectedProjectId;
    const glyph = buildProjectGlyph(project.name);
    const projectTitle = String(project.name ?? "").trim() || project.path || t("sidebarTitle");
    return `<button class="sidebar__project${isSelected ? " is-selected" : ""}" type="button" data-project-id="${escapeHtmlAttribute(project.id)}" title="${escapeHtmlAttribute(projectTitle)}" aria-label="${escapeHtmlAttribute(projectTitle)}">
      <span class="sidebar__project-glyph" aria-hidden="true">${escapeHtml(glyph)}</span>
      <span class="sidebar__project-meta">
        <div class="sidebar__project-name">${escapeHtml(project.name)}</div>
        <div class="sidebar__project-path">${escapeHtml(project.path)}</div>
      </span>
    </button>`;
  }).join("");

  container.querySelectorAll(".sidebar__project").forEach((button) => {
    button.addEventListener("click", () => {
      void selectProject(button.dataset.projectId, { preserveTask: true });
    });
  });
}

function buildProjectGlyph(name) {
  const compact = String(name ?? "").trim().replace(/[^A-Za-z0-9\u4e00-\u9fff]/g, "");
  return compact.slice(0, 2).toUpperCase() || "PR";
}

function updateSidebarAgentCount() {
  const el = elements.sidebarAgentCount;
  if (el) {
    const count = state.agents.length;
    el.textContent = t("sidebarActiveAgents", { count });
  }
}

renderLocale();
startLiveStatusRefresh();
void Promise.all([loadProjects({ preserveSelection: true }), loadAgents(), loadTaskTemplates()]);

function startLiveStatusRefresh() {
  window.setInterval(() => {
    if (document.visibilityState === "hidden") {
      return;
    }

    void refreshLiveStatus();
  }, LIVE_STATUS_REFRESH_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void refreshLiveStatus();
    }
  });
}

async function refreshLiveStatus() {
  const work = [loadAgents({ force: true })];

  if (state.selectedProjectId) {
    work.push(selectProject(state.selectedProjectId, { preserveTask: true }));
  } else if (state.selectedTaskId) {
    work.push(loadTaskDetail(state.selectedTaskId));
  }

  await Promise.allSettled(work);
}

async function onRegisterProject(event) {
  event.preventDefault();
  clearFeedback(elements.registrationFeedback);
  setButtonBusy(elements.registerProjectButton, true, t("registering"));

  try {
    const projectPath = elements.projectPathInput.value.trim();
    const response = await fetchJson("/api/projects", {
      body: { path: projectPath },
      method: "POST",
    });

    elements.projectRegistrationForm.reset();
    await loadProjects({ selectedProjectId: response.project.id });
    closeProjectRegistrationDialog();
    showFeedback(
      elements.projectDetailFeedback,
      "success",
      t("projectRegistered", { name: response.project.name }),
    );
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
    const useGuidedFlow = Boolean(state.selectedGuidedTemplateId);
    const routePath = useGuidedFlow ? "/api/guided-tasks" : "/api/tasks";

    const response = await fetchJson(routePath, {
      body: {
        attachments,
        baseBranch: getSelectedTaskBaseBranch(),
        baseBranchMode: state.baseBranchMode,
        ...(state.baseBranchMode === "new" ? { baseBranchStartPoint: state.baseBranchStartPoint } : {}),
        description: elements.taskDescriptionInput.value.trim(),
        leadAgentType: state.selectedLeadAgentName,
        projectId: state.selectedProjectId,
        ...(useGuidedFlow ? { templateId: state.selectedGuidedTemplateId } : {}),
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
    state.baseBranchDraftManual = false;
    state.baseBranchDraftName = "";
    state.baseBranchMode = "new";
    state.baseBranchStartPoint = null;
    state.selectedExistingBaseBranch = null;
    state.selectedTaskId = response.task.id;
    writeStorage(STORAGE_KEYS.selectedTaskId, response.task.id);
    await loadProjectDetail(state.selectedProjectId);
    await loadProjectTasks(state.selectedProjectId, { selectedTaskId: response.task.id });
    await loadTaskDetail(response.task.id);
    switchView("tasks");
    showFeedback(
      elements.taskDetailFeedback,
      "success",
      t("taskCreated", { title: response.task.title }),
    );
  } catch (error) {
    const message = buildTaskErrorMessage(error);
    const feedbackTarget = String(error?.code ?? "").startsWith("ATTACHMENT_")
      ? elements.taskAttachmentFeedback
      : elements.taskFormFeedback;

    showFeedback(feedbackTarget, "error", message);
  } finally {
    setButtonBusy(elements.createTaskButton, false, buildCreateTaskButtonLabel());
  }
}

async function onStartClarification(initialContent = null) {
  if (!state.selectedTaskId) {
    return;
  }

  clearFeedback(elements.taskDetailFeedback);
  setButtonBusy(elements.startClarificationButton, true, t("starting"));

  try {
    connectTaskStream(state.selectedTaskId);
    const response = await fetchJson(`/api/tasks/${encodeURIComponent(state.selectedTaskId)}/start-clarification`, {
      body: { content: normalizeOptionalText(initialContent ?? elements.taskMessageInput.value) },
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

function createLocalTaskMessage(content, status = "queued") {
  return {
    content,
    createdAt: new Date().toISOString(),
    id: `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    status,
    taskId: state.selectedTaskId,
  };
}

function resetTaskMessageQueueState(options = {}) {
  state.taskMessageQueue = [];
  state.taskMessageQueuePaused = false;

  const activeMessage = state.taskMessageInFlight;
  state.taskMessageInFlight = null;
  activeMessage?.controller?.abort?.();

  if (options.clearInput && elements.taskMessageInput) {
    elements.taskMessageInput.value = "";
  }
}

function removeQueuedTaskMessage(messageId) {
  state.taskMessageQueue = state.taskMessageQueue.filter((message) => message.id !== messageId);
  if (state.taskDetail?.task) {
    renderTaskMessageComposer(state.taskDetail);
    renderLeaderConversation(state.taskDetail);
  }
}

async function processNextQueuedTaskMessage() {
  if (state.taskMessageInFlight || state.taskMessageQueuePaused || state.taskMessageQueue.length === 0) {
    if (state.taskDetail?.task) {
      renderTaskMessageComposer(state.taskDetail);
      renderLeaderConversation(state.taskDetail);
    }
    return;
  }

  const [nextMessage, ...remaining] = state.taskMessageQueue;
  state.taskMessageQueue = remaining;
  await submitTaskMessageNow(nextMessage);
}

async function submitTaskMessageNow(message) {
  if (!state.selectedTaskId) {
    return;
  }

  const taskId = state.selectedTaskId;
  const taskStatus = state.taskDetail?.task?.status ?? null;
  const controller = new AbortController();
  const inFlightMessage = {
    ...message,
    controller,
    status: "running",
    stopRequested: false,
    taskId,
  };

  state.taskMessageInFlight = inFlightMessage;
  renderTaskMessageComposer(state.taskDetail);
  renderLeaderConversation(state.taskDetail);

  try {
    if (taskStatus === "DRAFT") {
      connectTaskStream(taskId);
      const response = await fetchJson(`/api/tasks/${encodeURIComponent(taskId)}/start-clarification`, {
        body: { content: message.content },
        method: "POST",
        signal: controller.signal,
      });

      if (state.selectedTaskId === taskId) {
        state.taskDetail = {
          ...state.taskDetail,
          sessions: [response.session],
          task: response.task,
        };
      }
    } else {
      await fetchJson(`/api/tasks/${encodeURIComponent(taskId)}/messages`, {
        body: { content: message.content },
        method: "POST",
        signal: controller.signal,
      });
    }

    if (state.taskMessageInFlight?.id === inFlightMessage.id) {
      state.taskMessageInFlight = null;
    }

    if (state.selectedTaskId === taskId) {
      renderTaskMessageComposer(state.taskDetail);
      renderLeaderConversation(state.taskDetail);
      await loadTaskDetail(taskId, { preserveStream: true });
    }
  } catch (error) {
    const aborted = controller.signal.aborted || error?.name === "AbortError";

    if (!aborted) {
      state.taskMessageQueuePaused = true;
      showFeedback(elements.taskDetailFeedback, "error", buildTaskErrorMessage(error));

      if (elements.taskMessageInput && state.selectedTaskId === taskId) {
        elements.taskMessageInput.value = message.content;
      }
    }
  } finally {
    if (state.taskMessageInFlight?.id === inFlightMessage.id) {
      state.taskMessageInFlight = null;
    }

    if (state.selectedTaskId === taskId) {
      renderTaskMessageComposer(state.taskDetail);
      renderLeaderConversation(state.taskDetail);
    }

    if (!state.taskMessageQueuePaused) {
      await processNextQueuedTaskMessage();
    }
  }
}

async function onSendTaskMessage(event) {
  event.preventDefault();

  if (!state.selectedTaskId) {
    return;
  }

  clearFeedback(elements.taskDetailFeedback);
  const content = elements.taskMessageInput.value.trim();

  if (!content) {
    renderTaskMessageComposer(state.taskDetail);
    return;
  }

  const message = createLocalTaskMessage(content, state.taskMessageInFlight ? "queued" : "running");
  elements.taskMessageInput.value = "";

  if (state.taskMessageInFlight) {
    state.taskMessageQueue.push(message);
    renderTaskMessageComposer(state.taskDetail);
    renderLeaderConversation(state.taskDetail);
    return;
  }

  state.taskMessageQueuePaused = false;
  await submitTaskMessageNow(message);
}

async function onStopActiveTaskMessage() {
  const activeMessage = state.taskMessageInFlight;

  if (!activeMessage || !state.selectedTaskId) {
    return;
  }

  activeMessage.stopRequested = true;
  state.taskMessageQueuePaused = true;
  renderTaskMessageComposer(state.taskDetail);

  try {
    await fetchJson(`/api/tasks/${encodeURIComponent(state.selectedTaskId)}/stop-lead-session`, {
      method: "POST",
    });
  } catch (error) {
    if (error?.code !== "SESSION_NOT_RUNNING") {
      showFeedback(elements.taskDetailFeedback, "error", buildTaskErrorMessage(error));
      return;
    }
  }

  activeMessage.controller?.abort?.();

  await loadTaskDetail(state.selectedTaskId, { preserveStream: true }).catch(() => null);

  if (elements.taskMessageInput) {
    elements.taskMessageInput.value = activeMessage.content;
    elements.taskMessageInput.focus();
    elements.taskMessageInput.setSelectionRange(
      elements.taskMessageInput.value.length,
      elements.taskMessageInput.value.length,
    );
  }

  state.taskMessageInFlight = null;
  renderTaskMessageComposer(state.taskDetail);
  renderLeaderConversation(state.taskDetail);
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
  clearFeedback(elements.taskPageFeedback);
  setButtonBusy(elements.refreshTasksButton, true, t("refreshing"));
  setButtonBusy(elements.refreshTaskPageButton, true, t("refreshing"));

  try {
    const params = new URLSearchParams();

    if (state.showArchivedTasks) {
      params.set("includeArchived", "1");
    }

    const response = await fetchJson(`/api/projects/${encodeURIComponent(projectId)}/tasks${params.toString() ? `?${params.toString()}` : ""}`);
    state.tasks = response.tasks ?? [];

    const nextTaskId = options.selectedTaskId
      ?? (options.preserveSelection && state.tasks.some((task) => task.id === state.selectedTaskId) ? state.selectedTaskId : null)
      ?? pickDefaultTaskId(state.tasks)
      ?? null;

    renderTaskCollections();

    if (nextTaskId) {
      await loadTaskDetail(nextTaskId);
    } else {
      clearTaskDetail();
    }
  } catch (error) {
    state.tasks = [];
    renderTaskCollections();
    clearTaskDetail();
    showFeedback(elements.taskListFeedback, "error", buildTaskErrorMessage(error));
    showFeedback(elements.taskPageFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.refreshTasksButton, false, t("refreshTasksButton"));
    setButtonBusy(elements.refreshTaskPageButton, false, t("refreshTasksButton"));
  }
}

async function loadTaskDetail(taskId, options = {}) {
  if (!taskId) {
    clearTaskDetail();
    return;
  }

  if (state.selectedTaskId && state.selectedTaskId !== taskId) {
    resetTaskMessageQueueState({ clearInput: true });
  }

  clearFeedback(elements.taskDetailFeedback);
  setButtonBusy(elements.refreshTaskDetailButton, true, t("refreshing"));

  try {
    const [response, previewResponse] = await Promise.all([
      fetchJson(`/api/tasks/${encodeURIComponent(taskId)}`),
      fetchJson(`/api/tasks/${encodeURIComponent(taskId)}/preview`).catch(() => ({ preview: null })),
    ]);
    closeLeaderPlanDetailDialog();
    state.selectedTaskId = taskId;
    state.taskDetail = response;
    state.taskPreview = previewResponse?.preview ?? null;
    hydrateExecutionState(response);
    writeStorage(STORAGE_KEYS.selectedTaskId, taskId);
    renderTaskList();
    renderTaskDetail();
    scheduleTaskPreviewPoll();

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

async function refreshTaskPreview(taskId, options = {}) {
  if (!taskId) {
    state.taskPreview = null;
    clearTaskPreviewPoll();
    return null;
  }

  try {
    const response = await fetchJson(`/api/tasks/${encodeURIComponent(taskId)}/preview`);
    state.taskPreview = response?.preview ?? null;

    if (options.render !== false && state.taskDetail?.task?.id === taskId) {
      renderTaskWorkspaceHub(state.taskDetail);
      renderTaskPreview(state.taskDetail);
      renderTaskStageBoard(state.taskDetail);
    }

    scheduleTaskPreviewPoll();
    return state.taskPreview;
  } catch (error) {
    if (options.silent !== true) {
      showFeedback(elements.taskPreviewFeedback, "error", buildTaskErrorMessage(error));
    }

    clearTaskPreviewPoll();
    return null;
  }
}

function clearTaskPreviewPoll() {
  if (state.taskPreviewPollTimer) {
    window.clearTimeout(state.taskPreviewPollTimer);
    state.taskPreviewPollTimer = null;
  }
}

function scheduleTaskPreviewPoll() {
  clearTaskPreviewPoll();

  if (!state.selectedTaskId) {
    return;
  }

  const status = state.taskPreview?.session?.status ?? null;

  if (!["STARTING", "RUNNING"].includes(status)) {
    return;
  }

  state.taskPreviewPollTimer = window.setTimeout(() => {
    void refreshTaskPreview(state.selectedTaskId, { silent: true });
  }, status === "STARTING" ? 2000 : 5000);
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

    const selectedLeadCandidate = state.leadCandidates.find((candidate) => candidate.agentName === state.selectedLeadAgentName) ?? null;

    if (!selectedLeadCandidate || (!selectedLeadCandidate.selectable && state.leadCandidates.some((candidate) => candidate.selectable))) {
      state.selectedLeadAgentName = state.leadCandidates.find((candidate) => candidate.selectable)?.agentName
        ?? state.leadCandidates[0]?.agentName
        ?? null;
    }

    renderAgentHealth();
    renderLeadSelector();
    updateSidebarAgentCount();
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
    updateSidebarAgentCount();
    showFeedback(elements.agentHealthFeedback, "error", buildAgentErrorMessage(error));
  } finally {
    setButtonBusy(elements.refreshAgentHealthButton, false, t("refreshHealthButton"));
  }
}

async function loadTaskTemplates() {
  try {
    const response = await fetchJson("/api/task-templates");
    state.planTemplates = response.templates ?? [];

    if (state.selectedGuidedTemplateId && !state.planTemplates.some((template) => template.id === state.selectedGuidedTemplateId)) {
      state.selectedGuidedTemplateId = null;
    }

    renderGuidedTaskComposer();

    if (state.taskDetail) {
      renderTaskDetail();
    }
  } catch {
    state.planTemplates = [];
    state.selectedGuidedTemplateId = null;
    renderGuidedTaskComposer();
  }
}

function renderProjectList() {
  // Sidebar is the primary project list now
  renderSidebarProjects();

  // Legacy project list container (if it exists)
  if (elements.projectList) {
    elements.projectList.replaceChildren();
    if (elements.projectListEmpty) {
      elements.projectListEmpty.hidden = state.projects.length > 0;
    }

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
  if (elements.projectCurrentBranchBadge) {
    elements.projectCurrentBranchBadge.textContent = `${t("currentBranchStat")} · ${repoStatus.currentBranch ?? t("detachedHead")}`;
  }
  if (elements.dashboardTeamBranchBadge) {
    elements.dashboardTeamBranchBadge.textContent = `${t("currentBranchStat")} · ${repoStatus.currentBranch ?? t("detachedHead")}`;
  }
  elements.cleanlinessBadge.textContent = buildCleanlinessLabel(repoStatus.isDirty);
  elements.cleanlinessBadge.className = `badge ${repoStatus.isDirty ? "badge--dirty" : "badge--clean"}`;
  elements.dirtyWarningBanner.hidden = !repoStatus.isDirty;

  const branches = buildBranchList(repoStatus.recentBranches);
  elements.recentBranches.replaceChildren(...branches.map((branchName) => {
    const item = document.createElement("span");
    item.className = `branches-list__item${branchName === repoStatus.currentBranch ? " is-current" : ""}`;
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
    const snapshot = state.agentHealth[agent.name] ?? null;
    const statusSnapshot = snapshot
      ? { ...snapshot, runtimeMode: snapshot.runtimeMode ?? agent.runtimeMode ?? null }
      : { runtimeMode: agent.runtimeMode ?? null };
    const checks = Array.isArray(snapshot?.checks) && snapshot.checks.length > 0
      ? snapshot.checks
      : [{
        message: t("notYetChecked"),
        name: "availability",
        status: "SKIP",
      }];
    const tone = buildAgentCardTone(agent, snapshot);
    const dominantCheck = checks.find((check) => ["FAIL", "WARN"].includes(check.status)) ?? checks[0] ?? null;
    const roleSummary = [
      agent.roles.leadCandidate ? t("capabilityLead") : null,
      agent.roles.workerCandidate ? t("capabilityWorker") : null,
    ].filter(Boolean).join(" / ");
    const article = document.createElement("article");
    article.className = `agent-card agent-card--${tone}`;

    article.innerHTML = `
      <div class="agent-card__header agent-card__header--compact">
        <div class="agent-card__identity">
          <span class="agent-card__icon" aria-hidden="true">
            <span class="material-symbols-outlined">${escapeHtml(buildAgentStatusIcon(agent, snapshot))}</span>
          </span>
          <div class="agent-card__copy">
            <div class="agent-card__topline">
              <p class="agent-card__title">${escapeHtml(agent.name)}</p>
              <span class="agent-card__state">${escapeHtml(buildAgentCompactStateLabel(agent, snapshot))}</span>
            </div>
            <p class="agent-card__summary">${escapeHtml(buildAgentCompactSummary(agent, snapshot, checks))}</p>
          </div>
        </div>
        <span class="agent-card__signal agent-card__signal--${escapeHtmlAttribute(tone)}" aria-hidden="true"></span>
      </div>
      <div class="agent-card__meta-row">
        <span class="agent-card__chip">${escapeHtml(buildAgentRuntimeModeLabel(agent, snapshot))}</span>
        ${roleSummary ? `<span class="agent-card__chip">${escapeHtml(roleSummary)}</span>` : ""}
        <span class="agent-card__chip">${escapeHtml(`v${snapshot?.version ?? t("unknown")}`)}</span>
      </div>
      ${dominantCheck ? `
        <p class="agent-card__detail">
          <strong>${escapeHtml(buildAgentCheckLabel(dominantCheck.name))}</strong>
          <span>${escapeHtml(dominantCheck.message ?? t("none"))}</span>
        </p>
      ` : ""}
      <p class="agent-card__meta">${escapeHtml(`${t("healthCheckedAtStat")} · ${state.healthCheckedAt ? formatTimestamp(state.healthCheckedAt) : t("notYetChecked")}`)}</p>
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
    option.disabled = !candidate.selectable;
    option.selected = candidate.agentName === state.selectedLeadAgentName;
    option.textContent = candidate.selectable
      ? candidate.agentName
      : `${candidate.agentName} (${translate("unavailable")})`;
    elements.leadAgentSelect.append(option);
  }

  const selectedCandidate = state.leadCandidates.find((candidate) => candidate.agentName === state.selectedLeadAgentName) ?? null;
  const gate = buildLeadSelectionState(selectedCandidate);

  elements.leadAgentSelect.disabled = false;
  showFeedback(elements.leadAgentFeedback, gate.tone, gate.message);
  updateCreateTaskButtonState();
  renderGuidedTaskComposer();
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

function onBaseBranchModeChange(event) {
  state.baseBranchMode = event.target.value === "existing" ? "existing" : "new";
  syncBranchChoices();
}

function onTaskTitleInput() {
  if (state.baseBranchMode === "new" && !state.baseBranchDraftManual) {
    syncBranchChoices();
    return;
  }

  renderTaskCreateFlowSummary();
}

function onSelectGuidedTemplate(_templateId) {
  // Templates removed — always use custom task flow
  state.selectedGuidedTemplateId = null;
  renderGuidedTaskComposer();
}

function onClearGuidedTemplateSelection() {
  state.selectedGuidedTemplateId = null;
  renderTaskCreateFlowSummary();
  if (state.baseBranchMode === "new" && !state.baseBranchDraftManual) {
    syncBranchChoices();
  }
}

function buildCreateTaskButtonLabel() {
  return t("createTaskButton");
}

function getSelectedGuidedTemplateCopy() {
  return null;
}

function renderGuidedTaskComposer() {
  elements.createTaskButton.textContent = buildCreateTaskButtonLabel();
  renderTaskCreateFlowSummary();
}

function renderTaskList() {
  renderTaskCollections();
}

function renderTaskCollections() {
  syncTaskSearchInputs();
  renderWorkspacePickerTrigger();
  renderWorkspacePickerList();
  renderTaskPageList();
}

function syncTaskSearchInputs() {
  if (elements.taskPageSearchInput && elements.taskPageSearchInput.value !== state.taskListSearch) {
    elements.taskPageSearchInput.value = state.taskListSearch;
  }

  if (elements.workspacePickerSearchInput && elements.workspacePickerSearchInput.value !== state.taskListSearch) {
    elements.workspacePickerSearchInput.value = state.taskListSearch;
  }

  if (elements.taskListArchivedToggle) {
    elements.taskListArchivedToggle.textContent = state.showArchivedTasks
      ? t("hideArchivedTasksButton")
      : t("showArchivedTasksButton");
  }

  if (elements.taskPageArchivedToggle) {
    elements.taskPageArchivedToggle.textContent = state.showArchivedTasks
      ? t("hideArchivedTasksButton")
      : t("showArchivedTasksButton");
  }
}

function renderWorkspacePickerTrigger() {
  const selectedTask = resolveTaskFromState(state.selectedTaskId);
  const taskTitle = selectedTask?.title ?? "选择任务";
  const switcherLabel = selectedTask ? `任务工作台 · ${taskTitle}` : taskTitle;

  if (elements.workspacePickerCurrent) {
    elements.workspacePickerCurrent.textContent = taskTitle;
    elements.workspacePickerCurrent.setAttribute("title", taskTitle);
  }

  if (elements.workspacePickerCount) {
    elements.workspacePickerCount.textContent = `${state.tasks.length} 个任务`;
  }

  if (elements.workspacePickerOpenButton) {
    elements.workspacePickerOpenButton.setAttribute("title", switcherLabel);
    elements.workspacePickerOpenButton.setAttribute("aria-label", switcherLabel);
  }
}

function buildVisibleTaskGroups() {
  const normalizedQuery = state.taskListSearch.trim().toLowerCase();
  const matches = (task) => {
    if (!normalizedQuery) {
      return true;
    }

    return [task.title, task.description, task.baseBranch, task.leadAgentType]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
  };

  const activeTasks = state.tasks.filter((task) => !task.archivedAt && matches(task));
  const archivedTasks = state.tasks.filter((task) => Boolean(task.archivedAt) && matches(task));

  return {
    activeTasks,
    archivedTasks,
    visibleTaskCount: state.showArchivedTasks ? activeTasks.length + archivedTasks.length : activeTasks.length,
  };
}

function renderWorkspacePickerList() {
  if (!elements.taskList || !elements.taskListEmpty) {
    return;
  }

  elements.taskList.replaceChildren();
  const { activeTasks, archivedTasks, visibleTaskCount } = buildVisibleTaskGroups();

  elements.taskListEmpty.hidden = visibleTaskCount > 0;
  elements.taskListEmpty.textContent = state.showArchivedTasks
    ? t("taskListEmptyArchived")
    : t("taskListEmptyActiveOnly");

  renderWorkspacePickerListSection(activeTasks);

  if (state.showArchivedTasks && archivedTasks.length > 0) {
    const heading = document.createElement("p");
    heading.className = "task-list__section-title";
    heading.textContent = `${t("taskListArchivedTitle")} · ${archivedTasks.length}`;
    elements.taskList.append(heading);
    renderWorkspacePickerListSection(archivedTasks, { archived: true });
  }
}

function renderWorkspacePickerListSection(tasks, options = {}) {
  for (const task of tasks) {
    const stageMeta = task.archivedAt
      ? { listHint: t("taskArchivedHint") }
      : buildTaskStageMeta(task);
    const entry = document.createElement("article");
    entry.className = "task-list__entry";

    if (options.archived) {
      entry.classList.add("is-archived");
    }

    if (task.id === state.selectedTaskId) {
      entry.classList.add("is-selected");
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "task-list__item";
    button.innerHTML = `
      <div class="task-list__topline">
        <p class="task-list__title">${escapeHtml(task.title)}</p>
        <div class="task-list__badges">
          ${task.archivedAt ? `<span class="badge badge--outline">${escapeHtml(t("taskListArchivedBadge"))}</span>` : ""}
          <span class="badge ${buildTaskStatusBadgeClass(task)}">${escapeHtml(buildTaskDisplayStatusLabel(task))}</span>
        </div>
      </div>
      <div class="task-list__content">
        <p class="task-list__meta"><strong>${escapeHtml(t("baseBranchMetaLabel"))}:</strong> ${escapeHtml(task.baseBranch)}</p>
        <p class="task-list__hint">${escapeHtml(stageMeta.listHint)}</p>
      </div>
    `;
    button.addEventListener("click", () => {
      closeWorkspacePickerDialog();
      switchView("workspace");
      void loadTaskDetail(task.id);
    });

    const actions = buildTaskActionRow(task);
    entry.append(button, actions);
    elements.taskList.append(entry);
  }
}

function renderTaskPageList() {
  if (!elements.taskPageList || !elements.taskPageEmpty) {
    return;
  }

  elements.taskPageList.replaceChildren();
  const { activeTasks, archivedTasks, visibleTaskCount } = buildVisibleTaskGroups();

  elements.taskPageEmpty.hidden = visibleTaskCount > 0;
  elements.taskPageEmpty.textContent = state.showArchivedTasks
    ? t("taskListEmptyArchived")
    : t("taskListEmptyActiveOnly");

  renderTaskPageListSection(activeTasks);

  if (state.showArchivedTasks && archivedTasks.length > 0) {
    const heading = document.createElement("p");
    heading.className = "task-list__section-title";
    heading.textContent = `${t("taskListArchivedTitle")} · ${archivedTasks.length}`;
    elements.taskPageList.append(heading);
    renderTaskPageListSection(archivedTasks, { archived: true });
  }
}

function renderTaskPageListSection(tasks, options = {}) {
  for (const task of tasks) {
    const stageMeta = task.archivedAt
      ? { listHint: t("taskArchivedHint") }
      : buildTaskStageMeta(task);
    const expanded = state.expandedTaskCards.has(task.id);
    const article = document.createElement("article");
    article.className = `task-page-card${expanded ? " is-expanded" : ""}${task.id === state.selectedTaskId ? " is-selected" : ""}${options.archived ? " is-archived" : ""}`;
    article.setAttribute("role", "listitem");

    const header = document.createElement("div");
    header.className = "task-page-card__header";
    header.innerHTML = `
      <button class="task-page-card__entry" type="button">
        <div class="task-page-card__topline">
          <h3 class="task-page-card__title">${escapeHtml(task.title)}</h3>
          <div class="task-page-card__badges">
            ${task.archivedAt ? `<span class="badge badge--outline">${escapeHtml(t("taskListArchivedBadge"))}</span>` : ""}
            <span class="badge ${buildTaskStatusBadgeClass(task)}">${escapeHtml(buildTaskDisplayStatusLabel(task))}</span>
          </div>
        </div>
        <p class="task-page-card__meta">${escapeHtml(task.baseBranch)}</p>
      </button>
      <div class="task-page-card__header-actions">
        <button class="button button--ghost task-page-card__expand" type="button" data-task-page-expand="${escapeHtmlAttribute(task.id)}">
          ${expanded ? "收起" : "展开"}
        </button>
      </div>
    `;
    header.querySelector(".task-page-card__entry")?.addEventListener("click", () => {
      switchView("workspace");
      void loadTaskDetail(task.id);
    });

    header.querySelector("[data-task-page-expand]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleTaskPageCardExpanded(task.id);
    });

    article.append(header);

    if (expanded) {
      const detail = document.createElement("div");
      detail.className = "task-page-card__detail";
      detail.innerHTML = `
        <p class="task-page-card__description">${escapeHtml(task.description ?? "")}</p>
        <div class="task-page-card__facts">
          <span>${escapeHtml(`${t("leadAgentStat")}: ${task.leadAgentType ?? t("unknownAgent")}`)}</span>
          <span>${escapeHtml(stageMeta.listHint)}</span>
        </div>
      `;
      detail.append(buildTaskActionRow(task));
      article.append(detail);
    }

    elements.taskPageList.append(article);
  }
}

function buildTaskActionRow(task) {
  const actions = document.createElement("div");
  actions.className = "task-list__item-actions";
  const paused = isPausedTask(task);
  const deleteAllowed = canDeleteTask(task);

  if (task.archivedAt) {
    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.className = "button button--secondary task-list__action";
    restoreButton.textContent = t("taskUnarchiveButton");
    restoreButton.addEventListener("click", (event) => {
      event.stopPropagation();
      void onUnarchiveTask(task.id);
    });
    actions.append(restoreButton);
  } else {
    if (canPauseTask(task)) {
      const pauseButton = document.createElement("button");
      pauseButton.type = "button";
      pauseButton.className = "button button--secondary task-list__action";
      pauseButton.textContent = t("taskPauseButton");
      pauseButton.addEventListener("click", (event) => {
        event.stopPropagation();
        openTaskActionDialog("pause", task);
      });
      actions.append(pauseButton);
    }

    const archiveButton = document.createElement("button");
    archiveButton.type = "button";
    archiveButton.className = "button button--secondary task-list__action";
    archiveButton.textContent = t("taskArchiveButton");
    archiveButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openTaskActionDialog("archive", task);
    });
    actions.append(archiveButton);
  }

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "button task-list__action task-list__action--danger";
  deleteButton.textContent = t("taskDeleteButton");
  deleteButton.disabled = !deleteAllowed;
  deleteButton.title = !deleteAllowed ? t("taskDeleteRequiresPauseHint") : "";
  deleteButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (deleteAllowed) {
      openTaskActionDialog("delete", task);
    }
  });
  actions.append(deleteButton);

  if (paused) {
    actions.dataset.state = "paused";
  }

  return actions;
}

function toggleTaskPageCardExpanded(taskId) {
  if (state.expandedTaskCards.has(taskId)) {
    state.expandedTaskCards.delete(taskId);
  } else {
    state.expandedTaskCards.add(taskId);
  }

  renderTaskPageList();
}

async function onUnarchiveTask(taskId) {
  try {
    await fetchJson(`/api/tasks/${encodeURIComponent(taskId)}/unarchive`, {
      method: "POST",
    });

    if (state.selectedProjectId) {
      await loadProjectTasks(state.selectedProjectId, { preserveSelection: true, selectedTaskId: taskId });
    }
  } catch (error) {
    showFeedback(elements.taskListFeedback, "error", buildTaskErrorMessage(error));
    showFeedback(elements.taskPageFeedback, "error", buildTaskErrorMessage(error));
  }
}

function resolveTaskFromState(taskId) {
  if (!taskId) {
    return null;
  }

  if (state.taskDetail?.task?.id === taskId) {
    return state.taskDetail.task;
  }

  return state.tasks.find((task) => task.id === taskId) ?? null;
}

function pickDefaultTaskId(tasks) {
  const activeTask = (tasks ?? []).find((task) => !task.archivedAt);
  return activeTask?.id ?? tasks?.[0]?.id ?? null;
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
  elements.taskDetailTitle.setAttribute("title", detail.task.title ?? "");
  elements.taskDetailDescription.textContent = detail.task.description;
  elements.taskDetailDescription.setAttribute("title", detail.task.description ?? "");
  renderWorkspaceOverview(detail, latestSession);
  elements.taskStatusBadge.textContent = buildTaskDisplayStatusLabel(detail.task);
  elements.taskStatusBadge.className = `badge ${buildTaskStatusBadgeClass(detail.task)}`;
  elements.taskBaseBranchBadge.textContent = detail.task.baseBranch;
  elements.taskLeadAgent.textContent = detail.task.leadAgentType;
  elements.taskBaseCommit.textContent = detail.task.baseCommitSha;
  elements.taskSessionStatus.textContent = latestSession
    ? `${translateSessionType(latestSession.sessionType)} · ${translateStatusLabel(latestSession.status)}`
    : t("latestSessionNone");
  elements.taskMessageCount.textContent = String(detail.messages?.length ?? 0);
  elements.taskPlanVersion.textContent = String(detail.task.planVersion ?? 0);
  elements.taskPlanSnapshotCount.textContent = String(detail.planSnapshots?.length ?? 0);

  renderTaskStageBoard(detail);
  renderLeaderConversation(detail);
  renderTaskDocumentPreview(detail);
  renderLeaderPlanPreview(detail);
  renderTaskWorkspaceHub(detail);
  renderTaskPreview(detail);
  syncEditablePlanDraft(detail);
  renderDashboardTeamOverview(detail);
  renderCleanupWarnings(detail.cleanupWarnings ?? []);
  renderTeamView(detail);
  renderTaskAttachments(detail.attachments ?? []);
  renderPlanDraft(detail);
  renderSubTaskExecution(detail);
  renderTaskIntegration(detail);
  renderTranscript(detail.messages ?? []);

  renderTaskMessageComposer(detail);
  renderWorkspaceTaskActions(detail.task);
  if (state.focusWorkspaceStageOnNextRender) {
    window.requestAnimationFrame(() => {
      focusActiveWorkspaceStageCard();
    });
  }
  const canConfirmRequirements = detail.task.status === "CLARIFYING";

  elements.startClarificationButton.hidden = true;
  elements.confirmRequirementsButton.hidden = !canConfirmRequirements;
  elements.confirmRequirementsButton.disabled = Boolean(state.taskMessageInFlight || state.taskMessageQueue.length > 0);
  if (elements.taskActions) {
    elements.taskActions.hidden = true;
  }
  elements.taskMessageForm.hidden = false;
}

function renderWorkspaceOverview(detail, latestSession) {
  const projectName = state.projectDetail?.project?.name
    ?? state.projects.find((project) => project.id === detail?.task?.projectId)?.name
    ?? t("unknown");
  const leadAgent = detail?.task?.leadAgentType ?? t("unknownAgent");
  const sessionLabel = latestSession
    ? `${translateSessionType(latestSession.sessionType)} · ${translateStatusLabel(latestSession.status)}`
    : t("latestSessionNone");
  const pills = [
    [elements.taskProjectPill, `${t("workspaceOverviewProjectLabel")} · ${projectName}`],
    [elements.taskLeadPill, `${t("workspaceOverviewLeadLabel")} · ${leadAgent}`],
    [elements.taskSessionPill, `${t("workspaceOverviewSessionLabel")} · ${sessionLabel}`],
  ];

  for (const [element, text] of pills) {
    if (!element) {
      continue;
    }

    element.textContent = text;
    element.setAttribute("title", text);
  }
}

function renderWorkspaceTaskActions(task) {
  if (!elements.taskWorkspaceActions || !elements.taskWorkspacePauseButton || !elements.taskWorkspaceDeleteButton) {
    return;
  }

  const showActions = Boolean(task) && !task.archivedAt;
  const deleteAllowed = canDeleteTask(task);

  elements.taskWorkspaceActions.hidden = !showActions;
  elements.taskWorkspacePauseButton.hidden = !canPauseTask(task);
  elements.taskWorkspacePauseButton.disabled = !canPauseTask(task);
  elements.taskWorkspacePauseButton.textContent = t("taskPauseButton");
  elements.taskWorkspaceDeleteButton.disabled = !deleteAllowed;
  elements.taskWorkspaceDeleteButton.title = !deleteAllowed ? t("taskDeleteRequiresPauseHint") : "";
  elements.taskWorkspaceDeleteButton.textContent = t("taskDeleteButton");
}

function renderTaskWorkspaceHub(detail) {
  const parsedPlan = parseCurrentPlanJson(detail.task.currentPlanJson);
  const planNodeCount = getPlanNodes(parsedPlan).length;
  const subTasks = detail.subTasks ?? [];
  const board = detail.board ?? null;
  const latestIntegrationRun = detail.integration?.latestRun ?? null;
  const previewSession = state.taskPreview?.session ?? null;
  const activeStage = buildWorkspaceHubActiveStage(detail, state.taskPreview);

  if (elements.taskHubPlanBadge) {
    elements.taskHubPlanBadge.textContent = buildTaskDisplayStatusLabel(detail.task);
    elements.taskHubPlanBadge.className = `badge ${buildTaskStatusBadgeClass(detail.task)}`;
  }
  if (elements.taskHubPlanTitle) {
    elements.taskHubPlanTitle.textContent = detail.task.status === "PLAN_REVIEW"
      ? t("workspaceHubPlanTitleReview")
      : detail.task.status === "PLANNING"
        ? t("workspaceHubPlanTitlePlanning")
        : planNodeCount > 0
          ? t("workspaceHubPlanTitleReady")
          : t("workspaceHubPlanTitleIdle");
  }
  if (elements.taskHubPlanSummary) {
    elements.taskHubPlanSummary.textContent = detail.task.status === "PLAN_REVIEW"
      ? t("workspaceHubPlanSummaryReview")
      : detail.task.status === "PLANNING"
        ? t("workspaceHubPlanSummaryPlanning")
        : planNodeCount > 0
          ? t("workspaceHubPlanSummaryReady")
          : t("workspaceHubPlanSummaryIdle");
  }
  if (elements.taskHubPlanCount) {
    elements.taskHubPlanCount.textContent = t("workspaceHubPlanCount", { count: planNodeCount });
  }

  if (elements.taskHubDeliveryBadge) {
    const tone = detail.task.status === "ACTION_REQUIRED"
      ? "badge--dirty"
      : latestIntegrationRun?.status === "COMPLETED" || detail.task.status === "COMPLETED"
        ? "badge--clean"
        : subTasks.length > 0
          ? "badge--accent-soft"
          : "badge--outline";
    elements.taskHubDeliveryBadge.textContent = latestIntegrationRun
      ? buildIntegrationRunStatusLabel(latestIntegrationRun.status)
      : buildTaskDisplayStatusLabel(detail.task);
    elements.taskHubDeliveryBadge.className = `badge ${tone}`;
  }
  if (elements.taskHubDeliveryTitle) {
    elements.taskHubDeliveryTitle.textContent = detail.task.status === "COMPLETED"
      ? t("workspaceHubDeliveryTitleCompleted")
      : subTasks.length > 0
        ? t("workspaceHubDeliveryTitleActive")
        : t("workspaceHubDeliveryTitleIdle");
  }
  if (elements.taskHubDeliverySummary) {
    const waiting = board?.workflow?.waiting ?? 0;
    const running = board?.summary?.running ?? 0;
    const manualAttention = board?.workflow?.manualAttentionCount ?? 0;
    elements.taskHubDeliverySummary.textContent = subTasks.length === 0
      ? t("workspaceHubDeliverySummaryIdle")
      : manualAttention > 0
        ? t("workspaceHubDeliverySummaryAttention", { count: manualAttention })
        : t("workspaceHubDeliverySummaryActive", {
            running,
            waiting,
            completed: board?.workflow?.completed ?? 0,
            total: board?.workflow?.total ?? subTasks.length,
          });
  }
  if (elements.taskHubDeliveryCount) {
    elements.taskHubDeliveryCount.textContent = t("workspaceHubDeliveryCount", { count: subTasks.length });
  }

  if (elements.taskHubPreviewBadge) {
    elements.taskHubPreviewBadge.textContent = buildPreviewSessionStatusLabel(previewSession?.status);
    elements.taskHubPreviewBadge.className = `badge ${buildPreviewSessionBadgeClass(previewSession?.status)}`;
  }
  if (elements.taskHubPreviewTitle) {
    elements.taskHubPreviewTitle.textContent = previewSession?.status === "RUNNING"
      ? t("workspaceHubPreviewTitleRunning")
      : previewSession?.status === "STARTING"
        ? t("workspaceHubPreviewTitleStarting")
        : t("workspaceHubPreviewTitleIdle");
  }
  if (elements.taskHubPreviewSummary) {
    elements.taskHubPreviewSummary.textContent = previewSession?.status === "RUNNING"
      ? (previewSession.note || t("workspaceHubPreviewSummaryRunning"))
      : previewSession?.status === "STARTING"
        ? t("workspaceHubPreviewSummaryStarting")
        : t("workspaceHubPreviewSummaryIdle");
  }
  if (elements.taskHubPreviewTarget) {
    elements.taskHubPreviewTarget.textContent = `${t("workspaceHubPreviewTargetLabel")} · ${previewSession?.targetLabel ?? state.taskPreview?.recommendation?.label ?? t("workspaceHubPreviewTargetFallback")}`;
  }

  toggleWorkspaceHubStageCard(elements.taskHubPlanCard, activeStage === "plan");
  toggleWorkspaceHubStageCard(elements.taskHubDeliveryCard, activeStage === "delivery");
  toggleWorkspaceHubStageCard(elements.taskHubPreviewCard, activeStage === "preview");
}

function buildWorkspaceHubActiveStage(detail, preview) {
  const taskStatus = detail?.task?.status ?? "DRAFT";
  const acceptanceModel = buildTaskAcceptanceModel(detail, preview);

  if (
    acceptanceModel.previewRunning
    || acceptanceModel.acceptanceReady
    || ["COMPLETED", "FAILED", "CANCELLED"].includes(taskStatus)
  ) {
    return "preview";
  }

  if (["DRAFT", "CLARIFYING", "PLANNING", "PLAN_REVIEW"].includes(taskStatus)) {
    return "plan";
  }

  return "delivery";
}

function toggleWorkspaceHubStageCard(element, isCurrent) {
  if (!element) {
    return;
  }

  element.classList.toggle("is-current", isCurrent);
  element.setAttribute("aria-current", isCurrent ? "step" : "false");
}

function resolveActiveWorkspaceStageCard() {
  const detail = state.taskDetail;

  if (!detail?.task) {
    return null;
  }

  const activeStage = buildWorkspaceHubActiveStage(detail, state.taskPreview);

  if (activeStage === "plan") {
    return elements.taskHubPlanCard;
  }

  if (activeStage === "preview") {
    return elements.taskHubPreviewCard;
  }

  return elements.taskHubDeliveryCard;
}

function focusActiveWorkspaceStageCard() {
  if (state.currentView !== "workspace") {
    return;
  }

  const card = resolveActiveWorkspaceStageCard();

  if (!card) {
    return;
  }

  card.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
  state.focusWorkspaceStageOnNextRender = false;
}

function resetTaskPreviewUi() {
  clearFeedback(elements.taskPreviewFeedback);
  if (elements.taskPreviewTargetSelect) {
    syncSelectOptions(elements.taskPreviewTargetSelect, [], "");
  }
  if (elements.taskPreviewAppRootSelect) {
    syncSelectOptions(elements.taskPreviewAppRootSelect, [], "");
  }
  if (elements.taskPreviewCommandInput) {
    elements.taskPreviewCommandInput.value = "";
  }
  if (elements.taskPreviewPortInput) {
    elements.taskPreviewPortInput.value = "4173";
  }
  if (elements.taskPreviewPathInput) {
    elements.taskPreviewPathInput.value = "/";
  }
  if (elements.taskPreviewDetected) {
    elements.taskPreviewDetected.textContent = t("previewDetectedEmpty");
  }
  if (elements.taskPreviewStatusBadge) {
    elements.taskPreviewStatusBadge.textContent = t("previewStatusIdle");
    elements.taskPreviewStatusBadge.className = "badge badge--outline";
  }
  if (elements.taskPreviewSummary) {
    elements.taskPreviewSummary.textContent = t("previewStudioSummary");
  }
  if (elements.taskPreviewTargetBadge) {
    elements.taskPreviewTargetBadge.textContent = `${t("previewTargetBadgeLabel")} · -`;
  }
  if (elements.taskPreviewAppBadge) {
    elements.taskPreviewAppBadge.textContent = `${t("previewAppBadgeLabel")} · -`;
  }
  if (elements.taskPreviewUrlBadge) {
    elements.taskPreviewUrlBadge.textContent = `${t("previewUrlBadgeLabel")} · -`;
  }
  if (elements.taskPreviewOpenLink) {
    elements.taskPreviewOpenLink.hidden = true;
    elements.taskPreviewOpenLink.href = "#";
  }
  if (elements.taskPreviewLogStatus) {
    elements.taskPreviewLogStatus.textContent = t("previewLogsIdle");
    elements.taskPreviewLogStatus.className = "badge badge--outline";
  }
  if (elements.taskPreviewLog) {
    elements.taskPreviewLog.textContent = t("previewLogsEmpty");
  }
  if (elements.taskPreviewFrame) {
    elements.taskPreviewFrame.hidden = true;
    elements.taskPreviewFrame.removeAttribute("src");
  }
  if (elements.taskPreviewEmpty) {
    elements.taskPreviewEmpty.hidden = false;
  }
  if (elements.taskPreviewReadinessBadge) {
    elements.taskPreviewReadinessBadge.textContent = "0/0";
    elements.taskPreviewReadinessBadge.className = "badge badge--outline";
  }
  if (elements.taskPreviewReadinessSummary) {
    elements.taskPreviewReadinessSummary.textContent = t("previewReadinessSummary");
  }
  if (elements.taskPreviewReadinessList) {
    elements.taskPreviewReadinessList.replaceChildren();
  }
  if (elements.taskPreviewRestartButton) {
    elements.taskPreviewRestartButton.hidden = true;
  }
  if (elements.taskPreviewStopButton) {
    elements.taskPreviewStopButton.hidden = true;
  }
}

function renderTaskPreview(detail) {
  const preview = state.taskPreview;
  const session = preview?.session ?? null;
  const targets = Array.isArray(preview?.targets) ? preview.targets : [];
  const appRoots = Array.isArray(preview?.appRoots) ? preview.appRoots : [];
  const defaults = preview?.defaults ?? {};
  const selectedTarget = elements.taskPreviewTargetSelect?.value || defaults.targetId || defaults.targetType || "";
  const selectedAppRoot = elements.taskPreviewAppRootSelect?.value || defaults.appRoot || "";

  clearFeedback(elements.taskPreviewFeedback);
  syncSelectOptions(
    elements.taskPreviewTargetSelect,
    targets.map((target) => target.id || target.type || ""),
    selectedTarget,
  );
  updateSelectOptionLabels(elements.taskPreviewTargetSelect, targets, (target) => target.label ?? target.branchName ?? target.type ?? "-");

  syncSelectOptions(
    elements.taskPreviewAppRootSelect,
    appRoots.map((root) => root.path ?? ""),
    selectedAppRoot,
  );
  updateSelectOptionLabels(elements.taskPreviewAppRootSelect, appRoots, (root) => root.label ?? root.path ?? "-");

  const activeTarget = targets.find((target) => (target.id || target.type || "") === (elements.taskPreviewTargetSelect?.value || selectedTarget)) ?? null;
  const activeAppRoot = appRoots.find((root) => (root.path ?? "") === (elements.taskPreviewAppRootSelect?.value || selectedAppRoot)) ?? null;
  const suggestedCommand = activeAppRoot?.command ?? defaults.command ?? "";
  const suggestedPath = defaults.path ?? "/";
  const suggestedPort = defaults.port ?? 4173;

  if (elements.taskPreviewCommandInput && (!elements.taskPreviewCommandInput.value || elements.taskPreviewCommandInput.dataset.autoFilled === "true")) {
    elements.taskPreviewCommandInput.value = session?.command ?? suggestedCommand;
    elements.taskPreviewCommandInput.dataset.autoFilled = "true";
  }
  if (elements.taskPreviewPortInput && (!elements.taskPreviewPortInput.value || elements.taskPreviewPortInput.dataset.autoFilled === "true")) {
    elements.taskPreviewPortInput.value = String(session?.port ?? suggestedPort);
    elements.taskPreviewPortInput.dataset.autoFilled = "true";
  }
  if (elements.taskPreviewPathInput && (!elements.taskPreviewPathInput.value || elements.taskPreviewPathInput.dataset.autoFilled === "true")) {
    elements.taskPreviewPathInput.value = defaults.path ?? suggestedPath;
    elements.taskPreviewPathInput.dataset.autoFilled = "true";
  }

  if (elements.taskPreviewDetected) {
    elements.taskPreviewDetected.textContent = activeAppRoot
      ? t("previewDetectedSummary", {
          framework: activeAppRoot.framework ?? t("unknown"),
          path: activeAppRoot.path ?? ".",
          packageManager: activeAppRoot.packageManager ?? t("unknown"),
        })
      : t("previewDetectedEmpty");
  }

  if (elements.taskPreviewStatusBadge) {
    elements.taskPreviewStatusBadge.textContent = buildPreviewSessionStatusLabel(session?.status);
    elements.taskPreviewStatusBadge.className = `badge ${buildPreviewSessionBadgeClass(session?.status)}`;
  }
  if (elements.taskPreviewSummary) {
    elements.taskPreviewSummary.textContent = session?.note
      ?? activeTarget?.description
      ?? t("previewStudioSummary");
  }
  if (elements.taskPreviewTargetBadge) {
    elements.taskPreviewTargetBadge.textContent = `${t("previewTargetBadgeLabel")} · ${session?.targetLabel ?? activeTarget?.label ?? t("workspaceHubPreviewTargetFallback")}`;
  }
  if (elements.taskPreviewAppBadge) {
    elements.taskPreviewAppBadge.textContent = `${t("previewAppBadgeLabel")} · ${session?.appRoot ?? activeAppRoot?.path ?? "-"}`;
  }
  if (elements.taskPreviewUrlBadge) {
    elements.taskPreviewUrlBadge.textContent = `${t("previewUrlBadgeLabel")} · ${session?.url ?? "-"}`;
  }
  if (elements.taskPreviewOpenLink) {
    elements.taskPreviewOpenLink.hidden = !session?.url;
    elements.taskPreviewOpenLink.href = session?.url ?? "#";
  }
  if (elements.taskPreviewLogStatus) {
    elements.taskPreviewLogStatus.textContent = buildPreviewSessionStatusLabel(session?.status);
    elements.taskPreviewLogStatus.className = `badge ${buildPreviewSessionBadgeClass(session?.status)}`;
  }
  if (elements.taskPreviewLog) {
    elements.taskPreviewLog.textContent = session?.logs || t("previewLogsEmpty");
  }
  if (elements.taskPreviewFrame) {
    if (session?.url && session.status === "RUNNING") {
      elements.taskPreviewFrame.hidden = false;
      elements.taskPreviewFrame.src = session.url;
    } else {
      elements.taskPreviewFrame.hidden = true;
      elements.taskPreviewFrame.removeAttribute("src");
    }
  }
  if (elements.taskPreviewEmpty) {
    elements.taskPreviewEmpty.hidden = Boolean(session?.url && session.status === "RUNNING");
    if (!session?.url || session.status !== "RUNNING") {
      elements.taskPreviewEmpty.textContent = session?.status === "FAILED"
        ? t("previewEmptyFailed")
        : t("previewEmpty");
    }
  }
  if (elements.taskPreviewRestartButton) {
    elements.taskPreviewRestartButton.hidden = !session;
  }
  if (elements.taskPreviewStopButton) {
    elements.taskPreviewStopButton.hidden = !session;
  }
  if (elements.taskPreviewStartButton) {
    elements.taskPreviewStartButton.disabled = !normalizeOptionalText(elements.taskPreviewCommandInput?.value)
      && !suggestedCommand
      && !session?.command;
  }
  if (elements.taskPreviewRestartButton) {
    elements.taskPreviewRestartButton.disabled = !session;
  }
  if (elements.taskPreviewStopButton) {
    elements.taskPreviewStopButton.disabled = !session;
  }

  renderTaskPreviewReadiness(detail);
}

function renderTaskPreviewReadiness(detail) {
  if (
    !elements.taskPreviewReadinessList
    || !elements.taskPreviewReadinessSummary
    || !elements.taskPreviewReadinessBadge
    || !elements.taskPreviewReadinessBlocker
  ) {
    return;
  }

  const acceptanceModel = buildTaskAcceptanceModel(detail, state.taskPreview);
  const doneCount = acceptanceModel.doneCount;
  const items = acceptanceModel.items;

  elements.taskPreviewReadinessBadge.textContent = t("previewReadinessProgress", {
    done: doneCount,
    total: items.length,
  });
  elements.taskPreviewReadinessBadge.className = `badge ${doneCount === items.length ? "badge--clean" : doneCount >= 3 ? "badge--accent-soft" : "badge--outline"}`;
  elements.taskPreviewReadinessBlocker.textContent = acceptanceModel.previewRunning
    ? t("previewReadinessBlockedReady", { label: t("taskDecisionTitleLive") })
    : acceptanceModel.acceptanceReady
      ? t("previewReadinessBlockedReady", { label: t("taskDecisionTitleReady") })
      : acceptanceModel.firstBlockingItem
        ? t("previewReadinessBlockedBy", { label: acceptanceModel.firstBlockingItem.label })
        : t("previewReadinessBlockedWaiting");
  elements.taskPreviewReadinessSummary.textContent = acceptanceModel.previewRunning || acceptanceModel.acceptanceReady
    ? t("previewReadinessReady")
    : acceptanceModel.firstBlockingItem?.hint ?? t("previewReadinessPending", { count: items.length - doneCount });

  elements.taskPreviewReadinessList.replaceChildren(...items.map((item) => {
    const card = document.createElement("article");
    card.className = `preview-readiness-item${item.done ? " is-done" : ""}`;
    card.innerHTML = `
      <div class="preview-readiness-item__header">
        <span class="preview-readiness-item__dot" aria-hidden="true"></span>
        <div class="preview-readiness-item__copy">
          <p class="preview-readiness-item__label">${escapeHtml(item.label)}</p>
          <p class="preview-readiness-item__hint">${escapeHtml(item.hint)}</p>
        </div>
        <span class="badge ${item.done ? "badge--clean" : "badge--outline"}">${escapeHtml(item.done ? t("automationStateDone") : t("automationStateWaiting"))}</span>
      </div>
    `;
    return card;
  }));
}

function buildTaskAcceptanceModel(detail, preview) {
  const previewModel = preview ?? null;
  const previewTargets = Array.isArray(previewModel?.targets) ? previewModel.targets : [];
  const appRoots = Array.isArray(previewModel?.appRoots) ? previewModel.appRoots : [];
  const previewSession = previewModel?.session ?? null;
  const workflow = detail?.board?.workflow ?? { manualAttentionCount: 0, systemAttentionCount: 0 };
  const latestIntegrationRun = detail?.integration?.latestRun ?? null;
  const subTasks = detail?.subTasks ?? [];
  const reviewSettled = subTasks.length > 0 && subTasks.every((subTask) => !["BLOCKED", "PENDING", "READY", "REVIEW_PENDING", "RUNNING"].includes(subTask.status));
  const mergeTracked = Boolean(latestIntegrationRun) || ["MERGING", "COMPLETED"].includes(detail?.task?.status);
  const previewRunning = previewSession?.status === "RUNNING";
  const items = [
    {
      done: previewTargets.length > 0,
      hint: previewTargets.length > 0
        ? t("previewReadinessHintTargetsReady", {
            label: previewModel?.recommendation?.label ?? previewTargets[0]?.label ?? t("workspaceHubPreviewTargetFallback"),
          })
        : t("previewReadinessHintTargets"),
      key: "targets",
      label: t("previewReadinessItemTargets"),
    },
    {
      done: appRoots.length > 0,
      hint: appRoots.length > 0
        ? t("previewReadinessHintAppRootsReady", {
            label: appRoots[0]?.label ?? appRoots[0]?.path ?? ".",
          })
        : t("previewReadinessHintAppRoots"),
      key: "appRoots",
      label: t("previewReadinessItemAppRoots"),
    },
    {
      done: (workflow.manualAttentionCount ?? 0) === 0,
      hint: (workflow.manualAttentionCount ?? 0) === 0
        ? t("previewReadinessHintManualReady")
        : t("previewReadinessHintManual"),
      key: "manual",
      label: t("previewReadinessItemManual"),
    },
    {
      done: reviewSettled,
      hint: reviewSettled ? t("previewReadinessHintReviewReady") : t("previewReadinessHintReview"),
      key: "review",
      label: t("previewReadinessItemReview"),
    },
    {
      done: mergeTracked,
      hint: mergeTracked
        ? t("previewReadinessHintMergeReady", {
            status: latestIntegrationRun ? buildIntegrationRunStatusLabel(latestIntegrationRun.status) : buildTaskDisplayStatusLabel(detail?.task),
          })
        : t("previewReadinessHintMerge"),
      key: "merge",
      label: t("previewReadinessItemMerge"),
    },
    {
      done: previewRunning,
      hint: previewRunning
        ? t("previewReadinessHintRunningReady", {
            status: buildPreviewSessionStatusLabel(previewSession.status),
          })
        : t("previewReadinessHintRunning"),
      key: "running",
      label: t("previewReadinessItemRunning"),
    },
  ];
  const doneCount = items.filter((item) => item.done).length;
  const acceptanceReady = (workflow.manualAttentionCount ?? 0) === 0
    && reviewSettled
    && previewTargets.length > 0
    && appRoots.length > 0;
  const firstBlockingItem = items.find((item) => !item.done && item.key !== "running")
    ?? items.find((item) => !item.done)
    ?? null;

  return {
    acceptanceReady,
    appRoots,
    doneCount,
    firstBlockingItem,
    items,
    mergeTracked,
    previewRunning,
    previewSession,
    previewTargets,
    reviewSettled,
    workflow,
  };
}

function buildTaskDecisionModel(detail, preview) {
  const acceptanceModel = buildTaskAcceptanceModel(detail, preview);
  const manualAttentionCount = acceptanceModel.workflow.manualAttentionCount ?? 0;
  const systemAttentionCount = acceptanceModel.workflow.systemAttentionCount ?? 0;
  let title = t("taskDecisionTitleIdle");
  let summary = t("taskDecisionSummaryIdle");
  let badgeLabel = t("taskDecisionBadgeIdle");
  let badgeClass = "badge--outline";

  if (acceptanceModel.previewRunning) {
    title = t("taskDecisionTitleLive");
    summary = t("taskDecisionSummaryLive");
    badgeLabel = t("taskDecisionBadgeLive");
    badgeClass = "badge--clean";
  } else if (manualAttentionCount > 0) {
    title = t("taskDecisionTitleBlocked");
    summary = t("taskDecisionSummaryBlocked", { count: manualAttentionCount });
    badgeLabel = t("taskDecisionBadgeBlocked");
    badgeClass = "badge--dirty";
  } else if (acceptanceModel.acceptanceReady) {
    title = t("taskDecisionTitleReady");
    summary = t("taskDecisionSummaryReady");
    badgeLabel = t("taskDecisionBadgeReady");
    badgeClass = "badge--clean";
  } else if (detail?.task?.status && detail.task.status !== "DRAFT") {
    title = t("taskDecisionTitleConverging");
    summary = t("taskDecisionSummaryConverging");
    badgeLabel = t("taskDecisionBadgeConverging");
    badgeClass = "badge--accent-soft";
  }

  return {
    ...acceptanceModel,
    badgeClass,
    badgeLabel,
    pills: [
      t("taskDecisionPillManual", { count: manualAttentionCount }),
      t("taskDecisionPillSystem", { count: systemAttentionCount }),
      t("taskDecisionPillPreview", {
        status: acceptanceModel.previewTargets.length > 0 ? t("automationStateDone") : t("automationStateWaiting"),
      }),
      t("taskDecisionPillReview", {
        status: acceptanceModel.reviewSettled ? t("automationStateDone") : t("automationStateWaiting"),
      }),
      t("taskDecisionPillRuntime", {
        status: acceptanceModel.previewRunning
          ? t("automationStateActive")
          : acceptanceModel.acceptanceReady
            ? t("automationStateReady")
            : t("automationStateWaiting"),
      }),
    ],
    summary,
    title,
  };
}

function renderTaskDecisionCard(detail) {
  if (!elements.taskDecisionTitle || !elements.taskDecisionSummary || !elements.taskDecisionBadge || !elements.taskDecisionPillList) {
    return;
  }

  const decisionModel = buildTaskDecisionModel(detail, state.taskPreview);
  elements.taskDecisionTitle.textContent = decisionModel.title;
  elements.taskDecisionSummary.textContent = decisionModel.summary;
  elements.taskDecisionBadge.textContent = decisionModel.badgeLabel;
  elements.taskDecisionBadge.className = `badge ${decisionModel.badgeClass}`;
  elements.taskDecisionPillList.replaceChildren(...decisionModel.pills.map((pill) => {
    const item = document.createElement("span");
    item.className = "workspace-meta-pill workspace-meta-pill--soft";
    item.textContent = pill;
    return item;
  }));
}

function updateSelectOptionLabels(select, entries, buildLabel) {
  if (!select) {
    return;
  }

  [...select.options].forEach((option) => {
    const entry = entries.find((item) => String(item.id ?? item.type ?? item.path ?? "") === option.value);
    if (entry) {
      option.textContent = buildLabel(entry);
    }
  });
}

function buildPreviewSessionStatusLabel(status) {
  switch (status) {
    case "FAILED":
      return t("previewStatusFailed");
    case "RUNNING":
      return t("previewStatusRunning");
    case "STARTING":
      return t("previewStatusStarting");
    case "STOPPED":
      return t("previewStatusStopped");
    default:
      return t("previewStatusIdle");
  }
}

function buildPreviewSessionBadgeClass(status) {
  switch (status) {
    case "FAILED":
      return "badge--dirty";
    case "RUNNING":
      return "badge--clean";
    case "STARTING":
      return "badge--accent-soft";
    case "STOPPED":
      return "badge--outline";
    default:
      return "badge--outline";
  }
}

function focusTaskPreviewStudio() {
  switchView("workspace");
  elements.taskPreviewStudio?.scrollIntoView({ behavior: "smooth", block: "start" });
  elements.taskPreviewTargetSelect?.focus();
}

function focusTaskPlanPreview() {
  switchView("workspace");

  const detail = state.taskDetail;
  const parsedPlan = parseCurrentPlanJson(detail?.task?.currentPlanJson);
  const nodes = getPlanNodes(parsedPlan);

  if (detail && nodes.length > 0) {
    openLeaderPlanDetailDialog(0, nodes[0]);
    return;
  }

  elements.taskLeaderPlanTitle?.scrollIntoView({ behavior: "smooth", block: "start" });
  elements.taskLeaderPlanList?.querySelector("button")?.focus();
}

function focusTaskDeliveryOverview() {
  switchView("workspace");
  document.querySelector("#task-team-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
  elements.taskTeamMemberList?.querySelector("button, [tabindex], a")?.focus();
}

function renderLeaderConversation(detail) {
  const leadSession = (detail.sessions ?? []).filter((session) => session.sessionType === "LEAD").at(-1) ?? null;
  const taskStatus = detail.task.status;
  const liveOutput = leadSession
    ? stripAnsi(state.liveSessionOutputs.get(leadSession.id) ?? leadSession.outputBuffer ?? "")
    : "";
  const summaryKey = isPausedTask(detail.task)
    ? "leaderConversationPausedSummary"
    : taskStatus === "DRAFT"
    ? "leaderConversationDraftSummary"
    : taskStatus === "CLARIFYING"
      ? "leaderConversationClarifyingSummary"
      : taskStatus === "PLANNING"
        ? "leaderConversationPlanningSummary"
        : taskStatus === "PLAN_REVIEW"
          ? "leaderConversationPlanReadySummary"
          : "leaderConversationExecutionSummary";

  if (elements.taskLeadSessionSummary) {
    elements.taskLeadSessionSummary.textContent = t(summaryKey);
  }

  if (elements.taskLeadSessionBadge) {
    elements.taskLeadSessionBadge.textContent = leadSession
      ? `${translateStatusLabel(leadSession.status)}${leadSession.id ? ` · ${t("sessionIdLabel", { id: leadSession.id })}` : ""}`
      : t("leadSessionNotStarted");
    elements.taskLeadSessionBadge.className = `badge ${leadSession?.status === "RUNNING" ? "badge--accent-soft" : leadSession?.status === "FAILED" ? "badge--dirty" : "badge--outline"}`;
  }

  if (elements.taskLeadSessionOutput) {
    renderLeaderConversationHistory(detail.messages ?? [], liveOutput, leadSession);
  }

  renderTaskMessageQueueList();
}

function renderLeaderPlanPreview(detail) {
  if (!elements.taskLeaderPlanList || !elements.taskLeaderPlanEmpty || !elements.taskLeaderPlanSummary || !elements.taskLeaderPlanBadge) {
    return;
  }

  const nodes = buildLeaderPlanNodes(detail);
  renderExecutionPlanPreview(detail, nodes);
}

function renderTaskDocumentPreview(detail) {
  if (!elements.taskDocumentList || !elements.taskDocumentEmpty || !elements.taskDocumentSummary || !elements.taskDocumentBadge) {
    return;
  }

  const sections = buildTaskDocumentSections(detail);
  const taskStatus = detail.task.status;
  const isConfirmedDocument = !["DRAFT", "CLARIFYING"].includes(taskStatus);
  const shouldShowLoading = sections.length === 0 && ["CLARIFYING", "PLANNING"].includes(taskStatus);

  if (elements.taskDocumentEyebrow) {
    elements.taskDocumentEyebrow.textContent = t("taskDocEyebrow");
  }
  if (elements.taskDocumentTitle) {
    elements.taskDocumentTitle.textContent = t("taskDocTitle");
  }
  if (elements.taskDocumentLoadingLabel) {
    elements.taskDocumentLoadingLabel.textContent = t("taskDocLoadingLabel");
  }

  elements.taskDocumentList.replaceChildren();
  if (elements.taskDocumentLoading) {
    elements.taskDocumentLoading.hidden = !shouldShowLoading;
  }
  elements.taskDocumentEmpty.hidden = sections.length > 0 || shouldShowLoading;
  elements.taskDocumentEmpty.textContent = t("taskDocEmpty");
  elements.taskDocumentSummary.textContent = taskStatus === "CLARIFYING"
    ? t("taskDocSummaryClarifying")
    : isConfirmedDocument
      ? t("taskDocSummaryConfirmed")
      : t("taskDocSummaryDraft");
  if (elements.taskDocumentCount) {
    elements.taskDocumentCount.textContent = t("workspacePreviewCountDocument", { count: sections.length });
  }
  if (elements.taskDocumentGuide) {
    elements.taskDocumentGuide.textContent = isConfirmedDocument
      ? t("workspacePreviewGuideTaskDocConfirmed")
      : t("workspacePreviewGuideTaskDoc");
  }
  elements.taskDocumentBadge.textContent = taskStatus === "CLARIFYING"
    ? t("taskDocBadgeReady")
    : isConfirmedDocument
      ? t("taskDocBadgeConfirmed")
      : t("taskDocBadgeDraft");
  elements.taskDocumentBadge.className = `badge ${taskStatus === "CLARIFYING" ? "badge--accent-soft" : isConfirmedDocument ? "badge--clean" : "badge--outline"}`;

  for (const section of sections) {
    const item = document.createElement("article");
    item.className = "task-doc-card";
    item.innerHTML = `
      <p class="task-doc-card__label">${escapeHtml(section.label)}</p>
      <p class="task-doc-card__body">${escapeHtml(section.body).replaceAll("\n", "<br>")}</p>
    `;
    elements.taskDocumentList.append(item);
  }
}

function renderExecutionPlanPreview(detail, nodes = buildLeaderPlanNodes(detail)) {
  const taskStatus = detail.task.status;
  const awaitingTaskDocument = ["DRAFT", "CLARIFYING"].includes(taskStatus);
  const shouldShowLoading = nodes.length === 0 && !awaitingTaskDocument && taskStatus === "PLANNING";

  if (elements.taskLeaderPlanEyebrow) {
    elements.taskLeaderPlanEyebrow.textContent = t("executionPlanEyebrow");
  }
  if (elements.taskLeaderPlanTitle) {
    elements.taskLeaderPlanTitle.textContent = t("executionPlanTitle");
  }
  if (elements.taskLeaderPlanLoadingLabel) {
    elements.taskLeaderPlanLoadingLabel.textContent = t("executionPlanLoadingLabel");
  }

  elements.taskLeaderPlanList.replaceChildren();
  if (elements.taskLeaderPlanLoading) {
    elements.taskLeaderPlanLoading.hidden = !shouldShowLoading;
  }
  elements.taskLeaderPlanEmpty.hidden = nodes.length > 0 || shouldShowLoading;
  elements.taskLeaderPlanEmpty.textContent = awaitingTaskDocument ? t("planEmpty") : t("executionPlanEmpty");
  elements.taskLeaderPlanSummary.textContent = nodes.length > 0
    ? t("executionPlanSummaryReady")
    : awaitingTaskDocument
      ? t("leaderPlanSummaryDraft")
      : t("executionPlanSummaryGenerating");
  if (elements.taskLeaderPlanCount) {
    elements.taskLeaderPlanCount.textContent = t("workspacePreviewCountPlan", { count: nodes.length });
  }
  if (elements.taskLeaderPlanGuide) {
    elements.taskLeaderPlanGuide.textContent = nodes.length > 0
      ? t("workspacePreviewGuideExecutionPlan")
      : awaitingTaskDocument
        ? t("taskDocConfirmHint")
        : t("workspacePreviewGuideExecutionPlanPending");
  }
  elements.taskLeaderPlanBadge.textContent = nodes.length > 0
    ? t("executionPlanReadyBadge")
    : awaitingTaskDocument
      ? t("leaderPlanWaitingBadge")
      : t("executionPlanWaitingBadge");
  elements.taskLeaderPlanBadge.className = `badge ${nodes.length > 0 ? "badge--clean" : "badge--outline"}`;

  for (const [index, node] of nodes.entries()) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "leader-plan-card";
    const cliType = node.recommended_agent || node.role || t("unknownAgent");
    item.innerHTML = `
      <div class="leader-plan-card__topline">
        <span class="leader-plan-card__eyebrow">${escapeHtml(`T${index + 1}`)}</span>
        <span class="leader-plan-card__cli">${escapeHtml(cliType)}</span>
      </div>
      <h4 class="leader-plan-card__title">${escapeHtml(node.title || `${t("leaderPlanTaskLabel", { index: index + 1 })}`)}</h4>
    `;
    item.addEventListener("click", () => {
      openLeaderPlanDetailDialog(index, node);
    });
    elements.taskLeaderPlanList.append(item);
  }
}

function buildTaskDocumentSections(detail) {
  const messages = detail.messages ?? [];
  const taskDocumentSnapshot = extractTaskDocumentSnapshot(messages);
  const allUserMessages = messages
    .filter((message) => message.role === "USER")
    .map((message) => String(message.content ?? "").trim())
    .filter(Boolean);
  const structuredLeadDocument = taskDocumentSnapshot ?? extractStructuredLeadTaskDocument(messages);
  const conversationLines = collectTaskDocumentConversationLines(messages);
  const clarificationNotes = allUserMessages.slice(1).join("\n\n").trim();
  const attachments = detail.attachments ?? [];
  const projectName = state.projectDetail?.project?.name
    ?? state.projects.find((project) => project.id === detail.task.projectId)?.name
    ?? t("unknown");
  const attachmentText = attachments.length > 0
    ? attachments.map((attachment) => attachment.fileName).join("、")
    : t("taskDocContextEmpty");
  const contextLines = [
    `${t("taskDocProjectLabel")} · ${projectName}`,
    `${t("taskDocBaseBranchLabel")} · ${detail.task.baseBranch || t("unknown")}`,
    `${t("taskDocAttachmentsSummaryLabel")} · ${attachmentText}`,
  ];
  const scopeHighlights = structuredLeadDocument?.scope
    || pickTaskDocumentHighlights(conversationLines, [
      "范围",
      "边界",
      "scope",
      "in scope",
      "out of scope",
      "页面",
      "接口",
      "api",
      "数据库",
      "schema",
      "字段",
      "交互",
      "ui",
      "cli",
    ])
    || normalizeOptionalText(clarificationNotes)
    || t("taskDocScopeEmpty");
  const constraintHighlights = structuredLeadDocument?.constraints
    ?? pickTaskDocumentHighlights(conversationLines, [
      "约束",
      "限制",
      "必须",
      "不要",
      "兼容",
      "分支",
      "base branch",
      "sandbox",
      "docker",
      "constraint",
      "must",
      "should",
      "repo",
      "仓库",
      "目录",
      "affected",
    ])
    ?? t("taskDocClarificationEmpty");
  const acceptanceHighlights = structuredLeadDocument?.acceptance
    ?? pickTaskDocumentHighlights(conversationLines, [
      "验收",
      "测试",
      "验证",
      "完成标准",
      "done",
      "acceptance",
      "check",
      "review",
      "smoke",
      "发布",
      "部署",
    ])
    ?? t("taskDocAcceptanceEmpty");

  const scopeAndConstraints = [scopeHighlights, constraintHighlights]
    .map((entry) => normalizeOptionalText(entry))
    .filter(Boolean)
    .join("\n\n");

  return [
    {
      label: t("taskDocGoalLabel"),
      body: structuredLeadDocument?.goal || detail.task.description || detail.task.title || t("taskDocEmpty"),
    },
    {
      label: t("taskDocScopeLabel"),
      body: scopeAndConstraints || t("taskDocScopeEmpty"),
    },
    {
      label: t("taskDocAcceptanceLabel"),
      body: acceptanceHighlights,
    },
    {
      label: t("taskDocContextLabel"),
      body: contextLines.join("\n"),
    },
  ];
}

function extractStructuredLeadTaskDocument(messages) {
  const leadMessages = (messages ?? [])
    .filter((message) => message.role === "ASSISTANT" || message.role === "LEAD_AGENT")
    .map((message) => String(message.content ?? "").trim())
    .filter(Boolean);

  for (let index = leadMessages.length - 1; index >= 0; index -= 1) {
    const parsed = parseStructuredTaskDocumentSections(leadMessages[index]);

    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function extractTaskDocumentSnapshot(messages) {
  return [...(messages ?? [])]
    .reverse()
    .map((message) => parseTaskDocumentSnapshotMessage(message))
    .find(Boolean) ?? null;
}

function parseTaskDocumentSnapshotMessage(message) {
  if (
    message?.role !== "SYSTEM"
    || typeof message.content !== "string"
    || !message.content.startsWith(TASK_DOCUMENT_SNAPSHOT_MESSAGE_PREFIX)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(message.content.slice(TASK_DOCUMENT_SNAPSHOT_MESSAGE_PREFIX.length));
    const goal = normalizeOptionalText(parsed?.goal);
    const scope = normalizeOptionalText(parsed?.scope);
    const constraints = normalizeOptionalText(parsed?.constraints);
    const acceptance = normalizeOptionalText(parsed?.acceptance);

    if (!goal && !scope && !constraints && !acceptance) {
      return null;
    }

    return {
      acceptance,
      constraints,
      context: parsed?.context && typeof parsed.context === "object" ? parsed.context : null,
      goal,
      scope,
    };
  } catch {
    return null;
  }
}

function isHiddenSystemConversationMessage(message) {
  return Boolean(parseTaskDocumentSnapshotMessage(message));
}

function parseStructuredTaskDocumentSections(text) {
  const lines = String(text ?? "").split(/\r?\n/u);
  const sections = {};
  let currentKey = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const heading = matchTaskDocumentHeading(line);

    if (heading) {
      currentKey = heading.key;

      if (heading.body) {
        sections[currentKey] = appendTaskDocumentSectionValue(sections[currentKey], heading.body);
      }
      continue;
    }

    if (!currentKey) {
      continue;
    }

    sections[currentKey] = appendTaskDocumentSectionValue(sections[currentKey], stripTaskDocumentLine(line));
  }

  const normalizedSections = Object.fromEntries(
    Object.entries(sections)
      .map(([key, value]) => [key, normalizeOptionalText(value)])
      .filter(([, value]) => Boolean(value)),
  );

  return Object.keys(normalizedSections).length >= 2 ? normalizedSections : null;
}

function appendTaskDocumentSectionValue(currentValue, nextLine) {
  const normalizedLine = normalizeOptionalText(nextLine);

  if (!normalizedLine) {
    return currentValue ?? "";
  }

  return currentValue ? `${currentValue}\n${normalizedLine}` : normalizedLine;
}

function matchTaskDocumentHeading(line) {
  const matchers = [
    /^#{1,6}\s*(.+?)\s*$/u,
    /^\*\*(.+?)\*\*\s*[:：]?\s*(.*)$/u,
    /^([A-Za-z\u4e00-\u9fff][A-Za-z0-9\u4e00-\u9fff ()/_-]{1,30})\s*[:：]\s*(.*)$/u,
  ];

  for (const matcher of matchers) {
    const match = line.match(matcher);

    if (!match) {
      continue;
    }

    const label = normalizeOptionalText(match[1]);
    const key = resolveTaskDocumentSectionKey(label);

    if (!key) {
      continue;
    }

    return {
      body: stripTaskDocumentLine(match[2] ?? ""),
      key,
    };
  }

  return null;
}

function resolveTaskDocumentSectionKey(label) {
  const normalizedLabel = String(label ?? "").trim().toLowerCase();

  if (!normalizedLabel) {
    return null;
  }

  if (
    normalizedLabel.includes("任务目标")
    || normalizedLabel.includes("需求目标")
    || normalizedLabel.includes("目标")
    || normalizedLabel.includes("goal")
    || normalizedLabel.includes("objective")
    || normalizedLabel.includes("outcome")
  ) {
    return "goal";
  }

  if (
    normalizedLabel.includes("工作范围")
    || normalizedLabel.includes("范围")
    || normalizedLabel.includes("边界")
    || normalizedLabel.includes("scope")
    || normalizedLabel.includes("in scope")
    || normalizedLabel.includes("out of scope")
  ) {
    return "scope";
  }

  if (
    normalizedLabel.includes("约束")
    || normalizedLabel.includes("限制")
    || normalizedLabel.includes("constraint")
    || normalizedLabel.includes("assumption")
    || normalizedLabel.includes("non-goal")
  ) {
    return "constraints";
  }

  if (
    normalizedLabel.includes("验收")
    || normalizedLabel.includes("测试")
    || normalizedLabel.includes("完成标准")
    || normalizedLabel.includes("acceptance")
    || normalizedLabel.includes("definition of done")
    || normalizedLabel.includes("verification")
  ) {
    return "acceptance";
  }

  return null;
}

function stripTaskDocumentLine(line) {
  return String(line ?? "").replace(/^[-*•\d.)\s]+/u, "").trim();
}

function collectTaskDocumentConversationLines(messages) {
  return (messages ?? [])
    .filter((message) => message.role === "USER" || message.role === "ASSISTANT" || message.role === "LEAD_AGENT")
    .flatMap((message) => String(message.content ?? "").split(/\r?\n/u))
    .map((line) => stripTaskDocumentLine(line))
    .filter((line) => line.length >= 4);
}

function pickTaskDocumentHighlights(lines, keywords, maxItems = 4) {
  const seen = new Set();
  const matches = [];

  for (const line of lines) {
    const normalizedLine = line.toLowerCase();

    if (!keywords.some((keyword) => normalizedLine.includes(keyword.toLowerCase()))) {
      continue;
    }

    if (seen.has(line)) {
      continue;
    }

    seen.add(line);
    matches.push(line);

    if (matches.length >= maxItems) {
      break;
    }
  }

  return matches.length > 0 ? matches.join("\n") : null;
}

function buildLeaderPlanNodes(detail) {
  const parsedPlan = parseCurrentPlanJson(detail.task.currentPlanJson);
  const planNodes = getPlanNodes(parsedPlan);
  const materializedNodes = (detail.subTasks ?? []).map((subTask) => ({
    branch_suffix: subTask.branchSuffix ?? subTask.branchName ?? "",
    depends_on: subTask.dependencyBranchSuffixes ?? [],
    description: subTask.description ?? "",
    recommended_agent: subTask.agentType ?? "",
    role: subTask.role ?? "",
    title: subTask.title ?? "",
  }));

  return planNodes.length > 0 ? planNodes : materializedNodes;
}

function renderLeaderPlanDetailDialog() {
  const detailState = state.leaderPlanDetailState;

  if (!detailState || !elements.leaderPlanDetailFacts || !elements.leaderPlanDetailTitle || !elements.leaderPlanDetailSummary) {
    return;
  }

  const { index, node } = detailState;
  const dependencies = Array.isArray(node.depends_on) && node.depends_on.length > 0
    ? node.depends_on.join(", ")
    : t("leaderPlanDependsNone");
  const acceptanceCriteria = Array.isArray(node.acceptance_criteria) && node.acceptance_criteria.length > 0
    ? node.acceptance_criteria.join("\n")
    : t("noAcceptanceCriteria");
  elements.leaderPlanDetailTitle.textContent = node.title || t("leaderPlanTaskLabel", { index: index + 1 });
  elements.leaderPlanDetailSummary.textContent = node.description || node.deliverable || "";
  elements.leaderPlanDetailFacts.innerHTML = `
    <div>
      <dt>${escapeHtml(t("leaderPlanAgentLabel"))}</dt>
      <dd>${escapeHtml(node.recommended_agent || t("unknownAgent"))}</dd>
    </div>
    <div>
      <dt>${escapeHtml(t("leaderPlanRoleLabel"))}</dt>
      <dd>${escapeHtml(node.role || t("unknown"))}</dd>
    </div>
    <div>
      <dt>${escapeHtml(t("leaderPlanBranchLabel"))}</dt>
      <dd>${escapeHtml(node.branch_suffix || t("leadSessionPending"))}</dd>
    </div>
    <div>
      <dt>${escapeHtml(t("leaderPlanDependsLabel"))}</dt>
      <dd>${escapeHtml(dependencies)}</dd>
    </div>
    <div>
      <dt>${escapeHtml(t("deliverableLabel"))}</dt>
      <dd>${escapeHtml(node.deliverable || t("none"))}</dd>
    </div>
    <div>
      <dt>${escapeHtml(t("acceptanceCriteriaTitle"))}</dt>
      <dd>${escapeHtml(acceptanceCriteria).replaceAll("\n", "<br>")}</dd>
    </div>
    <div>
      <dt>${escapeHtml(t("estimatedScopeField"))}</dt>
      <dd>${escapeHtml(node.estimated_scope || t("none"))}</dd>
    </div>
    <div>
      <dt>${escapeHtml(t("templateHintLabel"))}</dt>
      <dd>${escapeHtml(node.template_hint || t("none"))}</dd>
    </div>
  `;
}

function renderTaskPlanNodeDialog() {
  const detailState = state.taskPlanNodeDetailState;

  if (
    !detailState
    || !elements.taskPlanNodeDialog
    || !elements.taskPlanNodeTitle
    || !elements.taskPlanNodeSummary
    || !state.taskDetail?.task
  ) {
    return;
  }

  const editable = state.taskDetail.task.status === "PLAN_REVIEW" && Boolean(state.taskPlanDraft);
  const activePlan = editable
    ? state.taskPlanDraft
    : normalizePlanDraft(parseCurrentPlanJson(state.taskDetail.task.currentPlanJson));
  const nodes = getPlanNodes(activePlan);
  const entry = nodes[detailState.index];

  if (!entry) {
    closeTaskPlanNodeDialog();
    return;
  }

  const dependencies = Array.isArray(entry.depends_on) && entry.depends_on.length > 0
    ? entry.depends_on.join(", ")
    : t("noDependenciesLabel");
  const acceptanceCriteria = Array.isArray(entry.acceptance_criteria) && entry.acceptance_criteria.length > 0
    ? entry.acceptance_criteria.join("\n")
    : t("noAcceptanceCriteria");
  const agentLabel = entry.recommended_agent || t("planNodeNoAgent");

  elements.taskPlanNodeTitle.textContent = entry.title || t("leaderPlanTaskLabel", { index: detailState.index + 1 });
  elements.taskPlanNodeSummary.textContent = t("planNodeDetailSummary");

  if (elements.taskPlanNodeEditor) {
    elements.taskPlanNodeEditor.hidden = !editable;
  }
  if (elements.taskPlanNodeReadonlyFacts) {
    elements.taskPlanNodeReadonlyFacts.hidden = editable;
  }

  if (editable) {
    const fieldBindings = [
      [elements.taskPlanNodeTitleInput, entry.title ?? ""],
      [elements.taskPlanNodeRoleInput, entry.role ?? ""],
      [elements.taskPlanNodeDescriptionInput, entry.description ?? ""],
      [elements.taskPlanNodeDeliverableInput, entry.deliverable ?? ""],
      [elements.taskPlanNodeCriteriaInput, acceptanceCriteria === t("noAcceptanceCriteria") ? "" : acceptanceCriteria],
      [elements.taskPlanNodeBranchInput, entry.branch_suffix ?? ""],
      [elements.taskPlanNodeDependsInput, Array.isArray(entry.depends_on) ? entry.depends_on.join(", ") : ""],
      [elements.taskPlanNodeTemplateInput, entry.template_hint ?? ""],
      [elements.taskPlanNodeScopeInput, entry.estimated_scope ?? ""],
    ];

    for (const [input, value] of fieldBindings) {
      if (!input) {
        continue;
      }

      input.value = value;
      input.dataset.subtaskIndex = String(detailState.index);
    }

    if (elements.taskPlanNodeAgentSelect) {
      elements.taskPlanNodeAgentSelect.innerHTML = buildWorkerAgentOptions(entry.recommended_agent);
      elements.taskPlanNodeAgentSelect.dataset.subtaskIndex = String(detailState.index);
    }

    if (elements.taskPlanNodeRemoveButton) {
      elements.taskPlanNodeRemoveButton.dataset.removeSubtask = String(detailState.index);
    }
  } else if (elements.taskPlanNodeReadonlyFacts) {
    elements.taskPlanNodeReadonlyFacts.innerHTML = `
      <div>
        <dt>${escapeHtml(t("roleField"))}</dt>
        <dd>${escapeHtml(entry.role || t("unknown"))}</dd>
      </div>
      <div>
        <dt>${escapeHtml(t("workerAgentField"))}</dt>
        <dd>${escapeHtml(agentLabel)}</dd>
      </div>
      <div>
        <dt>${escapeHtml(t("descriptionField"))}</dt>
        <dd>${escapeHtml(entry.description || entry.deliverable || "")}</dd>
      </div>
      <div>
        <dt>${escapeHtml(t("deliverableField"))}</dt>
        <dd>${escapeHtml(entry.deliverable || entry.description || "")}</dd>
      </div>
      <div>
        <dt>${escapeHtml(t("dependsOnField"))}</dt>
        <dd>${escapeHtml(dependencies)}</dd>
      </div>
      <div>
        <dt>${escapeHtml(t("acceptanceCriteriaField"))}</dt>
        <dd>${escapeHtml(acceptanceCriteria)}</dd>
      </div>
      <div>
        <dt>${escapeHtml(t("branchSuffixField"))}</dt>
        <dd>${escapeHtml(entry.branch_suffix || t("missingSuffix"))}</dd>
      </div>
    `;
  }
}

function renderLeaderConversationHistory(messages, liveOutput, leadSession) {
  elements.taskLeadSessionOutput.replaceChildren();
  const visibleMessages = (messages ?? []).filter((message) => !isHiddenSystemConversationMessage(message));
  const pendingLiveOutput = getPendingLeadLiveOutput(visibleMessages, liveOutput);

  const lastAssistantMessage = [...visibleMessages]
    .reverse()
    .find((message) => message.role === "ASSISTANT" || message.role === "LEAD_AGENT")
    ?.content
    ?.trim();
  const shouldRenderLiveOutput = pendingLiveOutput.trim().length > 0 && pendingLiveOutput.trim() !== lastAssistantMessage;
  const inFlightVisible = Boolean(
    state.taskMessageInFlight
    && state.taskMessageInFlight.taskId === state.selectedTaskId
    && !hasPersistedUserMessage(visibleMessages, state.taskMessageInFlight),
  );
  const queuedMessages = state.taskMessageQueue
    .filter((message) => message.taskId === state.selectedTaskId)
    .filter((message) => !hasPersistedUserMessage(visibleMessages, message));

  if (visibleMessages.length === 0 && !shouldRenderLiveOutput && !inFlightVisible && queuedMessages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "workspace-chat__empty";
    empty.textContent = t("leaderConversationEmptyOutput");
    elements.taskLeadSessionOutput.append(empty);
    return;
  }

  for (const message of visibleMessages) {
    elements.taskLeadSessionOutput.append(buildConversationMessage(message.role, message.content, message.createdAt));
  }

  if (inFlightVisible) {
    elements.taskLeadSessionOutput.append(buildConversationMessage(
      "USER",
      state.taskMessageInFlight.content,
      state.taskMessageInFlight.createdAt,
      { localState: "running" },
    ));
  }

  if (shouldRenderLiveOutput) {
    elements.taskLeadSessionOutput.append(buildConversationMessage(
      "ASSISTANT",
      pendingLiveOutput,
      leadSession?.updatedAt ?? new Date().toISOString(),
      { live: true },
    ));
  }

  elements.taskLeadSessionOutput.scrollTop = elements.taskLeadSessionOutput.scrollHeight;
}

function getPendingLeadLiveOutput(messages, liveOutput) {
  const normalizedLiveOutput = typeof liveOutput === "string" ? liveOutput : String(liveOutput ?? "");

  if (normalizedLiveOutput.trim().length === 0) {
    return "";
  }

  const lastAssistantContent = [...(messages ?? [])]
    .reverse()
    .find((message) => message.role === "ASSISTANT" || message.role === "LEAD_AGENT")
    ?.content;

  if (typeof lastAssistantContent !== "string" || lastAssistantContent.trim().length === 0) {
    return normalizedLiveOutput;
  }

  const overlapIndex = normalizedLiveOutput.lastIndexOf(lastAssistantContent);

  if (overlapIndex < 0) {
    return normalizedLiveOutput;
  }

  const trailingOutput = normalizedLiveOutput.slice(overlapIndex + lastAssistantContent.length);
  return trailingOutput.trim().length > 0 ? trailingOutput : "";
}

function hasPersistedUserMessage(messages, localMessage) {
  const localContent = normalizeOptionalText(localMessage?.content);

  if (!localContent) {
    return false;
  }

  const localCreatedAt = Date.parse(localMessage?.createdAt ?? "");

  return (messages ?? []).some((message) => {
    if (message?.role !== "USER") {
      return false;
    }

    if (normalizeOptionalText(message.content) !== localContent) {
      return false;
    }

    if (!Number.isFinite(localCreatedAt)) {
      return true;
    }

    const persistedCreatedAt = Date.parse(message.createdAt ?? "");

    if (!Number.isFinite(persistedCreatedAt)) {
      return true;
    }

    return Math.abs(persistedCreatedAt - localCreatedAt) <= 30_000;
  });
}

function buildConversationMessage(role, content, createdAt, options = {}) {
  const article = document.createElement("article");
  const roleKey = role === "USER" ? "operator" : (role === "ASSISTANT" || role === "LEAD_AGENT") ? "leader" : "system";
  const localState = options.localState ?? null;
  const promptLabel = options.live
    ? "CLI"
    : role === "USER"
      ? "YOU"
      : (role === "ASSISTANT" || role === "LEAD_AGENT")
        ? "LEAD"
        : "SYS";
  const statusLabel = localState === "running"
    ? t("taskMessageRunningLabel")
    : localState === "queued"
      ? t("taskMessageQueuedLabel")
      : localState === "paused"
        ? t("taskMessageStoppedLabel")
        : options.live
        ? t("taskMessageRunningLabel")
        : "";
  article.className = `workspace-chat__message workspace-chat__message--${roleKey}${options.live ? " is-live" : ""}${localState ? ` is-${localState}` : ""}`;
  const bodyMarkup = buildConversationBodyMarkup(role, content);
  article.innerHTML = `
    <div class="workspace-chat__bubble">
      <div class="workspace-chat__prompt">${escapeHtml(promptLabel)}</div>
      <div class="workspace-chat__body">
        ${bodyMarkup}
        <div class="workspace-chat__meta">
          ${statusLabel ? `<span class="workspace-chat__state">${escapeHtml(statusLabel)}</span>` : "<span></span>"}
          <span class="workspace-chat__time">${escapeHtml(new Date(createdAt).toLocaleTimeString(state.locale, { hour: "2-digit", minute: "2-digit" }))}</span>
        </div>
      </div>
    </div>
  `;
  return article;
}

function buildConversationBodyMarkup(role, content) {
  const safeContent = escapeHtml(typeof content === "string" ? content : String(content ?? ""));
  if (role === "USER") {
    return `<p class="workspace-chat__text">${safeContent.replaceAll("\n", "<br>")}</p>`;
  }
  return `<pre class="workspace-chat__text workspace-chat__text--cli">${safeContent}</pre>`;
}

function renderTaskMessageQueueList() {
  if (!elements.taskMessageQueueList) {
    return;
  }

  elements.taskMessageQueueList.replaceChildren();
  const queuedMessages = state.taskMessageQueue.filter((message) => message.taskId === state.selectedTaskId);
  elements.taskMessageQueueList.hidden = queuedMessages.length === 0;

  for (const queuedMessage of queuedMessages) {
    const row = document.createElement("div");
    row.className = "workspace-chat__queue-item";
    row.innerHTML = `
      <div class="workspace-chat__queue-copy">
        <span class="workspace-chat__queue-badge">${escapeHtml(state.taskMessageQueuePaused ? t("taskMessageStoppedLabel") : t("taskMessageQueuedLabel"))}</span>
        <p class="workspace-chat__queue-text">${escapeHtml(queuedMessage.content)}</p>
      </div>
      <button class="button button--ghost workspace-chat__queue-remove" type="button">${escapeHtml(t("taskMessageWithdrawButton"))}</button>
    `;
    row.querySelector("button")?.addEventListener("click", () => {
      removeQueuedTaskMessage(queuedMessage.id);
    });
    elements.taskMessageQueueList.append(row);
  }
}

function renderTaskMessageComposer(detail) {
  const taskStatus = detail?.task?.status ?? null;
  const paused = isPausedTask(detail?.task);

  if (!elements.taskMessageInput || !elements.taskMessageLabel || !elements.sendTaskMessageButton) {
    return;
  }

  const hasDraftMessage = elements.taskMessageInput.value.trim().length > 0;
  const canSend = LEADER_CHAT_SENDABLE_STATUSES.has(taskStatus) && !paused;
  const isRunning = Boolean(state.taskMessageInFlight);
  const queuedCount = state.taskMessageQueue.filter((message) => message.taskId === state.selectedTaskId).length;
  const currentBranch = detail?.task?.taskBranchName ?? detail?.task?.baseBranch ?? state.projectDetail?.repoStatus?.currentBranch ?? "-";

  if (elements.taskMessageBranchHint) {
    elements.taskMessageBranchHint.textContent = t("taskMessageBranchHint", { branch: currentBranch });
  }

  if (elements.taskMessageQueueStatus) {
    elements.taskMessageQueueStatus.textContent = state.taskMessageQueuePaused
      ? t("taskMessageQueuePaused")
      : isRunning
        ? queuedCount > 0
          ? t("taskMessageQueueQueued", { count: queuedCount })
          : t("taskMessageQueueRunning")
        : queuedCount > 0
          ? t("taskMessageQueueQueued", { count: queuedCount })
          : t("taskMessageQueueIdle");
  }

  if (elements.taskMessageStopButton) {
    elements.taskMessageStopButton.hidden = !isRunning;
    elements.taskMessageStopButton.disabled = !isRunning;
    elements.taskMessageStopButton.textContent = state.taskMessageQueuePaused && isRunning
      ? t("taskMessageStopping")
      : t("taskMessageStopButton");
  }

  elements.taskMessageInput.disabled = !canSend;

  if (taskStatus === "DRAFT") {
    elements.taskMessageLabel.textContent = t("startClarificationDraftLabel");
    elements.taskMessageInput.setAttribute("placeholder", t("startClarificationDraftPlaceholder"));
    elements.sendTaskMessageButton.innerHTML = `
      <span>${escapeHtml(isRunning ? t("sendMessageQueuedButton") : t("startClarificationDraftButton"))}</span>
      <span class="workspace-chat__send-hint">${escapeHtml(t("sendMessageHotkey"))}</span>
    `;
    elements.sendTaskMessageButton.disabled = !hasDraftMessage;
    return;
  }

  if (paused) {
    elements.taskMessageLabel.textContent = t("sendReadonlyMessageLabel");
    elements.taskMessageInput.setAttribute("placeholder", t("taskPausedHint"));
    elements.sendTaskMessageButton.innerHTML = `
      <span>${escapeHtml(t("taskPausedStatusLabel"))}</span>
      <span class="workspace-chat__send-hint">${escapeHtml(t("sendMessageHotkey"))}</span>
    `;
    elements.sendTaskMessageButton.disabled = true;
    return;
  }

  if (!canSend) {
    elements.taskMessageLabel.textContent = t("sendReadonlyMessageLabel");
    elements.taskMessageInput.setAttribute("placeholder", t("sendReadonlyMessagePlaceholder"));
    elements.sendTaskMessageButton.innerHTML = `
      <span>${escapeHtml(t("sendMessageButton"))}</span>
      <span class="workspace-chat__send-hint">${escapeHtml(t("sendMessageHotkey"))}</span>
    `;
    elements.sendTaskMessageButton.disabled = true;
    return;
  }

  if (taskStatus === "PLAN_REVIEW") {
    elements.taskMessageLabel.textContent = t("sendPlanFeedbackLabel");
    elements.taskMessageInput.setAttribute("placeholder", t("sendPlanFeedbackPlaceholder"));
    elements.sendTaskMessageButton.innerHTML = `
      <span>${escapeHtml(isRunning ? t("sendMessageQueuedButton") : t("sendMessageButton"))}</span>
      <span class="workspace-chat__send-hint">${escapeHtml(t("sendMessageHotkey"))}</span>
    `;
    elements.sendTaskMessageButton.disabled = !hasDraftMessage;
    return;
  }

  if (taskStatus === "PLANNING") {
    elements.taskMessageLabel.textContent = t("sendPlanningMessageLabel");
    elements.taskMessageInput.setAttribute("placeholder", t("sendPlanningMessagePlaceholder"));
    elements.sendTaskMessageButton.innerHTML = `
      <span>${escapeHtml(isRunning ? t("sendMessageQueuedButton") : t("sendMessageButton"))}</span>
      <span class="workspace-chat__send-hint">${escapeHtml(t("sendMessageHotkey"))}</span>
    `;
    elements.sendTaskMessageButton.disabled = !hasDraftMessage;
    return;
  }

  if (["ACTION_REQUIRED", "EXECUTING", "MERGING", "REVIEWING"].includes(taskStatus)) {
    elements.taskMessageLabel.textContent = t("sendExecutionMessageLabel");
    elements.taskMessageInput.setAttribute("placeholder", t("sendExecutionMessagePlaceholder"));
    elements.sendTaskMessageButton.innerHTML = `
      <span>${escapeHtml(isRunning ? t("sendMessageQueuedButton") : t("sendMessageButton"))}</span>
      <span class="workspace-chat__send-hint">${escapeHtml(t("sendMessageHotkey"))}</span>
    `;
    elements.sendTaskMessageButton.disabled = !hasDraftMessage;
    return;
  }

  elements.taskMessageLabel.textContent = t("sendClarificationReplyLabel");
  elements.taskMessageInput.setAttribute("placeholder", t("sendClarificationReplyPlaceholder"));
  elements.sendTaskMessageButton.innerHTML = `
    <span>${escapeHtml(isRunning ? t("sendMessageQueuedButton") : t("sendMessageButton"))}</span>
    <span class="workspace-chat__send-hint">${escapeHtml(t("sendMessageHotkey"))}</span>
  `;
  elements.sendTaskMessageButton.disabled = !hasDraftMessage;
}

function buildTaskTeamMembers(detail) {
  return (detail.subTasks ?? []).map((subTask, index) => {
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
}

function renderDashboardTeamOverview(detail = state.taskDetail) {
  if (!elements.dashboardTeamList || !elements.dashboardTeamEmpty) {
    return;
  }

  const currentProjectBranch = state.projectDetail?.repoStatus?.currentBranch ?? null;
  const currentTaskTitle = detail?.task?.title ?? null;
  const members = detail?.task ? buildTaskTeamMembers(detail) : [];
  const teams = buildAgentTeams(members);

  elements.dashboardTeamList.replaceChildren();
  elements.dashboardTeamEmpty.hidden = teams.length > 0;

  if (elements.dashboardTeamTaskBadge) {
    elements.dashboardTeamTaskBadge.textContent = `${t("dashboardTeamTaskBadge")} · ${currentTaskTitle ?? t("dashboardTeamTaskIdle")}`;
  }

  if (elements.dashboardTeamBranchBadge) {
    elements.dashboardTeamBranchBadge.textContent = currentProjectBranch
      ? `${t("currentBranchStat")} · ${currentProjectBranch}`
      : t("currentBranchStat");
  }

  for (const team of teams) {
    const agent = state.agents.find((entry) => entry.name === team.agentType) ?? null;
    const snapshot = state.agentHealth?.[team.agentType] ?? null;
    const statusSnapshot = snapshot
      ? { ...snapshot, runtimeMode: snapshot.runtimeMode ?? agent?.runtimeMode ?? null }
      : { runtimeMode: agent?.runtimeMode ?? null };
    const card = document.createElement("article");
    const activityTone = buildAgentTeamTone(team.activitySummary);
    card.className = `dashboard-team-card dashboard-team-card--${activityTone}`;
    card.innerHTML = `
      <div class="dashboard-team-card__header">
        <div>
          <p class="dashboard-team-card__eyebrow">${escapeHtml(t("dashboardTeamRuntimeMode"))}</p>
          <div class="dashboard-team-card__title-row">
            <h3 class="dashboard-team-card__title">${escapeHtml(team.agentType ?? t("unknownAgent"))}</h3>
            <span class="badge ${buildAgentStatusBadgeClass(agent, snapshot)}">${escapeHtml(buildAgentStatusLabel(statusSnapshot))}</span>
          </div>
          <p class="dashboard-team-card__meta">${escapeHtml([
            buildAgentRuntimeModeLabel(agent, snapshot),
            `${team.members.length} ${t("dashboardTeamMembers")}`,
            `${team.workspaces.length} ${t("dashboardTeamWorkspaceCount")}`,
            `${team.branches.length} ${t("dashboardTeamBranchCount")}`,
          ].join(" · "))}</p>
        </div>
        <span class="dashboard-team-card__count">${escapeHtml(countLabel(team.members.length, "teamMemberCountOne", "teamMemberCountOther"))}</span>
      </div>
      <div class="dashboard-team-card__chamber">
        <div class="dashboard-team-card__scanline" aria-hidden="true"></div>
        <div class="dashboard-team-card__chamber-head">
          <div class="dashboard-team-card__eva-mark">
            <span class="dashboard-team-card__eva-core"></span>
          </div>
          <div class="dashboard-team-card__status-block">
            <span class="dashboard-team-card__activity-dot dashboard-team-card__activity-dot--${escapeHtmlAttribute(activityTone)}"></span>
            <span>${escapeHtml(buildAgentTeamActivityLabel(team.activitySummary))}</span>
          </div>
        </div>
        <div class="dashboard-team-card__pilot-deck" role="list" aria-label="${escapeHtmlAttribute(t("teamPilotDeckLabel"))}">
          ${team.members.map((member) => {
            const activityState = buildMemberActivityState(member);
            return `
              <div class="agent-figure agent-figure--${escapeHtmlAttribute(activityState.toLowerCase())}" role="listitem" title="${escapeHtmlAttribute(buildAgentFigureTitle(member))}">
                <span class="agent-figure__frame" aria-hidden="true">
                  <span class="agent-figure__head"></span>
                  <span class="agent-figure__body"></span>
                </span>
                <span class="agent-figure__label">${escapeHtml(member.displayName ?? member.title ?? t("teamMemberFallback"))}</span>
              </div>
            `;
          }).join("")}
        </div>
        <p class="dashboard-team-card__terminal">${escapeHtml(buildDashboardTeamTelemetry(team))}</p>
        <div class="dashboard-team-card__progress">
          <span class="dashboard-team-card__progress-bar" style="width: ${escapeHtmlAttribute(String(buildDashboardTeamProgress(team.activitySummary)))}%"></span>
        </div>
      </div>
      <div class="dashboard-team-card__footer">
        <div class="dashboard-team-card__chips">
          ${team.branches.slice(0, 3).map((branch) => `<span class="dashboard-team-card__chip">${escapeHtml(branch)}</span>`).join("")}
          ${team.workspaces.slice(0, 2).map((workspace) => `<span class="dashboard-team-card__chip dashboard-team-card__chip--muted">${escapeHtml(workspace)}</span>`).join("")}
        </div>
        <button class="button button--secondary dashboard-team-card__action" type="button" data-dashboard-open-task="true">${escapeHtml(t("dashboardTeamOpenTask"))}</button>
      </div>
    `;

    card.querySelector("[data-dashboard-open-task]")?.addEventListener("click", () => {
      switchView("workspace");
    });

    elements.dashboardTeamList.append(card);
  }
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
  const members = buildTaskTeamMembers(detail);
  const teams = buildAgentTeams(members);
  const currentProjectBranch = state.projectDetail?.repoStatus?.currentBranch ?? null;

  elements.taskTeamMemberList.replaceChildren();
  elements.taskTeamMemberCount.textContent = countLabel(members.length, "teamMemberCountOne", "teamMemberCountOther");
  if (elements.taskTeamProjectBranch) {
    elements.taskTeamProjectBranch.textContent = currentProjectBranch
      ? `${t("currentBranchStat")} · ${currentProjectBranch}`
      : t("currentBranchStat");
  }
  elements.taskTeamEmpty.hidden = members.length > 0;
  elements.taskTeamShell.hidden = members.length === 0;
  if (elements.taskTeamLeadPill) {
    const leadStatusLabel = translateStatusLabel(lead.status ?? "PENDING");
    const pill = `${t("workspaceOverviewLeadLabel")} · ${leadStatusLabel}`;
    elements.taskTeamLeadPill.textContent = pill;
    elements.taskTeamLeadPill.setAttribute("title", pill);
  }
  if (elements.taskTeamWorkerPill) {
    const pill = `Worker · ${members.length}`;
    elements.taskTeamWorkerPill.textContent = pill;
    elements.taskTeamWorkerPill.setAttribute("title", pill);
  }

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

  for (const team of teams) {
    const agent = state.agents.find((entry) => entry.name === team.agentType) ?? null;
    const snapshot = state.agentHealth?.[team.agentType] ?? null;
    const statusSnapshot = snapshot
      ? { ...snapshot, runtimeMode: snapshot.runtimeMode ?? agent?.runtimeMode ?? null }
      : { runtimeMode: agent?.runtimeMode ?? null };
    const card = document.createElement("article");
    card.className = `agent-team-card agent-team-card--${buildAgentCardTone(agent, snapshot)}`;
    card.innerHTML = `
      <div class="agent-team-card__header">
        <div>
          <p class="agent-team-card__eyebrow">${escapeHtml(t("teamRuntimeSummaryLabel"))}</p>
          <div class="agent-team-card__topline">
            <h4 class="agent-team-card__title">${escapeHtml(team.agentType ?? t("unknownAgent"))}</h4>
            <span class="badge ${buildAgentStatusBadgeClass(agent, snapshot)}">${escapeHtml(buildAgentStatusLabel(statusSnapshot))}</span>
          </div>
          <p class="agent-team-card__meta">${escapeHtml([
            buildAgentRuntimeModeLabel(agent, snapshot),
            t("teamWorkspacesSummary", { count: team.workspaces.length }),
            t("teamBranchesSummary", { count: team.branches.length }),
          ].join(" · "))}</p>
        </div>
        <span class="badge badge--outline">${escapeHtml(buildAgentTeamActivityLabel(team.activitySummary))}</span>
      </div>
      <div class="agent-team-card__hud">
        <div class="agent-team-card__pilot-deck" role="list" aria-label="${escapeHtmlAttribute(t("teamPilotDeckLabel"))}">
          ${team.members.map((member) => {
            const selected = member.subtaskId === state.selectedExecutionSubTaskId;
            const activityState = buildMemberActivityState(member);
            return `
              <button
                class="agent-figure agent-figure--${escapeHtmlAttribute(activityState.toLowerCase())}${selected ? " is-selected" : ""}"
                type="button"
                data-subtask-id="${escapeHtmlAttribute(member.subtaskId)}"
                title="${escapeHtmlAttribute(buildAgentFigureTitle(member))}"
              >
                <span class="agent-figure__frame" aria-hidden="true">
                  <span class="agent-figure__head"></span>
                  <span class="agent-figure__body"></span>
                </span>
                <span class="agent-figure__label">${escapeHtml(member.displayName ?? member.title ?? t("teamMemberFallback"))}</span>
              </button>
            `;
          }).join("")}
        </div>
        <dl class="agent-team-card__facts">
          <div>
            <dt>${escapeHtml(t("teamWorkspaceListLabel"))}</dt>
            <dd>${escapeHtml(team.workspaces[0] ?? t("leadSessionPending"))}</dd>
          </div>
          <div>
            <dt>${escapeHtml(t("teamBranchListLabel"))}</dt>
            <dd>${escapeHtml(team.branches[0] ?? t("leadSessionPending"))}</dd>
          </div>
        </dl>
      </div>
      <p class="agent-team-card__summary">${escapeHtml(team.summary)}</p>
      <div class="agent-team-card__workspace-list">
        ${team.workspaces.map((workspace) => `<span class="agent-team-card__chip">${escapeHtml(workspace)}</span>`).join("")}
      </div>
      <div class="agent-team-card__branch-list">
        ${team.branches.map((branch) => `<span class="agent-team-card__chip">${escapeHtml(branch)}</span>`).join("")}
      </div>
    `;

    card.querySelectorAll("[data-subtask-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const subTaskId = button.getAttribute("data-subtask-id");
        state.selectedExecutionSubTaskId = subTaskId;
        state.selectedExecutionSessionId = resolveFocusedSession(detail, subTaskId)?.id ?? null;
        renderTaskDetail();
      });
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

function buildAgentTeams(members) {
  const teams = new Map();

  for (const member of members) {
    const key = member.agentType ?? "unknown-agent";
    const existing = teams.get(key) ?? {
      activitySummary: {
        fault: 0,
        resting: 0,
        standby: 0,
        working: 0,
      },
      agentType: key,
      branches: new Set(),
      members: [],
      workspaces: new Set(),
    };
    const activityState = buildMemberActivityState(member);

    existing.members.push(member);
    existing.activitySummary[activityState.toLowerCase()] += 1;

    if (member.branchName ?? member.branchSuffix) {
      existing.branches.add(member.branchName ?? member.branchSuffix);
    }

    if (member.worktreePath) {
      existing.workspaces.add(member.worktreePath);
    }

    teams.set(key, existing);
  }

  return [...teams.values()].map((team) => ({
    ...team,
    branches: [...team.branches],
    summary: team.members.find((member) => buildMemberActivityState(member) === "WORKING")?.runSummary
      ?? team.members[0]?.runSummary
      ?? t("waitingTeamLifecycle"),
    workspaces: [...team.workspaces],
  }));
}

function buildAgentCardTone(agent, snapshot) {
  const runtimeMode = snapshot?.runtimeMode ?? agent?.runtimeMode ?? null;

  if (runtimeMode === "STUB") {
    return "stub";
  }

  if (snapshot?.available !== true) {
    return "offline";
  }

  if (Array.isArray(snapshot?.checks) && snapshot.checks.some((check) => check.status === "WARN")) {
    return "degraded";
  }

  return "real";
}

function buildAgentStatusIcon(agent, snapshot) {
  const tone = buildAgentCardTone(agent, snapshot);

  if (tone === "offline") {
    return "dangerous";
  }

  if (agent?.name === "gemini-cli") {
    return "data_object";
  }

  return "terminal";
}

function buildAgentCompactStateLabel(agent, snapshot) {
  switch (buildAgentCardTone(agent, snapshot)) {
    case "real":
      return t("agentCompactActive");
    case "degraded":
      return t("agentCompactDegraded");
    case "stub":
      return t("agentCompactStub");
    default:
      return t("agentCompactOffline");
  }
}

function buildAgentCompactSummary(agent, snapshot, checks) {
  switch (buildAgentCardTone(agent, snapshot)) {
    case "real":
      return t("agentCompactReadySummary");
    case "degraded":
      return checks.find((check) => check.status === "WARN")?.message ?? t("agentCompactDegradedSummary");
    case "stub":
      return snapshot?.failureReason?.message ?? t("agentCompactStubSummary");
    default:
      return snapshot?.failureReason?.message ?? checks.find((check) => check.status === "FAIL")?.message ?? t("agentCompactOfflineSummary");
  }
}

function buildAgentStatusBadgeClass(agent, snapshot) {
  switch (buildAgentCardTone(agent, snapshot)) {
    case "real":
      return "badge--clean";
    case "degraded":
      return "badge--accent-soft";
    case "stub":
      return "badge--outline";
    default:
      return "badge--dirty";
  }
}

function buildAgentTeamTone(summary) {
  if ((summary?.working ?? 0) > 0) {
    return "working";
  }

  if ((summary?.fault ?? 0) > 0) {
    return "fault";
  }

  if ((summary?.standby ?? 0) > 0) {
    return "standby";
  }

  return "resting";
}

function buildAgentCheckLabel(name) {
  switch (name) {
    case "auth":
      return t("agentCheckAuth");
    case "binary":
      return t("agentCheckBinary");
    case "runtime":
      return t("agentCheckRuntime");
    case "worker-sandbox":
      return t("agentCheckWorkerSandbox");
    default:
      return t("agentCheckAvailability");
  }
}

function buildDashboardTeamTelemetry(team) {
  const leadLine = team.summary ?? t("waitingTeamLifecycle");

  switch (buildAgentTeamTone(team.activitySummary)) {
    case "working":
      return `>> ${t("dashboardTeamWorkingLine")} :: ${leadLine}`;
    case "fault":
      return `>> ${t("dashboardTeamFaultLine")} :: ${leadLine}`;
    case "standby":
      return `>> ${t("dashboardTeamStandbyLine")} :: ${leadLine}`;
    default:
      return `>> ${t("dashboardTeamRestingLine")} :: ${leadLine}`;
  }
}

function buildDashboardTeamProgress(summary) {
  if ((summary?.working ?? 0) > 0) {
    return 72;
  }

  if ((summary?.fault ?? 0) > 0) {
    return 88;
  }

  if ((summary?.standby ?? 0) > 0) {
    return 36;
  }

  return 18;
}

function buildMemberActivityState(member) {
  const latestStatus = member.latestSessionStatus ?? member.status ?? "PENDING";

  if (["RUNNING", "REVIEW_PENDING"].includes(latestStatus)) {
    return "WORKING";
  }

  if (latestStatus === "FAILED") {
    return "FAULT";
  }

  if (["ACCEPTED", "MERGED", "CANCELLED", "DISCARDED"].includes(latestStatus)) {
    return "RESTING";
  }

  return "STANDBY";
}

function buildAgentFigureTitle(member) {
  return [
    member.displayName ?? member.title ?? t("teamMemberFallback"),
    member.agentType ?? t("unknownAgent"),
    translateStatusLabel(member.latestSessionStatus ?? member.status ?? "PENDING"),
    member.branchName ?? member.branchSuffix ?? t("leadSessionPending"),
  ].filter(Boolean).join(" · ");
}

function buildAgentTeamActivityLabel(summary) {
  if ((summary?.working ?? 0) > 0) {
    return `${summary.working} ${t("teamStateWorking")}`;
  }

  if ((summary?.fault ?? 0) > 0) {
    return `${summary.fault} ${t("teamStateFault")}`;
  }

  if ((summary?.standby ?? 0) > 0) {
    return `${summary.standby} ${t("teamStateStandby")}`;
  }

  return `${summary?.resting ?? 0} ${t("teamStateResting")}`;
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

function buildTaskOperationsBoard(detail, sessionsBySubTaskId) {
  const subTasks = detail.subTasks ?? [];
  const mailboxMessages = detail.mailboxMessages ?? [];
  const messages = detail.messages ?? [];
  const subTaskById = new Map(subTasks.map((subTask) => [subTask.id, subTask]));
  const launchFailures = messages
    .map(parseLaunchFailureMessageFromDetail)
    .filter(Boolean);
  const summary = {
    blocked: subTasks.filter((subTask) => subTask.status === "BLOCKED").length,
    pending: subTasks.filter((subTask) => ["PENDING", "READY"].includes(subTask.status)).length,
    reviewPending: subTasks.filter((subTask) => subTask.status === "REVIEW_PENDING").length,
    running: subTasks.filter((subTask) => subTask.status === "RUNNING").length,
  };
  const actionRequiredItems = buildTaskOperationActionItems(detail, launchFailures).map((item) => ({
    ...item,
    contextLabel: resolveOperationsActionContextLabel(item, subTaskById),
  }));
  const workflow = buildTaskOperationsWorkflow(detail, summary, actionRequiredItems);

  return {
    actionRequiredItems,
    activity: buildTaskOperationActivities(detail, launchFailures, sessionsBySubTaskId),
    graph: buildTaskOperationGraph(detail, mailboxMessages, sessionsBySubTaskId, actionRequiredItems),
    health: buildTaskOperationHealth(detail, subTasks),
    priority: buildTaskOperationsPriority(detail, summary, actionRequiredItems),
    risk: {
      integrationFailures: (detail.integration?.runs ?? []).reduce((count, integrationRun) => (
        count + (integrationRun.gateResults ?? []).filter((gateResult) => gateResult.status === "FAILED").length
      ), 0),
      launchFailures: launchFailures.length,
      mailboxBlockers: mailboxMessages.filter((message) => message.messageType === "BLOCKER").length,
      mergeConflicts: subTasks.filter((subTask) => (subTask.mergeRecords ?? []).some((record) => record.status === "CONFLICT")).length,
      requiresAck: mailboxMessages.filter((message) => message.requiresAck).length,
      reviewRequired: subTasks.filter((subTask) => ["DISCARD_PENDING", "REWORK_REQUIRED"].includes(subTask.status)).length,
    },
    summary,
    workflow,
  };
}

function buildTaskOperationGraph(detail, mailboxMessages, sessionsBySubTaskId, actionRequiredItems) {
  const subTasks = detail.subTasks ?? [];
  const byBranchSuffix = new Map(subTasks.map((subTask) => [subTask.branchSuffix, subTask]));
  const nodes = subTasks.map((subTask) => ({
    ...subTask,
    isSelected: subTask.id === state.selectedExecutionSubTaskId,
    latestActivity: buildSubTaskLatestActivitySummary(detail, subTask.id, sessionsBySubTaskId),
    latestSession: (sessionsBySubTaskId.get(subTask.id) ?? []).at(-1) ?? null,
    requiresAction: actionRequiredItems.some((item) => item.subTaskId === subTask.id),
  }));
  const edges = subTasks.flatMap((subTask) => (
    (subTask.dependencyBranchSuffixes ?? []).map((branchSuffix) => {
      const fromSubTask = byBranchSuffix.get(branchSuffix) ?? null;
      const handoffCount = mailboxMessages.filter((message) => (
        message.senderSubTaskId === fromSubTask?.id && message.targetSubTaskId === subTask.id
      )).length;
      const blockerCount = mailboxMessages.filter((message) => (
        message.targetSubTaskId === subTask.id
        && ["BLOCKER", "REVIEW_REQUEST", "TEST_REQUEST"].includes(message.messageType)
      )).length;
      const dependencySatisfied = ["ACCEPTED", "MERGED", "REVIEW_PENDING"].includes(fromSubTask?.status);

      return {
        blockerCount,
        from: fromSubTask?.id ?? branchSuffix,
        fromBranchSuffix: branchSuffix,
        handoffCount,
        state: !dependencySatisfied
          ? "BLOCKING"
          : blockerCount > 0
            ? "ATTENTION"
            : handoffCount > 0
              ? "HANDOFF_READY"
              : "SATISFIED",
        to: subTask.id,
      };
    })
  ));

  return { edges, nodes };
}

function buildSubTaskLatestActivitySummary(detail, subTaskId, sessionsBySubTaskId) {
  const latestSession = (sessionsBySubTaskId.get(subTaskId) ?? []).at(-1) ?? null;
  const latestMailbox = [...(detail.mailboxMessages ?? [])]
    .filter((message) => message.targetSubTaskId === subTaskId || message.senderSubTaskId === subTaskId)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .at(0) ?? null;

  if (latestMailbox) {
    return latestMailbox.content ?? buildMailboxMessageTypeLabel(latestMailbox.messageType);
  }

  if (latestSession?.endedAt) {
    return `${translateStatusLabel(latestSession.status)} · ${formatTimestamp(latestSession.endedAt)}`;
  }

  if (latestSession?.startedAt) {
    return `${translateStatusLabel(latestSession.status)} · ${formatTimestamp(latestSession.startedAt)}`;
  }

  return null;
}

function buildTaskOperationHealth(detail, subTasks) {
  const distinctWorkerAgents = [...new Set(subTasks.map((subTask) => subTask.agentType).filter(Boolean))];
  const workerHealthSnapshots = distinctWorkerAgents.map((agentType) => state.agentHealth?.[agentType]).filter(Boolean);
  const runtimeModes = distinctWorkerAgents
    .map((agentType) => {
      const agent = state.agents.find((entry) => entry.name === agentType);
      return agent ? buildAgentRuntimeModeLabel(agent, state.agentHealth?.[agentType] ?? null) : null;
    })
    .filter(Boolean);

  return {
    lead: buildAgentStatusLabel(state.agentHealth?.[detail.task.leadAgentType] ?? { available: true, checks: [] }),
    runtimeMode: runtimeModes.length > 0 ? runtimeModes.join(" / ") : t("notConfigured"),
    sandbox: buildDockerHealthLabel(state.systemDockerHealth ?? null),
    workers: workerHealthSnapshots.length > 0
      ? `${workerHealthSnapshots.filter((snapshot) => snapshot.available).length}/${workerHealthSnapshots.length}`
      : "0/0",
  };
}

function buildTaskOperationsWorkflow(detail, summary, actionRequiredItems) {
  const subTasks = detail.subTasks ?? [];
  const completed = subTasks.filter((subTask) => ["ACCEPTED", "CANCELLED", "DISCARDED", "MERGED"].includes(subTask.status)).length;
  const manualAttentionCount = actionRequiredItems.filter((item) => item.owner === "USER").length;
  const systemAttentionCount = actionRequiredItems.filter((item) => item.owner !== "USER").length;

  return {
    completed,
    manualAttentionCount,
    systemAttentionCount,
    total: subTasks.length,
    waiting: summary.blocked + summary.pending + summary.reviewPending,
  };
}

function buildTaskOperationsPriority(detail, summary, actionRequiredItems) {
  const subTasks = detail.subTasks ?? [];
  const userItems = actionRequiredItems.filter((item) => item.owner === "USER");
  const leaderItems = actionRequiredItems.filter((item) => item.owner !== "USER");
  const runningSubTask = subTasks.find((subTask) => subTask.status === "RUNNING") ?? null;
  const reviewPendingCount = summary.reviewPending;
  const waitingCount = summary.blocked + summary.pending;
  let title = t("operationsPriorityIdleTitle");
  let summaryText = t("operationsPriorityIdleSummary");
  let badgeLabel = t("operationsPriorityAutoBadge");
  let badgeClass = "badge--accent-soft";
  let caption = t("operationsPriorityAutoCaption");

  if (userItems.length > 0) {
    title = t("operationsPriorityManualTitle");
    summaryText = t("operationsPriorityManualSummary", { count: userItems.length });
    badgeLabel = t("operationsPriorityManualBadge");
    badgeClass = "badge--dirty";
    caption = t("operationsPriorityManualCaption");
  } else if (detail.task?.status === "COMPLETED") {
    title = t("operationsPriorityCompletedTitle");
    summaryText = t("operationsPriorityCompletedSummary");
    badgeLabel = t("operationsPriorityFinalBadge");
    badgeClass = "badge--clean";
    caption = t("operationsPriorityFinalCaption");
  } else if (detail.task?.status === "MERGING") {
    title = t("operationsPriorityMergingTitle");
    summaryText = t("operationsPriorityMergingSummary");
    badgeLabel = t("operationsPriorityLeaderBadge");
    badgeClass = "badge--accent-soft";
    caption = t("operationsPriorityLeaderCaption");
  } else if (detail.task?.status === "REVIEWING" || reviewPendingCount > 0) {
    title = t("operationsPriorityReviewTitle");
    summaryText = t("operationsPriorityReviewSummary", { count: reviewPendingCount || completedReviewableCount(subTasks) });
    badgeLabel = t("operationsPriorityLeaderBadge");
    badgeClass = "badge--accent-soft";
    caption = t("operationsPriorityLeaderCaption");
  } else if (leaderItems.length > 0) {
    title = t("operationsPriorityLeaderTitle");
    summaryText = t("operationsPriorityLeaderSummary", { count: leaderItems.length });
    badgeLabel = t("operationsPriorityLeaderBadge");
    badgeClass = "badge--accent-soft";
    caption = t("operationsPriorityLeaderCaption");
  } else if (runningSubTask) {
    title = t("operationsPriorityRunningTitle", { name: runningSubTask.displayName ?? runningSubTask.title });
    summaryText = t("operationsPriorityRunningSummary", { count: summary.running });
    badgeLabel = t("operationsPriorityAutoBadge");
    badgeClass = "badge--accent-soft";
    caption = t("operationsPriorityAutoCaption");
  } else if (waitingCount > 0) {
    title = t("operationsPriorityBlockedTitle");
    summaryText = t("operationsPriorityBlockedSummary", { count: waitingCount });
    badgeLabel = t("operationsPriorityAutoBadge");
    badgeClass = "badge--outline";
    caption = t("operationsPriorityAutoCaption");
  }

  return {
    badgeClass,
    badgeLabel,
    caption,
    highlights: [
      {
        label: t("operationsHighlightProgress"),
        value: `${subTasks.filter((subTask) => ["ACCEPTED", "CANCELLED", "DISCARDED", "MERGED"].includes(subTask.status)).length}/${subTasks.length || 0}`,
      },
      {
        label: t("operationsHighlightFlow"),
        value: badgeLabel,
      },
      {
        label: t("operationsHighlightNext"),
        value: buildTaskOperationsNextHighlight(detail, actionRequiredItems),
      },
    ],
    title,
    summary: summaryText,
  };
}

function buildTaskOperationsNextHighlight(detail, actionRequiredItems) {
  const subTasks = detail.subTasks ?? [];
  const userItem = actionRequiredItems.find((item) => item.owner === "USER") ?? null;

  if (userItem) {
    return buildOperationsActionTitle(userItem.kind);
  }

  const runningSubTask = subTasks.find((subTask) => subTask.status === "RUNNING")
    ?? subTasks.find((subTask) => subTask.status === "REVIEW_PENDING")
    ?? subTasks.find((subTask) => ["BLOCKED", "READY", "PENDING"].includes(subTask.status))
    ?? null;

  if (!runningSubTask) {
    return detail.task?.status === "COMPLETED"
      ? t("operationsSummaryFinalReview")
      : t("operationsHighlightNoNext");
  }

  return `${runningSubTask.title} · ${buildSubTaskStatusLabel(runningSubTask.status)}`;
}

function completedReviewableCount(subTasks) {
  return subTasks.filter((subTask) => subTask.status === "REVIEW_PENDING").length;
}

function buildTaskOperationActionItems(detail, launchFailures) {
  const items = [];
  const subTasks = detail.subTasks ?? [];
  const mailboxMessages = detail.mailboxMessages ?? [];
  const latestIntegrationRun = detail.integration?.latestRun ?? null;

  for (const subTask of subTasks) {
    if (subTask.status === "DISCARD_PENDING") {
      items.push({
        kind: "DISCARD_PENDING",
        label: t("operationsActionDiscardButton"),
        owner: resolveOperationsActionOwner("DISCARD_PENDING"),
        primaryAction: "CONFIRM_DISCARD",
        subTaskId: subTask.id,
        summary: subTask.latestReviewSummary ?? subTask.runSummary ?? subTask.title,
      });
    }

    if (subTask.status === "REWORK_REQUIRED") {
      items.push({
        kind: "REWORK_REQUIRED",
        label: t("operationsActionReworkButton"),
        owner: resolveOperationsActionOwner("REWORK_REQUIRED"),
        primaryAction: "REWORK",
        subTaskId: subTask.id,
        summary: subTask.latestReviewSummary ?? subTask.runSummary ?? subTask.title,
      });
    }

    if (subTask.status === "FAILED") {
      items.push({
        kind: "FAILED_SUBTASK",
        label: t("operationsActionReassignButton"),
        owner: resolveOperationsActionOwner("FAILED_SUBTASK"),
        primaryAction: "REASSIGN",
        subTaskId: subTask.id,
        summary: subTask.lastError ?? subTask.runSummary ?? subTask.title,
      });
    }

    const latestConflict = [...(subTask.mergeRecords ?? [])].reverse().find((record) => record.status === "CONFLICT") ?? null;

    if (latestConflict) {
      items.push({
        kind: "MERGE_CONFLICT",
        label: t("operationsActionRebaseButton"),
        owner: resolveOperationsActionOwner("MERGE_CONFLICT"),
        primaryAction: "REBASE_RETRY",
        subTaskId: subTask.id,
        summary: latestConflict.conflictSummary ?? subTask.title,
      });
    }
  }

  for (const failure of launchFailures) {
    items.push({
      kind: failure.kind,
      label: t("operationsActionReplaceButton"),
      owner: resolveOperationsActionOwner(failure.kind),
      primaryAction: "OPEN",
      subTaskId: failure.subTaskId ?? null,
      summary: failure.reason,
    });
  }

  for (const message of mailboxMessages) {
    if (!["BLOCKER", "REVIEW_REQUEST", "TEST_REQUEST"].includes(message.messageType)) {
      continue;
    }

    items.push({
      kind: message.messageType,
      label: message.targetType === "LEAD" ? t("operationsActionOpenButton") : t("operationsActionSendNoteButton"),
      owner: resolveOperationsActionOwner(message.messageType),
      primaryAction: "OPEN",
      subTaskId: message.targetSubTaskId ?? message.senderSubTaskId ?? null,
      summary: message.content,
    });
  }

  if (
    detail.task?.status === "ACTION_REQUIRED"
    && latestIntegrationRun
    && ["ACTION_REQUIRED", "FAILED", "ROLLED_BACK"].includes(latestIntegrationRun.status)
  ) {
    const failedGateSummary = (latestIntegrationRun.gateResults ?? [])
      .filter((gateResult) => gateResult.status === "FAILED")
      .at(-1)?.summary ?? null;

    items.push({
      kind: "INTEGRATION_ATTENTION",
      label: t("operationsActionOpenButton"),
      owner: resolveOperationsActionOwner("INTEGRATION_ATTENTION"),
      primaryAction: "OPEN_INTEGRATION",
      subTaskId: null,
      summary: failedGateSummary ?? detail.task.lastError ?? buildIntegrationRunStatusLabel(latestIntegrationRun.status),
    });
  }

  if (
    detail.task?.status === "ACTION_REQUIRED"
    && subTasks.length > 0
    && subTasks.every((subTask) => ["ACCEPTED", "CANCELLED", "DISCARDED", "MERGED"].includes(subTask.status))
  ) {
    items.push({
      kind: "TASK_RESUME_MERGE",
      label: t("operationsActionResumeButton"),
      owner: resolveOperationsActionOwner("TASK_RESUME_MERGE"),
      primaryAction: "RESUME_MERGE",
      subTaskId: null,
      summary: detail.task.lastError ?? t("mergeResumed"),
    });
  }

  return items.sort((left, right) => buildActionPriority(left.kind) - buildActionPriority(right.kind));
}

function resolveOperationsActionOwner(kind) {
  switch (kind) {
    case "MERGE_CONFLICT":
    case "FAILED_SUBTASK":
    case "INTEGRATION_ATTENTION":
    case "SANDBOX_LAUNCH_FAILURE":
    case "TASK_RESUME_MERGE":
    case "WORKER_LAUNCH_FAILURE":
      return "USER";
    default:
      return "LEADER";
  }
}

function buildActionPriority(kind) {
  switch (kind) {
    case "MERGE_CONFLICT":
      return 1;
    case "INTEGRATION_ATTENTION":
      return 2;
    case "DISCARD_PENDING":
      return 3;
    case "REWORK_REQUIRED":
      return 4;
    case "FAILED_SUBTASK":
    case "SANDBOX_LAUNCH_FAILURE":
    case "WORKER_LAUNCH_FAILURE":
      return 5;
    case "BLOCKER":
      return 6;
    default:
      return 10;
  }
}

function buildTaskOperationActivities(detail, launchFailures, sessionsBySubTaskId) {
  const subTaskById = new Map((detail.subTasks ?? []).map((subTask) => [subTask.id, subTask]));
  const activities = [];

  for (const session of detail.sessions ?? []) {
    if (session.startedAt) {
      activities.push({
        createdAt: session.startedAt,
        kind: "SESSION_STARTED",
        subTaskId: session.subTaskId ?? null,
        summary: session.subTaskId
          ? `${subTaskById.get(session.subTaskId)?.title ?? session.subTaskId} ${t("operationsActivitySessionStarted")}`
          : `Lead ${t("operationsActivitySessionStarted")}`,
      });
    }

    if (session.endedAt) {
      activities.push({
        createdAt: session.endedAt,
        kind: "SESSION_ENDED",
        subTaskId: session.subTaskId ?? null,
        summary: session.subTaskId
          ? `${subTaskById.get(session.subTaskId)?.title ?? session.subTaskId} ${t("operationsActivitySessionEnded")}`
          : `Lead ${t("operationsActivitySessionEnded")}`,
      });
    }
  }

  for (const message of detail.mailboxMessages ?? []) {
    activities.push({
      createdAt: message.createdAt,
      kind: "MAILBOX_MESSAGE",
      subTaskId: message.targetSubTaskId ?? message.senderSubTaskId ?? null,
      summary: `${buildMailboxDirectionLabel(detail, message)} · ${buildMailboxMessageTypeLabel(message.messageType)}`,
    });
  }

  for (const subTask of detail.subTasks ?? []) {
    for (const mergeRecord of subTask.mergeRecords ?? []) {
      activities.push({
        createdAt: mergeRecord.completedAt ?? mergeRecord.createdAt,
        kind: "MERGE",
        subTaskId: subTask.id,
        summary: `${subTask.title} · ${buildMergeOperationLabel(mergeRecord.operation)} · ${buildMergeStatusLabel(mergeRecord.status)}`,
      });
    }

    if (subTask.latestReviewPhase && subTask.latestReviewDecision) {
      activities.push({
        createdAt: (sessionsBySubTaskId.get(subTask.id) ?? []).at(-1)?.endedAt ?? subTask.updatedAt ?? null,
        kind: "REVIEW",
        subTaskId: subTask.id,
        summary: `${subTask.title} · ${buildReviewPhaseLabel(subTask.latestReviewPhase)} · ${buildReviewDecisionLabel(subTask.latestReviewDecision)}`,
      });
    }
  }

  for (const failure of launchFailures) {
    activities.push({
      createdAt: failure.createdAt,
      kind: "FAILURE",
      subTaskId: failure.subTaskId ?? null,
      summary: failure.reason,
    });
  }

  return activities
    .filter((activity) => activity.createdAt)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .slice(0, 40);
}

function parseLaunchFailureMessageFromDetail(message) {
  if (
    message?.role !== "SYSTEM"
    || typeof message.content !== "string"
    || !message.content.startsWith("Launch failure: ")
  ) {
    return null;
  }

  try {
    return JSON.parse(message.content.slice("Launch failure: ".length));
  } catch {
    return null;
  }
}

function renderTaskOperationsSummary(boardSnapshot) {
  const summaryItems = [
    ["operationsSummaryRunning", boardSnapshot.summary.running],
    ["operationsSummaryWaiting", boardSnapshot.workflow.waiting],
    ["operationsSummaryCompleted", `${boardSnapshot.workflow.completed}/${boardSnapshot.workflow.total}`],
    ["operationsSummaryManual", boardSnapshot.workflow.manualAttentionCount],
    ["operationsSummarySystem", boardSnapshot.workflow.systemAttentionCount ?? 0],
  ];

  elements.taskExecutionSummaryList.replaceChildren();

  for (const [labelKey, count] of summaryItems) {
    const card = document.createElement("article");
    card.className = "operations-summary-card";
    card.innerHTML = `
      <p class="operations-summary-card__label">${escapeHtml(t(labelKey))}</p>
      <p class="operations-summary-card__value">${escapeHtml(String(count))}</p>
    `;
    elements.taskExecutionSummaryList.append(card);
  }
}

function renderTaskOperationsPriority(boardSnapshot) {
  elements.taskExecutionPriorityEyebrow.textContent = t("operationsPriorityEyebrow");
  elements.taskExecutionPriorityTitle.textContent = boardSnapshot.priority.title;
  elements.taskExecutionPrioritySummary.textContent = boardSnapshot.priority.summary;
  elements.taskExecutionPriorityBadge.textContent = boardSnapshot.priority.badgeLabel;
  elements.taskExecutionPriorityBadge.className = `badge ${boardSnapshot.priority.badgeClass}`;
  elements.taskExecutionPriorityCaption.textContent = boardSnapshot.priority.caption;
  elements.taskExecutionHighlightList.replaceChildren();

  for (const highlight of boardSnapshot.priority.highlights) {
    const item = document.createElement("article");
    item.className = "operations-highlight";
    item.innerHTML = `
      <p class="operations-highlight__label">${escapeHtml(highlight.label)}</p>
      <p class="operations-highlight__value">${escapeHtml(highlight.value)}</p>
    `;
    elements.taskExecutionHighlightList.append(item);
  }
}

function renderTaskOperationsHealth(boardSnapshot) {
  renderOperationsMetaList(elements.taskExecutionHealthList, [
    [t("operationsHealthLead"), boardSnapshot.health.lead],
    [t("operationsHealthWorkers"), boardSnapshot.health.workers],
    [t("operationsHealthSandbox"), boardSnapshot.health.sandbox],
    [t("operationsHealthRuntime"), boardSnapshot.health.runtimeMode],
  ]);
}

function renderTaskOperationsRisk(boardSnapshot) {
  const riskEntries = [
    [t("operationsRiskMailbox"), boardSnapshot.risk.mailboxBlockers],
    [t("operationsRiskReview"), boardSnapshot.risk.reviewRequired],
    [t("operationsRiskMerge"), boardSnapshot.risk.mergeConflicts],
    [t("operationsRiskIntegration"), boardSnapshot.risk.integrationFailures],
    [t("operationsRiskLaunch"), boardSnapshot.risk.launchFailures],
    [t("operationsRiskAck"), boardSnapshot.risk.requiresAck],
  ].filter(([, value]) => Number(value) > 0);

  renderOperationsMetaList(
    elements.taskExecutionRiskList,
    riskEntries.length > 0 ? riskEntries : [[t("operationsRiskTitle"), t("operationsRiskAllClear")]],
  );
}

function renderOperationsMetaList(element, entries) {
  element.replaceChildren();

  for (const [label, value] of entries) {
    const item = document.createElement("div");
    item.className = "operations-meta-item";
    item.innerHTML = `
      <span class="operations-meta-item__label">${escapeHtml(String(label))}</span>
      <span class="operations-meta-item__value">${escapeHtml(String(value))}</span>
    `;
    element.append(item);
  }
}

function renderTaskOperationsActionQueue(boardSnapshot) {
  const manualAttentionCount = boardSnapshot.actionRequiredItems.filter((item) => item.owner === "USER").length;
  const manualItems = boardSnapshot.actionRequiredItems.filter((item) => item.owner === "USER");
  const systemItems = boardSnapshot.actionRequiredItems.filter((item) => item.owner !== "USER");
  const queueTitle = manualAttentionCount > 0
    ? t("operationsQueueManualTitle")
    : t("operationsQueueAutoTitle");
  const queueSummary = boardSnapshot.actionRequiredItems.length === 0
    ? t("operationsQueueCleanSummary")
    : manualAttentionCount > 0
      ? t("operationsQueueManualSummary")
      : t("operationsQueueAutoSummary");

  elements.taskExecutionActionTitle.textContent = queueTitle;
  elements.taskExecutionActionSummary.textContent = queueSummary;
  elements.taskExecutionActionList.replaceChildren();
  elements.taskExecutionActionCount.textContent = String(boardSnapshot.actionRequiredItems.length);
  elements.taskExecutionActionEmpty.hidden = boardSnapshot.actionRequiredItems.length > 0;
  elements.taskExecutionActionEmpty.textContent = queueSummary;

  if (boardSnapshot.actionRequiredItems.length === 0) {
    return;
  }

  renderOperationsActionGroup(
    elements.taskExecutionActionList,
    manualItems,
    t("operationsQueueManualGroupTitle"),
    t("operationsQueueManualGroupEmpty"),
    "badge--dirty",
  );
  renderOperationsActionGroup(
    elements.taskExecutionActionList,
    systemItems,
    t("operationsQueueSystemGroupTitle"),
    t("operationsQueueSystemGroupEmpty"),
    "badge--outline",
  );
}

function renderOperationsActionGroup(container, items, title, emptyLabel, badgeClass) {
  const section = document.createElement("section");
  section.className = "operations-action-group";
  section.innerHTML = `
    <div class="operations-action-group__header">
      <h5 class="operations-action-group__title">${escapeHtml(title)}</h5>
      <span class="badge ${badgeClass}">${escapeHtml(String(items.length))}</span>
    </div>
  `;

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "operations-action-group__empty";
    empty.textContent = emptyLabel;
    section.append(empty);
    container.append(section);
    return;
  }

  const list = document.createElement("div");
  list.className = "operations-action-list";

  for (const item of items) {
    list.append(buildOperationsActionCard(item));
  }

  section.append(list);
  container.append(section);
}

function buildOperationsActionCard(item) {
  const card = document.createElement("article");
  card.className = "operations-action-card";
  const buttonLabel = item.owner === "USER"
    ? (item.label ?? buildOperationsActionButtonLabel(item.primaryAction))
    : t("operationsActionViewContext");
  card.innerHTML = `
    <div class="operations-action-card__header">
      <div>
        <div class="operations-action-card__title-row">
          <p class="operations-action-card__title">${escapeHtml(buildOperationsActionTitle(item.kind))}</p>
          <span class="badge ${item.owner === "USER" ? "badge--dirty" : "badge--outline"}">${escapeHtml(buildOperationsActionOwnerLabel(item.owner))}</span>
        </div>
        <p class="operations-action-card__meta">${escapeHtml(item.contextLabel ?? t("operationsActionContextTask"))}</p>
        <p class="operations-action-card__summary">${escapeHtml(item.summary ?? "")}</p>
      </div>
      <button class="button button--secondary" type="button">${escapeHtml(buttonLabel)}</button>
    </div>
  `;
  card.querySelector("button")?.addEventListener("click", () => {
    void onTaskOperationsAction(item);
  });
  return card;
}

async function onTaskOperationsAction(item) {
  if (item.subTaskId) {
    state.selectedExecutionSubTaskId = item.subTaskId;
    state.selectedExecutionSessionId = resolveFocusedSession(state.taskDetail, item.subTaskId)?.id ?? null;
    renderTaskDetail();
  }

  switch (item.primaryAction) {
    case "REWORK":
      await onReworkSubTask();
      break;
    case "CONFIRM_DISCARD":
      await onConfirmDiscardSubTask();
      break;
    case "REBASE_RETRY":
      await onRebaseRetrySubTask();
      break;
    case "RESUME_MERGE":
      await onResumeTaskMerge();
      break;
    case "REASSIGN":
      await onReassignSubTask();
      break;
    default:
      renderTaskDetail();
      break;
  }
}

function buildOperationsActionOwnerLabel(owner) {
  switch (owner) {
    case "USER":
      return t("operationsOwnerUser");
    case "LEADER":
      return t("operationsOwnerLeader");
    default:
      return t("operationsOwnerSystem");
  }
}

function resolveOperationsActionContextLabel(item, subTaskById) {
  if (item.subTaskId && subTaskById.has(item.subTaskId)) {
    return subTaskById.get(item.subTaskId)?.displayName ?? subTaskById.get(item.subTaskId)?.title ?? item.subTaskId;
  }

  if (item.kind === "TASK_RESUME_MERGE" || item.kind === "INTEGRATION_ATTENTION") {
    return t("operationsActionContextTask");
  }

  return t("operationsActionContextLead");
}

function renderTaskOperationsGraph(boardSnapshot) {
  elements.taskExecutionGraphView.replaceChildren();

  const columns = buildTaskOperationsGraphColumns(boardSnapshot.graph.nodes);

  if (columns.length === 0) {
    return;
  }

  for (const column of columns) {
    const section = document.createElement("section");
    section.className = "operations-graph__column";
    section.innerHTML = `
      <div class="operations-graph__column-header">
        <p class="panel__eyebrow">${escapeHtml(t("graphColumnLabel", { count: column.level + 1 }))}</p>
        <span class="badge badge--outline">${escapeHtml(countLabel(column.nodes.length, "nodeCountOne", "nodeCountOther"))}</span>
      </div>
    `;

    for (const node of column.nodes) {
      const nodeCard = document.createElement("button");
      const nodeEdges = boardSnapshot.graph.edges.filter((edge) => edge.to === node.id);
      nodeCard.type = "button";
      nodeCard.className = `operations-graph__node${node.isSelected ? " is-selected" : ""}`;
      nodeCard.innerHTML = `
        <div class="operations-graph__node-header">
          <div>
            <p class="operations-graph__node-title">${escapeHtml(node.displayName ?? node.title)}</p>
            <p class="operations-graph__node-meta">${escapeHtml([node.role ?? node.branchSuffix, node.agentType].filter(Boolean).join(" · "))}</p>
          </div>
          <span class="badge ${buildExecutionStatusBadgeClass(node.status)}">${escapeHtml(buildSubTaskStatusLabel(node.status))}</span>
        </div>
        <p class="operations-graph__node-summary">${escapeHtml(node.latestActivity ?? node.runSummary ?? "")}</p>
        <div class="operations-graph__edge-list">
          ${nodeEdges.length > 0 ? nodeEdges.map((edge) => `
            <span class="operations-edge operations-edge--${escapeHtmlAttribute(edge.state.toLowerCase())}">
              ${escapeHtml(edge.fromBranchSuffix)} · ${escapeHtml(buildOperationsEdgeStateLabel(edge.state))}
              ${edge.handoffCount > 0 ? ` · ${escapeHtml(t("operationsGraphMailbox"))} ${escapeHtml(String(edge.handoffCount))}` : ""}
              ${edge.blockerCount > 0 ? ` · ${escapeHtml(t("operationsGraphBlocking"))} ${escapeHtml(String(edge.blockerCount))}` : ""}
            </span>
          `).join("") : `<span class="operations-edge operations-edge--satisfied">${escapeHtml(t("operationsGraphNoDependencies"))}</span>`}
        </div>
      `;
      nodeCard.addEventListener("click", () => {
        state.selectedExecutionSubTaskId = node.id;
        state.selectedExecutionSessionId = resolveFocusedSession(state.taskDetail, node.id)?.id ?? null;
        renderTaskDetail();
      });
      section.append(nodeCard);
    }

    elements.taskExecutionGraphView.append(section);
  }
}

function buildTaskOperationsGraphColumns(nodes) {
  const nodeByBranchSuffix = new Map(nodes.map((node) => [node.branchSuffix, node]));
  const levelCache = new Map();
  const resolveLevel = (node) => {
    if (levelCache.has(node.id)) {
      return levelCache.get(node.id);
    }

    const level = (node.dependencyBranchSuffixes ?? []).length === 0
      ? 0
      : Math.max(...node.dependencyBranchSuffixes.map((branchSuffix) => resolveLevel(nodeByBranchSuffix.get(branchSuffix) ?? { id: branchSuffix, dependencyBranchSuffixes: [] }))) + 1;

    levelCache.set(node.id, level);
    return level;
  };
  const columns = new Map();

  for (const node of nodes) {
    const level = resolveLevel(node);
    const entries = columns.get(level) ?? [];
    entries.push(node);
    columns.set(level, entries);
  }

  return [...columns.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([level, columnNodes]) => ({ level, nodes: columnNodes }));
}

function renderTaskOperationsActivity(boardSnapshot) {
  elements.taskExecutionActivityList.replaceChildren();
  elements.taskExecutionActivityEmpty.hidden = boardSnapshot.activity.length > 0;

  for (const activity of boardSnapshot.activity) {
    const item = document.createElement("article");
    item.className = "operations-activity-item";
    item.innerHTML = `
      <div class="operations-activity-item__header">
        <p class="operations-activity-item__kind">${escapeHtml(buildOperationsActivityKindLabel(activity.kind))}</p>
        <p class="operations-activity-item__time">${escapeHtml(formatTimestamp(activity.createdAt))}</p>
      </div>
      <p class="operations-activity-item__summary">${escapeHtml(activity.summary)}</p>
    `;
    elements.taskExecutionActivityList.append(item);
  }
}

function toggleBoardModeButton(button, active) {
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", active ? "true" : "false");
}

function buildOperationsModeBadgeLabel(view) {
  switch (view) {
    case "list":
      return t("operationsModeListBadge");
    case "activity":
      return t("operationsModeActivityBadge");
    default:
      return t("operationsModeGraphBadge");
  }
}

function buildOperationsEdgeStateLabel(state) {
  switch (state) {
    case "BLOCKING":
      return t("operationsGraphBlocking");
    case "ATTENTION":
      return t("operationsGraphAttention");
    case "HANDOFF_READY":
      return t("operationsGraphReady");
    default:
      return t("operationsGraphSatisfied");
  }
}

function buildOperationsActivityKindLabel(kind) {
  switch (kind) {
    case "SESSION_STARTED":
      return t("operationsActivitySessionStarted");
    case "SESSION_ENDED":
      return t("operationsActivitySessionEnded");
    case "MAILBOX_MESSAGE":
      return t("operationsActivityMailbox");
    case "REVIEW":
      return t("operationsActivityReview");
    case "MERGE":
      return t("operationsActivityMerge");
    case "FAILURE":
    case "SANDBOX_LAUNCH_FAILURE":
    case "WORKER_LAUNCH_FAILURE":
      return t("operationsActivityFailure");
    default:
      return t("operationsActivityUnknown");
  }
}

function buildOperationsActionTitle(kind) {
  switch (kind) {
    case "MERGE_CONFLICT":
      return t("operationsActionKindMergeConflict");
    case "INTEGRATION_ATTENTION":
      return t("operationsActionKindIntegrationAttention");
    case "DISCARD_PENDING":
      return t("operationsActionKindDiscardPending");
    case "REWORK_REQUIRED":
      return t("operationsActionKindReworkRequired");
    case "FAILED_SUBTASK":
      return t("operationsActionKindFailedSubtask");
    case "SANDBOX_LAUNCH_FAILURE":
      return t("operationsActionKindSandboxLaunchFailure");
    case "WORKER_LAUNCH_FAILURE":
      return t("operationsActionKindWorkerLaunchFailure");
    case "BLOCKER":
      return t("operationsActionKindBlocker");
    case "REVIEW_REQUEST":
      return t("operationsActionKindReviewRequest");
    case "TEST_REQUEST":
      return t("operationsActionKindTestRequest");
    case "TASK_RESUME_MERGE":
      return t("operationsActionKindTaskResumeMerge");
    default:
      return kind.replaceAll("_", " ");
  }
}

function buildOperationsActionButtonLabel(primaryAction) {
  switch (primaryAction) {
    case "CONFIRM_DISCARD":
      return t("operationsActionDiscardButton");
    case "REASSIGN":
      return t("operationsActionReassignButton");
    case "REBASE_RETRY":
      return t("operationsActionRebaseButton");
    case "REWORK":
      return t("operationsActionReworkButton");
    case "RESUME_MERGE":
      return t("operationsActionResumeButton");
    case "SEND_NOTE":
      return t("operationsActionSendNoteButton");
    default:
      return t("operationsActionOpenButton");
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
    elements.taskExecutionSummaryList.replaceChildren();
    elements.taskExecutionHealthList.replaceChildren();
    elements.taskExecutionHighlightList.replaceChildren();
    elements.taskExecutionPriorityTitle.textContent = t("operationsPriorityIdleTitle");
    elements.taskExecutionPrioritySummary.textContent = t("operationsPriorityIdleSummary");
    elements.taskExecutionPriorityBadge.textContent = t("operationsPriorityAutoBadge");
    elements.taskExecutionPriorityBadge.className = "badge badge--outline";
    elements.taskExecutionPriorityCaption.textContent = t("operationsPriorityAutoCaption");
    elements.taskExecutionRiskList.replaceChildren();
    elements.taskIntegrationMetaList.replaceChildren();
    elements.taskIntegrationGateList.replaceChildren();
    elements.taskIntegrationQueueList.replaceChildren();
    elements.taskIntegrationEmpty.hidden = true;
    elements.taskIntegrationGateEmpty.hidden = true;
    elements.taskIntegrationQueueEmpty.hidden = true;
    elements.taskIntegrationShell.hidden = false;
    elements.taskIntegrationStatusBadge.textContent = t("integrationRunQueued");
    elements.taskIntegrationStatusBadge.className = "badge badge--outline";
    elements.taskIntegrationStartButton.hidden = true;
    elements.taskIntegrationRetryButton.hidden = true;
    elements.taskIntegrationRollbackButton.hidden = true;
    elements.taskExecutionActionCount.textContent = "0";
    elements.taskExecutionActionEmpty.hidden = true;
    elements.taskExecutionActionList.replaceChildren();
    elements.taskExecutionGraphView.replaceChildren();
    elements.taskExecutionActivityList.replaceChildren();
    elements.taskExecutionActivityEmpty.hidden = true;
    return;
  }

  const boardSnapshot = buildTaskOperationsBoard(detail, sessionsBySubTaskId);
  renderTaskOperationsPriority(boardSnapshot);
  renderTaskOperationsSummary(boardSnapshot);
  renderTaskOperationsHealth(boardSnapshot);
  renderTaskOperationsRisk(boardSnapshot);
  renderTaskOperationsActionQueue(boardSnapshot);
  renderTaskOperationsView(detail, boardSnapshot, sessionsBySubTaskId);
  renderFocusedExecution(detail, sessionsBySubTaskId);
}

function renderTaskOperationsView(detail, boardSnapshot, sessionsBySubTaskId) {
  elements.taskExecutionGraphPanel.hidden = state.taskOperationsView !== "graph";
  elements.taskExecutionListPanel.hidden = state.taskOperationsView !== "list";
  elements.taskExecutionActivityPanel.hidden = state.taskOperationsView !== "activity";
  elements.taskExecutionModeBadge.textContent = buildOperationsModeBadgeLabel(state.taskOperationsView);
  toggleBoardModeButton(elements.taskExecutionGraphButton, state.taskOperationsView === "graph");
  toggleBoardModeButton(elements.taskExecutionListButton, state.taskOperationsView === "list");
  toggleBoardModeButton(elements.taskExecutionActivityButton, state.taskOperationsView === "activity");

  renderTaskOperationsGraph(boardSnapshot);
  renderTaskExecutionList(detail, sessionsBySubTaskId);
  renderTaskOperationsActivity(boardSnapshot);
}

function renderTaskExecutionList(detail, sessionsBySubTaskId) {
  const subTasks = detail.subTasks ?? [];

  elements.taskExecutionList.replaceChildren();

  for (const subTask of subTasks) {
    const sessions = sessionsBySubTaskId.get(subTask.id) ?? [];
    const latestSession = sessions.at(-1) ?? null;
    const mergeRecords = Array.isArray(subTask.mergeRecords) ? subTask.mergeRecords : [];
    const latestMergeRecord = mergeRecords.at(-1) ?? null;
    const reviewDecision = buildReviewDecisionLabel(subTask.latestReviewDecision);
    const reviewPhase = buildReviewPhaseLabel(subTask.latestReviewPhase);
    const reviewSummary = buildExecutionReviewSummary(subTask);
    const isSelected = subTask.id === state.selectedExecutionSubTaskId;
    const showReviewBlock = Boolean(subTask.latestReviewDecision || mergeRecords.length > 0 || subTask.status === "FAILED");
    const statusChips = [
      subTask.role ?? null,
      subTask.agentType,
      latestSession ? `${translateStatusLabel(latestSession.status)}` : null,
    ].filter(Boolean);
    const supportingLine = [
      latestSession ? `${t("latestSessionLabel")}: ${latestSession.agentType}` : null,
      `${t("retriesLabel")}: ${String(subTask.retryCount ?? 0)}`,
      mergeRecords.length > 0 ? `${t("mergeAttemptsLabel")}: ${String(mergeRecords.length)}` : null,
    ].filter(Boolean).join(" · ");
    const card = document.createElement("button");

    card.type = "button";
    card.className = `execution-card${isSelected ? " is-selected" : ""}`;
    card.innerHTML = `
      <div class="execution-card__header">
        <div>
          <p class="execution-card__title">${escapeHtml(subTask.title)}</p>
          <p class="execution-card__meta">${escapeHtml(buildSubTaskStatusLabel(subTask.status))}</p>
        </div>
        <span class="badge ${buildExecutionStatusBadgeClass(subTask.status)}">${escapeHtml(buildSubTaskStatusLabel(subTask.status))}</span>
      </div>
      <p class="execution-card__next-step">${escapeHtml(subTask.runSummary ?? reviewSummary)}</p>
      <div class="execution-card__chip-row">
        ${statusChips.map((chip) => `<span class="execution-card__chip">${escapeHtml(chip)}</span>`).join("")}
      </div>
      <p class="execution-card__supporting">${escapeHtml(supportingLine || t("latestSessionNone"))}</p>
      ${showReviewBlock ? `
        <div class="execution-card__review">
          <p class="execution-card__review-title">${escapeHtml(latestMergeRecord ? buildMergeHistoryHeadline(latestMergeRecord) : `${reviewPhase} · ${reviewDecision}`)}</p>
          <p class="execution-card__review-summary">${escapeHtml(latestMergeRecord ? buildExecutionMergeSummary(subTask, latestMergeRecord) : reviewSummary)}</p>
        </div>
      ` : ""}
    `;

    card.addEventListener("click", () => {
      const nextSession = resolveFocusedSession(detail, subTask.id);
      state.selectedExecutionSubTaskId = subTask.id;
      state.selectedExecutionSessionId = nextSession?.id ?? null;
      renderTaskDetail();
    });

    elements.taskExecutionList.append(card);
  }
}

function renderTaskIntegration(detail) {
  const latestRun = detail.integration?.latestRun ?? null;
  const queueItems = latestRun?.queueItems ?? [];
  const gateResults = latestRun?.gateResults ?? [];
  const showSection = Boolean(latestRun) || ["ACTION_REQUIRED", "COMPLETED", "MERGING"].includes(detail.task.status);

  elements.taskIntegrationShell.hidden = !showSection || !latestRun;
  elements.taskIntegrationEmpty.hidden = !showSection || Boolean(latestRun);
  elements.taskIntegrationMetaList.replaceChildren();
  elements.taskIntegrationGateList.replaceChildren();
  elements.taskIntegrationQueueList.replaceChildren();
  elements.taskIntegrationGateEmpty.hidden = gateResults.length > 0;
  elements.taskIntegrationQueueEmpty.hidden = queueItems.length > 0;

  if (!showSection) {
    return;
  }

  if (!latestRun) {
    elements.taskIntegrationStatusBadge.textContent = t("integrationRunQueued");
    elements.taskIntegrationStatusBadge.className = "badge badge--outline";
    elements.taskIntegrationStartButton.hidden = detail.task.status !== "MERGING" && detail.task.status !== "ACTION_REQUIRED";
    elements.taskIntegrationRetryButton.hidden = true;
    elements.taskIntegrationRollbackButton.hidden = true;
    return;
  }

  elements.taskIntegrationStatusBadge.textContent = buildIntegrationRunStatusLabel(latestRun.status);
  elements.taskIntegrationStatusBadge.className = `badge ${buildIntegrationRunBadgeClass(latestRun.status)}`;
  renderOperationsMetaList(elements.taskIntegrationMetaList, [
    [t("integrationMetaBranch"), latestRun.integrationBranch],
    [t("integrationMetaRun"), buildIntegrationRunStatusLabel(latestRun.status)],
    [t("integrationMetaQueue"), String(queueItems.length)],
    [t("integrationMetaReleased"), String(queueItems.filter((item) => item.status === "RELEASED").length)],
  ]);

  elements.taskIntegrationStartButton.hidden = true;
  elements.taskIntegrationRetryButton.hidden = !(detail.task.status === "ACTION_REQUIRED" && ["ACTION_REQUIRED", "FAILED", "ROLLED_BACK"].includes(latestRun.status));
  elements.taskIntegrationRollbackButton.hidden = !(detail.task.status === "ACTION_REQUIRED" && ["ACTION_REQUIRED", "FAILED"].includes(latestRun.status));

  for (const gateResult of gateResults) {
    const card = document.createElement("article");
    card.className = "operations-action-card";
    card.innerHTML = `
      <div class="operations-action-card__header">
        <div>
          <p class="operations-action-card__title">${escapeHtml(gateResult.gateType)}</p>
          <p class="operations-action-card__summary">${escapeHtml(gateResult.summary)}</p>
        </div>
        <span class="badge ${gateResult.status === "FAILED" ? "badge--dirty" : "badge--clean"}">${escapeHtml(buildIntegrationGateStatusLabel(gateResult.status))}</span>
      </div>
    `;
    elements.taskIntegrationGateList.append(card);
  }

  for (const queueItem of queueItems) {
    const card = document.createElement("article");
    card.className = "operations-action-card";
    const canDequeue = detail.task.status === "ACTION_REQUIRED"
      && latestRun.status === "ACTION_REQUIRED"
      && !["DEQUEUED", "RELEASED"].includes(queueItem.status);
    card.innerHTML = `
      <div class="operations-action-card__header">
        <div>
          <p class="operations-action-card__title">${escapeHtml(queueItem.subTask?.title ?? queueItem.subTaskId)}</p>
          <p class="operations-action-card__summary">${escapeHtml(buildIntegrationQueueItemStatusLabel(queueItem.status))}</p>
        </div>
        ${canDequeue ? `<button class="button button--ghost" type="button">${escapeHtml(t("integrationDequeueButton"))}</button>` : `<span class="badge badge--outline">${escapeHtml(buildIntegrationQueueItemStatusLabel(queueItem.status))}</span>`}
      </div>
    `;

    if (canDequeue) {
      card.querySelector("button")?.addEventListener("click", () => {
        void onDequeueIntegrationQueueItem(queueItem.id);
      });
    }

    elements.taskIntegrationQueueList.append(card);
  }
}

function buildIntegrationRunStatusLabel(status) {
  switch (status) {
    case "ACTION_REQUIRED":
      return t("integrationRunActionRequired");
    case "COMPLETED":
      return t("integrationRunCompleted");
    case "FAILED":
      return t("integrationRunFailed");
    case "ROLLED_BACK":
      return t("integrationRunRolledBack");
    case "RUNNING":
      return t("integrationRunRunning");
    default:
      return t("integrationRunQueued");
  }
}

function buildIntegrationRunBadgeClass(status) {
  switch (status) {
    case "ACTION_REQUIRED":
    case "FAILED":
      return "badge--dirty";
    case "COMPLETED":
      return "badge--clean";
    case "RUNNING":
      return "badge--accent-soft";
    default:
      return "badge--outline";
  }
}

function buildIntegrationQueueItemStatusLabel(status) {
  switch (status) {
    case "DEQUEUED":
      return t("integrationQueueDequeued");
    case "FAILED":
      return t("integrationQueueFailed");
    case "MERGED":
      return t("integrationQueueMerged");
    case "RELEASED":
      return t("integrationQueueReleased");
    case "ROLLED_BACK":
      return t("integrationQueueRolledBack");
    default:
      return t("integrationQueueQueued");
  }
}

function buildIntegrationGateStatusLabel(status) {
  return status === "FAILED" ? t("integrationGateFailed") : t("integrationGatePassed");
}

function renderPlanDraft(detail) {
  elements.taskPlanList.replaceChildren();
  elements.taskPlanGraph.replaceChildren();
  clearFeedback(elements.taskPlanFeedback);
  state.taskPlanView = "graph";

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
  renderTaskPlanNodeDialog();

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
  elements.taskPlanList.hidden = true;
  elements.taskPlanGraph.hidden = false;

  if (!planNodes.length) {
    return;
  }

  renderPlanGraph(planNodes, Boolean(editableDraft));
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
  elements.taskPlanGraphViewButton?.classList.toggle("is-active", true);
  elements.taskPlanListViewButton?.classList.toggle("is-active", false);
  elements.taskPlanGraphViewButton?.setAttribute("aria-pressed", "true");
  elements.taskPlanListViewButton?.setAttribute("aria-pressed", "false");
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
    section.className = "plan-sequence__step";
    const stepMeta = column.nodes.length > 1
      ? t("planSequenceParallelLabel", { count: column.nodes.length })
      : countLabel(column.nodes.length, "nodeCountOne", "nodeCountOther");
    section.innerHTML = `
      <div class="plan-sequence__header">
        <p class="panel__eyebrow">${escapeHtml(t("graphColumnLabel", { count: column.level + 1 }))}</p>
        <span class="badge badge--outline">${escapeHtml(stepMeta)}</span>
      </div>
    `;

    const list = document.createElement("div");
    list.className = "plan-sequence__lane";

    for (const entry of column.nodes) {
      list.append(renderPlanNodeSummaryCard(entry.index, entry.node, { editable, sequenceMode: true }));
    }

    section.append(list);
    elements.taskPlanGraph.append(section);
  }
}

function renderEditablePlanNodeCard(index, node, graphMode = false) {
  return renderPlanNodeSummaryCard(index, node, { editable: true, sequenceMode: graphMode });
}

function renderReadonlyPlanNodeCard(index, node, graphMode = false) {
  return renderPlanNodeSummaryCard(index, node, { editable: false, sequenceMode: graphMode });
}

function renderPlanNodeSummaryCard(index, node, options = {}) {
  const button = document.createElement("button");
  const sequenceMode = options.sequenceMode === true;
  const roleLabel = node.role || node.branch_suffix || t("unknown");
  const agentLabel = node.recommended_agent || t("planNodeNoAgent");

  button.type = "button";
  button.className = sequenceMode ? "plan-node-card plan-node-card--sequence" : "plan-node-card";
  button.setAttribute("aria-label", `${node.title || t("leaderPlanTaskLabel", { index: index + 1 })} · ${roleLabel} · ${agentLabel}`);
  button.innerHTML = `
    <div class="plan-node-card__topline">
      <span class="plan-node-card__index">${escapeHtml(`T${index + 1}`)}</span>
    </div>
    <h4 class="plan-node-card__title">${escapeHtml(node.title || t("leaderPlanTaskLabel", { index: index + 1 }))}</h4>
    <p class="plan-node-card__meta">${escapeHtml(roleLabel)}</p>
    <p class="plan-node-card__meta">${escapeHtml(agentLabel)}</p>
  `;
  button.addEventListener("click", () => openTaskPlanNodeDialog(index));
  return button;
}

function renderTranscript(messages) {
  const visibleMessages = (messages ?? []).filter((message) => !isHiddenSystemConversationMessage(message));
  elements.taskTranscript.replaceChildren();
  elements.taskTranscriptEmpty.hidden = visibleMessages.length > 0;

  for (const message of visibleMessages) {
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
  if (elements.projectCurrentBranchBadge) {
    elements.projectCurrentBranchBadge.textContent = t("currentBranchStat");
  }
  if (elements.dashboardTeamBranchBadge) {
    elements.dashboardTeamBranchBadge.textContent = t("currentBranchStat");
  }
  state.projectDetail = null;
  syncBranchChoices();
}

function clearTaskList() {
  state.tasks = [];
  state.selectedTaskId = null;
  writeStorage(STORAGE_KEYS.selectedTaskId, "");
  renderTaskCollections();
}

function clearTaskDetail() {
  resetTaskMessageQueueState({ clearInput: true });
  clearTaskPreviewPoll();
  state.executionDrafts = new Map();
  state.liveSessionOutputs = new Map();
  state.selectedExecutionSessionId = null;
  state.selectedExecutionSubTaskId = null;
  state.taskDetail = null;
  state.taskPreview = null;
  state.taskPlanDraft = null;
  state.taskPlanDraftState = null;
  state.taskPlanNotice = null;
  state.selectedTaskId = null;
  writeStorage(STORAGE_KEYS.selectedTaskId, "");
  closeLeaderPlanDetailDialog();
  closeTaskPlanNodeDialog();
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
  elements.taskExecutionHighlightList.replaceChildren();
  elements.taskExecutionSummaryList.replaceChildren();
  elements.taskExecutionHealthList.replaceChildren();
  elements.taskExecutionRiskList.replaceChildren();
  elements.taskExecutionActionList.replaceChildren();
  elements.taskExecutionActionCount.textContent = "0";
  elements.taskExecutionActionTitle.textContent = t("operationsActionTitle");
  elements.taskExecutionActionSummary.textContent = t("operationsQueueCleanSummary");
  elements.taskExecutionActionEmpty.hidden = true;
  elements.taskExecutionGraphView.replaceChildren();
  elements.taskExecutionActivityList.replaceChildren();
  elements.taskExecutionActivityEmpty.hidden = true;
  elements.taskExecutionGraphPanel.hidden = false;
  elements.taskExecutionListPanel.hidden = true;
  elements.taskExecutionActivityPanel.hidden = true;
  elements.taskExecutionModeBadge.textContent = buildOperationsModeBadgeLabel(state.taskOperationsView);
  elements.taskExecutionPriorityTitle.textContent = t("operationsPriorityIdleTitle");
  elements.taskExecutionPrioritySummary.textContent = t("operationsPriorityIdleSummary");
  elements.taskExecutionPriorityBadge.textContent = t("operationsPriorityAutoBadge");
  elements.taskExecutionPriorityBadge.className = "badge badge--outline";
  elements.taskExecutionPriorityCaption.textContent = t("operationsPriorityAutoCaption");
  if (elements.taskDecisionTitle) {
    elements.taskDecisionTitle.textContent = t("taskDecisionTitleIdle");
  }
  if (elements.taskDecisionSummary) {
    elements.taskDecisionSummary.textContent = t("taskDecisionSummaryIdle");
  }
  if (elements.taskDecisionBadge) {
    elements.taskDecisionBadge.textContent = t("taskDecisionBadgeIdle");
    elements.taskDecisionBadge.className = "badge badge--outline";
  }
  if (elements.taskDecisionPillList) {
    elements.taskDecisionPillList.replaceChildren();
  }
  if (elements.taskPreviewReadinessBlocker) {
    elements.taskPreviewReadinessBlocker.textContent = t("previewReadinessBlockedWaiting");
  }
  if (elements.dashboardTeamList) {
    elements.dashboardTeamList.replaceChildren();
  }
  if (elements.dashboardTeamEmpty) {
    elements.dashboardTeamEmpty.hidden = false;
  }
  if (elements.dashboardTeamTaskBadge) {
    elements.dashboardTeamTaskBadge.textContent = `${t("dashboardTeamTaskBadge")} · ${t("dashboardTeamTaskIdle")}`;
  }
  elements.taskTeamEmpty.hidden = false;
  elements.taskTeamLeadMeta.textContent = "";
  elements.taskTeamLeadSummary.textContent = "";
  elements.taskTeamLeadStatus.textContent = t("leadSessionPending");
  elements.taskTeamLeadStatus.className = "badge badge--outline";
  if (elements.taskLeadSessionBadge) {
    elements.taskLeadSessionBadge.textContent = t("leadSessionNotStarted");
    elements.taskLeadSessionBadge.className = "badge badge--outline";
  }
  if (elements.taskLeadSessionSummary) {
    elements.taskLeadSessionSummary.textContent = t("leaderConversationDraftSummary");
  }
  if (elements.taskLeadSessionOutput) {
    elements.taskLeadSessionOutput.textContent = t("leaderConversationEmptyOutput");
  }
  if (elements.taskMessageBranchHint) {
    elements.taskMessageBranchHint.textContent = t("taskMessageBranchHint", { branch: "-" });
  }
  if (elements.taskMessageQueueStatus) {
    elements.taskMessageQueueStatus.textContent = t("taskMessageQueueIdle");
  }
  if (elements.taskMessageQueueList) {
    elements.taskMessageQueueList.replaceChildren();
    elements.taskMessageQueueList.hidden = true;
  }
  if (elements.taskMessageStopButton) {
    elements.taskMessageStopButton.hidden = true;
    elements.taskMessageStopButton.disabled = true;
    elements.taskMessageStopButton.textContent = t("taskMessageStopButton");
  }
  if (elements.taskLeaderPlanBadge) {
    elements.taskLeaderPlanBadge.textContent = t("executionPlanWaitingBadge");
    elements.taskLeaderPlanBadge.className = "badge badge--outline";
  }
  if (elements.taskLeaderPlanEyebrow) {
    elements.taskLeaderPlanEyebrow.textContent = t("executionPlanEyebrow");
  }
  if (elements.taskLeaderPlanTitle) {
    elements.taskLeaderPlanTitle.textContent = t("executionPlanTitle");
  }
  if (elements.taskLeaderPlanSummary) {
    elements.taskLeaderPlanSummary.textContent = t("executionPlanSummaryGenerating");
  }
  if (elements.taskLeaderPlanEmpty) {
    elements.taskLeaderPlanEmpty.textContent = t("executionPlanEmpty");
    elements.taskLeaderPlanEmpty.hidden = false;
  }
  if (elements.taskLeaderPlanLoading) {
    elements.taskLeaderPlanLoading.hidden = true;
  }
  if (elements.taskLeaderPlanLoadingLabel) {
    elements.taskLeaderPlanLoadingLabel.textContent = t("executionPlanLoadingLabel");
  }
  if (elements.taskLeaderPlanList) {
    elements.taskLeaderPlanList.replaceChildren();
  }
  if (elements.taskLeaderPlanCount) {
    elements.taskLeaderPlanCount.textContent = t("workspacePreviewCountPlan", { count: 0 });
  }
  if (elements.taskLeaderPlanGuide) {
    elements.taskLeaderPlanGuide.textContent = t("workspacePreviewGuideExecutionPlanPending");
  }
  if (elements.taskDocumentBadge) {
    elements.taskDocumentBadge.textContent = t("taskDocBadgeDraft");
    elements.taskDocumentBadge.className = "badge badge--outline";
  }
  if (elements.taskDocumentEyebrow) {
    elements.taskDocumentEyebrow.textContent = t("taskDocEyebrow");
  }
  if (elements.taskDocumentTitle) {
    elements.taskDocumentTitle.textContent = t("taskDocTitle");
  }
  if (elements.taskDocumentSummary) {
    elements.taskDocumentSummary.textContent = t("taskDocSummaryDraft");
  }
  if (elements.taskDocumentEmpty) {
    elements.taskDocumentEmpty.textContent = t("taskDocEmpty");
    elements.taskDocumentEmpty.hidden = false;
  }
  if (elements.taskDocumentLoading) {
    elements.taskDocumentLoading.hidden = true;
  }
  if (elements.taskDocumentLoadingLabel) {
    elements.taskDocumentLoadingLabel.textContent = t("taskDocLoadingLabel");
  }
  if (elements.taskDocumentList) {
    elements.taskDocumentList.replaceChildren();
  }
  if (elements.taskDocumentCount) {
    elements.taskDocumentCount.textContent = t("workspacePreviewCountDocument", { count: 0 });
  }
  if (elements.taskDocumentGuide) {
    elements.taskDocumentGuide.textContent = t("workspacePreviewGuideTaskDoc");
  }
  elements.taskTeamMemberCount.textContent = countLabel(0, "teamMemberCountOne", "teamMemberCountOther");
  if (elements.taskStageRail) {
    elements.taskStageRail.replaceChildren();
  }
  if (elements.taskNextActionTitle) {
    elements.taskNextActionTitle.textContent = t("taskNextDraftTitle");
  }
  if (elements.taskNextActionSummary) {
    elements.taskNextActionSummary.textContent = t("taskNextDraftSummary");
  }
  if (elements.taskNextActionBadge) {
    elements.taskNextActionBadge.textContent = t("statusDraft");
    elements.taskNextActionBadge.className = "badge badge--outline";
  }
  if (elements.taskNextActionButton) {
    elements.taskNextActionButton.textContent = t("startClarificationDraftLabel");
    elements.taskNextActionButton.dataset.action = "focus-compose";
  }
  if (elements.taskMessageLabel) {
    elements.taskMessageLabel.textContent = t("startClarificationDraftLabel");
  }
  if (elements.taskMessageInput) {
    elements.taskMessageInput.value = "";
    elements.taskMessageInput.setAttribute("placeholder", t("startClarificationDraftPlaceholder"));
  }
  if (elements.sendTaskMessageButton) {
    elements.sendTaskMessageButton.textContent = t("startClarificationDraftButton");
  }
  if (elements.taskTeamProjectBranch) {
    elements.taskTeamProjectBranch.textContent = t("currentBranchStat");
  }
  renderTaskCollections();
  elements.taskTeamMemberList.replaceChildren();
  elements.taskTeamShell.hidden = true;
  elements.taskExecutionFocus.hidden = true;
  elements.taskExecutionFocusPreview.hidden = true;
  elements.taskExecutionMailbox.hidden = true;
  elements.taskExecutionReview.hidden = true;
  elements.taskExecutionAgentField.hidden = true;
  elements.taskExecutionReviewActions.hidden = true;
  elements.taskExecutionReworkField.hidden = true;
  if (elements.taskActions) {
    elements.taskActions.hidden = true;
  }
  if (elements.confirmRequirementsButton) {
    elements.confirmRequirementsButton.hidden = true;
  }
  if (elements.taskMessageForm) {
    elements.taskMessageForm.hidden = true;
  }
  if (elements.taskWorkspaceActions) {
    elements.taskWorkspaceActions.hidden = true;
  }
  if (elements.taskWorkspacePauseButton) {
    elements.taskWorkspacePauseButton.hidden = true;
    elements.taskWorkspacePauseButton.disabled = true;
  }
  if (elements.taskWorkspaceDeleteButton) {
    elements.taskWorkspaceDeleteButton.disabled = true;
    elements.taskWorkspaceDeleteButton.title = "";
  }
  elements.taskExecutionMailboxInboxList.replaceChildren();
  elements.taskExecutionMailboxOutboxList.replaceChildren();
  elements.taskExecutionMailboxContractsList.replaceChildren();
  elements.taskExecutionMailboxBlockersList.replaceChildren();
  elements.taskExecutionMailboxInput.value = "";
  elements.taskExecutionMailboxArtifactRefsInput.value = "";
  elements.taskExecutionMailboxBranchRefInput.value = "";
  elements.taskExecutionMailboxFileRefsInput.value = "";
  elements.taskExecutionMailboxSchemaInput.value = "";
  elements.taskExecutionMailboxRequiresAckInput.checked = false;
  elements.taskExecutionMailboxSenderSelect.replaceChildren();
  elements.taskExecutionMailboxTargetSelect.replaceChildren();
  elements.taskExecutionMailboxMessageTypeSelect.replaceChildren();
  elements.taskExecutionSessionList.replaceChildren();
  elements.taskPlanHistoryList.replaceChildren();
  elements.taskPlanGraph.replaceChildren();
  elements.taskPlanList.replaceChildren();
  resetTaskPreviewUi();
}

function syncBranchChoices() {
  const repoStatus = state.projectDetail?.repoStatus;
  const branchChoices = uniqueBranches([
    repoStatus?.currentBranch,
    repoStatus?.defaultBranch,
    ...(repoStatus?.recentBranches ?? []),
  ]);

  if (branchChoices.length === 0) {
    state.baseBranchStartPoint = null;
    state.selectedExistingBaseBranch = null;
    state.selectedBaseBranch = null;
    renderBaseBranchComposer([]);
    return;
  }

  const preferredStartPoint = branchChoices.includes(state.baseBranchStartPoint)
    ? state.baseBranchStartPoint
    : repoStatus?.currentBranch ?? repoStatus?.defaultBranch ?? branchChoices[0];

  state.baseBranchStartPoint = preferredStartPoint;
  state.selectedExistingBaseBranch = branchChoices.includes(state.selectedExistingBaseBranch)
    ? state.selectedExistingBaseBranch
    : preferredStartPoint;

  if (!state.baseBranchDraftManual || !normalizeOptionalText(state.baseBranchDraftName)) {
    state.baseBranchDraftName = buildSuggestedTaskBaseBranchName(preferredStartPoint, elements.taskTitleInput?.value ?? "");
  }

  state.selectedBaseBranch = getSelectedTaskBaseBranch();
  renderBaseBranchComposer(branchChoices);
}

function renderBaseBranchComposer(branchChoices = []) {
  const hasBranches = branchChoices.length > 0;
  const createNewBranch = state.baseBranchMode !== "existing";
  const activeBranch = getSelectedTaskBaseBranch();
  state.selectedBaseBranch = activeBranch;

  syncSelectOptions(elements.baseBranchSelect, branchChoices, state.selectedExistingBaseBranch);
  syncSelectOptions(elements.baseBranchStartPointSelect, branchChoices, state.baseBranchStartPoint);

  if (elements.baseBranchSelect) {
    elements.baseBranchSelect.disabled = !hasBranches || createNewBranch;
  }

  if (elements.baseBranchStartPointSelect) {
    elements.baseBranchStartPointSelect.disabled = !hasBranches || !createNewBranch;
  }

  if (elements.baseBranchInput) {
    elements.baseBranchInput.disabled = !hasBranches || !createNewBranch;
    if (elements.baseBranchInput.value !== state.baseBranchDraftName) {
      elements.baseBranchInput.value = state.baseBranchDraftName;
    }
  }

  if (elements.baseBranchModeNewInput) {
    elements.baseBranchModeNewInput.checked = createNewBranch;
    elements.baseBranchModeNewInput.disabled = !hasBranches;
  }

  if (elements.baseBranchModeExistingInput) {
    elements.baseBranchModeExistingInput.checked = !createNewBranch;
    elements.baseBranchModeExistingInput.disabled = !hasBranches;
  }

  elements.baseBranchNewPanel.hidden = !createNewBranch;
  elements.baseBranchExistingPanel.hidden = createNewBranch;
  elements.baseBranchModeNewLabel?.classList.toggle("is-active", createNewBranch);
  elements.baseBranchModeExistingLabel?.classList.toggle("is-active", !createNewBranch);

  if (elements.baseBranchModeBadge) {
    elements.baseBranchModeBadge.textContent = createNewBranch
      ? t("baseBranchModeNewBadge")
      : t("baseBranchModeExistingBadge");
    elements.baseBranchModeBadge.className = `badge ${createNewBranch ? "badge--accent-soft" : "badge--outline"}`;
  }

  if (elements.taskCreateBranchSummary) {
    elements.taskCreateBranchSummary.textContent = !hasBranches
      ? t("noBranchesAvailable")
      : createNewBranch
        ? t("taskCreateFlowSummaryNew", {
            branch: activeBranch || t("unknown"),
            source: state.baseBranchStartPoint || t("unknown"),
          })
        : t("taskCreateFlowSummaryExisting", {
            branch: activeBranch || t("unknown"),
          });
  }

  renderTaskCreateFlowSummary();
  updateCreateTaskButtonState();
}

function renderTaskCreateFlowSummary() {
  if (!elements.taskCreateFlowSummary) {
    return;
  }

  elements.taskCreateFlowSummary.textContent = t("taskCreateFlowSummaryDraft");

  renderTaskCreateJourney();
}

function updateCreateTaskButtonState() {
  const selectedCandidate = state.leadCandidates.find((candidate) => candidate.agentName === state.selectedLeadAgentName) ?? null;
  const gate = buildLeadSelectionState(selectedCandidate);
  const hasBranch = Boolean(getSelectedTaskBaseBranch());
  elements.createTaskButton.disabled = gate.disabled || !state.selectedProjectId || !hasBranch;
}

function getSelectedTaskBaseBranch() {
  return state.baseBranchMode === "existing"
    ? normalizeOptionalText(state.selectedExistingBaseBranch)
    : normalizeOptionalText(state.baseBranchDraftName);
}

function renderTaskCreateJourney() {
  if (!elements.taskCreateJourneySteps) {
    return;
  }

  const steps = [
    { label: t("taskJourneyStepRegister"), state: state.selectedProjectId ? "done" : "current" },
    { label: t("taskJourneyStepTemplate"), state: state.selectedProjectId ? "done" : "later" },
    { label: t("taskJourneyStepCreate"), state: state.selectedProjectId ? "current" : "later" },
    { label: t("taskJourneyStepClarify"), state: state.selectedProjectId ? "next" : "later" },
    { label: t("taskJourneyStepPlanReview"), state: "later" },
    { label: t("taskJourneyStepExecute"), state: "later" },
  ];

  const copyKey = "taskCreateJourneySummaryStandard";
  const badgeKey = "taskCreateJourneyStandardBadge";

  if (elements.taskCreateRouteSummary) {
    elements.taskCreateRouteSummary.textContent = t(copyKey);
  }

  if (elements.taskCreateRouteBadge) {
    elements.taskCreateRouteBadge.textContent = t(badgeKey);
    elements.taskCreateRouteBadge.className = "badge badge--outline";
  }

  elements.taskCreateJourneySteps.replaceChildren(...steps.map((step, index) => {
    const item = document.createElement("div");
    item.className = `task-journey-step task-journey-step--${step.state}`;
    item.innerHTML = `
      <span class="task-journey-step__index">${escapeHtml(String(index + 1))}</span>
      <div class="task-journey-step__copy">
        <p class="task-journey-step__label">${escapeHtml(step.label)}</p>
        <span class="task-journey-step__state">${escapeHtml(t(resolveJourneyStateKey(step.state)))}</span>
      </div>
    `;
    return item;
  }));
}

function resolveJourneyStateKey(stateKey) {
  switch (stateKey) {
    case "done":
      return "taskJourneyStateDone";
    case "current":
      return "taskJourneyStateCurrent";
    case "next":
      return "taskJourneyStateNext";
    default:
      return "taskJourneyStateLater";
  }
}

function isPausedTask(task) {
  return task?.status === "ACTION_REQUIRED"
    && typeof task?.lastError === "string"
    && task.lastError.startsWith(TASK_PAUSED_REASON_PREFIX);
}

function canPauseTask(task) {
  return [
    "CLARIFYING",
    "EXECUTING",
    "MERGING",
    "PLANNING",
    "PLAN_REVIEW",
    "REVIEWING",
  ].includes(task?.status);
}

function canDeleteTask(task) {
  return [
    "CANCELLED",
    "COMPLETED",
    "DRAFT",
    "FAILED",
  ].includes(task?.status) || isPausedTask(task);
}

function buildTaskDisplayStatusLabel(task) {
  return isPausedTask(task) ? t("taskPausedStatusLabel") : buildTaskStatusLabel(task?.status);
}

function isTaskLifecycleActive(status) {
  return [
    "ACTION_REQUIRED",
    "CLARIFYING",
    "DRAFT",
    "EXECUTING",
    "MERGING",
    "PLANNING",
    "PLAN_REVIEW",
    "REVIEWING",
  ].includes(status);
}

function buildTaskStageMeta(task) {
  const status = task?.status ?? "DRAFT";

  if (isPausedTask(task)) {
    return {
      badgeClass: "badge--paused",
      buttonAction: "refresh",
      buttonLabel: t("refreshTaskButton"),
      currentStep: 3,
      listHint: t("taskListHintPaused"),
      summary: t("taskNextPausedSummary"),
      title: t("taskNextPausedTitle"),
    };
  }

  switch (status) {
    case "CLARIFYING":
      return {
        badgeClass: "badge--accent-soft",
        buttonAction: "confirm",
        buttonLabel: t("confirmRequirementsButton"),
        currentStep: 1,
        listHint: t("taskListHintClarifying"),
        summary: t("taskNextClarifyingSummary"),
        title: t("taskNextClarifyingTitle"),
      };
    case "PLANNING":
      return {
        badgeClass: "badge--outline",
        buttonAction: "refresh",
        buttonLabel: t("refreshTaskButton"),
        currentStep: 2,
        listHint: t("taskListHintPlanning"),
        summary: t("taskNextPlanningSummary"),
        title: t("taskNextPlanningTitle"),
      };
    case "PLAN_REVIEW":
      return {
        badgeClass: "badge--clean",
        buttonAction: "plan",
        buttonLabel: t("navPlan"),
        currentStep: 2,
        listHint: t("taskListHintPlanReview"),
        summary: t("taskNextPlanReviewSummary"),
        title: t("taskNextPlanReviewTitle"),
      };
    case "EXECUTING":
    case "REVIEWING":
    case "MERGING":
      return {
        badgeClass: "badge--clean",
        buttonAction: "ops",
        buttonLabel: t("navOps"),
        currentStep: 3,
        listHint: t("taskListHintExecuting"),
        summary: t("taskNextExecutingSummary"),
        title: t("taskNextExecutingTitle"),
      };
    case "ACTION_REQUIRED":
      return {
        badgeClass: "badge--dirty",
        buttonAction: "ops",
        buttonLabel: t("navOps"),
        currentStep: 3,
        listHint: t("taskListHintActionRequired"),
        summary: t("taskNextActionRequiredSummary"),
        title: t("taskNextActionRequiredTitle"),
      };
    case "COMPLETED":
      return {
        badgeClass: "badge--clean",
        buttonAction: "ops",
        buttonLabel: t("navOps"),
        currentStep: 3,
        listHint: t("taskListHintCompleted"),
        summary: t("taskNextCompletedSummary"),
        title: t("taskNextCompletedTitle"),
      };
    case "FAILED":
    case "CANCELLED":
      return {
        badgeClass: "badge--dirty",
        buttonAction: "ops",
        buttonLabel: t("navOps"),
        currentStep: 3,
        listHint: t("taskListHintFailed"),
        summary: t("taskNextFailedSummary"),
        title: t("taskNextFailedTitle"),
      };
    case "DRAFT":
    default:
      return {
        badgeClass: "badge--outline",
        buttonAction: "focus-compose",
        buttonLabel: t("startClarificationDraftLabel"),
        currentStep: 0,
        listHint: t("taskListHintDraft"),
        summary: t("taskNextDraftSummary"),
        title: t("taskNextDraftTitle"),
      };
  }
}

function buildTaskStatusBadgeClass(taskOrStatus) {
  const task = typeof taskOrStatus === "string" ? { status: taskOrStatus } : taskOrStatus;
  const status = typeof taskOrStatus === "string" ? taskOrStatus : taskOrStatus?.status;

  if (isPausedTask(task)) {
    return "badge--paused";
  }

  switch (status) {
    case "CLARIFYING":
      return "badge--accent-soft";
    case "PLAN_REVIEW":
    case "PLANNING":
    case "EXECUTING":
    case "REVIEWING":
    case "MERGING":
    case "COMPLETED":
      return "badge--clean";
    case "ACTION_REQUIRED":
    case "FAILED":
    case "CANCELLED":
      return "badge--dirty";
    default:
      return "badge--outline";
  }
}

function buildTaskAutomationLoop(detail, preview) {
  const task = detail?.task ?? null;
  const subTasks = detail?.subTasks ?? [];
  const acceptanceModel = buildTaskAcceptanceModel(detail, preview);
  const workflow = detail?.board?.workflow ?? {
    ...acceptanceModel.workflow,
    completed: 0,
    total: subTasks.length,
    waiting: 0,
  };
  const latestIntegrationRun = detail?.integration?.latestRun ?? null;
  const parsedPlan = parseCurrentPlanJson(task?.currentPlanJson);
  const planNodeCount = getPlanNodes(parsedPlan).length;
  const previewTargets = acceptanceModel.previewTargets;
  const appRoots = acceptanceModel.appRoots;
  const previewSession = acceptanceModel.previewSession;
  const reviewSettled = acceptanceModel.reviewSettled;
  const mergeTracked = acceptanceModel.mergeTracked;
  const deliveryAutoRunning = task?.status === "EXECUTING" || ((detail?.board?.summary?.running ?? 0) > 0);
  const acceptanceReady = acceptanceModel.acceptanceReady;
  const steps = [
    {
      label: t("automationStepIntake"),
      note: task?.createdAt ? formatTimestamp(task.createdAt) : buildTaskDisplayStatusLabel(task),
      state: "done",
    },
    {
      label: t("automationStepClarify"),
      note: task?.status === "DRAFT" ? t("taskNextDraftSummary") : t("taskNextClarifyingSummary"),
      state: task?.status === "DRAFT"
        ? "next"
        : task?.status === "CLARIFYING"
          ? "current"
          : "done",
    },
    {
      label: t("automationStepScope"),
      note: task?.status === "CLARIFYING"
        ? t("taskNextClarifyingSummary")
        : t("workspacePreviewGuideTaskDocConfirmed"),
      state: task?.status === "CLARIFYING"
        ? "attention"
        : ["PLANNING", "PLAN_REVIEW", "EXECUTING", "REVIEWING", "MERGING", "ACTION_REQUIRED", "COMPLETED", "FAILED", "CANCELLED"].includes(task?.status)
          ? "done"
          : "waiting",
    },
    {
      label: t("automationStepPlan"),
      note: planNodeCount > 0 ? t("workspaceHubPlanSummaryReady") : t("workspaceHubPlanSummaryIdle"),
      state: task?.status === "PLANNING"
        ? "current"
        : planNodeCount > 0 || ["PLAN_REVIEW", "EXECUTING", "REVIEWING", "MERGING", "ACTION_REQUIRED", "COMPLETED", "FAILED", "CANCELLED"].includes(task?.status)
          ? "done"
          : "waiting",
    },
    {
      label: t("automationStepApprove"),
      note: subTasks.length > 0 ? t("workspaceHubPlanSummaryReady") : t("workspaceHubPlanSummaryReview"),
      state: task?.status === "PLAN_REVIEW"
        ? "attention"
        : subTasks.length > 0 || Boolean(task?.approvedPlanJson)
          ? "done"
          : "waiting",
    },
    {
      label: t("automationStepMaterialize"),
      note: subTasks.length > 0 ? t("workspaceHubDeliveryCount", { count: subTasks.length }) : t("workspaceHubDeliverySummaryIdle"),
      state: subTasks.length > 0 ? "done" : "waiting",
    },
    {
      label: t("automationStepExecute"),
      note: workflow.manualAttentionCount > 0
        ? t("automationSummaryGate", { count: workflow.manualAttentionCount })
        : deliveryAutoRunning
          ? t("workspaceHubDeliverySummaryActive", {
              completed: workflow.completed ?? 0,
              running: detail?.board?.summary?.running ?? 0,
              total: workflow.total ?? subTasks.length,
              waiting: workflow.waiting ?? 0,
            })
          : t("automationSummaryAuto"),
      state: workflow.manualAttentionCount > 0
        ? "attention"
        : deliveryAutoRunning
          ? "current"
          : subTasks.length > 0 && ["REVIEWING", "MERGING", "COMPLETED"].includes(task?.status)
            ? "done"
            : subTasks.length > 0
              ? "next"
              : "waiting",
    },
    {
      label: t("automationStepFinalReview"),
      note: reviewSettled ? t("previewReadinessHintReviewReady") : t("previewReadinessHintReview"),
      state: task?.status === "REVIEWING"
        ? "current"
        : reviewSettled
          ? "done"
          : subTasks.length > 0
            ? "next"
            : "waiting",
    },
    {
      label: t("automationStepMerge"),
      note: mergeTracked
        ? t("previewReadinessHintMergeReady", {
            status: latestIntegrationRun ? buildIntegrationRunStatusLabel(latestIntegrationRun.status) : buildTaskDisplayStatusLabel(task),
          })
        : t("previewReadinessHintMerge"),
      state: task?.status === "MERGING" || ["QUEUED", "RUNNING"].includes(latestIntegrationRun?.status)
        ? "current"
        : task?.status === "COMPLETED" || latestIntegrationRun?.status === "COMPLETED"
          ? "done"
          : workflow.manualAttentionCount > 0 && ["ACTION_REQUIRED", "FAILED", "ROLLED_BACK"].includes(latestIntegrationRun?.status)
            ? "attention"
            : reviewSettled
              ? "next"
              : "waiting",
    },
    {
      label: t("automationStepAcceptance"),
      note: previewSession?.status === "RUNNING"
        ? t("previewReadinessHintRunningReady", {
            status: buildPreviewSessionStatusLabel(previewSession.status),
          })
        : previewTargets.length > 0
          ? t("previewReadinessHintTargetsReady", {
              label: preview?.recommendation?.label ?? previewTargets[0]?.label ?? t("workspaceHubPreviewTargetFallback"),
            })
          : t("previewReadinessHintTargets"),
      state: previewSession?.status === "RUNNING"
        ? "current"
        : task?.status === "COMPLETED" && previewSession?.status === "STOPPED"
          ? "ready"
          : acceptanceReady
            ? "ready"
            : previewTargets.length > 0
              ? "next"
              : "waiting",
    },
  ];
  const completedCount = steps.filter((step) => step.state === "done").length;
  let badgeLabel = t("automationBadgeAuto");
  let badgeClass = "badge--accent-soft";
  let summary = t("automationSummaryAuto");

  if (workflow.manualAttentionCount > 0) {
    badgeLabel = t("automationBadgeGate");
    badgeClass = "badge--dirty";
    summary = t("automationSummaryGate", { count: workflow.manualAttentionCount });
  } else if (previewSession?.status === "RUNNING" || acceptanceReady) {
    badgeLabel = t("automationBadgeAccept");
    badgeClass = "badge--clean";
    summary = t("automationSummaryAccept");
  } else if (task?.status === "COMPLETED") {
    badgeLabel = t("automationBadgeDone");
    badgeClass = "badge--clean";
    summary = t("automationSummaryDone");
  }

  return {
    badgeClass,
    badgeLabel,
    completedCount,
    summary,
    totalSteps: steps.length,
    steps,
  };
}

function buildTaskStagePrimaryAction(detail, automationModel, fallbackMeta) {
  const acceptanceModel = buildTaskAcceptanceModel(detail, state.taskPreview);
  const previewTargets = acceptanceModel.previewTargets;
  const previewSession = acceptanceModel.previewSession;

  if (previewSession?.status === "RUNNING") {
    return {
      ...fallbackMeta,
      badgeClass: "badge--clean",
      buttonAction: "preview",
      buttonLabel: t("workspaceHubPreviewButton"),
      summary: t("taskDecisionSummaryLive"),
      title: t("workspaceHubPreviewTitleRunning"),
    };
  }

  if (acceptanceModel.acceptanceReady && previewTargets.length > 0) {
    return {
      ...fallbackMeta,
      badgeClass: "badge--clean",
      buttonAction: "preview",
      buttonLabel: t("workspaceHubPreviewButton"),
      summary: t("taskDecisionSummaryReady"),
      title: t("workspaceHubPreviewTitleIdle"),
    };
  }

  return fallbackMeta;
}

function buildAutomationStepStateLabel(state) {
  switch (state) {
    case "done":
      return t("automationStateDone");
    case "current":
      return t("automationStateActive");
    case "attention":
      return t("automationStateGate");
    case "ready":
      return t("automationStateReady");
    default:
      return t("automationStateWaiting");
  }
}

function renderTaskStageBoard(detail) {
  const task = detail?.task;

  if (!task || !elements.taskStageRail) {
    return;
  }

  const automationModel = buildTaskAutomationLoop(detail, state.taskPreview);
  const meta = buildTaskStagePrimaryAction(detail, automationModel, buildTaskStageMeta(task));
  const decisionModel = buildTaskDecisionModel(detail, state.taskPreview);

  elements.taskStageRail.hidden = false;
  elements.taskStageRail.replaceChildren(...automationModel.steps.map((step, index) => {
    const item = document.createElement("div");
    const stepLabel = step.label ?? "";
    const stepStateLabel = buildAutomationStepStateLabel(step.state);
    const stepNote = step.note ?? automationModel.summary ?? "";
    item.className = `task-stage-step task-stage-step--${step.state === "ready" ? "next" : step.state}${["done", "waiting"].includes(step.state) ? " is-muted" : ""}`;
    item.innerHTML = `
      <span class="task-stage-step__index">${escapeHtml(String(index + 1))}</span>
      <div class="task-stage-step__copy">
        <p class="task-stage-step__label" title="${escapeHtmlAttribute(stepLabel)}">${escapeHtml(stepLabel)}</p>
        <span class="task-stage-step__state">${escapeHtml(stepStateLabel)}</span>
        <p class="task-stage-step__note" title="${escapeHtmlAttribute(stepNote)}">${escapeHtml(stepNote)}</p>
      </div>
    `;
    return item;
  }));

  elements.taskNextActionTitle.textContent = meta.title;
  elements.taskNextActionSummary.textContent = `${meta.summary ?? decisionModel.summary ?? automationModel.summary} ${t("previewReadinessProgress", {
    done: automationModel.completedCount,
    total: automationModel.totalSteps,
  })}`;
  elements.taskNextActionBadge.textContent = automationModel.badgeLabel;
  elements.taskNextActionBadge.className = `badge ${automationModel.badgeClass}`;
  elements.taskNextActionButton.textContent = meta.buttonLabel;
  elements.taskNextActionButton.dataset.action = meta.buttonAction;
  elements.taskNextActionButton.hidden = false;
  renderTaskDecisionCard(detail);
}

async function onTaskNextAction() {
  const action = elements.taskNextActionButton?.dataset.action;

  if (!action || !state.taskDetail?.task) {
    return;
  }

  const busyLabel = action === "start"
    ? t("starting")
    : action === "confirm"
      ? t("confirming")
      : action === "refresh"
        ? t("refreshing")
        : null;

  if (busyLabel) {
    setButtonBusy(elements.taskNextActionButton, true, busyLabel);
  }

  if (action === "start") {
    try {
      await onStartClarification();
    } finally {
      renderTaskStageBoard(state.taskDetail);
    }
    return;
  }

  if (action === "focus-compose") {
    elements.taskMessageInput?.focus();
    elements.taskMessageInput?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (action === "confirm") {
    try {
      await onConfirmRequirements();
    } finally {
      renderTaskStageBoard(state.taskDetail);
    }
    return;
  }

  if (action === "plan") {
    switchView("workspace");
    elements.taskHubPlanOpenButton?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (action === "ops") {
    switchView("workspace");
    elements.taskHubDeliveryOpenButton?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (action === "preview") {
    focusTaskPreviewStudio();
    return;
  }

  if (action === "refresh" && state.selectedTaskId) {
    try {
      await loadTaskDetail(state.selectedTaskId);
    } finally {
      renderTaskStageBoard(state.taskDetail);
    }
  }
}

function onTaskPreviewPresetChange() {
  if (elements.taskPreviewCommandInput) {
    elements.taskPreviewCommandInput.dataset.autoFilled = "true";
  }
  if (elements.taskPreviewPortInput) {
    elements.taskPreviewPortInput.dataset.autoFilled = "true";
  }
  if (elements.taskPreviewPathInput) {
    elements.taskPreviewPathInput.dataset.autoFilled = "true";
  }
  if (state.taskDetail) {
    renderTaskPreview(state.taskDetail);
  }
}

async function onStartTaskPreview(event) {
  event?.preventDefault?.();

  if (!state.selectedTaskId) {
    return;
  }

  clearFeedback(elements.taskPreviewFeedback);
  setButtonBusy(elements.taskPreviewStartButton, true, t("starting"));

  try {
    const body = {
      appRoot: normalizeOptionalText(elements.taskPreviewAppRootSelect?.value),
      command: normalizeOptionalText(elements.taskPreviewCommandInput?.value),
      path: normalizePreviewPath(elements.taskPreviewPathInput?.value),
      port: normalizePreviewPort(elements.taskPreviewPortInput?.value),
      targetId: normalizeOptionalText(elements.taskPreviewTargetSelect?.value),
    };
    const response = await fetchJson(`/api/tasks/${encodeURIComponent(state.selectedTaskId)}/preview/start`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    });
    state.taskPreview = response?.preview ?? null;
    renderTaskPreview(state.taskDetail);
    scheduleTaskPreviewPoll();
  } catch (error) {
    showFeedback(elements.taskPreviewFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.taskPreviewStartButton, false, t("previewStartButton"));
  }
}

async function onRestartTaskPreview() {
  if (!state.selectedTaskId) {
    return;
  }

  await onStartTaskPreview({
    preventDefault() {},
  });
}

async function onStopTaskPreview() {
  if (!state.selectedTaskId) {
    return;
  }

  clearFeedback(elements.taskPreviewFeedback);
  setButtonBusy(elements.taskPreviewStopButton, true, t("stopping"));

  try {
    const response = await fetchJson(`/api/tasks/${encodeURIComponent(state.selectedTaskId)}/preview/stop`, {
      method: "POST",
    });
    state.taskPreview = response?.preview ?? null;
    clearTaskPreviewPoll();
    renderTaskPreview(state.taskDetail);
  } catch (error) {
    showFeedback(elements.taskPreviewFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.taskPreviewStopButton, false, t("previewStopButton"));
  }
}

function buildSuggestedTaskBaseBranchName(sourceBranch, title) {
  const sourceSegment = sanitizeBranchSegment(sourceBranch) || "base";
  const titleSegment = sanitizeBranchSegment(title) || "workspace";
  return `task/${sourceSegment}/${titleSegment}`;
}

function sanitizeBranchSegment(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

function syncSelectOptions(select, values, selectedValue) {
  if (!select) {
    return;
  }

  select.replaceChildren();

  if (values.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("noBranchesAvailable");
    select.append(option);
    return;
  }

  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.selected = value === selectedValue;
    option.textContent = value;
    select.append(option);
  }
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
      task.lastError = payload.reason ?? null;
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
  stream.addEventListener("integration:queued", () => {
    void loadTaskDetail(taskId, { preserveStream: true });
  });
  stream.addEventListener("integration:started", () => {
    void loadTaskDetail(taskId, { preserveStream: true });
  });
  stream.addEventListener("integration:gate-result", () => {
    void loadTaskDetail(taskId, { preserveStream: true });
  });
  stream.addEventListener("integration:completed", () => {
    void loadTaskDetail(taskId, { preserveStream: true });
  });
  stream.addEventListener("integration:failed", () => {
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
  const normalizedPersistedFingerprint = persistedDraft
    ? JSON.stringify(normalizePlanDraft(persistedDraft.draft))
    : null;
  const canReusePersistedDraft = persistedDraft
    && (
      (
        persistedDraft.serverFingerprint === serverFingerprint
        && persistedDraft.taskUpdatedAt === detail.task.updatedAt
      )
      || normalizedPersistedFingerprint === serverFingerprint
    );

  const hasUnsavedPersistedDraft = persistedDraft
    && normalizedPersistedFingerprint !== persistedDraft.serverFingerprint
    && normalizedPersistedFingerprint !== serverFingerprint;

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
  if (view !== "graph") {
    return;
  }

  state.taskPlanView = view;
  renderPlanDraft(state.taskDetail);
}

function onSetTaskOperationsView(view) {
  if (!["activity", "graph", "list"].includes(view)) {
    return;
  }

  state.taskOperationsView = view;
  renderTaskDetail();
}

async function onStartIntegrationRun() {
  if (!state.taskDetail?.task?.id) {
    return;
  }

  setButtonBusy(elements.taskIntegrationStartButton, true, t("starting"));

  try {
    await fetchJson(`/api/tasks/${encodeURIComponent(state.taskDetail.task.id)}/integration-runs`, {
      method: "POST",
    });
    await loadTaskDetail(state.taskDetail.task.id, { preserveStream: true });
  } finally {
    setButtonBusy(elements.taskIntegrationStartButton, false, t("integrationStartButton"));
  }
}

async function onRetryIntegrationRun() {
  const integrationRunId = state.taskDetail?.integration?.latestRun?.id;

  if (!integrationRunId || !state.taskDetail?.task?.id) {
    return;
  }

  setButtonBusy(elements.taskIntegrationRetryButton, true, t("restoring"));

  try {
    await fetchJson(`/api/integration-runs/${encodeURIComponent(integrationRunId)}/retry`, {
      method: "POST",
    });
    await loadTaskDetail(state.taskDetail.task.id, { preserveStream: true });
  } finally {
    setButtonBusy(elements.taskIntegrationRetryButton, false, t("integrationRetryButton"));
  }
}

async function onRollbackIntegrationRun() {
  const integrationRunId = state.taskDetail?.integration?.latestRun?.id;

  if (!integrationRunId || !state.taskDetail?.task?.id) {
    return;
  }

  setButtonBusy(elements.taskIntegrationRollbackButton, true, t("restoring"));

  try {
    await fetchJson(`/api/integration-runs/${encodeURIComponent(integrationRunId)}/rollback`, {
      method: "POST",
    });
    await loadTaskDetail(state.taskDetail.task.id, { preserveStream: true });
  } finally {
    setButtonBusy(elements.taskIntegrationRollbackButton, false, t("integrationRollbackButton"));
  }
}

async function onDequeueIntegrationQueueItem(integrationQueueItemId) {
  if (!integrationQueueItemId || !state.taskDetail?.task?.id) {
    return;
  }

  await fetchJson(`/api/integration-queue-items/${encodeURIComponent(integrationQueueItemId)}/dequeue`, {
    method: "POST",
  });
  await loadTaskDetail(state.taskDetail.task.id, { preserveStream: true });
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
    const sender = parseMailboxParticipantKey(elements.taskExecutionMailboxSenderSelect.value);
    const target = parseMailboxParticipantKey(elements.taskExecutionMailboxTargetSelect.value);
    const schemaJson = parseMailboxSchemaInput(elements.taskExecutionMailboxSchemaInput.value);
    const response = await fetchJson(`/api/tasks/${encodeURIComponent(state.selectedTaskId)}/mailbox`, {
      body: {
        artifactRefs: splitMailboxRefs(elements.taskExecutionMailboxArtifactRefsInput.value),
        branchRef: normalizeOptionalText(elements.taskExecutionMailboxBranchRefInput.value),
        content: elements.taskExecutionMailboxInput.value.trim(),
        fileRefs: splitMailboxRefs(elements.taskExecutionMailboxFileRefsInput.value),
        messageType: elements.taskExecutionMailboxMessageTypeSelect.value || "NOTE",
        requiresAck: elements.taskExecutionMailboxRequiresAckInput.checked,
        schemaJson,
        senderSubTaskId: sender.subTaskId,
        targetSubTaskId: target.subTaskId,
        targetType: target.type,
      },
      method: "POST",
    });

    if (state.taskDetail) {
      state.taskDetail.mailboxMessages = upsertRecord(state.taskDetail.mailboxMessages, response.message);
    }

    elements.taskExecutionMailboxInput.value = "";
    elements.taskExecutionMailboxArtifactRefsInput.value = "";
    elements.taskExecutionMailboxBranchRefInput.value = "";
    elements.taskExecutionMailboxFileRefsInput.value = "";
    elements.taskExecutionMailboxSchemaInput.value = "";
    elements.taskExecutionMailboxRequiresAckInput.checked = false;
    elements.taskExecutionMailboxSenderSelect.value = "LEAD";
    elements.taskExecutionMailboxTargetSelect.value = `SUBTASK:${selectedSubTask.id}`;
    elements.taskExecutionMailboxMessageTypeSelect.value = "NOTE";
    renderTaskDetail();
    showFeedback(elements.taskExecutionMailboxFeedback, "success", t("structuredHandoffSent"));
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
    signal: options.signal,
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
  updateSidebarAgentCount();

  if (state.projectDetail) {
    renderProjectDetail();
  }

  if (state.taskDetail) {
    renderTaskDetail();
  }

  if (state.taskActionDialogState) {
    renderTaskActionDialog();
  }
}

function renderLocale() {
  document.documentElement.lang = state.locale;
  document.title = t("brandName");
  if (elements.languageToggle) {
    elements.languageToggle.textContent = state.locale === "zh-CN" ? "English" : "中文";
    const label = state.locale === "zh-CN" ? t("switchToEnglish") : t("switchToChinese");
    elements.languageToggle.setAttribute("aria-label", label);
    elements.languageToggle.setAttribute("title", label);
  }

  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }

  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  }

  for (const node of document.querySelectorAll("[data-i18n-html]")) {
    node.innerHTML = t(node.dataset.i18nHtml);
  }

  applyLayoutChrome();
  renderGuidedTaskComposer();
  renderProjectRegistrationDialog();
}

function applyLayoutChrome() {
  document.body.classList.toggle("layout--nav-collapsed", state.navCollapsed);
  document.body.classList.toggle("layout--sidebar-collapsed", state.sidebarCollapsed);

  for (const tab of elements.topnavTabs) {
    const label = tab.querySelector(".topnav__tab-label")?.textContent?.trim();
    if (!label) continue;
    tab.setAttribute("title", label);
    tab.setAttribute("aria-label", label);
  }

  if (elements.topnavCollapseToggle) {
    const label = t(state.navCollapsed ? "expandNavButton" : "collapseNavButton");
    elements.topnavCollapseToggle.setAttribute("aria-label", label);
    elements.topnavCollapseToggle.setAttribute("title", label);
  }

  if (elements.topnavCollapseIcon) {
    elements.topnavCollapseIcon.textContent = state.navCollapsed ? "unfold_more" : "unfold_less";
  }

  if (elements.sidebarCollapseToggle) {
    const label = t(state.sidebarCollapsed ? "expandSidebarButton" : "collapseSidebarButton");
    elements.sidebarCollapseToggle.setAttribute("aria-label", label);
    elements.sidebarCollapseToggle.setAttribute("title", label);
  }

  if (elements.sidebarCollapseIcon) {
    elements.sidebarCollapseIcon.textContent = state.sidebarCollapsed ? "right_panel_open" : "left_panel_close";
  }

  if (elements.sidebarRegisterToggle) {
    const label = t("sidebarRegisterButton");
    elements.sidebarRegisterToggle.setAttribute("aria-label", label);
    elements.sidebarRegisterToggle.setAttribute("title", label);
  }
}

function showFeedback(element, tone, message) {
  if (!element) return;
  element.textContent = message;
  element.className = `feedback feedback--${tone} is-visible`;
}

function clearFeedback(element) {
  if (!element) return;
  element.textContent = "";
  element.className = "feedback";
}

function setButtonBusy(button, busy, label) {
  if (!button) return;
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

function readBooleanStorage(key, fallback) {
  const value = readStorage(key);
  if (value === null) {
    return fallback;
  }
  return value === "true";
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
    ?? [...subTasks].sort((left, right) => buildExecutionSelectionPriority(left) - buildExecutionSelectionPriority(right))[0]
    ?? null;

  state.selectedExecutionSubTaskId = nextSubTask?.id ?? null;
  state.selectedExecutionSessionId = resolveFocusedSession(detail, state.selectedExecutionSubTaskId)?.id ?? null;
}

function buildExecutionSelectionPriority(subTask) {
  switch (subTask?.status) {
    case "RUNNING":
      return 1;
    case "FAILED":
      return 2;
    case "REVIEW_PENDING":
      return 3;
    case "REWORK_REQUIRED":
    case "DISCARD_PENDING":
      return 4;
    case "BLOCKED":
      return 5;
    case "READY":
      return 6;
    case "PENDING":
      return 7;
    case "ACCEPTED":
      return 8;
    case "MERGED":
      return 9;
    default:
      return 10;
  }
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
  const draft = readMailboxDraft(subTask);
  const mailboxMessages = (detail.mailboxMessages ?? []).filter((message) => (
    message.targetSubTaskId === subTask.id
    || message.senderSubTaskId === subTask.id
  ));
  const inboxMessages = mailboxMessages.filter((message) => message.targetSubTaskId === subTask.id);
  const outboxMessages = mailboxMessages.filter((message) => message.senderSubTaskId === subTask.id);
  const contractMessages = mailboxMessages.filter((message) => MAILBOX_CONTRACT_MESSAGE_TYPES.has(message.messageType));
  const blockerMessages = mailboxMessages.filter((message) => MAILBOX_BLOCKER_MESSAGE_TYPES.has(message.messageType));
  const canSendMailbox = ["ACTION_REQUIRED", "EXECUTING", "MERGING", "REVIEWING"].includes(detail.task?.status);

  elements.taskExecutionMailbox.hidden = !subTask;
  elements.taskExecutionMailboxForm.hidden = !canSendMailbox;
  elements.taskExecutionMailboxCount.textContent = countLabel(mailboxMessages.length, "noteCountOne", "noteCountOther");
  elements.taskExecutionMailboxEmpty.hidden = mailboxMessages.length > 0;
  renderMailboxStream(detail, elements.taskExecutionMailboxInboxList, elements.taskExecutionMailboxInboxEmpty, inboxMessages);
  renderMailboxStream(detail, elements.taskExecutionMailboxOutboxList, elements.taskExecutionMailboxOutboxEmpty, outboxMessages);
  renderMailboxStream(detail, elements.taskExecutionMailboxContractsList, elements.taskExecutionMailboxContractsEmpty, contractMessages);
  renderMailboxStream(detail, elements.taskExecutionMailboxBlockersList, elements.taskExecutionMailboxBlockersEmpty, blockerMessages);

  renderMailboxComposer(detail, subTask, draft);
}

function readMailboxDraft(subTask) {
  return {
    artifactRefs: elements.taskExecutionMailboxArtifactRefsInput.value,
    branchRef: elements.taskExecutionMailboxBranchRefInput.value,
    content: elements.taskExecutionMailboxInput.value,
    fileRefs: elements.taskExecutionMailboxFileRefsInput.value,
    messageType: elements.taskExecutionMailboxMessageTypeSelect.value || "NOTE",
    requiresAck: elements.taskExecutionMailboxRequiresAckInput.checked,
    schemaText: elements.taskExecutionMailboxSchemaInput.value,
    senderKey: elements.taskExecutionMailboxSenderSelect.value || "LEAD",
    targetKey: elements.taskExecutionMailboxTargetSelect.value || `SUBTASK:${subTask.id}`,
  };
}

function renderMailboxComposer(detail, subTask, draft) {
  const senderOptions = [
    { value: "LEAD", label: buildMailboxParticipantOptionLabel(detail, null, true) },
    ...(detail.subTasks ?? []).map((member) => ({
      value: `SUBTASK:${member.id}`,
      label: buildMailboxParticipantOptionLabel(detail, member.id, false),
    })),
  ];
  const senderValues = new Set(senderOptions.map((option) => option.value));
  const senderKey = senderValues.has(draft.senderKey) ? draft.senderKey : "LEAD";
  const targetOptions = buildMailboxTargetOptions(detail, senderKey, subTask.id);
  const targetValues = new Set(targetOptions.map((option) => option.value));
  const defaultTargetKey = buildDefaultMailboxTargetKey(senderKey, subTask.id);
  const targetKey = targetValues.has(draft.targetKey)
    ? draft.targetKey
    : targetValues.has(defaultTargetKey)
      ? defaultTargetKey
      : targetOptions[0]?.value ?? "";

  renderSelectOptions(elements.taskExecutionMailboxSenderSelect, senderOptions, senderKey);
  renderSelectOptions(elements.taskExecutionMailboxTargetSelect, targetOptions, targetKey);
  renderSelectOptions(
    elements.taskExecutionMailboxMessageTypeSelect,
    MAILBOX_MESSAGE_TYPE_OPTIONS.map((type) => ({
      value: type,
      label: buildMailboxMessageTypeLabel(type),
    })),
    MAILBOX_MESSAGE_TYPE_OPTIONS.includes(draft.messageType) ? draft.messageType : "NOTE",
  );

  elements.taskExecutionMailboxBranchRefInput.value = draft.branchRef ?? "";
  elements.taskExecutionMailboxArtifactRefsInput.value = draft.artifactRefs ?? "";
  elements.taskExecutionMailboxFileRefsInput.value = draft.fileRefs ?? "";
  elements.taskExecutionMailboxSchemaInput.value = draft.schemaText ?? "";
  elements.taskExecutionMailboxRequiresAckInput.checked = Boolean(draft.requiresAck);
  elements.taskExecutionMailboxInput.value = draft.content ?? "";
}

function buildMailboxTargetOptions(detail, senderKey, selectedSubTaskId) {
  const sender = parseMailboxParticipantKey(senderKey);

  if (sender.type === "LEAD") {
    return (detail.subTasks ?? []).map((member) => ({
      value: `SUBTASK:${member.id}`,
      label: buildMailboxParticipantOptionLabel(detail, member.id, false),
    }));
  }

  return [
    { value: "LEAD", label: t("mailboxToLeadOption") },
    ...(detail.subTasks ?? [])
      .filter((member) => member.id !== sender.subTaskId)
      .map((member) => ({
        value: `SUBTASK:${member.id}`,
        label: buildMailboxParticipantOptionLabel(detail, member.id, false),
      })),
  ].sort((left, right) => {
    if (left.value === `SUBTASK:${selectedSubTaskId}`) {
      return -1;
    }

    if (right.value === `SUBTASK:${selectedSubTaskId}`) {
      return 1;
    }

    return left.label.localeCompare(right.label);
  });
}

function buildDefaultMailboxTargetKey(senderKey, selectedSubTaskId) {
  const sender = parseMailboxParticipantKey(senderKey);
  return sender.type === "LEAD" ? `SUBTASK:${selectedSubTaskId}` : "LEAD";
}

function renderSelectOptions(element, options, selectedValue) {
  element.replaceChildren();

  for (const optionData of options) {
    const option = document.createElement("option");
    option.value = optionData.value;
    option.textContent = optionData.label;
    option.selected = optionData.value === selectedValue;
    element.append(option);
  }
}

function renderMailboxStream(detail, listElement, emptyElement, messages) {
  listElement.replaceChildren();
  emptyElement.hidden = messages.length > 0;

  for (const message of sortMailboxMessagesNewestFirst(messages)) {
    listElement.append(buildMailboxItem(detail, message));
  }
}

function sortMailboxMessagesNewestFirst(messages) {
  return [...messages].sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

function buildMailboxItem(detail, mailboxMessage) {
  const item = document.createElement("article");
  item.className = "mailbox-item";
  const chips = buildMailboxChips(mailboxMessage);
  const schemaBlock = mailboxMessage.schemaJson
    ? `<pre class="mailbox-item__schema">${escapeHtml(JSON.stringify(mailboxMessage.schemaJson, null, 2))}</pre>`
    : "";

  item.innerHTML = `
    <div class="mailbox-item__header">
      <div>
        <p class="mailbox-item__title">${escapeHtml(buildMailboxDirectionLabel(detail, mailboxMessage))}</p>
        <p class="mailbox-item__meta">${escapeHtml([
          buildMailboxMessageTypeLabel(mailboxMessage.messageType),
          formatTimestamp(mailboxMessage.createdAt),
        ].join(" · "))}</p>
      </div>
      <span class="badge ${buildMailboxMessageBadgeClass(mailboxMessage.messageType)}">${escapeHtml(buildMailboxSenderTypeLabel(mailboxMessage.senderType))}</span>
    </div>
    <div class="mailbox-item__body">
      <p class="mailbox-item__content">${escapeHtml(mailboxMessage.content ?? "")}</p>
      ${chips.length > 0 ? `<div class="mailbox-item__chips">${chips.map((chip) => `<span class="mailbox-item__chip">${escapeHtml(chip)}</span>`).join("")}</div>` : ""}
      ${schemaBlock}
    </div>
  `;

  return item;
}

function buildMailboxChips(mailboxMessage) {
  return [
    mailboxMessage.branchRef ? `${t("mailboxBranchRefChip")}: ${mailboxMessage.branchRef}` : null,
    ...(mailboxMessage.artifactRefs ?? []).map((ref) => `${t("mailboxArtifactRefChip")}: ${ref}`),
    ...(mailboxMessage.fileRefs ?? []).map((ref) => `${t("mailboxFileRefChip")}: ${ref}`),
    mailboxMessage.schemaJson ? t("mailboxSchemaChip") : null,
    mailboxMessage.requiresAck ? t("mailboxAckRequiredChip") : null,
  ].filter(Boolean);
}

function buildMailboxMessageBadgeClass(messageType) {
  if (MAILBOX_CONTRACT_MESSAGE_TYPES.has(messageType)) {
    return "badge--clean";
  }

  if (MAILBOX_BLOCKER_MESSAGE_TYPES.has(messageType)) {
    return "badge--dirty";
  }

  if (messageType === "DELIVERABLE_READY") {
    return "badge--accent-soft";
  }

  return "badge--outline";
}

function buildMailboxParticipantOptionLabel(detail, subTaskId, isLead) {
  if (isLead) {
    return t("mailboxSenderLead");
  }

  const subTask = (detail.subTasks ?? []).find((entry) => entry.id === subTaskId);

  if (!subTask) {
    return t("mailboxSenderSubtask");
  }

  return [subTask.displayName ?? subTask.title, subTask.role ?? subTask.branchSuffix].filter(Boolean).join(" · ");
}

function buildMailboxMessageTypeLabel(messageType) {
  switch (messageType) {
    case "BLOCKER":
      return t("mailboxMessageTypeBlocker");
    case "DELIVERABLE_READY":
      return t("mailboxMessageTypeDeliverableReady");
    case "API_CONTRACT":
      return t("mailboxMessageTypeApiContract");
    case "DB_CONTRACT":
      return t("mailboxMessageTypeDbContract");
    case "TEST_REQUEST":
      return t("mailboxMessageTypeTestRequest");
    case "REVIEW_REQUEST":
      return t("mailboxMessageTypeReviewRequest");
    default:
      return t("mailboxMessageTypeNote");
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

function parseMailboxParticipantKey(value) {
  if (String(value ?? "").startsWith("SUBTASK:")) {
    return {
      subTaskId: String(value).slice("SUBTASK:".length) || null,
      type: "SUBTASK",
    };
  }

  return {
    subTaskId: null,
    type: "LEAD",
  };
}

function splitMailboxRefs(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseMailboxSchemaInput(value) {
  const normalizedValue = normalizeOptionalText(value);

  if (!normalizedValue) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(normalizedValue);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("schemaJson must be an object");
    }

    return parsed;
  } catch {
    throw { code: "MAILBOX_SCHEMA_INVALID" };
  }
}

function normalizeOptionalText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function normalizePreviewPath(value) {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    return "/";
  }

  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function normalizePreviewPort(value) {
  const numeric = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isInteger(numeric) && numeric >= 1000 && numeric <= 65535 ? numeric : 4173;
}

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? t("unknownTime") : date.toLocaleString(state.locale);
}

function isEditablePlanDirty(detail) {
  if (!detail?.task?.currentPlanJson || !state.taskPlanDraft) {
    return false;
  }

  const normalizedServerPlan = parseCurrentPlanJson(detail.task.currentPlanJson);

  if (!normalizedServerPlan) {
    return false;
  }

  return JSON.stringify(normalizePlanDraft(state.taskPlanDraft)) !== JSON.stringify(normalizedServerPlan);
}

function buildPlanSnapshotLabel(snapshot) {
  const sourceLabel = snapshot.source === "RESTORED_FROM_HISTORY"
    ? t("snapshotSourceRestored")
    : snapshot.source === "APPROVED"
      ? t("snapshotSourceApproved")
      : t("snapshotSourceLeadGenerated");

  return t("snapshotVersionLabel", { source: sourceLabel, version: snapshot.version });
}
