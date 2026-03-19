import { SESSION_STATUS, SESSION_TYPE, TASK_STATUS } from "../repositories/task-repository.js";

const CLEANUP_WARNING_MESSAGE_PREFIX = "Cleanup warning: ";
const LAUNCH_FAILURE_MESSAGE_PREFIX = "Launch failure: ";

// Metrics in Phase 14 are derived from persisted local state only.
// When a metric cannot be derived reliably from stored history, it is surfaced in unavailableMetrics
// rather than silently reported as zero.
export class MetricsService {
  constructor(options) {
    this.taskRepository = options.taskRepository;
  }

  async getSummary() {
    const dataset = await this.#loadDataset();
    const summary = buildMetricsSummary(dataset);

    return {
      ok: true,
      summary,
    };
  }

  async exportMetrics() {
    const dataset = await this.#loadDataset();
    const summary = buildMetricsSummary(dataset);

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      summary,
      tasks: buildTaskMetricRows(dataset),
    };
  }

  async #loadDataset() {
    const [
      tasks,
      subTasks,
      sessions,
      messages,
      reviewRecords,
      mergeRecords,
      planSnapshots,
    ] = await Promise.all([
      this.taskRepository.listTasks(),
      this.taskRepository.listSubTasks(),
      this.taskRepository.listSessions(),
      this.taskRepository.listMessages(),
      this.taskRepository.listReviewRecords(),
      this.taskRepository.listMergeRecords(),
      this.taskRepository.listPlanSnapshots(),
    ]);

    return {
      cleanupWarnings: messages.map(parseCleanupWarningMessage).filter(Boolean),
      launchFailures: messages.map(parseLaunchFailureMessage).filter(Boolean),
      mergeRecords,
      planSnapshots,
      reviewRecords,
      sessions,
      subTasks,
      tasks,
    };
  }
}

function buildMetricsSummary(dataset) {
  const tasksEnteredExecuting = dataset.tasks.filter((task) => typeof task.approvedPlanJson === "string").length;
  const tasksCompleted = dataset.tasks.filter((task) => task.status === TASK_STATUS.COMPLETED).length;
  const crashedWorkerSessions = dataset.sessions.filter((session) => (
    session.sessionType === SESSION_TYPE.WORKER
    && typeof session.exitCode === "number"
    && session.exitCode !== 0
  ));
  const detectedWorkerCrashes = crashedWorkerSessions.filter((session) => (
    session.status === SESSION_STATUS.FAILED && typeof session.endedAt === "string"
  ));
  const mergeConflicts = dataset.mergeRecords.filter((record) => (
    record.operation === "MERGE" && record.status === "CONFLICT"
  ));
  const rebaseRetries = dataset.mergeRecords.filter((record) => record.operation === "REBASE");
  const retrySessions = resolveRetrySessions(dataset.sessions);
  const retrySessionsWithReview = retrySessions.filter((session) => (
    dataset.reviewRecords.some((record) => (
      record.phase === "INCREMENTAL" && record.sessionId === session.id
    ))
  ));
  const actionableIncrementalReviews = dataset.reviewRecords.filter((record) => (
    record.phase === "INCREMENTAL" && ["REJECTED", "REWORK"].includes(record.decision)
  ));
  const earlyReworkAdoptions = actionableIncrementalReviews.filter((record) => (
    hasEarlyReworkAdoption(record, dataset.sessions, dataset.reviewRecords)
  ));
  const firstOutputDurations = resolveFirstOutputDurationsMs(dataset.tasks, dataset.sessions, dataset.planSnapshots);
  const tasksMissingFirstOutputTiming = resolveTasksMissingFirstOutputTiming(dataset.tasks, dataset.sessions, dataset.planSnapshots);

  return {
    cleanupWarningCount: dataset.cleanupWarnings.length,
    completionRateAfterPlanApproval: safeRate(tasksCompleted, tasksEnteredExecuting),
    definitions: {
      completionRateAfterPlanApproval: "tasks reaching COMPLETED divided by tasks with approved plans",
      mergeConflictSurfacingAccuracy: "merge conflicts with a persisted conflict summary divided by all merge conflicts",
      retryToReviewConversionRate: "retry worker sessions with a persisted incremental review divided by all retry worker sessions",
      workerCrashDetectionRate: "failed worker sessions persisted with FAILED status divided by worker sessions exiting non-zero",
    },
    earlyReworkAdoptionRate: safeRate(earlyReworkAdoptions.length, actionableIncrementalReviews.length),
    failedWorkerSessionCount: crashedWorkerSessions.length,
    mergeConflictCount: mergeConflicts.length,
    mergeConflictSurfacingAccuracy: safeRate(
      mergeConflicts.filter((record) => normalizeText(record.conflictSummary)).length,
      mergeConflicts.length,
    ),
    medianPlanApprovalToFirstWorkerOutputMs: median(firstOutputDurations),
    rebaseRetryCount: rebaseRetries.length,
    retryToReviewConversionRate: safeRate(retrySessionsWithReview.length, retrySessions.length),
    sandboxLaunchFailureCount: dataset.launchFailures.filter((failure) => failure.kind === "SANDBOX_LAUNCH_FAILURE").length,
    tasksCompleted,
    tasksEnteredExecuting,
    unavailableMetrics: buildUnavailableMetrics(tasksMissingFirstOutputTiming),
    workerCrashDetectionRate: safeRate(detectedWorkerCrashes.length, crashedWorkerSessions.length),
  };
}

function buildTaskMetricRows(dataset) {
  const subTasksByTaskId = groupBy(dataset.subTasks, (subTask) => subTask.taskId);
  const sessionsByTaskId = groupBy(dataset.sessions, (session) => session.taskId);
  const mergeRecordsByTaskId = groupBy(dataset.mergeRecords, (record) => (
    dataset.subTasks.find((subTask) => subTask.id === record.subTaskId)?.taskId ?? null
  ));
  const cleanupWarningsByTaskId = groupBy(dataset.cleanupWarnings, (warning) => warning.taskId);
  const launchFailuresByTaskId = groupBy(dataset.launchFailures, (failure) => failure.taskId);
  const approvedSnapshotsByTaskId = groupBy(
    dataset.planSnapshots.filter((snapshot) => snapshot.source === "APPROVED"),
    (snapshot) => snapshot.taskId,
  );

  return dataset.tasks.map((task) => {
    const taskSubTasks = subTasksByTaskId.get(task.id) ?? [];
    const taskSessions = sessionsByTaskId.get(task.id) ?? [];
    const taskMergeRecords = (mergeRecordsByTaskId.get(task.id) ?? []).filter(Boolean);
    const approvalSnapshot = (approvedSnapshotsByTaskId.get(task.id) ?? [])[0] ?? null;
    const firstWorkerOutputAt = taskSessions
      .filter((session) => session.sessionType === SESSION_TYPE.WORKER && normalizeText(session.firstOutputAt))
      .map((session) => session.firstOutputAt)
      .sort()[0] ?? null;

    return {
      cleanupWarningCount: (cleanupWarningsByTaskId.get(task.id) ?? []).length,
      completedAt: TERMINAL_TASK_STATUSES.has(task.status) ? task.updatedAt : null,
      createdAt: task.createdAt,
      failedWorkerSessionCount: taskSessions.filter((session) => (
        session.sessionType === SESSION_TYPE.WORKER
        && typeof session.exitCode === "number"
        && session.exitCode !== 0
      )).length,
      firstWorkerOutputAt,
      mergeConflictCount: taskMergeRecords.filter((record) => (
        record.operation === "MERGE" && record.status === "CONFLICT"
      )).length,
      planApprovedAt: approvalSnapshot?.createdAt ?? null,
      projectId: task.projectId,
      rebaseRetryCount: taskMergeRecords.filter((record) => record.operation === "REBASE").length,
      retryCount: taskSubTasks.reduce((total, subTask) => total + (subTask.retryCount ?? 0), 0),
      sandboxLaunchFailureCount: (launchFailuresByTaskId.get(task.id) ?? []).filter((failure) => (
        failure.kind === "SANDBOX_LAUNCH_FAILURE"
      )).length,
      status: task.status,
      taskId: task.id,
      title: task.title,
      workerSessionCount: taskSessions.filter((session) => session.sessionType === SESSION_TYPE.WORKER).length,
    };
  });
}

function resolveRetrySessions(sessions) {
  const sessionsBySubTaskId = groupBy(
    sessions.filter((session) => session.sessionType === SESSION_TYPE.WORKER && session.subTaskId),
    (session) => session.subTaskId,
  );
  const retrySessions = [];

  for (const subTaskSessions of sessionsBySubTaskId.values()) {
    const orderedSessions = [...subTaskSessions].sort(compareByCreatedAt);
    retrySessions.push(...orderedSessions.slice(1));
  }

  return retrySessions;
}

function hasEarlyReworkAdoption(reviewRecord, sessions, reviewRecords) {
  const subsequentWorkerSession = sessions
    .filter((session) => session.sessionType === SESSION_TYPE.WORKER && session.subTaskId === reviewRecord.subTaskId)
    .filter((session) => compareTimestamp(session.createdAt, reviewRecord.createdAt) > 0)
    .sort(compareByCreatedAt)[0] ?? null;

  if (!subsequentWorkerSession) {
    return false;
  }

  const firstFinalReview = reviewRecords
    .filter((record) => record.subTaskId === reviewRecord.subTaskId && record.phase === "FINAL")
    .sort(compareByCreatedAt)[0] ?? null;

  if (!firstFinalReview) {
    return true;
  }

  return compareTimestamp(subsequentWorkerSession.createdAt, firstFinalReview.createdAt) < 0;
}

function resolveFirstOutputDurationsMs(tasks, sessions, planSnapshots) {
  const approvedSnapshotByTaskId = new Map(
    planSnapshots
      .filter((snapshot) => snapshot.source === "APPROVED")
      .map((snapshot) => [snapshot.taskId, snapshot]),
  );
  const sessionsByTaskId = groupBy(sessions, (session) => session.taskId);
  const durations = [];

  for (const task of tasks) {
    if (typeof task.approvedPlanJson !== "string") {
      continue;
    }

    const approvedSnapshot = approvedSnapshotByTaskId.get(task.id);

    if (!approvedSnapshot?.createdAt) {
      continue;
    }

    const firstWorkerOutputAt = (sessionsByTaskId.get(task.id) ?? [])
      .filter((session) => session.sessionType === SESSION_TYPE.WORKER && normalizeText(session.firstOutputAt))
      .map((session) => session.firstOutputAt)
      .sort()[0] ?? null;

    if (!firstWorkerOutputAt) {
      continue;
    }

    const durationMs = Date.parse(firstWorkerOutputAt) - Date.parse(approvedSnapshot.createdAt);

    if (Number.isFinite(durationMs) && durationMs >= 0) {
      durations.push(durationMs);
    }
  }

  return durations;
}

function resolveTasksMissingFirstOutputTiming(tasks, sessions, planSnapshots) {
  const approvedSnapshotByTaskId = new Map(
    planSnapshots
      .filter((snapshot) => snapshot.source === "APPROVED")
      .map((snapshot) => [snapshot.taskId, snapshot]),
  );
  const sessionsByTaskId = groupBy(sessions, (session) => session.taskId);

  return tasks
    .filter((task) => typeof task.approvedPlanJson === "string")
    .filter((task) => {
      const approvedSnapshot = approvedSnapshotByTaskId.get(task.id);
      const workerSessions = (sessionsByTaskId.get(task.id) ?? []).filter((session) => session.sessionType === SESSION_TYPE.WORKER);
      const hasOutputWithoutTimestamp = workerSessions.some((session) => (
        normalizeText(session.outputBuffer) && !normalizeText(session.firstOutputAt)
      ));

      return !approvedSnapshot?.createdAt || hasOutputWithoutTimestamp;
    })
    .map((task) => task.id);
}

function buildUnavailableMetrics(tasksMissingFirstOutputTiming) {
  const unavailable = [];

  unavailable.push({
    metric: "routingCorrectness",
    reason: "No persisted cross-session routing audit exists in the local database.",
  });

  if (tasksMissingFirstOutputTiming.length > 0) {
    unavailable.push({
      metric: "medianPlanApprovalToFirstWorkerOutputMs",
      reason: `Missing persisted first-output timestamps for task ids: ${tasksMissingFirstOutputTiming.join(", ")}.`,
    });
  }

  return unavailable;
}

function parseCleanupWarningMessage(message) {
  if (!isStructuredMessage(message, CLEANUP_WARNING_MESSAGE_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(message.content.slice(CLEANUP_WARNING_MESSAGE_PREFIX.length));
    const worktreePath = normalizeText(parsed?.worktreePath);
    const reason = normalizeText(parsed?.reason);

    if (!worktreePath || !reason) {
      return null;
    }

    return {
      createdAt: message.createdAt,
      reason,
      taskId: message.taskId,
      worktreePath,
    };
  } catch {
    return null;
  }
}

function parseLaunchFailureMessage(message) {
  if (!isStructuredMessage(message, LAUNCH_FAILURE_MESSAGE_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(message.content.slice(LAUNCH_FAILURE_MESSAGE_PREFIX.length));
    const kind = normalizeText(parsed?.kind);
    const reason = normalizeText(parsed?.reason);

    if (!kind || !reason) {
      return null;
    }

    return {
      createdAt: message.createdAt,
      kind,
      reason,
      subTaskId: normalizeText(parsed?.subTaskId),
      taskId: message.taskId,
    };
  } catch {
    return null;
  }
}

function isStructuredMessage(message, prefix) {
  return message?.role === "SYSTEM"
    && typeof message.content === "string"
    && message.content.startsWith(prefix);
}

function groupBy(records, keySelector) {
  const grouped = new Map();

  for (const record of records) {
    const key = keySelector(record);
    const entry = grouped.get(key) ?? [];
    entry.push(record);
    grouped.set(key, entry);
  }

  return grouped;
}

function compareByCreatedAt(left, right) {
  return compareTimestamp(left?.createdAt, right?.createdAt);
}

function compareTimestamp(left, right) {
  return Date.parse(left ?? "") - Date.parse(right ?? "");
}

function normalizeText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function safeRate(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[midpoint];
  }

  return Math.round((sorted[midpoint - 1] + sorted[midpoint]) / 2);
}

const TERMINAL_TASK_STATUSES = new Set([
  TASK_STATUS.CANCELLED,
  TASK_STATUS.COMPLETED,
  TASK_STATUS.FAILED,
]);
