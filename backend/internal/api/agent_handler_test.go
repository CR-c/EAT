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
