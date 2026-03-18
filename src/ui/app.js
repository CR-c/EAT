import {
  buildBranchList,
  buildCleanlinessLabel,
  buildProjectErrorMessage,
} from "./view-model.js";

const state = {
  detail: null,
  loadingDetail: false,
  loadingList: false,
  selectedProjectId: null,
  projects: [],
};

const elements = {
  projectRegistrationForm: document.querySelector("#project-registration-form"),
  projectPathInput: document.querySelector("#project-path-input"),
  registerProjectButton: document.querySelector("#register-project-button"),
  registrationFeedback: document.querySelector("#registration-feedback"),
  refreshProjectsButton: document.querySelector("#refresh-projects-button"),
  projectListFeedback: document.querySelector("#project-list-feedback"),
  projectListEmpty: document.querySelector("#project-list-empty"),
  projectList: document.querySelector("#project-list"),
  refreshProjectDetailButton: document.querySelector("#refresh-project-detail-button"),
  projectDetailFeedback: document.querySelector("#project-detail-feedback"),
  projectDetailEmpty: document.querySelector("#project-detail-empty"),
  projectDetail: document.querySelector("#project-detail"),
  dirtyWarningBanner: document.querySelector("#dirty-warning-banner"),
  projectName: document.querySelector("#project-name"),
  projectPath: document.querySelector("#project-path"),
  registeredName: document.querySelector("#registered-name"),
  registeredPath: document.querySelector("#registered-path"),
  defaultBranch: document.querySelector("#default-branch"),
  currentBranch: document.querySelector("#current-branch"),
  cleanlinessBadge: document.querySelector("#cleanliness-badge"),
  recentBranches: document.querySelector("#recent-branches"),
};

elements.projectRegistrationForm.addEventListener("submit", onRegisterProject);
elements.refreshProjectsButton.addEventListener("click", () => {
  void loadProjects({ preserveSelection: true });
});
elements.refreshProjectDetailButton.addEventListener("click", () => {
  if (state.selectedProjectId) {
    void loadProjectDetail(state.selectedProjectId);
  }
});

void loadProjects();

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
      `Registered ${response.project.name}. Current branch: ${response.repoStatus.currentBranch ?? "detached HEAD"}.`,
    );

    elements.projectRegistrationForm.reset();
    await loadProjects({ selectedProjectId: response.project.id });
  } catch (error) {
    showFeedback(elements.registrationFeedback, "error", buildProjectErrorMessage(error));

    if (error?.code === "PROJECT_ALREADY_REGISTERED" && error.details?.projectId) {
      await loadProjects({ selectedProjectId: error.details.projectId });
      await loadProjectDetail(error.details.projectId);
    }
  } finally {
    setButtonBusy(elements.registerProjectButton, false, "Register project");
  }
}

async function loadProjects(options = {}) {
  state.loadingList = true;
  clearFeedback(elements.projectListFeedback);
  setButtonBusy(elements.refreshProjectsButton, true, "Refreshing...");

  try {
    const response = await fetchJson("/api/projects");
    state.projects = response.projects ?? [];

    const requestedProjectId = options.selectedProjectId;
    const preservedProjectId = options.preserveSelection ? state.selectedProjectId : null;
    const nextProjectId = requestedProjectId
      ?? preservedProjectId
      ?? state.projects[0]?.id
      ?? null;

    renderProjectList();

    if (nextProjectId) {
      state.selectedProjectId = nextProjectId;
      renderProjectList();
      if (options.loadDetail !== false) {
        await loadProjectDetail(nextProjectId);
      }
    } else {
      state.selectedProjectId = null;
      renderProjectList();
      clearProjectDetail();
    }
  } catch (error) {
    showFeedback(elements.projectListFeedback, "error", buildProjectErrorMessage(error));
    state.projects = [];
    state.selectedProjectId = null;
    renderProjectList();
    clearProjectDetail();
  } finally {
    state.loadingList = false;
    setButtonBusy(elements.refreshProjectsButton, false, "Refresh list");
  }
}

function renderProjectList() {
  elements.projectList.replaceChildren();
  elements.projectListEmpty.hidden = state.projects.length > 0;

  for (const project of state.projects) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "project-list__item";
    button.setAttribute("role", "listitem");
    button.dataset.projectId = project.id;

    if (project.id === state.selectedProjectId) {
      button.classList.add("is-selected");
    }

    button.innerHTML = `
      <div class="project-list__topline">
        <p class="project-list__title">${escapeHtml(project.name)}</p>
        <span class="badge badge--clean">${escapeHtml(project.defaultBranch ?? "No default branch")}</span>
      </div>
      <p class="project-list__meta"><strong>Path:</strong> <span class="project-list__path">${escapeHtml(project.path)}</span></p>
    `;

    button.addEventListener("click", () => {
      state.selectedProjectId = project.id;
      renderProjectList();
      void loadProjectDetail(project.id);
    });

    elements.projectList.append(button);
  }
}

async function loadProjectDetail(projectId) {
  state.loadingDetail = true;
  clearFeedback(elements.projectDetailFeedback);
  setButtonBusy(elements.refreshProjectDetailButton, true, "Refreshing...");

  try {
    const response = await fetchJson(`/api/projects/${encodeURIComponent(projectId)}`);
    state.detail = response;
    state.selectedProjectId = projectId;
    renderProjectList();
    renderProjectDetail();
  } catch (error) {
    state.detail = null;
    clearProjectDetail();
    showFeedback(elements.projectDetailFeedback, "error", buildProjectErrorMessage(error));
  } finally {
    state.loadingDetail = false;
    setButtonBusy(elements.refreshProjectDetailButton, false, "Refresh status");
  }
}

function renderProjectDetail() {
  const detail = state.detail;

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

function clearProjectDetail() {
  elements.projectDetail.hidden = true;
  elements.projectDetailEmpty.hidden = false;
  elements.dirtyWarningBanner.hidden = true;
  elements.recentBranches.replaceChildren();
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
