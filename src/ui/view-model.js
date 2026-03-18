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

export function buildCleanlinessLabel(isDirty) {
  return isDirty ? "Dirty working tree" : "Clean working tree";
}

export function buildBranchList(branches) {
  if (!Array.isArray(branches) || branches.length === 0) {
    return ["No recent local branches detected."];
  }

  return branches;
}
