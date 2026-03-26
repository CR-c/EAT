package api

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"eat/backend/internal/eventbus"
	"eat/backend/internal/store"
)

func TestStartClarificationAndPauseEndpointsPublishRealtimeEvents(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectAndTask(t, db, "project-1", "task-events", "DRAFT", 0, "")

	bus := eventbus.New()
	events, unsubscribe := bus.Subscribe("task:task-events", 16)
	defer unsubscribe()

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: bus,
	}))

	startResponse := performJSONRequest(router, http.MethodPost, "/api/tasks/task-events/clarification-sessions", map[string]any{
		"content": "Clarify the operator workflow first.",
	})
	if startResponse.Code != http.StatusOK {
		t.Fatalf("unexpected clarification status: %d body=%s", startResponse.Code, startResponse.Body.String())
	}

	statusEvent := mustReadEvent(t, events)
	if statusEvent.Name != "task:status" {
		t.Fatalf("unexpected first event: %s", statusEvent.Name)
	}
	statusPayload := decodeEventPayload(t, statusEvent)
	if statusPayload["taskId"] != "task-events" || statusPayload["status"] != "CLARIFYING" {
		t.Fatalf("unexpected task status payload: %#v", statusPayload)
	}

	sessionStartedEvent := mustReadEvent(t, events)
	if sessionStartedEvent.Name != "session:started" {
		t.Fatalf("unexpected session start event: %s", sessionStartedEvent.Name)
	}
	sessionStartedPayload := decodeEventPayload(t, sessionStartedEvent)
	if sessionStartedPayload["taskId"] != "task-events" || sessionStartedPayload["sessionType"] != "LEAD" || sessionStartedPayload["status"] != "RUNNING" {
		t.Fatalf("unexpected session started payload: %#v", sessionStartedPayload)
	}

	pauseResponse := performJSONRequest(router, http.MethodPost, "/api/tasks/task-events/pauses", nil)
	if pauseResponse.Code != http.StatusOK {
		t.Fatalf("unexpected pause status: %d body=%s", pauseResponse.Code, pauseResponse.Body.String())
	}

	sessionEndedEvent := mustReadEvent(t, events)
	if sessionEndedEvent.Name != "session:ended" {
		t.Fatalf("unexpected session end event: %s", sessionEndedEvent.Name)
	}
	sessionEndedPayload := decodeEventPayload(t, sessionEndedEvent)
	if sessionEndedPayload["taskId"] != "task-events" || sessionEndedPayload["status"] != "CANCELLED" {
		t.Fatalf("unexpected session ended payload: %#v", sessionEndedPayload)
	}

	pausedEvent := mustReadEvent(t, events)
	if pausedEvent.Name != "task:status" {
		t.Fatalf("unexpected paused event: %s", pausedEvent.Name)
	}
	pausedPayload := decodeEventPayload(t, pausedEvent)
	if pausedPayload["status"] != "ACTION_REQUIRED" {
		t.Fatalf("unexpected paused payload: %#v", pausedPayload)
	}
	if !strings.Contains(eventPayloadString(pausedPayload["reason"]), "Paused by operator from CLARIFYING.") {
		t.Fatalf("unexpected paused reason: %#v", pausedPayload["reason"])
	}
}

func TestResumeEndpointPublishesTaskStatusEvent(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectTaskRecord(t, db, "project-resume", "task-resume-events", "ACTION_REQUIRED", 1, `{"subtasks":[{"title":"Accepted slice","description":"Ready","recommended_agent":"codex-cli","branch_suffix":"accepted-slice"}]}`)
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:               "subtask-resume",
		TaskID:           "task-resume-events",
		Title:            "Accepted slice",
		Description:      "Ready",
		BranchSuffix:     "accepted-slice",
		AgentType:        "codex-cli",
		Status:           "ACCEPTED",
		AssignmentSource: "LEAD",
		AutoAssigned:     true,
		ExecutionOrder:   1,
		CreatedAt:        "2026-03-24T00:10:00Z",
	})

	bus := eventbus.New()
	events, unsubscribe := bus.Subscribe("task:task-resume-events", 8)
	defer unsubscribe()

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: bus,
	}))

	response := performJSONRequest(router, http.MethodDelete, "/api/tasks/task-resume-events/pauses/current", nil)
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected resume status: %d body=%s", response.Code, response.Body.String())
	}

	event := mustReadEvent(t, events)
	if event.Name != "task:status" {
		t.Fatalf("unexpected event: %s", event.Name)
	}
	payload := decodeEventPayload(t, event)
	if payload["taskId"] != "task-resume-events" || payload["status"] != "MERGING" {
		t.Fatalf("unexpected resume payload: %#v", payload)
	}
}

func TestApprovePlanEndpointPublishesSubTaskAssignmentEvents(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectAndTask(t, db, "project-approve", "task-approve-events", "PLAN_REVIEW", 1, `{"subtasks":[{"title":"Plan backend slice","description":"Independent backend work.","recommended_agent":"codex-cli","branch_suffix":"backend-slice","role":"builder"}]}`)

	bus := eventbus.New()
	events, unsubscribe := bus.Subscribe("task:task-approve-events", 16)
	defer unsubscribe()

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: bus,
	}))

	response := performJSONRequest(router, http.MethodPost, "/api/tasks/task-approve-events/plan-approvals", nil)
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected approve status: %d body=%s", response.Code, response.Body.String())
	}

	taskStatusEvent := mustReadEvent(t, events)
	if taskStatusEvent.Name != "task:status" {
		t.Fatalf("unexpected task status event: %s", taskStatusEvent.Name)
	}
	taskStatusPayload := decodeEventPayload(t, taskStatusEvent)
	if taskStatusPayload["status"] != "EXECUTING" {
		t.Fatalf("unexpected task status payload: %#v", taskStatusPayload)
	}

	assignedEvent := mustReadEvent(t, events)
	if assignedEvent.Name != "subtask:assigned" {
		t.Fatalf("unexpected assigned event: %s", assignedEvent.Name)
	}
	assignedPayload := decodeEventPayload(t, assignedEvent)
	if assignedPayload["taskId"] != "task-approve-events" || assignedPayload["status"] != "PENDING" {
		t.Fatalf("unexpected assigned payload: %#v", assignedPayload)
	}

	subTaskStatusEvent := mustReadEvent(t, events)
	if subTaskStatusEvent.Name != "subtask:status" {
		t.Fatalf("unexpected subtask status event: %s", subTaskStatusEvent.Name)
	}
	subTaskStatusPayload := decodeEventPayload(t, subTaskStatusEvent)
	if subTaskStatusPayload["taskId"] != "task-approve-events" || subTaskStatusPayload["status"] != "PENDING" {
		t.Fatalf("unexpected subtask status payload: %#v", subTaskStatusPayload)
	}

	sessionStartedEvent := mustReadEvent(t, events)
	if sessionStartedEvent.Name != "session:started" {
		t.Fatalf("unexpected session started event: %s", sessionStartedEvent.Name)
	}
	sessionStartedPayload := decodeEventPayload(t, sessionStartedEvent)
	if sessionStartedPayload["taskId"] != "task-approve-events" || sessionStartedPayload["sessionType"] != "WORKER" || sessionStartedPayload["status"] != "PENDING" {
		t.Fatalf("unexpected session started payload: %#v", sessionStartedPayload)
	}
	if sessionStartedPayload["subtaskId"] == nil {
		t.Fatalf("expected worker session payload to include subtaskId: %#v", sessionStartedPayload)
	}

	teamUpdatedEvent := mustReadEvent(t, events)
	if teamUpdatedEvent.Name != "team:updated" {
		t.Fatalf("unexpected team event: %s", teamUpdatedEvent.Name)
	}
	teamUpdatedPayload := decodeEventPayload(t, teamUpdatedEvent)
	if teamUpdatedPayload["taskId"] != "task-approve-events" {
		t.Fatalf("unexpected team payload: %#v", teamUpdatedPayload)
	}
}

func TestRestorePlanSnapshotEndpointPublishesPlanRestoredEvent(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectAndTask(t, db, "project-restore", "task-restore-events", "PLAN_REVIEW", 1, `{"subtasks":[{"title":"Current draft","description":"Current","recommended_agent":"codex-cli","branch_suffix":"current"}]}`)
	if _, err := db.Exec(`
		INSERT INTO plan_snapshots (id, task_id, version, source, payload, created_at)
		VALUES (
			'snapshot-restore-events',
			'task-restore-events',
			1,
			'LEAD_GENERATED',
			'{"subtasks":[{"title":"Restored draft","description":"Restored","recommended_agent":"codex-cli","branch_suffix":"restored"}]}',
			'2026-03-24T00:20:00Z'
		)
	`); err != nil {
		t.Fatalf("insert plan snapshot: %v", err)
	}

	bus := eventbus.New()
	events, unsubscribe := bus.Subscribe("task:task-restore-events", 8)
	defer unsubscribe()

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: bus,
	}))

	response := performJSONRequest(router, http.MethodPost, "/api/tasks/task-restore-events/plan-snapshot-restores", map[string]any{
		"snapshotId": "snapshot-restore-events",
	})
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected restore status: %d body=%s", response.Code, response.Body.String())
	}

	event := mustReadEvent(t, events)
	if event.Name != "task:plan-restored" {
		t.Fatalf("unexpected restore event: %s", event.Name)
	}
	payload := decodeEventPayload(t, event)
	if payload["taskId"] != "task-restore-events" || payload["snapshotId"] != "snapshot-restore-events" {
		t.Fatalf("unexpected restore payload: %#v", payload)
	}
}

func TestIntegrationAndMailboxEndpointsPublishRealtimeEvents(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectTaskRecord(t, db, "project-stream", "task-stream-events", "ACTION_REQUIRED", 1, `{"subtasks":[{"title":"Accepted alpha","description":"Ready for integration.","recommended_agent":"codex-cli","branch_suffix":"alpha"}]}`)
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:               "subtask-stream-alpha",
		TaskID:           "task-stream-events",
		Title:            "Accepted alpha",
		Description:      "Ready for integration.",
		BranchSuffix:     "alpha",
		AgentType:        "codex-cli",
		Status:           "ACCEPTED",
		AssignmentSource: "LEAD",
		AutoAssigned:     true,
		ExecutionOrder:   1,
		CreatedAt:        "2026-03-24T00:30:00Z",
	})

	bus := eventbus.New()
	events, unsubscribe := bus.Subscribe("task:task-stream-events", 16)
	defer unsubscribe()

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: bus,
	}))

	integrationResponse := performJSONRequest(router, http.MethodPost, "/api/tasks/task-stream-events/integration-runs", nil)
	if integrationResponse.Code != http.StatusCreated {
		t.Fatalf("unexpected integration start status: %d body=%s", integrationResponse.Code, integrationResponse.Body.String())
	}

	taskStatusEvent := mustReadEvent(t, events)
	if taskStatusEvent.Name != "task:status" {
		t.Fatalf("unexpected integration task status event: %s", taskStatusEvent.Name)
	}
	taskStatusPayload := decodeEventPayload(t, taskStatusEvent)
	if taskStatusPayload["status"] != "MERGING" {
		t.Fatalf("unexpected integration task status payload: %#v", taskStatusPayload)
	}

	integrationQueuedEvent := mustReadEvent(t, events)
	if integrationQueuedEvent.Name != "integration:queued" {
		t.Fatalf("unexpected integration queued event: %s", integrationQueuedEvent.Name)
	}
	integrationQueuedPayload := decodeEventPayload(t, integrationQueuedEvent)
	if integrationQueuedPayload["taskId"] != "task-stream-events" || integrationQueuedPayload["status"] != "QUEUED" {
		t.Fatalf("unexpected integration queued payload: %#v", integrationQueuedPayload)
	}

	mailboxResponse := performJSONRequest(router, http.MethodPost, "/api/tasks/task-stream-events/mailbox-messages", map[string]any{
		"content":         "Please verify the integration branch before release.",
		"messageType":     "REVIEW_REQUEST",
		"targetSubTaskId": "subtask-stream-alpha",
	})
	if mailboxResponse.Code != http.StatusCreated {
		t.Fatalf("unexpected mailbox status: %d body=%s", mailboxResponse.Code, mailboxResponse.Body.String())
	}

	mailboxEvent := mustReadEvent(t, events)
	if mailboxEvent.Name != "mailbox:message" {
		t.Fatalf("unexpected mailbox event: %s", mailboxEvent.Name)
	}
	mailboxPayload := decodeEventPayload(t, mailboxEvent)
	if mailboxPayload["taskId"] != "task-stream-events" {
		t.Fatalf("unexpected mailbox payload: %#v", mailboxPayload)
	}

	boardEvent := mustReadEvent(t, events)
	if boardEvent.Name != "board:activity" {
		t.Fatalf("unexpected board event: %s", boardEvent.Name)
	}
	boardPayload := decodeEventPayload(t, boardEvent)
	if boardPayload["taskId"] != "task-stream-events" || boardPayload["kind"] != "MAILBOX_MESSAGE" {
		t.Fatalf("unexpected board payload: %#v", boardPayload)
	}

	teamUpdatedEvent := mustReadEvent(t, events)
	if teamUpdatedEvent.Name != "team:updated" {
		t.Fatalf("unexpected team event: %s", teamUpdatedEvent.Name)
	}
	teamUpdatedPayload := decodeEventPayload(t, teamUpdatedEvent)
	if teamUpdatedPayload["taskId"] != "task-stream-events" {
		t.Fatalf("unexpected team payload: %#v", teamUpdatedPayload)
	}
}

func TestCancelSubTaskPublishesActionRequiredWhenBlockedDependentsRemain(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectTaskRecord(t, db, "project-cancel-events", "task-cancel-events", "EXECUTING", 1, `{"subtasks":[{"title":"Backend contract","description":"Original","recommended_agent":"codex-cli","branch_suffix":"backend-contract"},{"title":"Frontend consumer","description":"Waits on backend.","recommended_agent":"codex-cli","branch_suffix":"frontend-consumer","depends_on":["backend-contract"]}]}`)
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:               "subtask-cancel-events-upstream",
		TaskID:           "task-cancel-events",
		Title:            "Backend contract",
		Description:      "Running worker.",
		BranchSuffix:     "backend-contract",
		AgentType:        "codex-cli",
		Status:           "RUNNING",
		AssignmentSource: "LEAD",
		AutoAssigned:     true,
		ExecutionOrder:   1,
		CreatedAt:        "2026-03-24T00:40:00Z",
	})
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:                          "subtask-cancel-events-downstream",
		TaskID:                      "task-cancel-events",
		Title:                       "Frontend consumer",
		Description:                 "Blocked on backend.",
		BranchSuffix:                "frontend-consumer",
		DependencyBranchSuffixesRaw: `["backend-contract"]`,
		AgentType:                   "codex-cli",
		Status:                      "BLOCKED",
		AssignmentSource:            "LEAD",
		AutoAssigned:                true,
		ExecutionOrder:              2,
		CreatedAt:                   "2026-03-24T00:40:01Z",
	})
	insertWorkerSessionRecord(t, db, "worker-session-cancel-events", "task-cancel-events", "subtask-cancel-events-upstream", "RUNNING")

	bus := eventbus.New()
	events, unsubscribe := bus.Subscribe("task:task-cancel-events", 16)
	defer unsubscribe()

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: bus,
	}))

	response := performJSONRequest(router, http.MethodPost, "/api/subtasks/subtask-cancel-events-upstream/cancellations", nil)
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected cancel status: %d body=%s", response.Code, response.Body.String())
	}

	mustReadEventNamed(t, events, "session:ended")
	mustReadEventNamed(t, events, "subtask:cancelled")
	mustReadEventNamed(t, events, "subtask:status")

	taskStatusEvent := mustReadEventNamed(t, events, "task:status")
	taskStatusPayload := decodeEventPayload(t, taskStatusEvent)
	if taskStatusPayload["taskId"] != "task-cancel-events" || taskStatusPayload["status"] != "ACTION_REQUIRED" {
		t.Fatalf("unexpected task status payload: %#v", taskStatusPayload)
	}
	if !strings.Contains(eventPayloadString(taskStatusPayload["reason"]), "Frontend consumer is blocked by backend-contract (CANCELLED).") {
		t.Fatalf("unexpected task status reason: %#v", taskStatusPayload["reason"])
	}
}

func TestConfirmDiscardPublishesActionRequiredWhenBlockedDependentsRemain(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	insertProjectTaskRecord(t, db, "project-discard-events", "task-discard-events", "ACTION_REQUIRED", 1, `{"subtasks":[{"title":"Backend slice","description":"Original","recommended_agent":"codex-cli","branch_suffix":"backend-slice"},{"title":"Frontend consumer","description":"Waits on backend.","recommended_agent":"codex-cli","branch_suffix":"frontend-consumer","depends_on":["backend-slice"]}]}`)
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:               "subtask-discard-events-upstream",
		TaskID:           "task-discard-events",
		Title:            "Backend slice",
		Description:      "Discard pending.",
		BranchSuffix:     "backend-slice",
		AgentType:        "codex-cli",
		Status:           "DISCARD_PENDING",
		AssignmentSource: "LEAD",
		AutoAssigned:     true,
		ExecutionOrder:   1,
		CreatedAt:        "2026-03-24T00:41:00Z",
	})
	insertSubTaskRecord(t, db, subTaskFixture{
		ID:                          "subtask-discard-events-downstream",
		TaskID:                      "task-discard-events",
		Title:                       "Frontend consumer",
		Description:                 "Blocked on backend.",
		BranchSuffix:                "frontend-consumer",
		DependencyBranchSuffixesRaw: `["backend-slice"]`,
		AgentType:                   "codex-cli",
		Status:                      "BLOCKED",
		AssignmentSource:            "LEAD",
		AutoAssigned:                true,
		ExecutionOrder:              2,
		CreatedAt:                   "2026-03-24T00:41:01Z",
	})

	bus := eventbus.New()
	events, unsubscribe := bus.Subscribe("task:task-discard-events", 16)
	defer unsubscribe()

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: bus,
	}))

	response := performJSONRequest(router, http.MethodPost, "/api/subtasks/subtask-discard-events-upstream/discard-confirmations", nil)
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected confirm-discard status: %d body=%s", response.Code, response.Body.String())
	}

	mustReadEventNamed(t, events, "subtask:confirm-discard")
	mustReadEventNamed(t, events, "subtask:status")

	taskStatusEvent := mustReadEventNamed(t, events, "task:status")
	taskStatusPayload := decodeEventPayload(t, taskStatusEvent)
	if taskStatusPayload["taskId"] != "task-discard-events" || taskStatusPayload["status"] != "ACTION_REQUIRED" {
		t.Fatalf("unexpected task status payload: %#v", taskStatusPayload)
	}
	if !strings.Contains(eventPayloadString(taskStatusPayload["reason"]), "Frontend consumer is blocked by backend-slice (DISCARDED).") {
		t.Fatalf("unexpected task status reason: %#v", taskStatusPayload["reason"])
	}
}

func mustReadEvent(t *testing.T, events <-chan eventbus.Event) eventbus.Event {
	t.Helper()

	select {
	case event := <-events:
		return event
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for realtime event")
		return eventbus.Event{}
	}
}

func decodeEventPayload(t *testing.T, event eventbus.Event) map[string]any {
	t.Helper()

	if len(event.Data) == 0 {
		return map[string]any{}
	}

	var payload map[string]any
	if err := json.Unmarshal(event.Data, &payload); err != nil {
		t.Fatalf("decode event payload for %s: %v", event.Name, err)
	}
	return payload
}

func mustReadEventNamed(t *testing.T, events <-chan eventbus.Event, eventName string) eventbus.Event {
	t.Helper()

	event := mustReadEvent(t, events)
	if event.Name != eventName {
		t.Fatalf("unexpected event order: got %s want %s", event.Name, eventName)
	}
	return event
}

func eventPayloadString(value any) string {
	if value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return text
	}
	return ""
}
