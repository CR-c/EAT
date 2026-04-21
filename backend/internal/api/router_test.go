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

func TestSystemHealthEndpoint(t *testing.T) {
	tempDir := t.TempDir()
	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	handler := NewHandler(Dependencies{
		DB:  db,
		Bus: eventbus.New(),
	})
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

func TestExecutionBackendsEndpointReturnsDockerBackendStatus(t *testing.T) {
	tempDir := t.TempDir()
	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	handler := NewHandler(Dependencies{
		DB:             db,
		Bus:            eventbus.New(),
		SandboxManager: newUnavailableSandboxManager(),
	})
	router := NewRouter(handler)

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/system/execution-backends", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d body=%s", response.Code, response.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	backends := payload["backends"].([]any)
	if len(backends) != 1 {
		t.Fatalf("unexpected backends payload: %#v", payload["backends"])
	}
	backend := backends[0].(map[string]any)
	if backend["kind"] != "docker" {
		t.Fatalf("unexpected backend kind: %#v", backend)
	}
	if backend["default"] != true {
		t.Fatalf("expected docker backend to be default: %#v", backend)
	}
	if backend["available"] != false {
		t.Fatalf("expected unavailable docker backend: %#v", backend)
	}
}

func TestExecutionBackendsEndpointExposesTrustedHostWhenEnabled(t *testing.T) {
	tempDir := t.TempDir()
	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()
	t.Setenv("EAT_ENABLE_TRUSTED_HOST_BACKEND", "1")

	handler := NewHandler(Dependencies{
		DB:             db,
		Bus:            eventbus.New(),
		SandboxManager: newUnavailableSandboxManager(),
	})
	router := NewRouter(handler)

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/system/execution-backends", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d body=%s", response.Code, response.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	backends := payload["backends"].([]any)
	if len(backends) != 2 {
		t.Fatalf("unexpected backends payload: %#v", payload["backends"])
	}
	hostBackend := backends[0].(map[string]any)
	if hostBackend["kind"] != "host" {
		t.Fatalf("expected host backend first when docker unavailable: %#v", backends)
	}
	if hostBackend["default"] != true || hostBackend["available"] != true {
		t.Fatalf("expected host backend default+available: %#v", hostBackend)
	}
	if hostBackend["trustLevel"] != "REDUCED_ISOLATION" {
		t.Fatalf("unexpected host trust level: %#v", hostBackend)
	}

	policyResponse := httptest.NewRecorder()
	router.ServeHTTP(policyResponse, httptest.NewRequest(http.MethodGet, "/api/system/sandbox-policy", nil))
	if policyResponse.Code != http.StatusOK {
		t.Fatalf("unexpected sandbox policy status: %d body=%s", policyResponse.Code, policyResponse.Body.String())
	}
	var policy map[string]any
	if err := json.Unmarshal(policyResponse.Body.Bytes(), &policy); err != nil {
		t.Fatalf("decode policy: %v", err)
	}
	if policy["workerDefault"] != "HOST" {
		t.Fatalf("expected workerDefault HOST: %#v", policy)
	}
}
