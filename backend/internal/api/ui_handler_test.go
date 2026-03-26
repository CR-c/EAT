package api

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"eat/backend/internal/eventbus"
	"eat/backend/internal/store"
)

func TestGoBackendServesUIShellAndStaticAssets(t *testing.T) {
	tempDir := t.TempDir()
	db, err := store.Open(filepath.Join(tempDir, "eat.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	uiDir := filepath.Join(tempDir, "ui")
	writeTestFile(t, filepath.Join(uiDir, "index.html"), "<!doctype html><html><head></head><body><script type=\"module\" src=\"/assets/main.js\"></script></body></html>")
	writeTestFile(t, filepath.Join(uiDir, "assets", "main.js"), "console.log('react-entry');")

	router := NewRouter(NewHandler(Dependencies{
		DB:         db,
		Bus:        eventbus.New(),
		UIRootPath: uiDir,
	}))

	rootResponse := performJSONRequest(router, http.MethodGet, "/", nil)
	if rootResponse.Code != http.StatusOK {
		t.Fatalf("unexpected root status: %d body=%s", rootResponse.Code, rootResponse.Body.String())
	}
	if got := rootResponse.Header().Get("Content-Type"); got != "text/html; charset=utf-8" {
		t.Fatalf("unexpected root content type: %s", got)
	}
	if !strings.Contains(rootResponse.Body.String(), "<!doctype html>") {
		t.Fatalf("expected html shell, got %q", rootResponse.Body.String())
	}

	appJSResponse := performJSONRequest(router, http.MethodGet, "/assets/main.js?v=test", nil)
	if appJSResponse.Code != http.StatusOK {
		t.Fatalf("unexpected asset status: %d body=%s", appJSResponse.Code, appJSResponse.Body.String())
	}
	if got := appJSResponse.Header().Get("Content-Type"); got != "text/javascript; charset=utf-8" {
		t.Fatalf("unexpected asset content type: %s", got)
	}
	if !strings.Contains(appJSResponse.Body.String(), "react-entry") {
		t.Fatalf("expected asset body, got %q", appJSResponse.Body.String())
	}
	if got := appJSResponse.Header().Get("Cache-Control"); got != uiStaticCacheControl {
		t.Fatalf("unexpected cache-control: %s", got)
	}
}

func writeTestFile(t *testing.T, filePath, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(filePath), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(filePath), err)
	}
	if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", filePath, err)
	}
}
