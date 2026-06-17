package task

import (
	"context"
	"strings"
)

type SessionOutputResult struct {
	SessionID string `json:"sessionId"`
	Output    string `json:"output"`
	Truncated bool   `json:"truncated"`
}

func (s *Service) GetSessionOutput(ctx context.Context, sessionID string, expectedTaskID string) (*SessionOutputResult, *Error) {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return nil, failure("SESSION_NOT_FOUND", "Session not found.", nil)
	}

	session, err := s.repository.FindSessionByID(ctx, sessionID)
	if err != nil {
		return nil, failure("TASK_SESSIONS_READ_FAILED", err.Error(), nil)
	}
	if session == nil {
		return nil, failure("SESSION_NOT_FOUND", "Session not found.", map[string]any{"sessionId": sessionID})
	}
	if strings.TrimSpace(session.TaskID) == "" {
		return nil, failure("SESSION_FORBIDDEN", "Session is not attached to a task.", map[string]any{"sessionId": sessionID})
	}

	expectedTaskID = strings.TrimSpace(expectedTaskID)
	if expectedTaskID != "" && session.TaskID != expectedTaskID {
		return nil, failure("SESSION_FORBIDDEN", "Session does not belong to the requested task.", map[string]any{
			"sessionId": sessionID,
			"taskId":    expectedTaskID,
		})
	}

	effectiveMax := session.OutputBufferMaxBytes
	if effectiveMax <= 0 {
		effectiveMax = 65536
	}

	return &SessionOutputResult{
		SessionID: session.ID,
		Output:    session.OutputBuffer,
		Truncated: int64(len(session.OutputBuffer)) >= effectiveMax,
	}, nil
}
