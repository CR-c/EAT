package orchestrator

import (
	"bufio"
	"encoding/json"
	"strings"

	"eat/backend/internal/tokenusage"
)

type codexUsageEvent struct {
	Type  string `json:"type"`
	Usage *struct {
		InputTokens  int64 `json:"input_tokens"`
		OutputTokens int64 `json:"output_tokens"`
	} `json:"usage"`
}

func collectSessionTokenUsage(chunk string) []tokenusage.SessionInput {
	scanner := bufio.NewScanner(strings.NewReader(chunk))
	results := make([]tokenusage.SessionInput, 0, 1)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || !strings.HasPrefix(line, "{") {
			continue
		}

		var payload codexUsageEvent
		if err := json.Unmarshal([]byte(line), &payload); err != nil {
			continue
		}
		if payload.Type != "turn.completed" || payload.Usage == nil {
			continue
		}

		results = append(results, tokenusage.SessionInput{
			InputTokens:  payload.Usage.InputTokens,
			OutputTokens: payload.Usage.OutputTokens,
		})
	}

	return results
}
