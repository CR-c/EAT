package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"eat/backend/internal/eventbus"
)

func TestSystemHealthEndpoint(t *testing.T) {
	handler := NewHandler(Dependencies{Bus: eventbus.New()})
	router := NewRouter(handler)

	request := httptest.NewRequest(http.MethodGet, "/api/system/health", nil)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d", response.Code)
	}

	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if payload["status"] != "healthy" {
		t.Fatalf("unexpected status payload: %#v", payload["status"])
	}
}
