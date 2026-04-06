package task

import (
	"context"
	"errors"
	"strings"
	"time"
)

func (s *Service) RetrySubTask(ctx context.Context, subTaskID string, input RetrySubTaskRequest) (*SubTaskMutationResult, *Error) {
	subTask, taskRecord, serviceError := s.loadSubTaskContext(ctx, subTaskID)
	if serviceError != nil {
		return nil, serviceError
	}
	if taskRecord.Status != taskStatusActionRequired && taskRecord.Status != taskStatusExecuting {
		return nil, failure(
			ErrorCodeSubTaskRetryNotAllowed,
			"Subtask retry is only available while the task is executing or action is required.",
			map[string]any{"status": taskRecord.Status, "subTaskId": subTaskID},
		)
	}
	if hasLive, serviceError := s.ensureNoLiveWorkerSession(ctx, subTaskID); serviceError != nil {
		return nil, serviceError
	} else if hasLive {
		return nil, failure(ErrorCodeSubTaskActiveSession, "The subtask already has a live worker session.", map[string]any{"subTaskId": subTaskID})
	}

	result, serviceError := s.relaunchSubTask(ctx, taskRecord, subTask, relaunchSubTaskOptions{
		Description:       input.Description,
		ResumeTaskStatus:  true,
		NextStatus:        subTaskStatusPending,
		ForceManualAssign: true,
		ErrorCode:         "SUBTASK_RETRY_FAILED",
	})
	if serviceError != nil {
		return nil, serviceError
	}

	s.publishSubTaskStatus(taskRecord.ID, result.SubTask)
	if result.Session != nil {
		s.publishSession(taskRecord.ID, "session:started", result.Session)
		s.notifyWorkerQueued(taskRecord.ID)
	}
	if result.Task != nil && result.Task.Status != taskRecord.Status {
		s.publishTaskStatus(result.Task.ID, result.Task.Status, nil)
	}
	s.publishTeamUpdated(taskRecord.ID)
	return result, nil
}

func (s *Service) ReworkSubTask(ctx context.Context, subTaskID string, input ReworkSubTaskRequest) (*SubTaskMutationResult, *Error) {
	subTask, taskRecord, serviceError := s.loadSubTaskContext(ctx, subTaskID)
	if serviceError != nil {
		return nil, serviceError
	}
	if taskRecord.Status != taskStatusExecuting {
		return nil, failure(
			ErrorCodeSubTaskReworkNotAllowed,
			"Early rework is only available while the task is executing.",
			map[string]any{"status": taskRecord.Status, "subTaskId": subTaskID},
		)
	}
	if !isEarlyReworkEligible(subTask) {
		return nil, failure(
			ErrorCodeSubTaskReworkNotAllowed,
			"This subtask does not have an actionable incremental review yet.",
			map[string]any{
				"latestReviewDecision": derefString(subTask.LatestReviewDecision),
				"status":               subTask.Status,
				"subTaskId":            subTaskID,
			},
		)
	}
	if hasLive, serviceError := s.ensureNoLiveWorkerSession(ctx, subTaskID); serviceError != nil {
		return nil, serviceError
	} else if hasLive {
		return nil, failure(ErrorCodeSubTaskActiveSession, "The subtask already has a live worker session.", map[string]any{"subTaskId": subTaskID})
	}

	result, serviceError := s.relaunchSubTask(ctx, taskRecord, subTask, relaunchSubTaskOptions{
		Description:       input.Description,
		NextStatus:        subTaskStatusPending,
		ForceManualAssign: true,
		ErrorCode:         "SUBTASK_REWORK_FAILED",
	})
	if serviceError != nil {
		return nil, serviceError
	}

	s.publish(taskRecord.ID, "subtask:rework", map[string]any{
		"description": result.SubTask.Description,
		"subTaskId":   subTaskID,
		"taskId":      taskRecord.ID,
	})
	s.publishSubTaskStatus(taskRecord.ID, result.SubTask)
	if result.Session != nil {
		s.publishSession(taskRecord.ID, "session:started", result.Session)
		s.notifyWorkerQueued(taskRecord.ID)
	}
	s.publishTeamUpdated(taskRecord.ID)
	return result, nil
}

func (s *Service) CancelSubTask(ctx context.Context, subTaskID string) (*SubTaskMutationResult, *Error) {
	subTask, taskRecord, serviceError := s.loadSubTaskContext(ctx, subTaskID)
	if serviceError != nil {
		return nil, serviceError
	}
	if !isSubTaskCancelEligible(taskRecord, subTask) {
		return nil, failure(
			ErrorCodeSubTaskCancelNotAllowed,
			"Cancelling this member is not allowed from the current task or subtask state.",
			map[string]any{"status": subTask.Status, "subTaskId": subTaskID, "taskStatus": taskRecord.Status},
		)
	}

	var result SubTaskMutationResult
	txErr := s.repository.RunInTransaction(ctx, func(repository *Repository) error {
		sessions, err := repository.ListSessionsBySubTaskID(ctx, subTaskID)
		if err != nil {
			return err
		}
		liveSession := latestLiveWorkerSession(sessions)
		if liveSession != nil {
			cancelledAt := time.Now().UTC().Format(time.RFC3339Nano)
			cancelledStatus := sessionStatusCancelled
			updatedSession, updateErr := repository.UpdateSession(ctx, liveSession.ID, UpdateSessionInput{
				Status:      &cancelledStatus,
				SetStatus:   true,
				EndedAt:     &cancelledAt,
				SetEndedAt:  true,
				ExitCode:    nil,
				SetExitCode: true,
			})
			if updateErr != nil {
				return updateErr
			}
			result.Session = updatedSession
		}

		nextStatus := "CANCELLED"
		runSummary := "Cancelled by the operator."
		assignmentSource := stringPointer("OPERATOR")
		updatedSubTask, updateErr := repository.UpdateSubTask(ctx, subTaskID, UpdateSubTaskInput{
			Status:              &nextStatus,
			LastError:           nil,
			SetLastError:        true,
			AssignmentSource:    assignmentSource,
			SetAssignmentSource: true,
			RunSummary:          &runSummary,
			SetRunSummary:       true,
		})
		if updateErr != nil {
			return updateErr
		}
		result.SubTask = updatedSubTask

		nextTask, readErr := repository.FindTaskByID(ctx, taskRecord.ID)
		if readErr != nil {
			return readErr
		}
		result.Task = nextTask
		return nil
	})
	if txErr != nil {
		return nil, failure("SUBTASK_CANCEL_FAILED", txErr.Error(), nil)
	}

	if result.Session != nil {
		s.publishSession(taskRecord.ID, "session:ended", result.Session)
	}
	s.publish(taskRecord.ID, "subtask:cancelled", map[string]any{
		"status":    result.SubTask.Status,
		"subTaskId": subTaskID,
		"taskId":    taskRecord.ID,
	})
	s.publishSubTaskStatus(taskRecord.ID, result.SubTask)
	scheduleResult, scheduleError := s.progressDependencySchedule(ctx, taskRecord.ID)
	if scheduleError != nil {
		return nil, scheduleError
	}
	if scheduleResult != nil {
		for _, releasedSubTask := range scheduleResult.ReleasedSubTasks {
			releasedSubTaskCopy := releasedSubTask
			s.publishSubTaskStatus(taskRecord.ID, &releasedSubTaskCopy)
		}
		for _, releasedSession := range scheduleResult.ReleasedSessions {
			releasedSessionCopy := releasedSession
			s.publishSession(taskRecord.ID, "session:started", &releasedSessionCopy)
		}
		if len(scheduleResult.ReleasedSessions) > 0 {
			s.notifyWorkerQueued(taskRecord.ID)
		}
		if scheduleResult.Task != nil && result.Task != nil && shouldPublishTaskStatus(result.Task, scheduleResult.Task) {
			s.publishTaskStatus(scheduleResult.Task.ID, scheduleResult.Task.Status, scheduleResult.Task.LastError)
			result.Task = scheduleResult.Task
		}
	}
	s.publishTeamUpdated(taskRecord.ID)
	return &result, nil
}

func (s *Service) ReassignSubTask(ctx context.Context, subTaskID string, input ReassignSubTaskRequest) (*SubTaskMutationResult, *Error) {
	subTask, taskRecord, serviceError := s.loadSubTaskContext(ctx, subTaskID)
	if serviceError != nil {
		return nil, serviceError
	}
	if !isSubTaskReassignEligible(taskRecord, subTask) {
		return nil, failure(
			ErrorCodeSubTaskReassignNotAllowed,
			"Reassigning this member is not allowed from the current task or subtask state.",
			map[string]any{"status": subTask.Status, "subTaskId": subTaskID, "taskStatus": taskRecord.Status},
		)
	}
	if hasLive, serviceError := s.ensureNoLiveWorkerSession(ctx, subTaskID); serviceError != nil {
		return nil, serviceError
	} else if hasLive {
		return nil, failure(ErrorCodeSubTaskActiveSession, "The subtask already has a live worker session.", map[string]any{"subTaskId": subTaskID})
	}

	siblingSubTasks, err := s.repository.ListSubTasksByTaskID(ctx, taskRecord.ID)
	if err != nil {
		return nil, failure("TASK_SUBTASKS_READ_FAILED", err.Error(), nil)
	}

	nextStatus := subTaskStatusPending
	if !areSubTaskDependenciesSatisfied(subTask, siblingSubTasks) {
		nextStatus = subTaskStatusBlocked
	}

	result, serviceError := s.relaunchSubTask(ctx, taskRecord, subTask, relaunchSubTaskOptions{
		AgentType:         input.AgentType,
		Description:       input.Description,
		ResumeTaskStatus:  true,
		NextStatus:        nextStatus,
		ForceManualAssign: true,
		ClearAutoAssigned: true,
		CreateSession:     nextStatus != subTaskStatusBlocked,
		ErrorCode:         "SUBTASK_REASSIGN_FAILED",
	})
	if serviceError != nil {
		return nil, serviceError
	}

	s.publish(taskRecord.ID, "subtask:assigned", map[string]any{
		"agentType":        result.SubTask.AgentType,
		"assignmentSource": result.SubTask.AssignmentSource,
		"displayName":      result.SubTask.DisplayName,
		"role":             result.SubTask.Role,
		"status":           result.SubTask.Status,
		"subTaskId":        subTaskID,
		"taskId":           taskRecord.ID,
	})
	s.publishSubTaskStatus(taskRecord.ID, result.SubTask)
	if result.Session != nil {
		s.publishSession(taskRecord.ID, "session:started", result.Session)
		s.notifyWorkerQueued(taskRecord.ID)
	}
	if result.Task != nil && result.Task.Status != taskRecord.Status {
		s.publishTaskStatus(result.Task.ID, result.Task.Status, nil)
	}
	s.publishTeamUpdated(taskRecord.ID)
	return result, nil
}

func (s *Service) ChangeSubTaskAgent(ctx context.Context, subTaskID string, input ChangeSubTaskAgentRequest) (*SubTaskMutationResult, *Error) {
	subTask, taskRecord, serviceError := s.loadSubTaskContext(ctx, subTaskID)
	if serviceError != nil {
		return nil, serviceError
	}
	if !isAgentChangeEligible(taskRecord, subTask) {
		return nil, failure(
			ErrorCodeSubTaskChangeAgentInvalid,
			"Changing the assigned worker is not allowed from the current subtask state.",
			map[string]any{"status": subTask.Status, "subTaskId": subTaskID, "taskStatus": taskRecord.Status},
		)
	}
	if hasLive, serviceError := s.ensureNoLiveWorkerSession(ctx, subTaskID); serviceError != nil {
		return nil, serviceError
	} else if hasLive {
		return nil, failure(ErrorCodeSubTaskActiveSession, "The subtask already has a live worker session.", map[string]any{"subTaskId": subTaskID})
	}

	nextAgentType := normalizeRequiredString(input.AgentType)
	if nextAgentType == "" {
		return nil, failure("AGENT_TYPE_REQUIRED", "A replacement worker agent is required before relaunch.", map[string]any{"subTaskId": subTaskID})
	}
	if nextAgentType == subTask.AgentType {
		return nil, failure(
			ErrorCodeSubTaskChangeAgentInvalid,
			"Select a different worker agent before using Switch Agent & Relaunch.",
			map[string]any{"agentType": nextAgentType, "subTaskId": subTaskID},
		)
	}

	result, serviceError := s.relaunchSubTask(ctx, taskRecord, subTask, relaunchSubTaskOptions{
		AgentType:         nextAgentType,
		Description:       input.Description,
		ResumeTaskStatus:  true,
		NextStatus:        subTaskStatusPending,
		ForceManualAssign: true,
		ClearAutoAssigned: true,
		ErrorCode:         "SUBTASK_CHANGE_AGENT_FAILED",
	})
	if serviceError != nil {
		return nil, serviceError
	}

	s.publish(taskRecord.ID, "subtask:agent-changed", map[string]any{
		"newAgentType": nextAgentType,
		"oldAgentType": subTask.AgentType,
		"subTaskId":    subTaskID,
		"taskId":       taskRecord.ID,
	})
	s.publishSubTaskStatus(taskRecord.ID, result.SubTask)
	if result.Session != nil {
		s.publishSession(taskRecord.ID, "session:started", result.Session)
		s.notifyWorkerQueued(taskRecord.ID)
	}
	if result.Task != nil && result.Task.Status != taskRecord.Status {
		s.publishTaskStatus(result.Task.ID, result.Task.Status, nil)
	}
	s.publishTeamUpdated(taskRecord.ID)
	return result, nil
}

func (s *Service) ConfirmDiscardSubTask(ctx context.Context, subTaskID string) (*SubTaskMutationResult, *Error) {
	subTask, taskRecord, serviceError := s.loadSubTaskContext(ctx, subTaskID)
	if serviceError != nil {
		return nil, serviceError
	}
	if taskRecord.Status != taskStatusActionRequired || subTask.Status != "DISCARD_PENDING" {
		return nil, failure(
			ErrorCodeSubTaskDiscardNotAllowed,
			"Discard confirmation is only available for DISCARD_PENDING subtasks while the task is ACTION_REQUIRED.",
			map[string]any{"status": subTask.Status, "subTaskId": subTaskID, "taskStatus": taskRecord.Status},
		)
	}

	var result SubTaskMutationResult
	txErr := s.repository.RunInTransaction(ctx, func(repository *Repository) error {
		nextStatus := "DISCARDED"
		runSummary := "Discarded from the merge set."
		updatedSubTask, updateErr := repository.UpdateSubTask(ctx, subTaskID, UpdateSubTaskInput{
			Status:        &nextStatus,
			RunSummary:    &runSummary,
			SetRunSummary: true,
		})
		if updateErr != nil {
			return updateErr
		}
		result.SubTask = updatedSubTask

		subTasks, err := repository.ListSubTasksByTaskID(ctx, taskRecord.ID)
		if err != nil {
			return err
		}
		for index := range subTasks {
			if subTasks[index].ID == updatedSubTask.ID {
				subTasks[index] = *updatedSubTask
				break
			}
		}

		nextTask := taskRecord
		if isMergeResumeEligible(subTasks) {
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
		result.Task = nextTask
		return nil
	})
	if txErr != nil {
		return nil, failure("SUBTASK_CONFIRM_DISCARD_FAILED", txErr.Error(), nil)
	}

	s.publish(taskRecord.ID, "subtask:confirm-discard", map[string]any{
		"subTaskId": subTaskID,
		"taskId":    taskRecord.ID,
	})
	s.publishSubTaskStatus(taskRecord.ID, result.SubTask)
	scheduleResult, scheduleError := s.progressDependencySchedule(ctx, taskRecord.ID)
	if scheduleError != nil {
		return nil, scheduleError
	}
	if scheduleResult != nil {
		for _, releasedSubTask := range scheduleResult.ReleasedSubTasks {
			releasedSubTaskCopy := releasedSubTask
			s.publishSubTaskStatus(taskRecord.ID, &releasedSubTaskCopy)
		}
		for _, releasedSession := range scheduleResult.ReleasedSessions {
			releasedSessionCopy := releasedSession
			s.publishSession(taskRecord.ID, "session:started", &releasedSessionCopy)
		}
		if len(scheduleResult.ReleasedSessions) > 0 {
			s.notifyWorkerQueued(taskRecord.ID)
		}
		if scheduleResult.Task != nil && result.Task != nil && shouldPublishTaskStatus(result.Task, scheduleResult.Task) {
			s.publishTaskStatus(scheduleResult.Task.ID, scheduleResult.Task.Status, scheduleResult.Task.LastError)
			result.Task = scheduleResult.Task
		}
	}
	if result.Task != nil && result.Task.Status != taskRecord.Status {
		s.publishTaskStatus(result.Task.ID, result.Task.Status, nil)
	}
	s.publishTeamUpdated(taskRecord.ID)
	return &result, nil
}

func (s *Service) RebaseRetrySubTask(ctx context.Context, subTaskID string) (*RebaseRetrySubTaskResult, *Error) {
	subTask, taskRecord, serviceError := s.loadSubTaskContext(ctx, subTaskID)
	if serviceError != nil {
		return nil, serviceError
	}

	mergeRecords, err := s.repository.ListMergeRecordsBySubTaskID(ctx, subTaskID)
	if err != nil {
		return nil, failure("TASK_MERGE_RECORDS_READ_FAILED", err.Error(), nil)
	}
	latestMergeRecord := latestMergeRecord(mergeRecords)
	if taskRecord.Status != taskStatusActionRequired || !isRebaseRetryEligibleSubTaskStatus(subTask.Status) || latestMergeRecord == nil || latestMergeRecord.Operation != "MERGE" || latestMergeRecord.Status != "CONFLICT" {
		return nil, failure(
			"SUBTASK_REBASE_RETRY_NOT_ALLOWED",
			"Rebase & Retry is only available for accepted or review-pending subtasks whose latest merge attempt conflicted.",
			map[string]any{
				"latestMergeRecord": latestMergeRecord,
				"status":            subTask.Status,
				"subTaskId":         subTaskID,
				"taskStatus":        taskRecord.Status,
			},
		)
	}

	mergingStatus := taskStatusMerging
	nextTask, err := s.repository.UpdateTask(ctx, taskRecord.ID, UpdateTaskInput{
		Status:       &mergingStatus,
		LastError:    nil,
		SetLastError: true,
	})
	if err != nil {
		return nil, failure("SUBTASK_REBASE_RETRY_FAILED", err.Error(), nil)
	}

	s.publish(taskRecord.ID, "merge:status", map[string]any{
		"mergeStatus": "SUCCEEDED",
		"subTaskId":   subTaskID,
		"taskId":      taskRecord.ID,
	})
	s.publishTaskStatus(taskRecord.ID, nextTask.Status, nil)

	return &RebaseRetrySubTaskResult{
		MergeStatus: "SUCCEEDED",
		SubTask:     subTask,
		Task:        nextTask,
	}, nil
}

type relaunchSubTaskOptions struct {
	AgentType         string
	Description       string
	ResumeTaskStatus  bool
	NextStatus        string
	ForceManualAssign bool
	ClearAutoAssigned bool
	CreateSession     bool
	ErrorCode         string
}

func (s *Service) loadSubTaskContext(ctx context.Context, subTaskID string) (*SubTask, *Task, *Error) {
	subTask, err := s.repository.FindSubTaskByID(ctx, subTaskID)
	if err != nil {
		return nil, nil, failure("TASK_SUBTASK_READ_FAILED", err.Error(), nil)
	}
	if subTask == nil {
		return nil, nil, failure(ErrorCodeSubTaskNotFound, "Subtask not found.", map[string]any{"subTaskId": subTaskID})
	}

	taskRecord, err := s.repository.FindTaskByID(ctx, subTask.TaskID)
	if err != nil {
		return nil, nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": subTask.TaskID})
	}

	return subTask, taskRecord, nil
}

func (s *Service) ensureNoLiveWorkerSession(ctx context.Context, subTaskID string) (bool, *Error) {
	sessions, err := s.repository.ListSessionsBySubTaskID(ctx, subTaskID)
	if err != nil {
		return false, failure("TASK_SESSIONS_READ_FAILED", err.Error(), nil)
	}
	return latestLiveWorkerSession(sessions) != nil, nil
}

func (s *Service) relaunchSubTask(ctx context.Context, taskRecord *Task, subTask *SubTask, options relaunchSubTaskOptions) (*SubTaskMutationResult, *Error) {
	result := &SubTaskMutationResult{}
	txErr := s.repository.RunInTransaction(ctx, func(repository *Repository) error {
		nextTask := taskRecord
		var err error
		if options.ResumeTaskStatus && taskRecord.Status == taskStatusActionRequired {
			executingStatus := taskStatusExecuting
			nextTask, err = repository.UpdateTask(ctx, taskRecord.ID, UpdateTaskInput{
				Status:       &executingStatus,
				LastError:    nil,
				SetLastError: true,
			})
			if err != nil {
				return err
			}
		}

		nextDescription := subTask.Description
		if normalized := normalizeRequiredString(options.Description); normalized != "" {
			nextDescription = normalized
		}
		nextAgentType := subTask.AgentType
		if normalized := normalizeRequiredString(options.AgentType); normalized != "" {
			nextAgentType = normalized
		}
		manualAssignment := options.ForceManualAssign || normalizeRequiredString(derefString(subTask.AssignmentSource)) == "OPERATOR"
		nextRetryCount := subTask.RetryCount + 1
		runSummary := buildDerivedRunSummary(SubTask{
			Status:                   options.NextStatus,
			DependencyBranchSuffixes: subTask.DependencyBranchSuffixes,
			WorktreePath:             subTask.WorktreePath,
		})

		updatedSubTask, updateErr := repository.UpdateSubTask(ctx, subTask.ID, UpdateSubTaskInput{
			Description:         stringPointer(nextDescription),
			SetDescription:      true,
			AgentType:           stringPointer(nextAgentType),
			Status:              stringPointer(options.NextStatus),
			AutoAssigned:        boolPointer(nextAutoAssignedValue(subTask.AutoAssigned, options.ClearAutoAssigned)),
			RetryCount:          &nextRetryCount,
			LastError:           nil,
			SetLastError:        true,
			AssignmentSource:    assignmentSourcePointer(manualAssignment, subTask.AssignmentSource),
			SetAssignmentSource: manualAssignment || subTask.AssignmentSource != nil,
			RunSummary:          stringPointer(runSummary),
			SetRunSummary:       true,
		})
		if updateErr != nil {
			return updateErr
		}

		result.SubTask = updatedSubTask
		result.Task = nextTask

		createSession := options.CreateSession || options.NextStatus == subTaskStatusPending
		if !createSession {
			return nil
		}

		sessionRecord, sessionErr := repository.CreateSession(ctx, CreateSessionInput{
			TaskID:               taskRecord.ID,
			SubTaskID:            &updatedSubTask.ID,
			AgentType:            updatedSubTask.AgentType,
			SessionType:          sessionTypeWorker,
			SandboxType:          sessionSandboxDocker,
			Status:               "PENDING",
			OutputBuffer:         "",
			OutputBufferMaxBytes: 65536,
		})
		if sessionErr != nil {
			return sessionErr
		}
		result.Session = sessionRecord
		return nil
	})
	if txErr != nil {
		return nil, failure(options.ErrorCode, txErr.Error(), nil)
	}
	return result, nil
}

func (s *Service) progressDependencySchedule(ctx context.Context, taskID string) (*dependencyScheduleResult, *Error) {
	result := &dependencyScheduleResult{}
	txErr := s.repository.RunInTransaction(ctx, func(repository *Repository) error {
		taskRecord, err := repository.FindTaskByID(ctx, taskID)
		if err != nil {
			return err
		}
		if taskRecord == nil {
			return serviceFailure{payload: failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})}
		}
		result.Task = taskRecord

		if taskRecord.Status != taskStatusExecuting && taskRecord.Status != taskStatusActionRequired {
			return nil
		}

		subTasks, err := repository.ListSubTasksByTaskID(ctx, taskID)
		if err != nil {
			return err
		}

		attentionBlockedSubTasks := make([]SubTask, 0)
		for _, subTask := range subTasks {
			if subTask.Status != subTaskStatusBlocked {
				continue
			}

			if areSubTaskDependenciesSatisfied(&subTask, subTasks) {
				nextStatus := subTaskStatusPending
				runSummary := buildDerivedRunSummary(SubTask{
					Status:                   nextStatus,
					DependencyBranchSuffixes: subTask.DependencyBranchSuffixes,
					WorktreePath:             subTask.WorktreePath,
				})
				updatedSubTask, updateErr := repository.UpdateSubTask(ctx, subTask.ID, UpdateSubTaskInput{
					Status:        &nextStatus,
					LastError:     nil,
					SetLastError:  true,
					RunSummary:    &runSummary,
					SetRunSummary: true,
				})
				if updateErr != nil {
					return updateErr
				}
				result.ReleasedSubTasks = append(result.ReleasedSubTasks, *updatedSubTask)

				if taskRecord.Status == taskStatusExecuting {
					sessionRecord, sessionErr := repository.CreateSession(ctx, CreateSessionInput{
						TaskID:               taskID,
						SubTaskID:            &updatedSubTask.ID,
						AgentType:            updatedSubTask.AgentType,
						SessionType:          sessionTypeWorker,
						SandboxType:          sessionSandboxDocker,
						Status:               "PENDING",
						OutputBuffer:         "",
						OutputBufferMaxBytes: 65536,
					})
					if sessionErr != nil {
						return sessionErr
					}
					result.ReleasedSessions = append(result.ReleasedSessions, *sessionRecord)
				}
				continue
			}

			if isBlockedDependencyAttentionRequired(&subTask, subTasks) {
				attentionBlockedSubTasks = append(attentionBlockedSubTasks, subTask)
			}
		}

		if len(attentionBlockedSubTasks) == 0 {
			return nil
		}

		lastError := buildBlockedDependencyReason(attentionBlockedSubTasks, subTasks)
		if taskRecord.Status == taskStatusActionRequired && derefString(taskRecord.LastError) == lastError {
			return nil
		}

		nextStatus := taskStatusActionRequired
		updatedTask, updateErr := repository.UpdateTask(ctx, taskID, UpdateTaskInput{
			Status:       &nextStatus,
			LastError:    &lastError,
			SetLastError: true,
		})
		if updateErr != nil {
			return updateErr
		}
		result.Task = updatedTask
		return nil
	})
	if txErr != nil {
		var opErr serviceFailure
		if errors.As(txErr, &opErr) {
			return nil, opErr.payload
		}
		return nil, failure("DEPENDENCY_SCHEDULE_FAILED", txErr.Error(), map[string]any{"taskId": taskID})
	}
	return result, nil
}

func latestLiveWorkerSession(sessions []Session) *Session {
	for index := len(sessions) - 1; index >= 0; index-- {
		session := sessions[index]
		if session.SessionType != sessionTypeWorker || !isLiveSessionStatus(session.Status) {
			continue
		}
		return &session
	}
	return nil
}

func latestMergeRecord(records []MergeRecord) *MergeRecord {
	if len(records) == 0 {
		return nil
	}
	record := records[len(records)-1]
	return &record
}

func isEarlyReworkEligible(subTask *SubTask) bool {
	if subTask == nil {
		return false
	}
	return subTask.Status == "REVIEW_PENDING" && (derefString(subTask.LatestReviewDecision) == "REJECTED" || derefString(subTask.LatestReviewDecision) == "REWORK")
}

func isSubTaskReassignEligible(taskRecord *Task, subTask *SubTask) bool {
	if taskRecord == nil || subTask == nil {
		return false
	}
	if taskRecord.Status != taskStatusActionRequired && taskRecord.Status != taskStatusExecuting {
		return false
	}
	switch subTask.Status {
	case subTaskStatusBlocked, "CANCELLED", "FAILED", subTaskStatusPending, "READY", "REVIEW_PENDING", "REWORK_REQUIRED":
		return true
	default:
		return false
	}
}

func isSubTaskCancelEligible(taskRecord *Task, subTask *SubTask) bool {
	if taskRecord == nil || subTask == nil {
		return false
	}
	if taskRecord.Status != taskStatusActionRequired && taskRecord.Status != taskStatusExecuting {
		return false
	}
	switch subTask.Status {
	case subTaskStatusBlocked, "FAILED", subTaskStatusPending, "READY", "REVIEW_PENDING", "REWORK_REQUIRED", "RUNNING":
		return true
	default:
		return false
	}
}

func isAgentChangeEligible(taskRecord *Task, subTask *SubTask) bool {
	if taskRecord == nil || subTask == nil {
		return false
	}
	if taskRecord.Status != taskStatusActionRequired && taskRecord.Status != taskStatusExecuting {
		return false
	}
	switch subTask.Status {
	case "CANCELLED", "FAILED", "REVIEW_PENDING", "REWORK_REQUIRED":
		return true
	default:
		return false
	}
}

func isRebaseRetryEligibleSubTaskStatus(status string) bool {
	return status == "ACCEPTED" || status == "REVIEW_PENDING"
}

func areSubTaskDependenciesSatisfied(subTask *SubTask, siblingSubTasks []SubTask) bool {
	if subTask == nil || len(subTask.DependencyBranchSuffixes) == 0 {
		return true
	}
	statusByBranchSuffix := make(map[string]string, len(siblingSubTasks))
	for _, sibling := range siblingSubTasks {
		statusByBranchSuffix[sibling.BranchSuffix] = sibling.Status
	}
	for _, dependency := range subTask.DependencyBranchSuffixes {
		if !isDependencySatisfiedStatus(statusByBranchSuffix[dependency]) {
			return false
		}
	}
	return true
}

func isBlockedDependencyAttentionRequired(subTask *SubTask, siblingSubTasks []SubTask) bool {
	if subTask == nil || len(subTask.DependencyBranchSuffixes) == 0 {
		return false
	}

	statusByBranchSuffix := make(map[string]string, len(siblingSubTasks))
	for _, sibling := range siblingSubTasks {
		statusByBranchSuffix[sibling.BranchSuffix] = sibling.Status
	}

	for _, dependency := range subTask.DependencyBranchSuffixes {
		switch statusByBranchSuffix[dependency] {
		case "CANCELLED", "DISCARDED", "DISCARD_PENDING", "FAILED", "REWORK_REQUIRED", "":
			return true
		}
	}

	return false
}

func buildBlockedDependencyReason(blockedSubTasks []SubTask, allSubTasks []SubTask) string {
	subTaskByBranchSuffix := make(map[string]SubTask, len(allSubTasks))
	for _, subTask := range allSubTasks {
		subTaskByBranchSuffix[subTask.BranchSuffix] = subTask
	}

	summaries := make([]string, 0, len(blockedSubTasks))
	for _, subTask := range blockedSubTasks {
		blockers := make([]string, 0, len(subTask.DependencyBranchSuffixes))
		for _, branchSuffix := range subTask.DependencyBranchSuffixes {
			dependencySubTask, ok := subTaskByBranchSuffix[branchSuffix]
			if !ok {
				blockers = append(blockers, branchSuffix+" (missing)")
				continue
			}
			blockers = append(blockers, branchSuffix+" ("+dependencySubTask.Status+")")
		}
		summaries = append(summaries, subTask.Title+" is blocked by "+strings.Join(blockers, ", ")+".")
	}

	return strings.Join(summaries, " ")
}

func boolPointer(value bool) *bool {
	return &value
}

func nextAutoAssignedValue(current bool, clear bool) bool {
	if clear {
		return false
	}
	return current
}

func assignmentSourcePointer(isManual bool, fallback *string) *string {
	if isManual {
		return stringPointer("OPERATOR")
	}
	if fallback != nil {
		return fallback
	}
	return stringPointer(subTaskAssignmentSourceLead)
}
