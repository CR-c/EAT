package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"eat/backend/internal/eventbus"
	"eat/backend/internal/store"
)

func TestAgentEndpointsExposeBuiltInDirectoryAndHealth(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	router := NewRouter(NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	}))

	listRequest := httptest.NewRequest(http.MethodGet, "/api/agents", nil)
	listResponse := httptest.NewRecorder()
	router.ServeHTTP(listResponse, listRequest)
	if listResponse.Code != http.StatusOK {
		t.Fatalf("unexpected agent list status: %d body=%s", listResponse.Code, listResponse.Body.String())
	}

	var listPayload map[string]any
	if err := json.Unmarshal(listResponse.Body.Bytes(), &listPayload); err != nil {
		t.Fatalf("decode list response: %v", err)
	}

	agents := listPayload["agents"].([]any)
	if len(agents) != 3 {
		t.Fatalf("unexpected agent count: %d", len(agents))
	}

	healthRequest := httptest.NewRequest(http.MethodGet, "/api/agents/health", nil)
	healthResponse := httptest.NewRecorder()
	router.ServeHTTP(healthResponse, healthRequest)
	if healthResponse.Code != http.StatusOK {
		t.Fatalf("unexpected health status: %d body=%s", healthResponse.Code, healthResponse.Body.String())
	}

	var healthPayload map[string]any
	if err := json.Unmarshal(healthResponse.Body.Bytes(), &healthPayload); err != nil {
		t.Fatalf("decode health response: %v", err)
	}

	healthAgents := healthPayload["agents"].(map[string]any)
	if _, ok := healthAgents["codex-cli"]; !ok {
		t.Fatal("expected codex-cli health snapshot")
	}
}

func TestAgentEndpointsKeepLeadSelectableWhenWorkerBackendIsUnavailable(t *testing.T) {
	tempDir := t.TempDir()

	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	sandboxManager := newUnavailableSandboxManager()
	router := NewRouter(NewHandler(Dependencies{
		DB:             db,
		Bus:            eventbus.New(),
		SandboxManager: sandboxManager,
		AgentService:   newFakeLeadAgentServiceWithSandbox(t, sandboxManager, "已收到。"),
	}))

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/agents", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected agent list status: %d body=%s", response.Code, response.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	leadCandidates := payload["leadCandidates"].([]any)
	var codexCandidate map[string]any
	for _, item := range leadCandidates {
		candidate := item.(map[string]any)
		if candidate["agentName"] == "codex-cli" {
			codexCandidate = candidate
			break
		}
	}
	if codexCandidate == nil {
		t.Fatal("expected codex-cli lead candidate")
	}
	if codexCandidate["selectable"] != true {
		t.Fatalf("expected codex-cli lead candidate to stay selectable: %#v", codexCandidate)
	}
	if codexCandidate["executionAvailable"] != false {
		t.Fatalf("expected codex-cli execution to be unavailable: %#v", codexCandidate)
	}
	if codexCandidate["orchestrationAvailable"] != true {
		t.Fatalf("expected codex-cli orchestration to stay available: %#v", codexCandidate)
	}

	workerCandidates := payload["workerCandidates"].([]any)
	for _, item := range workerCandidates {
		candidate := item.(map[string]any)
		if candidate["agentName"] == "codex-cli" && candidate["selectable"] != false {
			t.Fatalf("expected codex-cli worker candidate to be blocked without execution backend: %#v", candidate)
		}
	}
}
