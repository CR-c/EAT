export function buildProjectErrorMessage(error) {
  if (!error) {
    return "An unknown project error occurred.";
  }

  switch (error.code) {
    case "PROJECT_ALREADY_REGISTERED":
      return `This repository is already registered at ${error.details?.path ?? "the saved path"}.`;
    case "PATH_NOT_ABSOLUTE":
      return "Use an absolute path such as /home/code/EAT.";
    case "PATH_NOT_FOUND":
      return "That path does not exist. Check the directory and try again.";
    case "PATH_NOT_DIRECTORY":
      return "The selected path must be a directory, not a file.";
    case "NOT_GIT_REPOSITORY":
      return "The selected directory is not a non-bare git repository.";
    case "BARE_GIT_REPOSITORY":
      return "Bare git repositories are not supported for project registration.";
    case "PROJECT_NOT_FOUND":
      return "The selected project no longer exists in the local registry.";
    default:
      return error.message ?? "An unexpected project error occurred.";
  }
}

export function buildTaskErrorMessage(error) {
  if (!error) {
    return "An unknown task error occurred.";
  }

  switch (error.code) {
    case "BASE_BRANCH_NOT_FOUND":
      return `The selected base branch ${error.details?.baseBranch ?? ""} could not be resolved.`;
    case "LEAD_AGENT_UNHEALTHY":
      return `${error.details?.leadAgentType ?? "Lead agent"} is unhealthy: ${error.details?.failureReason?.message ?? "health check failed"}.`;
    case "TASK_NOT_DRAFT":
      return "Clarification can only start from a draft task.";
    case "TASK_NOT_CLARIFYING":
      return "This action is only available while the task is clarifying.";
    case "TASK_NOT_PLAN_REVIEW":
      return "This action is only available during plan review.";
    case "ATTACHMENT_TYPE_UNSUPPORTED":
      return "One or more attachments use an unsupported type.";
    case "ATTACHMENT_SIZE_EXCEEDED":
      return "One or more attachments exceed the current size limit.";
    case "ATTACHMENT_MIME_MISMATCH":
      return "One or more attachments do not match the supplied type or MIME metadata.";
    case "TASK_MESSAGE_REQUIRED":
      return "Write a message before sending it to the lead agent.";
    case "INVALID_PLAN":
      return error.message ?? "The generated plan is invalid and needs regeneration.";
    default:
      return error.message ?? "An unexpected task error occurred.";
  }
}

export function buildCleanlinessLabel(isDirty) {
  return isDirty ? "Dirty working tree" : "Clean working tree";
}

export function buildBranchList(branches) {
  if (!Array.isArray(branches) || branches.length === 0) {
    return ["No recent local branches detected."];
  }

  return branches;
}

export function buildAgentErrorMessage(error) {
  if (!error) {
    return "An unknown agent error occurred.";
  }

  return error.message ?? "Unable to load agent registry data.";
}

export function buildAgentStatusLabel(snapshot) {
  if (!snapshot) {
    return "Unknown";
  }

  if (snapshot.available !== true) {
    return "Unavailable";
  }

  if (Array.isArray(snapshot.checks) && snapshot.checks.some((check) => check.status === "WARN")) {
    return "Degraded";
  }

  return "Healthy";
}

export function buildLeadSelectionState(candidate) {
  if (!candidate) {
    return {
      disabled: true,
      message: "No lead-capable agents are registered yet.",
      tone: "error",
    };
  }

  if (candidate.selectable) {
    return {
      disabled: false,
      message: `${candidate.agentName} is healthy and ready for task creation.`,
      tone: "success",
    };
  }

  return {
    disabled: true,
    message: `${candidate.agentName} is blocked: ${candidate.failureReason?.message ?? "Health check failed."}`,
    tone: "error",
  };
}

export function buildTaskStatusLabel(status) {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "CLARIFYING":
      return "Clarifying";
    case "PLANNING":
      return "Planning";
    case "PLAN_REVIEW":
      return "Plan review";
    case "ACTION_REQUIRED":
      return "Action required";
    case "FAILED":
      return "Failed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status ?? "Unknown";
  }
}

export function buildAttachmentCaption(attachment) {
  if (!attachment) {
    return "Unknown attachment";
  }

  const size = typeof attachment.size === "number"
    ? `${Math.max(1, Math.round(attachment.size / 1024))} KB`
    : "size unknown";

  return `${attachment.fileType} · ${attachment.mimeType} · ${size}`;
}
