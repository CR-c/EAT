package orchestrator

import (
	"strings"
	"testing"
)

func TestBuildWorkerPromptKeepsExistingPromptWhenMailboxEmpty(t *testing.T) {
	task := &TaskRecord{Title: "Implement checkout"}
	subTask := &SubTaskRecord{
		BranchSuffix: "backend-api",
		BranchName:   "eat/task/backend-api",
		WorktreePath: "/tmp/worktree",
		Description:  "Build the backend API.",
	}
	attachments := []AttachmentRecord{{
		FileName: "requirements.md",
		FilePath: "/tmp/requirements.md",
		FileType: "text/markdown",
	}}

	prompt := buildWorkerPrompt(task, subTask, attachments, nil)
	if strings.Contains(prompt, "## Team Handoffs") {
		t.Fatalf("empty mailbox should not render Team Handoffs:\n%s", prompt)
	}
	if !strings.Contains(prompt, "- Exit with code 0 on success.") {
		t.Fatalf("expected existing instruction to remain:\n%s", prompt)
	}
}

func TestBuildWorkerPromptRendersTeamHandoffsWhenMailboxPresent(t *testing.T) {
	branchRef := "eat/task/backend-api"
	senderSubTaskID := "subtask-backend"
	targetSubTaskID := "subtask-frontend"

	prompt := buildWorkerPrompt(
		&TaskRecord{Title: "Implement checkout"},
		&SubTaskRecord{ID: targetSubTaskID, BranchSuffix: "frontend-ui", BranchName: "eat/task/frontend-ui", WorktreePath: "/tmp/frontend"},
		nil,
		[]MailboxMessageRecord{{
			SenderSubTaskID: &senderSubTaskID,
			TargetType:      "SUBTASK",
			TargetSubTaskID: &targetSubTaskID,
			MessageType:     "API_CONTRACT",
			Content:         "Use POST /api/checkout with totalCents.",
			BranchRef:       &branchRef,
		}},
	)

	expected := "- [API_CONTRACT from subtask-backend -> you] Use POST /api/checkout with totalCents. (branch: eat/task/backend-api)"
	if !strings.Contains(prompt, "## Team Handoffs (read before you start)") {
		t.Fatalf("expected Team Handoffs section:\n%s", prompt)
	}
	if !strings.Contains(prompt, expected) {
		t.Fatalf("expected handoff line %q in prompt:\n%s", expected, prompt)
	}
}

func TestParseMailboxMessagesFromOutputHandlesMultipleAndInvalidBlocks(t *testing.T) {
	output := strings.Join([]string{
		"worker log",
		"```eat:mailbox",
		`{"type":"API_CONTRACT","targetType":"LEAD","content":"Use GET /api/tasks.","branchRef":"eat/task/api"}`,
		"```",
		"```eat:mailbox",
		`{"type":"BLOCKER","targetType":"SUBTASK","targetSubTaskId":"subtask-ui","content":"Need copy approval.","requiresAck":true}`,
		"```",
		"```eat:mailbox",
		`{"type":`,
		"```",
	}, "\n")

	messages := parseMailboxMessagesFromOutput(output, "task-1", "subtask-api")
	if len(messages) != 2 {
		t.Fatalf("expected two valid mailbox messages, got %#v", messages)
	}
	if messages[0].MessageType != "API_CONTRACT" || messages[0].TargetType != "LEAD" || messages[0].Content != "Use GET /api/tasks." {
		t.Fatalf("unexpected first message: %#v", messages[0])
	}
	if messages[0].SenderSubTaskID == nil || *messages[0].SenderSubTaskID != "subtask-api" {
		t.Fatalf("unexpected sender: %#v", messages[0])
	}
	if messages[0].BranchRef == nil || *messages[0].BranchRef != "eat/task/api" {
		t.Fatalf("unexpected branch ref: %#v", messages[0])
	}
	if messages[1].MessageType != "BLOCKER" || messages[1].TargetSubTaskID == nil || *messages[1].TargetSubTaskID != "subtask-ui" || !messages[1].RequiresAck {
		t.Fatalf("unexpected second message: %#v", messages[1])
	}
}

func TestParseMailboxMessagesFromOutputReturnsEmptyForNoBlocks(t *testing.T) {
	messages := parseMailboxMessagesFromOutput("plain worker output", "task-1", "subtask-api")
	if len(messages) != 0 {
		t.Fatalf("expected no messages, got %#v", messages)
	}
}
