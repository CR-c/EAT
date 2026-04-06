package task

import (
	"encoding/json"
	"strings"

	"eat/backend/internal/eventbus"
)

func (s *Service) publish(taskID, eventName string, data any) {
	if s.bus == nil || strings.TrimSpace(taskID) == "" || strings.TrimSpace(eventName) == "" {
		return
	}

	payload, err := json.Marshal(data)
	if err != nil {
		return
	}

	s.bus.Publish("task:"+taskID, eventbus.Event{
		Name: eventName,
		Data: payload,
	})
}

func (s *Service) publishTaskStatus(taskID, status string, reason *string) {
	s.publish(taskID, "task:status", map[string]any{
		"taskId": taskID,
		"status": status,
		"reason": reason,
	})
}

func (s *Service) publishSession(taskID, eventName string, session *Session) {
	if session == nil {
		return
	}
	s.publish(taskID, eventName, map[string]any{
		"agentType":            session.AgentType,
		"attachments":          nil,
		"containerId":          session.ContainerID,
		"createdAt":            session.CreatedAt,
		"endedAt":              session.EndedAt,
		"exitCode":             session.ExitCode,
		"firstOutputAt":        session.FirstOutputAt,
		"id":                   session.ID,
		"logPath":              session.LogPath,
		"outputBuffer":         session.OutputBuffer,
		"outputBufferMaxBytes": session.OutputBufferMaxBytes,
		"pid":                  session.PID,
		"sandboxType":          session.SandboxType,
		"sessionId":            session.ID,
		"sessionType":          session.SessionType,
		"startedAt":            session.StartedAt,
		"status":               session.Status,
		"subTaskId":            session.SubTaskID,
		"taskId":               session.TaskID,
		"updatedAt":            session.UpdatedAt,
	})
}

func (s *Service) publishSessionOutput(taskID string, session *Session, chunk string) {
	if session == nil || strings.TrimSpace(chunk) == "" {
		return
	}
	s.publish(taskID, "session:output", map[string]any{
		"chunk":     chunk,
		"sessionId": session.ID,
		"subTaskId": session.SubTaskID,
		"taskId":    taskID,
	})
}

func (s *Service) publishLeadMessage(taskID string, message *Message) {
	if message == nil {
		return
	}
	s.publish(taskID, "task:lead-message", map[string]any{
		"content":   message.Content,
		"createdAt": message.CreatedAt,
		"id":        message.ID,
		"role":      message.Role,
		"subTaskId": message.SubTaskID,
		"taskId":    taskID,
	})
}

func (s *Service) publishSubTaskAssigned(taskID string, subTask *SubTask) {
	if subTask == nil {
		return
	}
	s.publish(taskID, "subtask:assigned", map[string]any{
		"agentType":        subTask.AgentType,
		"assignmentSource": subTask.AssignmentSource,
		"displayName":      subTask.DisplayName,
		"role":             subTask.Role,
		"status":           subTask.Status,
		"subTaskId":        subTask.ID,
		"taskId":           taskID,
	})
}

func (s *Service) publishSubTaskStatus(taskID string, subTask *SubTask) {
	if subTask == nil {
		return
	}
	s.publish(taskID, "subtask:status", map[string]any{
		"id":               subTask.ID,
		"taskId":           subTask.TaskID,
		"subTaskId":        subTask.ID,
		"title":            subTask.Title,
		"description":      subTask.Description,
		"branchSuffix":     subTask.BranchSuffix,
		"branchName":       subTask.BranchName,
		"agentType":        subTask.AgentType,
		"status":           subTask.Status,
		"autoAssigned":     subTask.AutoAssigned,
		"retryCount":       subTask.RetryCount,
		"lastError":        subTask.LastError,
		"role":             subTask.Role,
		"displayName":      subTask.DisplayName,
		"executionOrder":   subTask.ExecutionOrder,
		"assignmentSource": subTask.AssignmentSource,
		"runSummary":       subTask.RunSummary,
		"attachments":      nil,
	})
}

func (s *Service) publishTeamUpdated(taskID string) {
	s.publish(taskID, "team:updated", map[string]any{
		"taskId": taskID,
	})
}
