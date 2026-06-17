package orchestrator

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"eat/backend/internal/tokenusage"
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

func TestCollectMailboxMessagesSkipsInvalidWorkerBlocks(t *testing.T) {
	ctx := context.Background()
	repo := newMailboxCollectRepo()
	repo.sessions["session-1"] = &SessionRecord{
		ID: "session-1",
		OutputBuffer: strings.Join([]string{
			testMailboxBlock(`{"type":"UNSUPPORTED","targetType":"LEAD","content":"bad type"}`),
			testMailboxBlock(`{"type":"NOTE","targetType":"SUBTASK","content":"missing target"}`),
			testMailboxBlock(`{"type":"NOTE","targetType":"SUBTASK","targetSubTaskId":"missing-subtask","content":"bad target"}`),
			testMailboxBlock(`{"type":"NOTE","targetType":"SUBTASK","targetSubTaskId":"subtask-sender","content":"self target"}`),
			testMailboxBlock(`{"type":"NOTE","targetType":"LEAD","content":"valid lead note"}`),
		}, "\n"),
	}
	repo.subTasks["subtask-sender"] = &SubTaskRecord{ID: "subtask-sender", TaskID: "task-1"}

	orchestrator := New(repo, nil, nil)
	orchestrator.collectMailboxMessagesFromWorkerOutput(ctx, "task-1", "subtask-sender", "session-1")

	if len(repo.createdMailboxMessages) != 1 {
		t.Fatalf("expected exactly one valid mailbox message, got %#v", repo.createdMailboxMessages)
	}
	if repo.createdMailboxMessages[0].Content != "valid lead note" {
		t.Fatalf("unexpected created message: %#v", repo.createdMailboxMessages[0])
	}
}

func TestCollectMailboxMessagesReadsFullLogBeyondOutputBuffer(t *testing.T) {
	ctx := context.Background()
	repo := newMailboxCollectRepo()
	logPath := filepath.Join(t.TempDir(), "session.log")
	output := testMailboxBlock(`{"type":"API_CONTRACT","targetType":"LEAD","content":"early handoff survives truncation"}`) + strings.Repeat("x", 70*1024)
	if err := os.WriteFile(logPath, []byte(output), 0o644); err != nil {
		t.Fatalf("write log: %v", err)
	}
	repo.sessions["session-1"] = &SessionRecord{
		ID:           "session-1",
		LogPath:      &logPath,
		OutputBuffer: strings.Repeat("x", 64*1024),
	}
	repo.subTasks["subtask-sender"] = &SubTaskRecord{ID: "subtask-sender", TaskID: "task-1"}

	orchestrator := New(repo, nil, nil)
	orchestrator.collectMailboxMessagesFromWorkerOutput(ctx, "task-1", "subtask-sender", "session-1")

	if len(repo.createdMailboxMessages) != 1 {
		t.Fatalf("expected mailbox from full log, got %#v", repo.createdMailboxMessages)
	}
	if repo.createdMailboxMessages[0].Content != "early handoff survives truncation" {
		t.Fatalf("unexpected mailbox content: %#v", repo.createdMailboxMessages[0])
	}
}

func TestCollectMailboxMessagesHandlesBlockSplitAcrossOutputChunks(t *testing.T) {
	ctx := context.Background()
	repo := newMailboxCollectRepo()
	logPath := filepath.Join(t.TempDir(), "session.log")
	repo.sessions["session-1"] = &SessionRecord{
		ID:      "session-1",
		LogPath: &logPath,
	}
	repo.subTasks["subtask-sender"] = &SubTaskRecord{ID: "subtask-sender", TaskID: "task-1"}

	orchestrator := New(repo, nil, nil)
	if err := orchestrator.appendWorkerSessionOutput(ctx, "session-1", "```eat:mailbox\n{\"type\":\"NOTE\",", &logPath); err != nil {
		t.Fatalf("append first chunk: %v", err)
	}
	if err := orchestrator.appendWorkerSessionOutput(ctx, "session-1", "\"targetType\":\"LEAD\",\"content\":\"split block\"}\n```", &logPath); err != nil {
		t.Fatalf("append second chunk: %v", err)
	}
	orchestrator.collectMailboxMessagesFromWorkerOutput(ctx, "task-1", "subtask-sender", "session-1")

	if len(repo.createdMailboxMessages) != 1 {
		t.Fatalf("expected one mailbox from split block, got %#v", repo.createdMailboxMessages)
	}
	if repo.createdMailboxMessages[0].Content != "split block" {
		t.Fatalf("unexpected mailbox content: %#v", repo.createdMailboxMessages[0])
	}
}

func TestCollectMailboxMessagesIsIdempotentPerSessionBlock(t *testing.T) {
	ctx := context.Background()
	repo := newMailboxCollectRepo()
	repo.sessions["session-1"] = &SessionRecord{
		ID:           "session-1",
		OutputBuffer: testMailboxBlock(`{"type":"NOTE","targetType":"LEAD","content":"only once"}`),
	}
	repo.subTasks["subtask-sender"] = &SubTaskRecord{ID: "subtask-sender", TaskID: "task-1"}

	orchestrator := New(repo, nil, nil)
	orchestrator.collectMailboxMessagesFromWorkerOutput(ctx, "task-1", "subtask-sender", "session-1")
	orchestrator.collectMailboxMessagesFromWorkerOutput(ctx, "task-1", "subtask-sender", "session-1")

	if len(repo.createdMailboxMessages) != 1 {
		t.Fatalf("expected one mailbox after duplicate collection, got %#v", repo.createdMailboxMessages)
	}
}

func testMailboxBlock(jsonPayload string) string {
	return "```eat:mailbox\n" + jsonPayload + "\n```"
}

type mailboxCollectRepo struct {
	sessions               map[string]*SessionRecord
	subTasks               map[string]*SubTaskRecord
	createdMailboxMessages []CreateMailboxMessageInput
	processedBlocks        map[string]bool
}

func newMailboxCollectRepo() *mailboxCollectRepo {
	return &mailboxCollectRepo{
		sessions:        make(map[string]*SessionRecord),
		subTasks:        make(map[string]*SubTaskRecord),
		processedBlocks: make(map[string]bool),
	}
}

func (r *mailboxCollectRepo) FindTaskByID(context.Context, string) (*TaskRecord, error) {
	return nil, nil
}

func (r *mailboxCollectRepo) FindSubTaskByID(_ context.Context, subTaskID string) (*SubTaskRecord, error) {
	return r.subTasks[subTaskID], nil
}

func (r *mailboxCollectRepo) ListSubTasksByTaskID(context.Context, string) ([]SubTaskRecord, error) {
	return nil, nil
}

func (r *mailboxCollectRepo) ListSessionsBySubTaskID(context.Context, string) ([]SessionRecord, error) {
	return nil, nil
}

func (r *mailboxCollectRepo) FindSessionByID(_ context.Context, sessionID string) (*SessionRecord, error) {
	return r.sessions[sessionID], nil
}

func (r *mailboxCollectRepo) ListAttachmentsByTaskID(context.Context, string) ([]AttachmentRecord, error) {
	return nil, nil
}

func (r *mailboxCollectRepo) ListMailboxMessagesForSubTask(context.Context, string, string) ([]MailboxMessageRecord, error) {
	return nil, nil
}

func (r *mailboxCollectRepo) FindProjectByID(context.Context, string) (*ProjectRecord, error) {
	return nil, nil
}

func (r *mailboxCollectRepo) AccumulateSessionTokenUsage(context.Context, tokenusage.SessionInput) error {
	return nil
}

func (r *mailboxCollectRepo) UpdateSession(_ context.Context, sessionID string, input UpdateSessionInput) error {
	session := r.sessions[sessionID]
	if session == nil {
		session = &SessionRecord{ID: sessionID}
		r.sessions[sessionID] = session
	}
	if input.LogPath != nil {
		session.LogPath = input.LogPath
	}
	return nil
}

func (r *mailboxCollectRepo) UpdateSubTask(context.Context, string, UpdateSubTaskInput) error {
	return nil
}

func (r *mailboxCollectRepo) UpdateTask(context.Context, string, UpdateTaskInput) error {
	return nil
}

func (r *mailboxCollectRepo) CreateMessage(context.Context, CreateMessageInput) error {
	return nil
}

func (r *mailboxCollectRepo) CreateMailboxMessage(_ context.Context, input CreateMailboxMessageInput) (*MailboxMessageRecord, error) {
	r.createdMailboxMessages = append(r.createdMailboxMessages, input)
	return &MailboxMessageRecord{
		ID:              "message-" + input.Content,
		TaskID:          input.TaskID,
		SenderType:      input.SenderType,
		SenderSubTaskID: input.SenderSubTaskID,
		TargetType:      input.TargetType,
		TargetSubTaskID: input.TargetSubTaskID,
		MessageType:     input.MessageType,
		Content:         input.Content,
		CreatedAt:       "2026-03-24T00:00:00Z",
	}, nil
}

func (r *mailboxCollectRepo) AppendSessionOutput(_ context.Context, sessionID string, chunk string) error {
	session := r.sessions[sessionID]
	if session == nil {
		session = &SessionRecord{ID: sessionID}
		r.sessions[sessionID] = session
	}
	session.OutputBuffer += chunk
	return nil
}

func (r *mailboxCollectRepo) ClaimSessionMailboxBlock(_ context.Context, sessionID string, fingerprint string) (bool, error) {
	key := sessionID + ":" + fingerprint
	if r.processedBlocks[key] {
		return false, nil
	}
	r.processedBlocks[key] = true
	return true, nil
}

func (r *mailboxCollectRepo) AtomicClaimRetry(context.Context, string, int) (bool, error) {
	return false, nil
}
