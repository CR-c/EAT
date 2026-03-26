package task

import (
	"context"
	"strconv"
	"time"
)

func (s *Service) StartIntegrationRun(ctx context.Context, taskID string) (*IntegrationMutationResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}
	if taskRecord.Status != taskStatusMerging && taskRecord.Status != taskStatusActionRequired {
		return nil, failure(
			"INTEGRATION_START_NOT_ALLOWED",
			"Integration runs can only start while merging or after an integration failure requires action.",
			map[string]any{"status": taskRecord.Status, "taskId": taskID},
		)
	}

	subTasks, err := s.repository.ListSubTasksByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_SUBTASKS_READ_FAILED", err.Error(), nil)
	}

	result, serviceError := s.createIntegrationRun(ctx, taskRecord, subTasks, true)
	if serviceError != nil {
		return nil, serviceError
	}

	if result.Task != nil && result.Task.Status != taskRecord.Status {
		s.publishTaskStatus(result.Task.ID, result.Task.Status, nil)
	}
	if result.IntegrationRun != nil {
		s.publish(taskID, "integration:queued", map[string]any{
			"integrationBranch": result.IntegrationRun.IntegrationBranch,
			"integrationRunId":  result.IntegrationRun.ID,
			"status":            result.IntegrationRun.Status,
			"taskId":            taskID,
		})
	}
	return result, nil
}

func (s *Service) RetryIntegrationRun(ctx context.Context, integrationRunID string) (*IntegrationMutationResult, *Error) {
	integrationRun, err := s.repository.FindIntegrationRunByID(ctx, integrationRunID)
	if err != nil {
		return nil, failure("TASK_INTEGRATION_RUN_READ_FAILED", err.Error(), nil)
	}
	if integrationRun == nil {
		return nil, failure("INTEGRATION_RUN_NOT_FOUND", "Integration run not found.", map[string]any{"integrationRunId": integrationRunID})
	}

	taskRecord, err := s.repository.FindTaskByID(ctx, integrationRun.TaskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": integrationRun.TaskID})
	}
	if taskRecord.Status != taskStatusActionRequired || !isRetryableIntegrationStatus(integrationRun.Status) {
		return nil, failure(
			"INTEGRATION_RETRY_NOT_ALLOWED",
			"Integration retry is only available after an actionable integration failure or rollback.",
			map[string]any{"integrationRunId": integrationRunID, "integrationRunStatus": integrationRun.Status, "taskStatus": taskRecord.Status},
		)
	}

	subTasks, err := s.repository.ListSubTasksByTaskID(ctx, taskRecord.ID)
	if err != nil {
		return nil, failure("TASK_SUBTASKS_READ_FAILED", err.Error(), nil)
	}

	result, serviceError := s.createIntegrationRun(ctx, taskRecord, subTasks, true)
	if serviceError != nil {
		return nil, serviceError
	}

	if result.Task != nil && result.Task.Status != taskRecord.Status {
		s.publishTaskStatus(result.Task.ID, result.Task.Status, nil)
	}
	if result.IntegrationRun != nil {
		s.publish(taskRecord.ID, "integration:queued", map[string]any{
			"integrationBranch": result.IntegrationRun.IntegrationBranch,
			"integrationRunId":  result.IntegrationRun.ID,
			"status":            result.IntegrationRun.Status,
			"taskId":            taskRecord.ID,
		})
	}
	return result, nil
}

func (s *Service) RollbackIntegrationRun(ctx context.Context, integrationRunID string) (*IntegrationMutationResult, *Error) {
	integrationRun, err := s.repository.FindIntegrationRunByID(ctx, integrationRunID)
	if err != nil {
		return nil, failure("TASK_INTEGRATION_RUN_READ_FAILED", err.Error(), nil)
	}
	if integrationRun == nil {
		return nil, failure("INTEGRATION_RUN_NOT_FOUND", "Integration run not found.", map[string]any{"integrationRunId": integrationRunID})
	}

	taskRecord, err := s.repository.FindTaskByID(ctx, integrationRun.TaskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": integrationRun.TaskID})
	}
	if taskRecord.Status != taskStatusActionRequired || !isRollbackableIntegrationStatus(integrationRun.Status) {
		return nil, failure(
			"INTEGRATION_ROLLBACK_NOT_ALLOWED",
			"Integration rollback is only available after an actionable integration failure.",
			map[string]any{"integrationRunId": integrationRunID, "integrationRunStatus": integrationRun.Status, "taskStatus": taskRecord.Status},
		)
	}

	result := &IntegrationMutationResult{Task: taskRecord}
	txErr := s.repository.RunInTransaction(ctx, func(repository *Repository) error {
		endedAt := time.Now().UTC().Format(time.RFC3339Nano)
		rolledBackStatus := "ROLLED_BACK"
		updatedRun, updateErr := repository.UpdateIntegrationRun(ctx, integrationRunID, UpdateIntegrationRunInput{
			Status:     &rolledBackStatus,
			EndedAt:    &endedAt,
			SetEndedAt: true,
		})
		if updateErr != nil {
			return updateErr
		}
		result.IntegrationRun = updatedRun

		queueItems, err := repository.ListIntegrationQueueItemsByIntegrationRunID(ctx, integrationRunID)
		if err != nil {
			return err
		}
		for _, queueItem := range queueItems {
			nextStatus := queueItem.Status
			if queueItem.Status != "RELEASED" {
				nextStatus = "ROLLED_BACK"
			}
			if nextStatus == queueItem.Status {
				continue
			}
			if _, err := repository.UpdateIntegrationQueueItem(ctx, queueItem.ID, UpdateIntegrationQueueItemInput{
				Status: &nextStatus,
			}); err != nil {
				return err
			}
		}
		return nil
	})
	if txErr != nil {
		return nil, failure("INTEGRATION_ROLLBACK_FAILED", txErr.Error(), nil)
	}

	if result.IntegrationRun != nil {
		s.publish(taskRecord.ID, "integration:failed", map[string]any{
			"integrationBranch": result.IntegrationRun.IntegrationBranch,
			"integrationRunId":  result.IntegrationRun.ID,
			"reason":            "Integration run rolled back by operator.",
			"status":            result.IntegrationRun.Status,
			"taskId":            taskRecord.ID,
		})
	}
	return result, nil
}

func (s *Service) DequeueIntegrationQueueItem(ctx context.Context, integrationQueueItemID string) (*IntegrationMutationResult, *Error) {
	queueItem, err := s.repository.FindIntegrationQueueItemByID(ctx, integrationQueueItemID)
	if err != nil {
		return nil, failure("TASK_INTEGRATION_QUEUE_ITEM_READ_FAILED", err.Error(), nil)
	}
	if queueItem == nil {
		return nil, failure("INTEGRATION_QUEUE_ITEM_NOT_FOUND", "Integration queue item not found.", map[string]any{"integrationQueueItemId": integrationQueueItemID})
	}

	integrationRun, err := s.repository.FindIntegrationRunByID(ctx, queueItem.IntegrationRunID)
	if err != nil {
		return nil, failure("TASK_INTEGRATION_RUN_READ_FAILED", err.Error(), nil)
	}
	if integrationRun == nil {
		return nil, failure("INTEGRATION_RUN_NOT_FOUND", "Integration run not found.", map[string]any{"integrationRunId": queueItem.IntegrationRunID})
	}

	taskRecord, err := s.repository.FindTaskByID(ctx, integrationRun.TaskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": integrationRun.TaskID})
	}

	if taskRecord.Status != taskStatusActionRequired || integrationRun.Status != taskStatusActionRequired || queueItem.Status == "RELEASED" || queueItem.Status == "DEQUEUED" {
		return nil, failure(
			"INTEGRATION_DEQUEUE_NOT_ALLOWED",
			"Integration dequeue is only available for actionable queue items during an interrupted integration run.",
			map[string]any{"integrationQueueItemId": integrationQueueItemID, "integrationRunStatus": integrationRun.Status, "queueItemStatus": queueItem.Status, "taskStatus": taskRecord.Status},
		)
	}

	dequeuedStatus := "DEQUEUED"
	updatedQueueItem, err := s.repository.UpdateIntegrationQueueItem(ctx, integrationQueueItemID, UpdateIntegrationQueueItemInput{
		Status: &dequeuedStatus,
	})
	if err != nil {
		return nil, failure("INTEGRATION_DEQUEUE_FAILED", err.Error(), nil)
	}

	s.publish(taskRecord.ID, "integration:queued", map[string]any{
		"integrationQueueItemId": updatedQueueItem.ID,
		"integrationRunId":       integrationRun.ID,
		"status":                 updatedQueueItem.Status,
		"subTaskId":              updatedQueueItem.SubTaskID,
		"taskId":                 taskRecord.ID,
	})

	return &IntegrationMutationResult{
		IntegrationQueueItem: updatedQueueItem,
		Task:                 taskRecord,
	}, nil
}

func (s *Service) createIntegrationRun(ctx context.Context, taskRecord *Task, subTasks []SubTask, resumeFromActionRequired bool) (*IntegrationMutationResult, *Error) {
	result := &IntegrationMutationResult{}
	txErr := s.repository.RunInTransaction(ctx, func(repository *Repository) error {
		nextTask := taskRecord
		var err error
		if resumeFromActionRequired && taskRecord.Status == taskStatusActionRequired {
			mergingStatus := taskStatusMerging
			nextTask, err = repository.UpdateTask(ctx, taskRecord.ID, UpdateTaskInput{
				Status:       &mergingStatus,
				LastError:    nil,
				SetLastError: true,
			})
			if err != nil {
				return err
			}
		}

		existingRuns, err := repository.ListIntegrationRunsByTaskID(ctx, taskRecord.ID)
		if err != nil {
			return err
		}
		integrationBranch := "eat/" + taskRecord.ID + "/integration-" + strconv.Itoa(len(existingRuns)+1)
		queuedStatus := "QUEUED"
		runRecord, err := repository.CreateIntegrationRun(ctx, CreateIntegrationRunInput{
			TaskID:            taskRecord.ID,
			IntegrationBranch: integrationBranch,
			Status:            queuedStatus,
		})
		if err != nil {
			return err
		}

		acceptedSubTasks := filterIntegrationEligibleSubTasks(subTasks)
		for index, subTask := range acceptedSubTasks {
			queueStatus := "QUEUED"
			queueOrder := int64(index + 1)
			if _, err := repository.CreateIntegrationQueueItem(ctx, CreateIntegrationQueueItemInput{
				IntegrationRunID: runRecord.ID,
				SubTaskID:        subTask.ID,
				QueueOrder:       queueOrder,
				Status:           queueStatus,
			}); err != nil {
				return err
			}
		}

		result.IntegrationRun = runRecord
		result.Task = nextTask
		return nil
	})
	if txErr != nil {
		return nil, failure("INTEGRATION_RUN_CREATE_FAILED", txErr.Error(), nil)
	}
	return result, nil
}

func filterIntegrationEligibleSubTasks(subTasks []SubTask) []SubTask {
	eligible := make([]SubTask, 0)
	for _, subTask := range sortSubTasksForDisplay(subTasks) {
		if subTask.Status == "ACCEPTED" {
			eligible = append(eligible, subTask)
		}
	}
	return eligible
}

func isRetryableIntegrationStatus(status string) bool {
	return status == taskStatusActionRequired || status == "FAILED" || status == "ROLLED_BACK"
}

func isRollbackableIntegrationStatus(status string) bool {
	return status == taskStatusActionRequired || status == "FAILED"
}
