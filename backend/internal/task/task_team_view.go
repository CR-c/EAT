package task

import "context"

func (s *Service) GetTaskTeam(ctx context.Context, taskID string) (*GetTaskTeamResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}

	sessions, err := s.repository.ListSessionsByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_SESSIONS_READ_FAILED", err.Error(), nil)
	}
	subTasks, err := s.repository.ListSubTasksByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_SUBTASKS_READ_FAILED", err.Error(), nil)
	}

	return &GetTaskTeamResult{
		Team: s.buildTaskTeamView(taskRecord, sessions, subTasks),
	}, nil
}

func (s *Service) buildTaskTeamView(taskRecord *Task, sessions []Session, subTasks []SubTask) map[string]any {
	latestLeadSession := latestSessionByType(sessions, sessionTypeLead, "")
	members := make([]map[string]any, 0, len(subTasks))
	sortedSubTasks := sortSubTasksForDisplay(subTasks)
	for index, subTask := range sortedSubTasks {
		latestWorkerSession := latestSessionByType(sessions, sessionTypeWorker, subTask.ID)
		executionOrder := index + 1
		if subTask.ExecutionOrder != nil && *subTask.ExecutionOrder > 0 {
			executionOrder = int(*subTask.ExecutionOrder)
		}
		members = append(members, map[string]any{
			"agentType":        subTask.AgentType,
			"assignmentSource": firstNonEmpty(derefString(subTask.AssignmentSource), assignmentSourceForSubTask(subTask)),
			"autoAssigned":     subTask.AutoAssigned,
			"branchName":       subTask.BranchName,
			"branchSuffix":     subTask.BranchSuffix,
			"displayName":      firstNonEmpty(derefString(subTask.DisplayName), subTask.Title),
			"executionOrder":   executionOrder,
			"latestBackendKind": pointerStringValue(latestWorkerSession, func(value *Session) *string {
				return stringPointerValue(value.BackendKind)
			}),
			"latestSessionId": pointerStringValue(latestWorkerSession, func(value *Session) *string { return &value.ID }),
			"latestSessionStatus": pointerStringValue(latestWorkerSession, func(value *Session) *string {
				return stringPointerValue(value.Status)
			}),
			"role":         firstNonEmpty(derefString(subTask.Role), subTask.BranchSuffix, "worker"),
			"runSummary":   firstNonEmpty(derefString(subTask.RunSummary), buildDerivedRunSummary(subTask)),
			"status":       subTask.Status,
			"subTaskId":    subTask.ID,
			"taskId":       taskRecord.ID,
			"title":        subTask.Title,
			"worktreePath": subTask.WorktreePath,
		})
	}

	leadStatus := deriveLeadLifecycleStatus(taskRecord.Status)
	leadSessionID := any(nil)
	if latestLeadSession != nil {
		leadStatus = latestLeadSession.Status
		leadSessionID = latestLeadSession.ID
	}

	return map[string]any{
		"lead": map[string]any{
			"agentType": taskRecord.LeadAgentType,
			"backendKind": pointerStringValue(latestLeadSession, func(value *Session) *string {
				return stringPointerValue(value.BackendKind)
			}),
			"lastError": taskRecord.LastError,
			"sessionId": leadSessionID,
			"status":    leadStatus,
		},
		"members": members,
		"task": map[string]any{
			"id":                taskRecord.ID,
			"status":            taskRecord.Status,
			"taskBranchName":    taskRecord.TaskBranchName,
			"title":             taskRecord.Title,
			"workerBackendKind": taskRecord.WorkerBackendKind,
			"executionProfile":  taskRecord.ExecutionProfile,
		},
	}
}
