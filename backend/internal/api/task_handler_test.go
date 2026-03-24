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

func TestTaskTemplatesEndpoint(t *testing.T) {
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

	request := httptest.NewRequest(http.MethodGet, "/api/task-templates", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d body=%s", response.Code, response.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	templates := payload["templates"].([]any)
	if len(templates) != 4 {
		t.Fatalf("unexpected template count: %d", len(templates))
	}
}
