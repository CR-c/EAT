package task

import (
	"context"
	"sort"
	"strings"
)

func (s *Service) buildTaskIntegrationView(ctx context.Context, taskRecord *Task, subTasks []SubTask) (map[string]any, *Error) {
	integrationRuns, err := s.repository.ListIntegrationRunsByTaskID(ctx, taskRecord.ID)
	if err != nil {
		return nil, failure("TASK_INTEGRATION_RUNS_READ_FAILED", err.Error(), nil)
	}

	subTaskByID := make(map[string]SubTask, len(subTasks))
	for _, subTask := range subTasks {
		subTaskByID[subTask.ID] = subTask
	}

	runs := make([]map[string]any, 0, len(integrationRuns))
	for _, integrationRun := range integrationRuns {
		queueItems, err := s.repository.ListIntegrationQueueItemsByIntegrationRunID(ctx, integrationRun.ID)
		if err != nil {
			return nil, failure("TASK_INTEGRATION_QUEUE_ITEMS_READ_FAILED", err.Error(), nil)
		}
		gateResults, err := s.repository.ListGateResultsByIntegrationRunID(ctx, integrationRun.ID)
		if err != nil {
			return nil, failure("TASK_GATE_RESULTS_READ_FAILED", err.Error(), nil)
		}

		queueItemViews := make([]map[string]any, 0, len(queueItems))
		for _, queueItem := range queueItems {
			queueItemViews = append(queueItemViews, map[string]any{
				"id":               queueItem.ID,
				"integrationRunId": queueItem.IntegrationRunID,
				"subTaskId":        queueItem.SubTaskID,
				"queueOrder":       queueItem.QueueOrder,
				"status":           queueItem.Status,
				"mergedCommitSha":  queueItem.MergedCommitSHA,
				"createdAt":        queueItem.CreatedAt,
				"updatedAt":        queueItem.UpdatedAt,
				"subTask":          subTaskOrNil(subTaskByID, queueItem.SubTaskID),
			})
		}

		gateResultViews := make([]map[string]any, 0, len(gateResults))
		for _, gateResult := range gateResults {
			gateResultViews = append(gateResultViews, map[string]any{
				"id":               gateResult.ID,
				"integrationRunId": gateResult.IntegrationRunID,
				"gateType":         gateResult.GateType,
				"status":           gateResult.Status,
				"summary":          gateResult.Summary,
				"detailsJson":      gateResult.DetailsJSON,
				"createdAt":        gateResult.CreatedAt,
			})
		}

		runs = append(runs, map[string]any{
			"id":                integrationRun.ID,
			"taskId":            integrationRun.TaskID,
			"integrationBranch": integrationRun.IntegrationBranch,
			"status":            integrationRun.Status,
			"startedAt":         integrationRun.StartedAt,
			"endedAt":           integrationRun.EndedAt,
			"createdAt":         integrationRun.CreatedAt,
			"updatedAt":         integrationRun.UpdatedAt,
			"queueItems":        queueItemViews,
			"gateResults":       gateResultViews,
		})
	}

	var latestRun any
	if len(runs) > 0 {
		latestRun = runs[len(runs)-1]
	}

	return map[string]any{
		"latestRun": latestRun,
		"runs":      runs,
		"task": map[string]any{
			"id":             taskRecord.ID,
			"status":         taskRecord.Status,
			"taskBranchName": taskRecord.TaskBranchName,
			"title":          taskRecord.Title,
		},
	}, nil
}

func latestSessionByType(sessions []Session, sessionType, subTaskID string) *Session {
	for index := len(sessions) - 1; index >= 0; index-- {
		session := sessions[index]
		if session.SessionType != sessionType {
			continue
		}
		if subTaskID != "" && derefString(session.SubTaskID) != subTaskID {
			continue
		}
		return &session
	}
	return nil
}

func sortSubTasksForDisplay(subTasks []SubTask) []SubTask {
	sorted := append([]SubTask(nil), subTasks...)
	sort.SliceStable(sorted, func(i, j int) bool {
		leftOrder := int64(1 << 30)
		rightOrder := int64(1 << 30)
		if sorted[i].ExecutionOrder != nil {
			leftOrder = *sorted[i].ExecutionOrder
		}
		if sorted[j].ExecutionOrder != nil {
			rightOrder = *sorted[j].ExecutionOrder
		}
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		return sorted[i].CreatedAt < sorted[j].CreatedAt
	})
	return sorted
}

func assignmentSourceForSubTask(subTask SubTask) string {
	if subTask.AutoAssigned {
		return subTaskAssignmentSourceLead
	}
	return "OPERATOR"
}

func buildDerivedRunSummary(subTask SubTask) string {
	switch subTask.Status {
	case "BLOCKED":
		if len(subTask.DependencyBranchSuffixes) > 0 {
			return "Waiting on " + strings.Join(subTask.DependencyBranchSuffixes, ", ") + " before this member can run."
		}
		return "Waiting on upstream dependencies before this member can run."
	case "PENDING":
		return "Queued for team execution."
	case "READY":
		return "Workspace is ready. Waiting for worker launch."
	case "RUNNING":
		if subTask.WorktreePath != nil && *subTask.WorktreePath != "" {
			return "Running in " + *subTask.WorktreePath + "."
		}
		return "Worker session is running."
	case "REVIEW_PENDING":
		return "Worker run finished. Waiting for review outcome."
	case "ACCEPTED":
		return "Accepted for integration."
	case "REWORK_REQUIRED":
		return firstNonEmpty(derefString(subTask.LatestReviewSummary), "Needs another worker pass before integration.")
	case "DISCARD_PENDING":
		return firstNonEmpty(derefString(subTask.LatestReviewSummary), "Marked for discard. Waiting for operator confirmation.")
	case "MERGED":
		return "Merged into the task base branch."
	case "FAILED":
		return firstNonEmpty(derefString(subTask.LastError), "Worker execution failed.")
	case "CANCELLED":
		return "Cancelled by the operator."
	case "DISCARDED":
		return "Discarded from the merge set."
	default:
		return "Waiting for team lifecycle events."
	}
}
