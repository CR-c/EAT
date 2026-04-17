package task

import (
	"fmt"
	"strings"
)

func (s *Service) buildTaskRuntimeView(taskRecord *Task, sessions []Session, subTasks []SubTask) map[string]any {
	latestLeadSession := latestSessionByType(sessions, sessionTypeLead, "")
	nodes := make([]map[string]any, 0, len(subTasks)+1)
	edges := make([]map[string]any, 0, len(subTasks))
	subTaskIDByBranchSuffix := make(map[string]string, len(subTasks))
	for _, subTask := range subTasks {
		subTaskIDByBranchSuffix[subTask.BranchSuffix] = subTask.ID
	}
	leadStatus := deriveLeadLifecycleStatus(taskRecord.Status)
	if latestLeadSession != nil && strings.TrimSpace(latestLeadSession.Status) != "" {
		leadStatus = latestLeadSession.Status
	}

	nodes = append(nodes, map[string]any{
		"id":               "lead",
		"nodeType":         "LEAD",
		"taskId":           taskRecord.ID,
		"title":            "Lead Orchestrator",
		"agentType":        taskRecord.LeadAgentType,
		"backendKind":      sessionBackendKindValue(latestLeadSession),
		"status":           leadStatus,
		"sessionId":        pointerStringValue(latestLeadSession, func(value *Session) *string { return &value.ID }),
		"startedAt":        pointerStringValue(latestLeadSession, func(value *Session) *string { return value.StartedAt }),
		"endedAt":          pointerStringValue(latestLeadSession, func(value *Session) *string { return value.EndedAt }),
		"exitCode":         pointerIntValue(latestLeadSession, func(value *Session) *int64 { return value.ExitCode }),
		"errorReason":      nullableString(taskRecord.LastError),
		"branchName":       nullableString(taskRecord.TaskBranchName),
		"logsPreview":      latestSessionOutput(latestLeadSession, "[SYS] Lead orchestration waiting for runtime output..."),
		"dependsOnNodeIds": []string{},
	})

	for _, subTask := range sortSubTasksForDisplay(subTasks) {
		session := latestSessionByType(sessions, sessionTypeWorker, subTask.ID)
		nodeID := subTask.ID
		dependencyNodeIDs := make([]string, 0, len(subTask.DependencyBranchSuffixes))
		for _, dependency := range subTask.DependencyBranchSuffixes {
			if dependency == "" {
				continue
			}
			dependencyNodeID := firstNonEmpty(subTaskIDByBranchSuffix[dependency], dependency)
			dependencyNodeIDs = append(dependencyNodeIDs, dependencyNodeID)
			edges = append(edges, map[string]any{
				"from": dependencyNodeID,
				"to":   nodeID,
				"type": "DEPENDS_ON",
			})
		}
		if len(dependencyNodeIDs) == 0 {
			edges = append(edges, map[string]any{
				"from": "lead",
				"to":   nodeID,
				"type": "ASSIGNS",
			})
		}

		nodes = append(nodes, map[string]any{
			"id":               nodeID,
			"nodeType":         "SUBTASK",
			"taskId":           taskRecord.ID,
			"subTaskId":        subTask.ID,
			"title":            firstNonEmpty(derefString(subTask.DisplayName), subTask.Title),
			"agentType":        subTask.AgentType,
			"backendKind":      sessionBackendKindValue(session),
			"status":           subTask.Status,
			"sessionId":        pointerStringValue(session, func(value *Session) *string { return &value.ID }),
			"startedAt":        pointerStringValue(session, func(value *Session) *string { return value.StartedAt }),
			"endedAt":          pointerStringValue(session, func(value *Session) *string { return value.EndedAt }),
			"exitCode":         pointerIntValue(session, func(value *Session) *int64 { return value.ExitCode }),
			"errorReason":      firstNonEmpty(derefString(subTask.LastError), latestSessionError(session)),
			"branchName":       nullableString(subTask.BranchName),
			"branchSuffix":     subTask.BranchSuffix,
			"dependsOnNodeIds": dependencyNodeIDs,
			"logsPreview":      latestSessionOutput(session, fmt.Sprintf("[SYS] %s\n[SYS] 状态: %s", subTask.Title, subTask.Status)),
		})
	}

	return map[string]any{
		"taskId":              taskRecord.ID,
		"taskStatus":          taskRecord.Status,
		"workspaceStage":      taskRecord.WorkspaceStage,
		"workspaceStageLabel": taskRecord.WorkspaceStageLabel,
		"nodes":               nodes,
		"edges":               edges,
		"summary": map[string]any{
			"failed":      countSubTasksByStatuses(subTasks, "FAILED", "DISCARD_PENDING", "REWORK_REQUIRED"),
			"running":     countSubTasksByStatuses(subTasks, "RUNNING"),
			"total":       len(subTasks) + 1,
			"waiting":     countSubTasksByStatuses(subTasks, subTaskStatusBlocked, subTaskStatusPending, "READY", "REVIEW_PENDING"),
			"workerCount": len(subTasks),
		},
	}
}

func workspaceStageForStatus(status string) (string, string) {
	switch status {
	case "COMPLETED":
		return "COMPLETED", "已完成"
	case taskStatusExecuting, taskStatusActionRequired, taskStatusReviewing, taskStatusMerging:
		return "EXECUTING", "执行中"
	case "PLAN_REVIEW", taskStatusPlanning:
		return "PLAN_REVIEW", "计划审阅"
	default:
		return "CLARIFYING", "需求澄清"
	}
}

func latestSessionOutput(session *Session, fallback string) string {
	if session == nil || strings.TrimSpace(session.OutputBuffer) == "" {
		return fallback
	}
	output := strings.TrimSpace(session.OutputBuffer)
	if len(output) > 4000 {
		return output[len(output)-4000:]
	}
	return output
}

func latestSessionError(session *Session) string {
	if session == nil {
		return ""
	}
	if session.ExitCode != nil && *session.ExitCode != 0 {
		return fmt.Sprintf("Session exited with code %d.", *session.ExitCode)
	}
	return ""
}

func deriveLeadLifecycleStatus(taskStatus string) string {
	switch taskStatus {
	case taskStatusClarifying, taskStatusPlanning, taskStatusReviewing:
		return sessionStatusRunning
	case taskStatusExecuting, taskStatusMerging, taskStatusActionRequired, "COMPLETED":
		return "COMPLETED"
	case "FAILED", "CANCELLED":
		return "FAILED"
	default:
		return "PENDING"
	}
}
