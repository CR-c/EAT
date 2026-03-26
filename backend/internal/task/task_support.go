package task

import (
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
	return &decorated
}

func normalizeRequiredString(value string) string {
	return strings.TrimSpace(value)
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
