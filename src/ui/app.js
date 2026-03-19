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
} from "./view-model.js";

const STORAGE_KEYS = {
  draftPrefix: "eat.phase06.planDraft",
  selectedProjectId: "eat.phase04.selectedProjectId",
  selectedTaskId: "eat.phase04.selectedTaskId",
};
const DEFAULT_OUTPUT_BUFFER_MAX_BYTES = 65_536;

const state = {
  agentHealth: {},
  agents: [],
  executionDrafts: new Map(),
  healthCheckedAt: null,
  leadCandidates: [],
  liveSessionOutputs: new Map(),
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
  taskExecutionReworkButton: document.querySelector("#task-execution-rework-button"),
  taskExecutionReworkDescription: document.querySelector("#task-execution-rework-description"),
  taskExecutionReworkField: document.querySelector("#task-execution-rework-field"),
  taskExecutionReviewActions: document.querySelector("#task-execution-review-actions"),
  taskExecutionReview: document.querySelector("#task-execution-review"),
  taskExecutionReviewDecision: document.querySelector("#task-execution-review-decision"),
  taskExecutionReviewFeedback: document.querySelector("#task-execution-review-feedback"),
  taskExecutionReviewPhase: document.querySelector("#task-execution-review-phase"),
  taskExecutionReviewSummary: document.querySelector("#task-execution-review-summary"),
  taskExecutionFocusTitle: document.querySelector("#task-execution-focus-title"),
  taskExecutionSessionList: document.querySelector("#task-execution-session-list"),
  taskExecutionList: document.querySelector("#task-execution-list"),
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
  taskPlanHistory: document.querySelector("#task-plan-history"),
  taskPlanHistoryEmpty: document.querySelector("#task-plan-history-empty"),
  taskPlanHistoryList: document.querySelector("#task-plan-history-list"),
  taskPlanApproveButton: document.querySelector("#task-plan-approve-button"),
  taskPlanEmpty: document.querySelector("#task-plan-empty"),
  taskPlanFeedback: document.querySelector("#task-plan-feedback"),
  taskPlanAddSubtaskButton: document.querySelector("#task-plan-add-subtask-button"),
  taskPlanList: document.querySelector("#task-plan-list"),
  taskPlanNotesInput: document.querySelector("#task-plan-notes-input"),
  taskPlanResetDraftButton: document.querySelector("#task-plan-reset-draft-button"),
  taskPlanSaveDraftButton: document.querySelector("#task-plan-save-draft-button"),
  taskPlanSnapshotCount: document.querySelector("#task-plan-snapshot-count"),
  taskPlanSummary: document.querySelector("#task-plan-summary"),
  taskPlanVersion: document.querySelector("#task-plan-version"),
  taskSessionStatus: document.querySelector("#task-session-status"),
  taskStatusBadge: document.querySelector("#task-status-badge"),
  taskTitleInput: document.querySelector("#task-title-input"),
  taskTranscript: document.querySelector("#task-transcript"),
  taskTranscriptEmpty: document.querySelector("#task-transcript-empty"),
  taskAttachmentsInput: document.querySelector("#task-attachments-input"),
};

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
elements.taskPlanApproveButton.addEventListener("click", onApprovePlanDraft);
elements.taskPlanResetDraftButton.addEventListener("click", onResetPlanDraft);
elements.taskPlanSaveDraftButton.addEventListener("click", onSavePlanDraft);
elements.taskPlanNotesInput.addEventListener("input", onPlanNotesInput);
elements.taskExecutionAgentSelect.addEventListener("change", onExecutionDraftAgentInput);
elements.taskExecutionChangeAgentButton.addEventListener("click", onChangeSubTaskAgent);
elements.taskExecutionReworkButton.addEventListener("click", onReworkSubTask);
elements.taskExecutionReworkDescription.addEventListener("input", onExecutionDraftDescriptionInput);

void Promise.all([loadProjects({ preserveSelection: true }), loadAgents()]);

async function onRegisterProject(event) {
  event.preventDefault();
  clearFeedback(elements.registrationFeedback);
  setButtonBusy(elements.registerProjectButton, true, "Registering...");

  try {
    const response = await fetchJson("/api/projects", {
      body: { path: elements.projectPathInput.value.trim() },
      method: "POST",
    });

    showFeedback(
      elements.registrationFeedback,
      "success",
      `Registered ${response.project.name}.`,
    );

    elements.projectRegistrationForm.reset();
    await loadProjects({ selectedProjectId: response.project.id });
  } catch (error) {
    showFeedback(elements.registrationFeedback, "error", buildProjectErrorMessage(error));
  } finally {
    setButtonBusy(elements.registerProjectButton, false, "Register project");
  }
}

async function onCreateTask(event) {
  event.preventDefault();
  clearFeedback(elements.taskFormFeedback);
  clearFeedback(elements.taskAttachmentFeedback);
  setButtonBusy(elements.createTaskButton, true, "Creating...");

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
      `Created task ${response.task.title}. Start clarification when you are ready.`,
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
    setButtonBusy(elements.createTaskButton, false, "Create task");
  }
}

async function onStartClarification() {
  if (!state.selectedTaskId) {
    return;
  }

  clearFeedback(elements.taskDetailFeedback);
  setButtonBusy(elements.startClarificationButton, true, "Starting...");

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
    setButtonBusy(elements.startClarificationButton, false, "Start clarification");
  }
}

async function onSendTaskMessage(event) {
  event.preventDefault();

  if (!state.selectedTaskId) {
    return;
  }

  clearFeedback(elements.taskDetailFeedback);
  setButtonBusy(elements.sendTaskMessageButton, true, "Sending...");

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
    setButtonBusy(elements.sendTaskMessageButton, false, "Send message");
  }
}

async function onConfirmRequirements() {
  if (!state.selectedTaskId) {
    return;
  }

  clearFeedback(elements.taskDetailFeedback);
  setButtonBusy(elements.confirmRequirementsButton, true, "Confirming...");

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
    setButtonBusy(elements.confirmRequirementsButton, false, "Requirements confirmed");
  }
}

async function loadProjects(options = {}) {
  clearFeedback(elements.projectListFeedback);
  setButtonBusy(elements.refreshProjectsButton, true, "Refreshing...");

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
    setButtonBusy(elements.refreshProjectsButton, false, "Refresh list");
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
  setButtonBusy(elements.refreshProjectDetailButton, true, "Refreshing...");

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
    setButtonBusy(elements.refreshProjectDetailButton, false, "Refresh status");
  }
}

async function loadProjectTasks(projectId, options = {}) {
  clearFeedback(elements.taskListFeedback);
  setButtonBusy(elements.refreshTasksButton, true, "Refreshing...");

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
    setButtonBusy(elements.refreshTasksButton, false, "Refresh tasks");
  }
}

async function loadTaskDetail(taskId, options = {}) {
  if (!taskId) {
    clearTaskDetail();
    return;
  }

  clearFeedback(elements.taskDetailFeedback);
  setButtonBusy(elements.refreshTaskDetailButton, true, "Refreshing...");

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
    setButtonBusy(elements.refreshTaskDetailButton, false, "Refresh task");
  }
}

async function loadAgents(options = {}) {
  clearFeedback(elements.agentHealthFeedback);
  setButtonBusy(elements.refreshAgentHealthButton, true, "Refreshing...");

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
    setButtonBusy(elements.refreshAgentHealthButton, false, "Refresh health");
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
        <span class="badge badge--clean">${escapeHtml(project.defaultBranch ?? "Unknown")}</span>
      </div>
      <p class="project-list__meta"><strong>Path:</strong> <span class="project-list__path">${escapeHtml(project.path)}</span></p>
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
  elements.defaultBranch.textContent = repoStatus.defaultBranch ?? "Unknown";
  elements.currentBranch.textContent = repoStatus.currentBranch ?? "Detached HEAD";
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
    : "Not configured";
  elements.agentHealthCheckedAt.textContent = state.healthCheckedAt
    ? new Date(state.healthCheckedAt).toLocaleString()
    : "Not yet checked";
  elements.dockerHealthBadge.textContent = buildDockerHealthLabel(state.systemDockerHealth);
  elements.dockerHealthBadge.className = `badge ${state.systemDockerHealth?.available ? "badge--clean" : "badge--dirty"}`;
  elements.dockerHealthReason.textContent = state.systemDockerHealth?.reason
    ?? "Docker sandbox health is ready for worker sessions.";
  elements.agentHealthEmpty.hidden = state.agents.length > 0;

  for (const agent of state.agents) {
    const snapshot = state.agentHealth[agent.name];
    const capabilityBadges = [
      agent.roles.leadCandidate ? "Lead" : null,
      agent.roles.workerCandidate ? "Worker" : null,
      agent.capabilities.supportsVision ? "Vision" : "No vision",
      agent.capabilities.supportsInteractiveInput ? "Interactive" : "One-shot",
      ...(agent.capabilities.supportedSandboxTypes ?? []).map((sandboxType) => `${sandboxType} sandbox`),
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
      <p class="agent-card__meta"><strong>Runtime:</strong> ${escapeHtml(buildAgentRuntimeModeLabel(agent, snapshot))}</p>
      <p class="agent-card__meta"><strong>Capabilities:</strong> ${escapeHtml(capabilityBadges.join(" · "))}</p>
      <p class="agent-card__meta"><strong>Failure reason:</strong> ${escapeHtml(snapshot?.failureReason?.message ?? "None")}</p>
    `;

    elements.agentHealthList.append(article);
  }
}

function renderLeadSelector() {
  elements.leadAgentSelect.replaceChildren();

  if (state.leadCandidates.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No lead agents available";
    elements.leadAgentSelect.append(option);
    elements.leadAgentSelect.disabled = true;
    elements.createTaskButton.disabled = true;
    showFeedback(elements.leadAgentFeedback, "error", "No lead-capable agents are registered yet.");
    return;
  }

  for (const candidate of state.leadCandidates) {
    const option = document.createElement("option");
    option.value = candidate.agentName;
    option.selected = candidate.agentName === state.selectedLeadAgentName;
    option.textContent = candidate.selectable
      ? candidate.agentName
      : `${candidate.agentName} (unhealthy)`;
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
      `${invalidFile.name} is not a supported attachment type.`,
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
      <p class="task-list__meta"><strong>Base branch:</strong> ${escapeHtml(task.baseBranch)}</p>
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
  elements.taskSessionStatus.textContent = latestSession ? `${latestSession.sessionType} · ${latestSession.status}` : "None";
  elements.taskMessageCount.textContent = String(detail.messages?.length ?? 0);
  elements.taskPlanVersion.textContent = String(detail.task.planVersion ?? 0);
  elements.taskPlanSnapshotCount.textContent = String(detail.planSnapshots?.length ?? 0);

  syncEditablePlanDraft(detail);
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
    const includedAttachments = subTask.launchMetadata?.included?.map((attachment) => attachment.fileName) ?? [];
    const excludedAttachments = subTask.launchMetadata?.excluded?.map((attachment) => (
      `${attachment.fileName} (${attachment.reason})`
    )) ?? [];
    const previewText = stripAnsi(latestSession?.outputBuffer ?? "");
    const reviewDecision = buildReviewDecisionLabel(subTask.latestReviewDecision);
    const reviewPhase = buildReviewPhaseLabel(subTask.latestReviewPhase);
    const reviewSummary = subTask.latestReviewSummary ?? "Incremental review will appear after a successful worker run.";
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
        <span class="badge ${subTask.status === "FAILED" ? "badge--dirty" : subTask.status === "RUNNING" ? "badge--accent-soft" : "badge--outline"}">${escapeHtml(buildSubTaskStatusLabel(subTask.status))}</span>
      </div>
      <div class="execution-card__summary">
        <p class="execution-card__summary-line"><strong>Latest session:</strong> ${escapeHtml(latestSession ? `${latestSession.agentType} · ${latestSession.status}` : "None")}</p>
        <p class="execution-card__summary-line"><strong>Retries:</strong> ${escapeHtml(String(subTask.retryCount ?? 0))} · <strong>Sessions:</strong> ${escapeHtml(String(sessions.length))}</p>
        <p class="execution-card__summary-line"><strong>Attachments:</strong> ${escapeHtml(`${includedAttachments.length} included · ${excludedAttachments.length} excluded`)}</p>
      </div>
      <div class="execution-card__review">
        <p class="execution-card__review-title">${escapeHtml(`${reviewPhase} · ${reviewDecision}`)}</p>
        <p class="execution-card__review-summary">${escapeHtml(reviewSummary)}</p>
      </div>
      <dl class="execution-card__facts">
        <div>
          <dt>Branch</dt>
          <dd>${escapeHtml(subTask.branchName ?? "Pending")}</dd>
        </div>
        <div>
          <dt>Worktree</dt>
          <dd>${escapeHtml(subTask.worktreePath ?? "Pending")}</dd>
        </div>
      </dl>
      <pre class="execution-card__preview">${escapeHtml(previewText || "Waiting for worker output...")}</pre>
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
  clearFeedback(elements.taskPlanFeedback);

  const parsedPlan = parseCurrentPlanJson(detail.task.currentPlanJson);
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
      `Plan draft ready for review. Version ${detail.task.planVersion} is saved and available for the next phase.`,
    );
  } else if (failedAttempts > 0) {
    showFeedback(
      elements.taskPlanFeedback,
      "error",
      `Planning is retrying after ${failedAttempts} validation failure${failedAttempts === 1 ? "" : "s"}.`,
    );
  } else if (detail.task.status === "PLANNING") {
    showFeedback(
      elements.taskPlanFeedback,
      "success",
      "Planning is in progress. Waiting for a valid JSON draft from the lead agent.",
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

  if (editableDraft) {
    elements.taskPlanNotesInput.value = editableDraft.notes ?? "";
  }

  const subtasks = editableDraft?.subtasks ?? parsedPlan?.subtasks ?? [];
  const hasUnsavedDraft = editableDraft ? isEditablePlanDirty(detail) : false;
  const hasStaleDraft = state.taskPlanDraftState?.stale === true;

  if (hasStaleDraft) {
    showFeedback(
      elements.taskPlanFeedback,
      "error",
      "Server draft changed in another tab or after a restore. Reset local edits before continuing.",
    );
  }

  elements.taskPlanSaveDraftButton.disabled = !editableDraft || !hasUnsavedDraft || hasStaleDraft;
  elements.taskPlanApproveButton.disabled = !editableDraft || hasUnsavedDraft || hasStaleDraft;
  elements.taskPlanApproveButton.textContent = hasUnsavedDraft ? "Save before approval" : "Approve draft";

  if (!subtasks.length) {
    return;
  }

  for (const [index, subtask] of subtasks.entries()) {
    if (editableDraft) {
      elements.taskPlanList.append(renderEditablePlanSubtask(index, subtask));
      continue;
    }

    const article = document.createElement("article");
    article.className = "plan-card";
    article.innerHTML = `
      <div class="plan-card__header">
        <div>
          <p class="plan-card__title">${escapeHtml(`${index + 1}. ${subtask.title}`)}</p>
          <p class="plan-card__meta">${escapeHtml(`Agent: ${subtask.recommended_agent}`)}</p>
        </div>
        <span class="badge badge--outline">${escapeHtml(subtask.branch_suffix)}</span>
      </div>
      <p class="plan-card__description">${escapeHtml(subtask.description)}</p>
    `;
    elements.taskPlanList.append(article);
  }
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
          <p class="plan-history__caption">${escapeHtml(new Date(snapshot.createdAt).toLocaleString())}</p>
        </div>
        <button class="button button--secondary" type="button" data-restore-snapshot-id="${snapshot.id}">
          Restore snapshot
        </button>
      </div>
    `;

    article.querySelector("[data-restore-snapshot-id]")?.addEventListener("click", onRestorePlanSnapshot);
    elements.taskPlanHistoryList.append(article);
  }
}

function renderEditablePlanSubtask(index, subtask) {
  const article = document.createElement("article");
  article.className = "plan-subtask";

  article.innerHTML = `
    <div class="plan-subtask__header">
      <p class="plan-subtask__index">Subtask ${index + 1}</p>
      <button class="button button--ghost" type="button" data-remove-subtask="${index}">
        Remove
      </button>
    </div>
    <div class="plan-subtask__grid">
      <label class="field">
        <span class="field__label">Title</span>
        <input type="text" value="${escapeHtmlAttribute(subtask.title ?? "")}" data-plan-field="title" data-subtask-index="${index}">
      </label>
      <label class="field">
        <span class="field__label">Worker agent</span>
        <select class="field__control" data-plan-field="recommended_agent" data-subtask-index="${index}">
          ${buildWorkerAgentOptions(subtask.recommended_agent)}
        </select>
      </label>
      <label class="field">
        <span class="field__label">Description</span>
        <textarea rows="4" data-plan-field="description" data-subtask-index="${index}">${escapeHtml(subtask.description ?? "")}</textarea>
      </label>
      <label class="field">
        <span class="field__label">Branch suffix</span>
        <div class="plan-subtask__branch">
          <input type="text" value="${escapeHtmlAttribute(subtask.branch_suffix ?? "")}" data-plan-field="branch_suffix" data-subtask-index="${index}">
          <span class="badge badge--outline">${escapeHtml(subtask.branch_suffix ?? "missing-suffix")}</span>
        </div>
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

function renderTranscript(messages) {
  elements.taskTranscript.replaceChildren();
  elements.taskTranscriptEmpty.hidden = messages.length > 0;

  for (const message of messages) {
    const article = document.createElement("article");
    article.className = `transcript__message transcript__message--${message.role.toLowerCase().replaceAll("_", "-")}`;
    article.innerHTML = `
      <div class="transcript__meta">
        <span>${escapeHtml(message.role.replaceAll("_", " "))}</span>
        <span>${escapeHtml(new Date(message.createdAt).toLocaleString())}</span>
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
  elements.taskTranscript.replaceChildren();
  elements.taskAttachmentsList.replaceChildren();
  elements.taskExecutionList.replaceChildren();
  elements.taskExecutionBoard.hidden = true;
  elements.taskExecutionFocus.hidden = true;
  elements.taskExecutionFocusPreview.hidden = true;
  elements.taskExecutionReview.hidden = true;
  elements.taskExecutionAgentField.hidden = true;
  elements.taskExecutionReviewActions.hidden = true;
  elements.taskExecutionReworkField.hidden = true;
  elements.taskExecutionSessionList.replaceChildren();
  elements.taskPlanHistoryList.replaceChildren();
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
    option.textContent = "No branches available";
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
      if (payload.reason) {
        state.taskDetail.task.lastError = payload.reason;
      }
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
  stream.addEventListener("task:plan-restored", (event) => {
    const payload = JSON.parse(event.data);

    state.taskPlanNotice = {
      message: `Snapshot ${payload.snapshotId} was restored into the current draft.`,
      tone: "success",
    };
    void loadTaskDetail(taskId, { preserveStream: true });
  });
  stream.addEventListener("subtask:status", (event) => {
    applySubTaskStatusEvent(JSON.parse(event.data));
  });
  stream.addEventListener("subtask:review", (event) => {
    applySubTaskReviewEvent(JSON.parse(event.data));
  });
  stream.addEventListener("subtask:agent-changed", (event) => {
    applySubTaskAgentChangedEvent(JSON.parse(event.data));
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
    && JSON.stringify(persistedDraft.draft) !== persistedDraft.serverFingerprint;

  if (canReusePersistedDraft) {
    state.taskPlanDraft = persistedDraft.draft;
    state.taskPlanDraftState = {
      stale: false,
    };
  } else if (hasUnsavedPersistedDraft) {
    state.taskPlanDraft = persistedDraft.draft;
    state.taskPlanDraftState = {
      stale: true,
    };
  } else {
    state.taskPlanDraft = clonePlanDraft(serverPlan);
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
  const nextDraft = {
    ...state.taskPlanDraft,
  };

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

  if (!Number.isInteger(index) || !field || !state.taskPlanDraft.subtasks[index]) {
    return;
  }

  state.taskPlanDraft = {
    ...state.taskPlanDraft,
    subtasks: state.taskPlanDraft.subtasks.map((subtask, subtaskIndex) => (
      subtaskIndex === index
        ? { ...subtask, [field]: event.target.value }
        : subtask
    )),
  };
  persistCurrentTaskDraft();
  renderPlanDraft(state.taskDetail);
}

function onAddPlanSubtask() {
  if (!state.taskPlanDraft) {
    return;
  }

  state.taskPlanDraft = {
    ...state.taskPlanDraft,
    subtasks: [
      ...state.taskPlanDraft.subtasks,
      createDefaultPlanSubtask(state.taskPlanDraft.subtasks.length),
    ],
  };
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

  state.taskPlanDraft = {
    ...state.taskPlanDraft,
    subtasks: state.taskPlanDraft.subtasks.filter((_, subtaskIndex) => subtaskIndex !== index),
  };
  persistCurrentTaskDraft();
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
    showFeedback(elements.taskPlanFeedback, "error", "Reset local edits to review the latest server draft first.");
    return;
  }

  setButtonBusy(elements.taskPlanSaveDraftButton, true, "Saving...");

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
    showFeedback(elements.taskPlanFeedback, "success", "Draft saved. Server validation passed.");
  } catch (error) {
    showFeedback(elements.taskPlanFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.taskPlanSaveDraftButton, false, "Save draft");
  }
}

async function onApprovePlanDraft() {
  if (!state.taskDetail?.task?.id || !state.taskPlanDraft) {
    return;
  }

  clearFeedback(elements.taskPlanFeedback);

  if (state.taskPlanDraftState?.stale) {
    showFeedback(elements.taskPlanFeedback, "error", "Reset local edits to the latest server draft before approval.");
    return;
  }

  if (isEditablePlanDirty(state.taskDetail)) {
    showFeedback(elements.taskPlanFeedback, "error", "Save the draft before approval.");
    return;
  }

  setButtonBusy(elements.taskPlanApproveButton, true, "Checking...");

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
        ? "Plan was already approved. Materialized subtasks were reused."
        : "Plan approved. Subtasks are materialized and ready for Phase 08 launch.",
    );
  } catch (error) {
    showFeedback(elements.taskPlanFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.taskPlanApproveButton, false, "Approve draft");
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
  if (!window.confirm("Restore this snapshot into the current draft? Unsaved local edits in this tab will be replaced.")) {
    return;
  }
  setButtonBusy(button, true, "Restoring...");

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
    showFeedback(elements.taskPlanFeedback, "success", "Snapshot restored into the current draft.");
  } catch (error) {
    showFeedback(elements.taskPlanFeedback, "error", buildTaskErrorMessage(error));
    setButtonBusy(button, false, "Restore snapshot");
  }
}

async function onReworkSubTask() {
  const selectedSubTask = getSelectedExecutionSubTask();

  if (!state.selectedTaskId || !selectedSubTask) {
    return;
  }

  const draft = getExecutionDraft(selectedSubTask);
  clearFeedback(elements.taskExecutionReviewFeedback);
  setButtonBusy(elements.taskExecutionReworkButton, true, "Relaunching...");

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
    showFeedback(elements.taskExecutionReviewFeedback, "success", "Rework relaunched on the same branch and worktree.");
  } catch (error) {
    showFeedback(elements.taskExecutionReviewFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.taskExecutionReworkButton, false, "Rework now");
  }
}

async function onChangeSubTaskAgent() {
  const selectedSubTask = getSelectedExecutionSubTask();

  if (!state.selectedTaskId || !selectedSubTask) {
    return;
  }

  const draft = getExecutionDraft(selectedSubTask);
  clearFeedback(elements.taskExecutionReviewFeedback);
  setButtonBusy(elements.taskExecutionChangeAgentButton, true, "Switching...");

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
    showFeedback(elements.taskExecutionReviewFeedback, "success", "Worker agent changed and relaunched on the same branch and worktree.");
  } catch (error) {
    showFeedback(elements.taskExecutionReviewFeedback, "error", buildTaskErrorMessage(error));
  } finally {
    setButtonBusy(elements.taskExecutionChangeAgentButton, false, "Switch agent & relaunch");
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
        message: `${file.name} is not a supported attachment type.`,
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
    throw payload.error ?? { code: "REQUEST_FAILED", message: "Request failed." };
  }

  return payload;
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
      reject(new Error(`Unable to read ${file.name}.`));
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
    return parsed && typeof parsed === "object" ? parsed : null;
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
  const summaryParts = [
    `Version ${detail.task.planVersion ?? 0}`,
    `${snapshotCount} snapshot${snapshotCount === 1 ? "" : "s"}`,
  ];

  if (failedAttempts > 0) {
    summaryParts.push(`${failedAttempts} regeneration${failedAttempts === 1 ? "" : "s"}`);
  }

  if (parsedPlan?.notes) {
    summaryParts.push(`Notes: ${parsedPlan.notes}`);
  }

  return summaryParts.join(" · ");
}

function buildWorkerAgentOptions(selectedAgentName) {
  const options = [];
  const selectableCandidates = state.workerCandidates.filter((candidate) => candidate.selectable);
  const knownNames = new Set(selectableCandidates.map((candidate) => candidate.agentName));

  if (selectedAgentName && !knownNames.has(selectedAgentName)) {
    options.push(
      `<option value="${escapeHtmlAttribute(selectedAgentName)}" selected>${escapeHtml(`${selectedAgentName} (currently assigned)`)}</option>`,
    );
  }

  for (const candidate of selectableCandidates) {
    options.push(
      `<option value="${escapeHtmlAttribute(candidate.agentName)}"${candidate.agentName === selectedAgentName ? " selected" : ""}>${escapeHtml(candidate.agentName)}</option>`,
    );
  }

  return options.join("");
}

function createDefaultPlanSubtask(index) {
  return {
    branch_suffix: `draft-subtask-${index + 1}`,
    description: "",
    recommended_agent: state.workerCandidates.find((candidate) => candidate.selectable)?.agentName
      ?? state.taskDetail?.task?.leadAgentType
      ?? "",
    title: "",
  };
}

function clonePlanDraft(plan) {
  return JSON.parse(JSON.stringify(plan));
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
    return;
  }

  state.selectedExecutionSessionId = focusedSession?.id ?? null;
  elements.taskExecutionFocusTitle.textContent = selectedSubTask.title;
  elements.taskExecutionFocusBadge.textContent = focusedSession
    ? focusedSession.status
    : "Pending";
  elements.taskExecutionFocusBadge.className = `badge ${focusedSession?.status === "FAILED" ? "badge--dirty" : focusedSession?.status === "RUNNING" ? "badge--accent-soft" : "badge--outline"}`;
  elements.taskExecutionFocusMeta.textContent = [
    `${selectedSubTask.agentType} · ${focusedSessions.length} session${focusedSessions.length === 1 ? "" : "s"}`,
    focusedSession?.logPath ? `log ${focusedSession.logPath}` : "log pending",
    selectedSubTask.lastError ? `error: ${selectedSubTask.lastError}` : null,
  ].filter(Boolean).join(" · ");
  const draft = getExecutionDraft(selectedSubTask);
  const canReworkNow = selectedSubTask.status === "REVIEW_PENDING"
    && ["REJECTED", "REWORK"].includes(selectedSubTask.latestReviewDecision);
  const canChangeAgent = canReworkNow || selectedSubTask.status === "FAILED";
  const hasRecoveryPanel = canChangeAgent || selectedSubTask.latestReviewDecision || selectedSubTask.latestReviewSummary;

  elements.taskExecutionReview.hidden = !hasRecoveryPanel;
  elements.taskExecutionReworkField.hidden = !canReworkNow;
  elements.taskExecutionAgentField.hidden = !canChangeAgent;
  elements.taskExecutionReworkButton.hidden = !canReworkNow;
  elements.taskExecutionChangeAgentButton.hidden = !canChangeAgent;
  elements.taskExecutionReviewActions.hidden = !canReworkNow && !canChangeAgent;

  if (!elements.taskExecutionReview.hidden) {
    if (selectedSubTask.latestReviewDecision || selectedSubTask.latestReviewSummary) {
      elements.taskExecutionReviewDecision.textContent = buildReviewDecisionLabel(selectedSubTask.latestReviewDecision);
      elements.taskExecutionReviewPhase.textContent = buildReviewPhaseLabel(selectedSubTask.latestReviewPhase);
      elements.taskExecutionReviewSummary.textContent = selectedSubTask.latestReviewSummary ?? "No review summary available.";
    } else {
      elements.taskExecutionReviewDecision.textContent = "Recovery";
      elements.taskExecutionReviewPhase.textContent = "Launch recovery";
      elements.taskExecutionReviewSummary.textContent = selectedSubTask.lastError
        ?? "This subtask needs a replacement worker before it can relaunch.";
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

  if (!canReworkNow && !canChangeAgent) {
    clearFeedback(elements.taskExecutionReviewFeedback);
  }

  const previewOutput = focusedSession
    ? stripAnsi(state.liveSessionOutputs.get(focusedSession.id) ?? focusedSession.outputBuffer ?? "")
    : "";

  elements.taskExecutionSessionList.replaceChildren(...focusedSessions.map((session, index) => {
    const button = document.createElement("button");
    const isSelected = session.id === focusedSession?.id;

    button.type = "button";
    button.className = `button ${isSelected ? "button--primary" : "button--secondary"}`;
    button.textContent = `Session ${index + 1} · ${session.status}`;
    button.addEventListener("click", () => {
      state.selectedExecutionSessionId = session.id;
      renderTaskDetail();
    });

    return button;
  }));

  elements.taskExecutionFocusEmpty.hidden = Boolean(focusedSession);
  elements.taskExecutionFocusPreview.hidden = !focusedSession;

  if (focusedSession) {
    elements.taskExecutionFocusPreview.textContent = previewOutput || "Waiting for worker output...";
  } else {
    elements.taskExecutionFocusPreview.textContent = "";
  }
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

function isEditablePlanDirty(detail) {
  if (!detail?.task?.currentPlanJson || !state.taskPlanDraft) {
    return false;
  }

  return JSON.stringify(state.taskPlanDraft) !== detail.task.currentPlanJson;
}

function buildPlanSnapshotLabel(snapshot) {
  const sourceLabel = snapshot.source === "RESTORED_FROM_HISTORY"
    ? "Restored"
    : snapshot.source === "APPROVED"
      ? "Approved"
      : "Lead generated";

  return `Version ${snapshot.version} · ${sourceLabel}`;
}
