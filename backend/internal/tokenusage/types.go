package tokenusage

import "strings"

type Summary map[string]int64

type SessionInput struct {
	SessionID    string
	TaskID       string
	ProjectID    string
	SubTaskID    *string
	AgentType    string
	InputTokens  int64
	OutputTokens int64
}

func NormalizeAgentType(agentType string) string {
	return strings.TrimSpace(agentType)
}

func (s Summary) Add(agentType string, totalTokens int64) {
	normalized := NormalizeAgentType(agentType)
	if normalized == "" || totalTokens == 0 {
		return
	}
	if s == nil {
		return
	}
	s[normalized] += totalTokens
}

func (s Summary) Clone() Summary {
	if len(s) == 0 {
		return nil
	}
	cloned := make(Summary, len(s))
	for key, value := range s {
		cloned[key] = value
	}
	return cloned
}

func (s Summary) IsEmpty() bool {
	return len(s) == 0
}
