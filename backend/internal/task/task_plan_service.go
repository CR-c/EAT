package task

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"eat/backend/internal/tasktemplates"
	"github.com/google/uuid"
)

func (s *Service) CreateGuidedTask(ctx context.Context, input CreateGuidedTaskRequest) (*CreateGuidedTaskResult, *Error) {
	templateID := normalizeRequiredString(input.TemplateID)
	if templateID == "" {
		return nil, failure(ErrorCodePlanTemplateRequired, "A task template must be selected before starting the guided flow.", nil)
	}

	workerAgentType := s.resolveDefaultTemplateAgentType(&Task{LeadAgentType: input.LeadAgentType}, input.AgentType)
	seed := tasktemplates.BuildSeed(templateID, tasktemplates.BuildOptions{
		AgentType:   workerAgentType,
		Description: input.Description,
		Title:       input.Title,
	})
	if seed == nil {
		return nil, failure(ErrorCodePlanTemplateNotFound, "Requested plan template was not found.", map[string]any{"templateId": templateID})
	}

	if validationError := s.validatePlan(seed.Plan); validationError != nil {
		return nil, validationError
	}

	createResult, serviceError := s.CreateTask(ctx, input.CreateTaskRequest)
	if serviceError != nil {
		return nil, serviceError
	}

	currentPlanJSONBytes, err := json.Marshal(seed.Plan)
	if err != nil {
		return nil, failure("PLAN_SERIALIZATION_FAILED", err.Error(), nil)
	}
	currentPlanJSON := string(currentPlanJSONBytes)
	status := "PLAN_REVIEW"
	planVersion := int64(1)

	guidedType := "GUIDED"
	templateOrigin := "TEMPLATE_SEEDED"
	taskRecord, err := s.repository.UpdateTask(ctx, createResult.Task.ID, UpdateTaskInput{
		Status:             &status,
		TaskType:           &guidedType,
		SetTaskType:        true,
		PlanOrigin:         &templateOrigin,
		SetPlanOrigin:      true,
		PlanVersion:        &planVersion,
		CurrentPlanJSON:    &currentPlanJSON,
		SetCurrentPlanJSON: true,
		LastError:          nil,
		SetLastError:       true,
	})
	if err != nil {
		return nil, failure("TASK_UPDATE_FAILED", err.Error(), nil)
	}

	if _, err := s.repository.CreatePlanSnapshot(ctx, CreatePlanSnapshotInput{
		TaskID:  createResult.Task.ID,
		Version: taskRecord.PlanVersion,
		Source:  planSnapshotSourceLeadGenerated,
		Payload: currentPlanJSON,
	}); err != nil {
		return nil, failure("PLAN_SNAPSHOT_CREATE_FAILED", err.Error(), nil)
	}

	return &CreateGuidedTaskResult{
		Task:        decorateTask(taskRecord),
		Attachments: createResult.Attachments,
		CurrentPlan: seed.Plan,
		Template:    seed.Template,
	}, nil
}

func (s *Service) buildSeededPlanForTask(taskRecord *Task) (*tasktemplates.Plan, *Error) {
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", nil)
	}

	templateID := strings.TrimSpace(s.inferTemplateIDForTask(taskRecord))
	if templateID == "" {
		return nil, failure(ErrorCodePlanTemplateNotFound, "No matching task template was found for the current task.", map[string]any{"taskId": taskRecord.ID})
	}

	workerAgentType := s.resolveDefaultTemplateAgentType(taskRecord, "")
	seed := tasktemplates.BuildSeed(templateID, tasktemplates.BuildOptions{
		AgentType:   workerAgentType,
		Description: taskRecord.Description,
		Title:       taskRecord.Title,
	})
	if seed == nil {
		return nil, failure(ErrorCodePlanTemplateNotFound, "Requested plan template was not found.", map[string]any{"taskId": taskRecord.ID, "templateId": templateID})
	}

	normalizedPlan, validationError := s.normalizeAndValidatePlan(seed.Plan)
	if validationError != nil {
		return nil, validationError
	}

	return &normalizedPlan, nil
}

func (s *Service) persistGeneratedPlan(ctx context.Context, taskID string, plan tasktemplates.Plan) (*Task, *PlanSnapshot, *Error) {
	currentPlanJSONBytes, err := json.Marshal(plan)
	if err != nil {
		return nil, nil, failure("PLAN_SERIALIZATION_FAILED", err.Error(), nil)
	}
	currentPlanJSON := string(currentPlanJSONBytes)
	status := "PLAN_REVIEW"
	defaultPlanVersion := int64(1)

	var (
		nextTask *Task
		snapshot *PlanSnapshot
	)

	txErr := s.repository.RunInTransaction(ctx, func(repository *Repository) error {
		currentTask, readErr := repository.FindTaskByID(ctx, taskID)
		if readErr != nil {
			return readErr
		}
		if currentTask == nil {
			return serviceFailure{payload: failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})}
		}

		nextPlanVersion := currentTask.PlanVersion + 1
		if nextPlanVersion <= 0 {
			nextPlanVersion = defaultPlanVersion
		}

		taskType := inferTaskTypeFromPlan(&currentPlanJSON)
		planOrigin := "TEMPLATE_SEEDED"
		if taskType == "NORMAL" {
			planOrigin = "AUTO_GENERATED"
		}
		updatedTask, updateErr := repository.UpdateTask(ctx, taskID, UpdateTaskInput{
			Status:             &status,
			TaskType:           &taskType,
			SetTaskType:        true,
			PlanOrigin:         &planOrigin,
			SetPlanOrigin:      true,
			PlanVersion:        &nextPlanVersion,
			CurrentPlanJSON:    &currentPlanJSON,
			SetCurrentPlanJSON: true,
			LastError:          nil,
			SetLastError:       true,
		})
		if updateErr != nil {
			return updateErr
		}
		nextTask = updatedTask

		createdSnapshot, snapshotErr := repository.CreatePlanSnapshot(ctx, CreatePlanSnapshotInput{
			TaskID:  taskID,
			Version: updatedTask.PlanVersion,
			Source:  planSnapshotSourceLeadGenerated,
			Payload: currentPlanJSON,
		})
		if snapshotErr != nil {
			return snapshotErr
		}
		snapshot = createdSnapshot
		return nil
	})
	if txErr != nil {
		var opErr serviceFailure
		if errors.As(txErr, &opErr) {
			return nil, nil, opErr.payload
		}
		return nil, nil, failure("PLAN_SNAPSHOT_CREATE_FAILED", txErr.Error(), map[string]any{"taskId": taskID})
	}

	return nextTask, snapshot, nil
}

func (s *Service) ApplyPlanSeed(ctx context.Context, taskID string, input PlanSeedRequest) (*PlanSeedResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}
	if taskRecord.Status != "PLAN_REVIEW" {
		return nil, failure(
			ErrorCodeTaskNotPlanReview,
			"Plan template seeding is only available during PLAN_REVIEW.",
			map[string]any{"status": taskRecord.Status, "taskId": taskID},
		)
	}

	templateID := normalizeRequiredString(input.TemplateID)
	if templateID == "" {
		return nil, failure(ErrorCodePlanTemplateRequired, "A plan template must be selected before seeding.", nil)
	}

	workerAgentType := s.resolveDefaultTemplateAgentType(taskRecord, input.AgentType)
	seed := tasktemplates.BuildSeed(templateID, tasktemplates.BuildOptions{
		AgentType:   workerAgentType,
		Description: taskRecord.Description,
		Title:       taskRecord.Title,
	})
	if seed == nil {
		return nil, failure(ErrorCodePlanTemplateNotFound, "Requested plan template was not found.", map[string]any{"templateId": templateID})
	}

	if validationError := s.validatePlan(seed.Plan); validationError != nil {
		return nil, validationError
	}

	currentPlanJSONBytes, err := json.Marshal(seed.Plan)
	if err != nil {
		return nil, failure("PLAN_SERIALIZATION_FAILED", err.Error(), nil)
	}
	currentPlanJSON := string(currentPlanJSONBytes)

	planOrigin := "TEMPLATE_SEEDED"
	nextTask, err := s.repository.UpdateTask(ctx, taskID, UpdateTaskInput{
		PlanOrigin:         &planOrigin,
		SetPlanOrigin:      true,
		CurrentPlanJSON:    &currentPlanJSON,
		SetCurrentPlanJSON: true,
		LastError:          nil,
		SetLastError:       true,
	})
	if err != nil {
		return nil, failure("TASK_UPDATE_FAILED", err.Error(), nil)
	}

	return &PlanSeedResult{
		Task:        decorateTask(nextTask),
		CurrentPlan: seed.Plan,
		Template:    seed.Template,
	}, nil
}

func (s *Service) UpdateCurrentPlan(ctx context.Context, taskID string, input tasktemplates.Plan) (*UpdateCurrentPlanResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}
	if taskRecord.Status != "PLAN_REVIEW" {
		return nil, failure(
			ErrorCodeTaskNotPlanReview,
			"Plan drafts can only be edited during PLAN_REVIEW.",
			map[string]any{"status": taskRecord.Status, "taskId": taskID},
		)
	}

	normalizedPlan, validationError := s.normalizeAndValidatePlan(input)
	if validationError != nil {
		return nil, validationError
	}

	currentPlanJSONBytes, err := json.Marshal(normalizedPlan)
	if err != nil {
		return nil, failure("PLAN_SERIALIZATION_FAILED", err.Error(), nil)
	}
	currentPlanJSON := string(currentPlanJSONBytes)

	planOrigin := "USER_EDITED"
	nextTask, err := s.repository.UpdateTask(ctx, taskID, UpdateTaskInput{
		PlanOrigin:         &planOrigin,
		SetPlanOrigin:      true,
		CurrentPlanJSON:    &currentPlanJSON,
		SetCurrentPlanJSON: true,
		LastError:          nil,
		SetLastError:       true,
	})
	if err != nil {
		return nil, failure("TASK_CURRENT_PLAN_UPDATE_FAILED", err.Error(), nil)
	}

	return &UpdateCurrentPlanResult{
		Task:        decorateTask(nextTask),
		CurrentPlan: normalizedPlan,
	}, nil
}

func (s *Service) RequestReplan(ctx context.Context, taskID string, input ReplanRequest) (*ReplanResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}
	if taskRecord.Status != taskStatusPlanning && taskRecord.Status != "PLAN_REVIEW" {
		return nil, failure(
			ErrorCodeTaskReplanNotAllowed,
			"Re-plan requests are only available during PLANNING or PLAN_REVIEW.",
			map[string]any{"status": taskRecord.Status, "taskId": taskID},
		)
	}

	currentPlan := parsePlanJSON(firstNonEmpty(derefString(taskRecord.CurrentPlanJSON), derefString(taskRecord.ApprovedPlanJSON)))
	if currentPlan == nil {
		return nil, failure(ErrorCodeInvalidPlan, "Stored current plan is not valid JSON.", map[string]any{"taskId": taskID})
	}

	changeSummary := normalizeReplanSummary(input)
	if len(changeSummary) == 0 {
		return nil, failure(ErrorCodeTaskReplanFeedbackMissing, "Re-plan requests require a reason or at least one node annotation.", map[string]any{"taskId": taskID})
	}

	nextPlan := *currentPlan
	nextPlan.Notes = strings.TrimSpace(joinPlanNotes(nextPlan.Notes, buildReplanNotesBlock(changeSummary)))
	normalizedPlan, validationError := s.normalizeAndValidatePlan(nextPlan)
	if validationError != nil {
		return nil, validationError
	}

	currentPlanJSONBytes, err := json.Marshal(normalizedPlan)
	if err != nil {
		return nil, failure("PLAN_SERIALIZATION_FAILED", err.Error(), nil)
	}
	currentPlanJSON := string(currentPlanJSONBytes)
	requestedAt := time.Now().UTC().Format(time.RFC3339Nano)
	messageContent := strings.Join(changeSummary, "\n")

	var nextTask *Task
	var requestMessage *Message
	txErr := s.repository.RunInTransaction(ctx, func(repository *Repository) error {
		updatedTask, updateErr := repository.UpdateTask(ctx, taskID, UpdateTaskInput{
			CurrentPlanJSON:    &currentPlanJSON,
			SetCurrentPlanJSON: true,
			LastError:          nil,
			SetLastError:       true,
		})
		if updateErr != nil {
			return updateErr
		}
		nextTask = updatedTask

		messageRecord, createErr := repository.CreateMessage(ctx, CreateMessageInput{
			ID:        uuid.NewString(),
			TaskID:    taskID,
			Role:      messageRoleUser,
			Content:   "[REPLAN_REQUEST]\n" + messageContent,
			CreatedAt: requestedAt,
		})
		if createErr != nil {
			return createErr
		}
		requestMessage = messageRecord

		_, snapshotErr := repository.CreatePlanSnapshot(ctx, CreatePlanSnapshotInput{
			TaskID:  taskID,
			Version: updatedTask.PlanVersion,
			Source:  planSnapshotSourceReplanRequest,
			Payload: currentPlanJSON,
		})
		return snapshotErr
	})
	if txErr != nil {
		return nil, failure("TASK_REPLAN_FAILED", txErr.Error(), map[string]any{"taskId": taskID})
	}

	return &ReplanResult{
		Task:           decorateTask(nextTask),
		CurrentPlan:    normalizedPlan,
		ChangeSummary:  changeSummary,
		PlanVersion:    nextTask.PlanVersion,
		RequestedAt:    requestedAt,
		RequestMessage: requestMessage,
	}, nil
}

func (s *Service) ApprovePlan(ctx context.Context, taskID string) (*ApprovePlanResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}

	if taskRecord.Status == "EXECUTING" && taskRecord.ApprovedPlanJSON != nil && strings.TrimSpace(*taskRecord.ApprovedPlanJSON) != "" {
		currentPlan := parsePlanJSON(*taskRecord.ApprovedPlanJSON)
		if currentPlan == nil {
			currentPlan = parsePlanJSON(derefString(taskRecord.CurrentPlanJSON))
		}
		if currentPlan == nil {
			return nil, failure(ErrorCodeInvalidPlan, "Stored approved plan is not valid JSON.", map[string]any{"taskId": taskID})
		}

		subTasks, listErr := s.repository.ListSubTasksByTaskID(ctx, taskID)
		if listErr != nil {
			return nil, failure("TASK_SUBTASKS_READ_FAILED", listErr.Error(), nil)
		}

		return &ApprovePlanResult{
			ApprovalReady: true,
			CurrentPlan:   *currentPlan,
			Idempotent:    true,
			SubTasks:      subTasks,
			Task:          taskRecord,
		}, nil
	}

	if taskRecord.Status != "PLAN_REVIEW" {
		return nil, failure(
			ErrorCodeTaskNotPlanReview,
			"Plan approval is only available during PLAN_REVIEW.",
			map[string]any{"status": taskRecord.Status, "taskId": taskID},
		)
	}

	parsedPlan := parsePlanJSON(derefString(taskRecord.CurrentPlanJSON))
	if parsedPlan == nil {
		return nil, failure(ErrorCodeInvalidPlan, "Stored current plan is not valid JSON.", map[string]any{"taskId": taskID})
	}
	normalizedPlan, validationError := s.normalizeAndValidatePlan(*parsedPlan)
	if validationError != nil {
		return nil, validationError
	}

	approvedPlanJSONBytes, err := json.Marshal(normalizedPlan)
	if err != nil {
		return nil, failure("PLAN_SERIALIZATION_FAILED", err.Error(), nil)
	}
	approvedPlanJSON := string(approvedPlanJSONBytes)
	backendStatus := s.defaultExecutionBackendStatus(ctx)
	if !backendStatus.Available {
		return nil, failure(
			ErrorCodeExecutionBackendUnavailable,
			"Worker backend is unavailable. You can continue clarification and planning, but plan approval requires a ready execution backend.",
			map[string]any{
				"backend": backendStatus,
				"taskId":  taskID,
			},
		)
	}
	if executionValidationError := s.validatePlanExecutionReadiness(ctx, normalizedPlan); executionValidationError != nil {
		return nil, executionValidationError
	}

	backendSandboxType := s.defaultWorkerSessionSandboxType(ctx)

	result := &ApprovePlanResult{
		ApprovalReady: true,
		CurrentPlan:   normalizedPlan,
	}

	txErr := s.repository.RunInTransaction(ctx, func(repository *Repository) error {
		currentTask, readErr := repository.FindTaskByID(ctx, taskID)
		if readErr != nil {
			return readErr
		}
		if currentTask == nil {
			return serviceFailure{payload: failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})}
		}
		if currentTask.Status == "EXECUTING" && currentTask.ApprovedPlanJSON != nil && strings.TrimSpace(*currentTask.ApprovedPlanJSON) != "" {
			subTasks, listErr := repository.ListSubTasksByTaskID(ctx, taskID)
			if listErr != nil {
				return listErr
			}
			result.Idempotent = true
			result.SubTasks = subTasks
			result.Task = currentTask
			return nil
		}
		if currentTask.Status != "PLAN_REVIEW" {
			return serviceFailure{payload: failure(
				ErrorCodeTaskNotPlanReview,
				"Plan approval is only available during PLAN_REVIEW.",
				map[string]any{"status": currentTask.Status, "taskId": taskID},
			)}
		}

		planOrigin := "APPROVED"
		approvedTask, updateErr := repository.UpdateTask(ctx, taskID, UpdateTaskInput{
			PlanOrigin:          &planOrigin,
			SetPlanOrigin:       true,
			CurrentPlanJSON:     &approvedPlanJSON,
			SetCurrentPlanJSON:  true,
			ApprovedPlanJSON:    &approvedPlanJSON,
			SetApprovedPlanJSON: true,
			LastError:           nil,
			SetLastError:        true,
		})
		if updateErr != nil {
			return updateErr
		}

		approvedSnapshot, snapshotErr := repository.CreatePlanSnapshot(ctx, CreatePlanSnapshotInput{
			TaskID:  taskID,
			Version: approvedTask.PlanVersion,
			Source:  planSnapshotSourceApproved,
			Payload: approvedPlanJSON,
		})
		if snapshotErr != nil {
			return snapshotErr
		}

		subTasks := make([]SubTask, 0, len(planNodes(normalizedPlan)))
		sessions := make([]Session, 0, len(planNodes(normalizedPlan)))
		seedTime := time.Now().UTC()
		for index, node := range planNodes(normalizedPlan) {
			dependencyBranchSuffixes := append([]string(nil), node.DependsOn...)
			role := stringPointer(node.Role)
			displayName := stringPointer(node.Title)
			executionOrder := int64(index + 1)
			assignmentSource := stringPointer(subTaskAssignmentSourceLead)
			status := subTaskStatusPending
			if len(dependencyBranchSuffixes) > 0 {
				status = subTaskStatusBlocked
			}

			createdAt := seedTime.Add(time.Duration(index) * time.Millisecond).Format(time.RFC3339Nano)
			subTask, createErr := repository.CreateSubTask(ctx, CreateSubTaskInput{
				TaskID:                   taskID,
				Title:                    node.Title,
				Description:              node.Description,
				BranchSuffix:             node.BranchSuffix,
				DependencyBranchSuffixes: dependencyBranchSuffixes,
				BranchName:               nil,
				StartCommitSHA:           nil,
				WorktreePath:             nil,
				AgentType:                node.RecommendedAgent,
				Status:                   status,
				AutoAssigned:             true,
				Role:                     role,
				DisplayName:              displayName,
				ExecutionOrder:           &executionOrder,
				AssignmentSource:         assignmentSource,
				CreatedAt:                createdAt,
				UpdatedAt:                createdAt,
			})
			if createErr != nil {
				return createErr
			}
			subTasks = append(subTasks, *subTask)

			if status != subTaskStatusPending {
				continue
			}

			sessionRecord, sessionErr := repository.CreateSession(ctx, CreateSessionInput{
				TaskID:               taskID,
				SubTaskID:            &subTask.ID,
				AgentType:            subTask.AgentType,
				SessionType:          sessionTypeWorker,
				SandboxType:          backendSandboxType,
				Status:               "PENDING",
				OutputBuffer:         "",
				OutputBufferMaxBytes: 65536,
			})
			if sessionErr != nil {
				return sessionErr
			}
			sessions = append(sessions, *sessionRecord)
		}

		executingStatus := "EXECUTING"
		executingTask, updateExecutingErr := repository.UpdateTask(ctx, taskID, UpdateTaskInput{
			PlanOrigin:          &planOrigin,
			SetPlanOrigin:       true,
			CurrentPlanJSON:     &approvedPlanJSON,
			SetCurrentPlanJSON:  true,
			Status:              &executingStatus,
			ApprovedPlanJSON:    &approvedPlanJSON,
			SetApprovedPlanJSON: true,
			LastError:           nil,
			SetLastError:        true,
		})
		if updateExecutingErr != nil {
			return updateExecutingErr
		}

		result.ApprovedSnapshot = approvedSnapshot
		result.Idempotent = false
		result.Sessions = sessions
		result.SubTasks = subTasks
		result.Task = executingTask
		return nil
	})
	if txErr != nil {
		var opErr serviceFailure
		if errors.As(txErr, &opErr) {
			return nil, opErr.payload
		}
		return nil, failure("TASK_APPROVAL_FAILED", txErr.Error(), nil)
	}

	if !result.Idempotent {
		if result.Task != nil {
			s.publishTaskStatus(result.Task.ID, result.Task.Status, nil)
		}
		for _, subTask := range result.SubTasks {
			subTaskCopy := subTask
			s.publishSubTaskAssigned(taskID, &subTaskCopy)
			s.publishSubTaskStatus(taskID, &subTaskCopy)
		}
		for _, session := range result.Sessions {
			sessionCopy := session
			s.publishSession(taskID, "session:started", &sessionCopy)
		}
		s.publishTeamUpdated(taskID)

		if s.OnPlanApproved != nil {
			go s.OnPlanApproved(context.Background(), taskID)
		}
		s.notifyWorkerQueued(taskID)
	}

	return result, nil
}

func (s *Service) RestorePlanSnapshot(ctx context.Context, taskID string, input RestorePlanSnapshotRequest) (*RestorePlanSnapshotResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}
	if taskRecord.Status != "PLAN_REVIEW" {
		return nil, failure(
			ErrorCodeTaskNotPlanReview,
			"Plan restore is only available during PLAN_REVIEW.",
			map[string]any{"status": taskRecord.Status, "taskId": taskID},
		)
	}

	snapshotID := normalizeRequiredString(input.SnapshotID)
	snapshot, err := s.repository.FindPlanSnapshotByID(ctx, snapshotID)
	if err != nil {
		return nil, failure("TASK_PLAN_SNAPSHOT_READ_FAILED", err.Error(), nil)
	}
	if snapshot == nil || snapshot.TaskID != taskID {
		return nil, failure(ErrorCodePlanSnapshotNotFound, "Plan snapshot not found.", map[string]any{"snapshotId": snapshotID, "taskId": taskID})
	}

	currentPlan := parsePlanJSON(snapshot.Payload)
	if currentPlan == nil {
		return nil, failure(ErrorCodeInvalidPlan, "Stored plan snapshot is not valid JSON.", map[string]any{"snapshotId": snapshotID})
	}

	nextTask, err := s.repository.UpdateTask(ctx, taskID, UpdateTaskInput{
		CurrentPlanJSON:    &snapshot.Payload,
		SetCurrentPlanJSON: true,
		LastError:          nil,
		SetLastError:       true,
	})
	if err != nil {
		return nil, failure("TASK_RESTORE_FAILED", err.Error(), nil)
	}

	if _, err := s.repository.CreatePlanSnapshot(ctx, CreatePlanSnapshotInput{
		TaskID:  taskID,
		Version: nextTask.PlanVersion,
		Source:  planSnapshotSourceRestoredFromHistory,
		Payload: snapshot.Payload,
	}); err != nil {
		return nil, failure("PLAN_SNAPSHOT_CREATE_FAILED", err.Error(), nil)
	}

	s.publish(taskID, "task:plan-restored", map[string]any{
		"currentPlan": currentPlan,
		"snapshotId":  snapshotID,
		"taskId":      taskID,
	})

	return &RestorePlanSnapshotResult{
		CurrentPlan: *currentPlan,
		SnapshotID:  snapshotID,
		Task:        nextTask,
	}, nil
}

func normalizeReplanSummary(input ReplanRequest) []string {
	summary := make([]string, 0, len(input.Annotations)+1)
	if reason := normalizeRequiredString(input.Reason); reason != "" {
		summary = append(summary, "整体意见: "+reason)
	}
	for _, annotation := range input.Annotations {
		note := normalizeRequiredString(annotation.Note)
		if note == "" {
			continue
		}
		nodeLabel := firstNonEmpty(
			normalizeRequiredString(annotation.NodeID),
			normalizeRequiredString(annotation.BranchSuffix),
			normalizeRequiredString(annotation.Title),
			"unknown-node",
		)
		summary = append(summary, "节点 "+nodeLabel+": "+note)
	}
	return uniqueStrings(summary)
}

func buildReplanNotesBlock(lines []string) string {
	if len(lines) == 0 {
		return ""
	}
	return "[REPLAN_REQUEST]\n- " + strings.Join(lines, "\n- ")
}

func joinPlanNotes(parts ...string) string {
	segments := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		segments = append(segments, trimmed)
	}
	return strings.Join(segments, "\n\n")
}

func validatePlanWithAgents(plan tasktemplates.Plan, validAgents map[string]bool) *Error {
	plan = normalizePlan(plan)
	if len(planNodes(plan)) == 0 {
		return failure(ErrorCodeInvalidPlan, "Plan must include at least one node.", nil)
	}

	knownNodes := make(map[string]bool, len(planNodes(plan)))
	for index, node := range planNodes(plan) {
		if strings.TrimSpace(node.Title) == "" {
			return failure(ErrorCodeInvalidPlan, "Plan nodes must include a title.", map[string]any{"index": index})
		}
		if strings.TrimSpace(node.BranchSuffix) == "" {
			return failure(ErrorCodeInvalidPlan, "Plan nodes must include a branch suffix.", map[string]any{"index": index})
		}
		if knownNodes[node.BranchSuffix] {
			return failure(ErrorCodeInvalidPlan, "Plan branch_suffix values must be unique.", map[string]any{"branchSuffix": node.BranchSuffix})
		}
		if strings.TrimSpace(node.RecommendedAgent) == "" {
			return failure(ErrorCodeInvalidPlan, "Plan nodes must include a recommended_agent.", map[string]any{"branchSuffix": node.BranchSuffix})
		}
		if !validAgents[node.RecommendedAgent] {
			return failure(ErrorCodeInvalidPlan, "Plan nodes must target a known executable agent.", map[string]any{
				"branchSuffix":     node.BranchSuffix,
				"recommendedAgent": node.RecommendedAgent,
			})
		}
		knownNodes[node.BranchSuffix] = true
	}

	for _, node := range planNodes(plan) {
		for _, dependency := range node.DependsOn {
			if !knownNodes[dependency] {
				return failure(ErrorCodeInvalidPlan, "Plan node depends_on references an unknown branch_suffix.", map[string]any{
					"branchSuffix": node.BranchSuffix,
					"dependsOn":    dependency,
				})
			}
		}
	}

	return nil
}

func (s *Service) registeredExecutableAgents() map[string]bool {
	result := make(map[string]bool)
	if s == nil || s.agentService == nil {
		return result
	}
	for _, descriptor := range s.agentService.ListAgents() {
		if descriptor.Capabilities.CanExecute {
			result[descriptor.Name] = true
		}
	}
	return result
}

func (s *Service) validatePlan(plan tasktemplates.Plan) *Error {
	validAgents := s.registeredExecutableAgents()
	if len(validAgents) == 0 {
		return failure(ErrorCodeInvalidPlan, "Executable agent registry is unavailable while validating the plan.", nil)
	}
	return validatePlanWithAgents(plan, validAgents)
}

func (s *Service) normalizeAndValidatePlan(plan tasktemplates.Plan) (tasktemplates.Plan, *Error) {
	normalizedPlan := normalizePlan(plan)
	if validationError := s.validatePlan(normalizedPlan); validationError != nil {
		return tasktemplates.Plan{}, validationError
	}
	return normalizedPlan, nil
}

func (s *Service) validatePlanExecutionReadiness(ctx context.Context, plan tasktemplates.Plan) *Error {
	if s == nil || s.agentService == nil {
		return failure(ErrorCodeExecutionAgentUnavailable, "Agent registry is unavailable while validating planned worker execution readiness.", nil)
	}
	healthSnapshots := s.agentService.GetHealth(ctx)
	for _, node := range planNodes(plan) {
		healthSnapshot, ok := healthSnapshots[node.RecommendedAgent]
		if !ok {
			return failure(ErrorCodeExecutionAgentUnavailable, "Plan approval requires every planned worker agent to be registered and execution-ready.", map[string]any{
				"branchSuffix":     node.BranchSuffix,
				"recommendedAgent": node.RecommendedAgent,
			})
		}
		if healthSnapshot.ExecutionAvailable {
			continue
		}
		failureReason := healthSnapshot.ExecutionFailureReason
		if failureReason == nil {
			failureReason = healthSnapshot.FailureReason
		}
		details := map[string]any{
			"branchSuffix":     node.BranchSuffix,
			"recommendedAgent": node.RecommendedAgent,
		}
		if failureReason != nil {
			details["failureReason"] = failureReason
		}
		return failure(ErrorCodeExecutionAgentUnavailable, "Plan approval requires every planned worker agent to be execution-ready.", details)
	}
	return nil
}

func (s *Service) resolveDefaultTemplateAgentType(taskRecord *Task, requestedAgentType string) string {
	explicitAgentType := normalizeRequiredString(requestedAgentType)
	if explicitAgentType != "" {
		return explicitAgentType
	}
	if taskRecord != nil && normalizeRequiredString(taskRecord.LeadAgentType) != "" {
		return taskRecord.LeadAgentType
	}

	for _, descriptor := range s.agentService.ListAgents() {
		if descriptor.Capabilities.CanExecute {
			return descriptor.Name
		}
	}

	return "codex-cli"
}

func (s *Service) inferTemplateIDForTask(taskRecord *Task) string {
	text := strings.ToLower(strings.TrimSpace(strings.Join([]string{taskRecord.Title, taskRecord.Description}, "\n")))

	switch {
	case strings.Contains(text, "todo"):
		return "full-stack-web-app"
	case strings.Contains(text, "frontend") || strings.Contains(text, "ui") || strings.Contains(text, "页面"):
		return "frontend-feature"
	case strings.Contains(text, "api") || strings.Contains(text, "backend") || strings.Contains(text, "接口"):
		return "backend-api"
	case strings.Contains(text, "refactor") || strings.Contains(text, "重构"):
		return "repo-wide-refactor"
	default:
		return "full-stack-web-app"
	}
}

func normalizePlan(plan tasktemplates.Plan) tasktemplates.Plan {
	normalized := plan
	if len(normalized.Nodes) == 0 && len(normalized.Subtasks) > 0 {
		normalized.Nodes = append([]tasktemplates.Node(nil), normalized.Subtasks...)
	}
	if len(normalized.Subtasks) == 0 && len(normalized.Nodes) > 0 {
		normalized.Subtasks = append([]tasktemplates.Node(nil), normalized.Nodes...)
	}
	if len(normalized.Nodes) > 0 && len(normalized.Subtasks) > 0 {
		normalized.Nodes = append([]tasktemplates.Node(nil), normalized.Nodes...)
		normalized.Subtasks = append([]tasktemplates.Node(nil), normalized.Subtasks...)
	}
	return normalized
}

func planNodes(plan tasktemplates.Plan) []tasktemplates.Node {
	if len(plan.Nodes) > 0 {
		return plan.Nodes
	}
	return plan.Subtasks
}

func parsePlanJSON(raw string) *tasktemplates.Plan {
	if strings.TrimSpace(raw) == "" {
		return nil
	}

	var plan tasktemplates.Plan
	if err := json.Unmarshal([]byte(raw), &plan); err != nil {
		return nil
	}
	normalized := normalizePlan(plan)
	return &normalized
}
