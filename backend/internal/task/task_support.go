package task

import (
	"fmt"
	"strconv"
	"strings"
)

func decorateTasks(tasks []Task) []Task {
	decorated := make([]Task, 0, len(tasks))
	for _, taskRecord := range tasks {
		item := taskRecord
		stage, label := workspaceStageForStatus(item.Status)
		item.WorkspaceStage = stage
		item.WorkspaceStageLabel = label
		if strings.TrimSpace(item.TaskType) == "" {
			item.TaskType = inferTaskTypeFromPlan(item.CurrentPlanJSON)
		}
		if item.PlanOrigin == nil || strings.TrimSpace(derefString(item.PlanOrigin)) == "" {
			derived := inferPlanOrigin(&item)
			item.PlanOrigin = stringPointerValue(derived)
		}
		decorated = append(decorated, item)
	}
	return decorated
}

func decorateTask(taskRecord *Task) *Task {
	if taskRecord == nil {
		return nil
	}
	stage, label := workspaceStageForStatus(taskRecord.Status)
	decorated := *taskRecord
	decorated.WorkspaceStage = stage
	decorated.WorkspaceStageLabel = label
	if strings.TrimSpace(decorated.TaskType) == "" {
		decorated.TaskType = inferTaskTypeFromPlan(decorated.CurrentPlanJSON)
	}
	if decorated.PlanOrigin == nil || strings.TrimSpace(derefString(decorated.PlanOrigin)) == "" {
		derived := inferPlanOrigin(&decorated)
		decorated.PlanOrigin = stringPointerValue(derived)
	}
	return &decorated
}

func normalizeRequiredString(value string) string {
	return strings.TrimSpace(value)
}

func normalizeExecutionProfile(value string) (string, error) {
	normalized := strings.TrimSpace(strings.ToLower(value))
	switch normalized {
	case "", "default", "isolated", "internet", "host-network", "web-preview", "web-preview-host":
		return normalized, nil
	default:
		return "", fmt.Errorf("executionProfile must be one of: default, isolated, internet, host-network, web-preview, web-preview-host")
	}
}

func normalizeStringList(values []string) []string {
	result := make([]string, 0, len(values))
	seen := make(map[string]bool, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" || seen[trimmed] {
			continue
		}
		seen[trimmed] = true
		result = append(result, trimmed)
	}
	return result
}

func cloneJSONMap(value map[string]any) map[string]any {
	if value == nil {
		return nil
	}
	cloned := make(map[string]any, len(value))
	for key, item := range value {
		cloned[key] = item
	}
	return cloned
}

func stringPointerValue(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func nullableString(values ...*string) any {
	for _, value := range values {
		if value != nil && *value != "" {
			return *value
		}
	}
	return nil
}

func trimStringTo(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit]
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func stringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case *string:
		return derefString(typed)
	case int:
		return strconv.Itoa(typed)
	default:
		return ""
	}
}

func isDependencySatisfiedStatus(status string) bool {
	return status == "ACCEPTED" || status == "MERGED" || status == "REVIEW_PENDING"
}

func pointerStringValue(session *Session, selector func(*Session) *string) any {
	if session == nil {
		return nil
	}
	value := selector(session)
	if value == nil {
		return nil
	}
	return *value
}

func pointerIntValue(session *Session, selector func(*Session) *int64) any {
	if session == nil {
		return nil
	}
	value := selector(session)
	if value == nil {
		return nil
	}
	return *value
}

func sessionBackendKindValue(session *Session) any {
	if session == nil || strings.TrimSpace(session.BackendKind) == "" {
		return nil
	}
	return session.BackendKind
}

func failure(code, message string, details map[string]any) *Error {
	return &Error{Code: code, Message: message, Details: details}
}

func stringPointer(value string) *string {
	normalized := strings.TrimSpace(value)
	if normalized == "" {
		return nil
	}
	return &normalized
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func shouldPublishTaskStatus(previous, next *Task) bool {
	if previous == nil || next == nil {
		return previous != next
	}
	return previous.Status != next.Status || derefString(previous.LastError) != derefString(next.LastError)
}

type serviceFailure struct {
	payload *Error
}

func (f serviceFailure) Error() string {
	if f.payload == nil {
		return "service failure"
	}
	return f.payload.Code + ": " + f.payload.Message
}

func subTaskOrNil(subTaskByID map[string]SubTask, subTaskID string) any {
	subTask, ok := subTaskByID[subTaskID]
	if !ok {
		return nil
	}
	return map[string]any{
		"id":               subTask.ID,
		"taskId":           subTask.TaskID,
		"title":            subTask.Title,
		"description":      subTask.Description,
		"branchSuffix":     subTask.BranchSuffix,
		"branchName":       subTask.BranchName,
		"agentType":        subTask.AgentType,
		"status":           subTask.Status,
		"assignmentSource": subTask.AssignmentSource,
	}
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]bool, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}

func inferTaskTypeFromPlan(currentPlanJSON *string) string {
	raw := strings.TrimSpace(derefString(currentPlanJSON))
	if raw == "" {
		return "NORMAL"
	}
	if strings.Contains(strings.ToLower(raw), "\"template_id\"") {
		return "GUIDED"
	}
	return "NORMAL"
}

func inferPlanOrigin(taskRecord *Task) string {
	if taskRecord == nil {
		return "NONE"
	}

	if strings.TrimSpace(derefString(taskRecord.ApprovedPlanJSON)) == "" && strings.TrimSpace(derefString(taskRecord.CurrentPlanJSON)) == "" {
		return "NONE"
	}

	if strings.TrimSpace(derefString(taskRecord.CurrentPlanJSON)) != "" {
		if strings.Contains(strings.ToLower(derefString(taskRecord.CurrentPlanJSON)), "\"template_id\"") {
			if strings.TrimSpace(taskRecord.TaskType) == "NORMAL" {
				return "AUTO_GENERATED"
			}
			return "TEMPLATE_SEEDED"
		}
	}

	if strings.TrimSpace(derefString(taskRecord.ApprovedPlanJSON)) != "" {
		return "APPROVED"
	}

	return "USER_EDITED"
}
