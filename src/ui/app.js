import {
  buildAgentErrorMessage,
  buildAgentStatusLabel,
  buildAttachmentCaption,
  buildBranchList,
  buildCleanlinessLabel,
  buildLeadSelectionState,
  buildProjectErrorMessage,
  buildTaskErrorMessage,
  buildTaskStatusLabel,
} from "./view-model.js";

const STORAGE_KEYS = {
  selectedProjectId: "eat.phase04.selectedProjectId",
  selectedTaskId: "eat.phase04.selectedTaskId",
};

const state = {
  agentHealth: {},
  agents: [],
  healthCheckedAt: null,
  leadCandidates: [],
  projectDetail: null,
  projects: [],
  selectedBaseBranch: null,
  selectedLeadAgentName: null,
  selectedProjectId: readStorage(STORAGE_KEYS.selectedProjectId),
  selectedTaskId: readStorage(STORAGE_KEYS.selectedTaskId),
  taskDetail: null,
  tasks: [],
  taskStream: null,
  workerCandidates: [],
};

const elements = {
  agentCount: document.querySelector("#agent-count"),
  agentHealthCheckedAt: document.querySelector("#agent-health-checked-at"),
  agentHealthEmpty: document.querySelector("#agent-health-empty"),
  agentHealthFeedback: document.querySelector("#agent-health-feedback"),
  agentHealthList: document.querySelector("#agent-health-list"),
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
  taskFormFeedback: document.querySelector("#task-form-feedback"),
  taskLeadAgent: document.querySelector("#task-lead-agent"),
  taskList: document.querySelector("#task-list"),
  taskListEmpty: document.querySelector("#task-list-empty"),
  taskListFeedback: document.querySelector("#task-list-feedback"),
  taskMessageCount: document.querySelector("#task-message-count"),
  taskMessageForm: document.querySelector("#task-message-form"),
  taskMessageInput: document.querySelector("#task-message-input"),
  taskPlanDetail: document.querySelector("#task-plan-detail"),
  taskPlanEmpty: document.querySelector("#task-plan-empty"),
  taskPlanFeedback: document.querySelector("#task-plan-feedback"),
  taskPlanList: document.querySelector("#task-plan-list"),
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
    const [directory, health] = await Promise.all([
      fetchJson(`/api/agents${refreshSuffix}`),
      fetchJson(`/api/agents/health${refreshSuffix}`),
    ]);

    state.agents = directory.agents ?? [];
    state.agentHealth = health.agents ?? {};
    state.healthCheckedAt = health.checkedAt ?? null;
    state.leadCandidates = health.leadCandidates ?? [];
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
  elements.agentHealthCheckedAt.textContent = state.healthCheckedAt
    ? new Date(state.healthCheckedAt).toLocaleString()
    : "Not yet checked";
  elements.agentHealthEmpty.hidden = state.agents.length > 0;

  for (const agent of state.agents) {
    const snapshot = state.agentHealth[agent.name];
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

  renderTaskAttachments(detail.attachments ?? []);
  renderPlanDraft(detail);
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

function renderPlanDraft(detail) {
  elements.taskPlanList.replaceChildren();
  clearFeedback(elements.taskPlanFeedback);

  const parsedPlan = parseCurrentPlanJson(detail.task.currentPlanJson);
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

  elements.taskPlanDetail.hidden = false;
  elements.taskPlanSummary.textContent = buildPlanSummary(detail, failedAttempts, parsedPlan);

  if (!parsedPlan?.subtasks?.length) {
    return;
  }

  for (const [index, subtask] of parsedPlan.subtasks.entries()) {
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
  state.taskDetail = null;
  state.selectedTaskId = null;
  writeStorage(STORAGE_KEYS.selectedTaskId, "");
  disconnectTaskStream();
  elements.taskDetail.hidden = true;
  elements.taskDetailEmpty.hidden = false;
  elements.taskTranscript.replaceChildren();
  elements.taskAttachmentsList.replaceChildren();
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
  stream.addEventListener("session:started", () => {
    void loadTaskDetail(taskId, { preserveStream: true });
  });
  stream.addEventListener("session:ended", () => {
    void loadTaskDetail(taskId, { preserveStream: true });
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
