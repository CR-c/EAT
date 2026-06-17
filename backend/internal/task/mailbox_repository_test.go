package task

import (
	"context"
	"path/filepath"
	"testing"

	"eat/backend/internal/store"
)

func TestListMailboxMessagesForSubTaskFiltersRelevantHandoffs(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(filepath.Join(t.TempDir(), "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if _, err := db.ExecContext(ctx, `
		INSERT INTO projects (
			id, name, path, default_branch, created_at, updated_at
		) VALUES (
			'project-mailbox', 'Mailbox Project', '/tmp/mailbox-project', 'main',
			'2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z'
		);
		INSERT INTO tasks (
			id, project_id, title, description, lead_agent_type, base_branch, base_commit_sha,
			task_branch_name, worker_backend_kind, execution_profile, task_type, plan_origin, status,
			plan_version, current_plan_json, approved_plan_json, last_error, archived_at,
			created_at, updated_at, version
		) VALUES (
			'task-mailbox', 'project-mailbox', 'Mailbox', '', 'codex-cli', 'main', 'abc123',
			NULL, 'docker', 'default', 'feature', NULL, 'EXECUTING',
			0, NULL, NULL, NULL, NULL,
			'2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z', 0
		);
		INSERT INTO sub_tasks (
			id, task_id, title, description, branch_suffix, dependency_branch_suffixes_json,
			branch_name, start_commit_sha, worktree_path, agent_type, status, auto_assigned,
			retry_count, last_error, latest_review_decision, latest_review_phase,
			latest_review_summary, role, display_name, execution_order, assignment_source,
			run_summary, version, created_at, updated_at
		) VALUES (
			'subtask-target', 'task-mailbox', 'Target', '', 'target', '[]',
			NULL, NULL, NULL, 'codex-cli', 'PENDING', 1,
			0, NULL, NULL, NULL,
			NULL, NULL, NULL, 1, 'LEAD',
			NULL, 0, '2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z'
		), (
			'subtask-other', 'task-mailbox', 'Other', '', 'other', '[]',
			NULL, NULL, NULL, 'codex-cli', 'PENDING', 1,
			0, NULL, NULL, NULL,
			NULL, NULL, NULL, 2, 'LEAD',
			NULL, 0, '2026-03-24T00:00:00Z', '2026-03-24T00:00:00Z'
		);
	`); err != nil {
		t.Fatalf("seed task: %v", err)
	}

	repository := NewRepository(db.DB)
	target := "subtask-target"
	other := "subtask-other"
	if _, err := repository.CreateMailboxMessage(ctx, CreateMailboxMessageInput{
		ID:              "mailbox-target",
		TaskID:          "task-mailbox",
		SenderType:      "LEAD",
		TargetType:      "SUBTASK",
		TargetSubTaskID: &target,
		MessageType:     "BLOCKER",
		Content:         "direct target",
		CreatedAt:       "2026-03-24T00:00:01Z",
	}); err != nil {
		t.Fatalf("create target message: %v", err)
	}
	if _, err := repository.CreateMailboxMessage(ctx, CreateMailboxMessageInput{
		ID:              "mailbox-api",
		TaskID:          "task-mailbox",
		SenderType:      "SUBTASK",
		SenderSubTaskID: &other,
		TargetType:      "LEAD",
		MessageType:     "API_CONTRACT",
		Content:         "api contract",
		CreatedAt:       "2026-03-24T00:00:02Z",
	}); err != nil {
		t.Fatalf("create api message: %v", err)
	}
	if _, err := repository.CreateMailboxMessage(ctx, CreateMailboxMessageInput{
		ID:          "mailbox-ack",
		TaskID:      "task-mailbox",
		SenderType:  "LEAD",
		TargetType:  "LEAD",
		MessageType: "NOTE",
		RequiresAck: true,
		Content:     "requires ack",
		CreatedAt:   "2026-03-24T00:00:03Z",
	}); err != nil {
		t.Fatalf("create ack message: %v", err)
	}
	if _, err := repository.CreateMailboxMessage(ctx, CreateMailboxMessageInput{
		ID:              "mailbox-other",
		TaskID:          "task-mailbox",
		SenderType:      "LEAD",
		TargetType:      "SUBTASK",
		TargetSubTaskID: &other,
		MessageType:     "NOTE",
		Content:         "other subtask only",
		CreatedAt:       "2026-03-24T00:00:04Z",
	}); err != nil {
		t.Fatalf("create other message: %v", err)
	}

	messages, err := repository.ListMailboxMessagesForSubTask(ctx, "task-mailbox", "subtask-target")
	if err != nil {
		t.Fatalf("list mailbox messages: %v", err)
	}

	got := make([]string, 0, len(messages))
	for _, message := range messages {
		got = append(got, message.ID)
	}
	want := []string{"mailbox-target", "mailbox-api", "mailbox-ack"}
	if len(got) != len(want) {
		t.Fatalf("unexpected mailbox ids: got=%v want=%v", got, want)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("unexpected mailbox ids: got=%v want=%v", got, want)
		}
	}
}
