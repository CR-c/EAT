package api

import (
	"net/http"
	"os"
	"path/filepath"
)

const uiStaticCacheControl = "no-store"

var uiStaticAssets = map[string]struct {
	FileName    string
	ContentType string
}{
	"/app.css": {
		FileName:    "app.css",
		ContentType: "text/css; charset=utf-8",
	},
	"/app.js": {
		FileName:    "app.js",
		ContentType: "text/javascript; charset=utf-8",
	},
	"/view-model.js": {
		FileName:    "view-model.js",
		ContentType: "text/javascript; charset=utf-8",
	},
}

func (h *Handler) HandleRoot(w http.ResponseWriter, r *http.Request) {
	h.respondUIFile(w, "index.html", "text/html; charset=utf-8")
}

func (h *Handler) HandleStaticAsset(w http.ResponseWriter, r *http.Request) {
	asset, ok := uiStaticAssets[r.URL.Path]
	if !ok {
		http.NotFound(w, r)
		return
	}
	h.respondUIFile(w, asset.FileName, asset.ContentType)
}

func (h *Handler) respondUIFile(w http.ResponseWriter, fileName, contentType string) {
	if h.uiRootPath == "" {
		respondJSON(w, http.StatusInternalServerError, map[string]any{
			"error": map[string]any{
				"code":    "STATIC_ASSET_ROOT_NOT_FOUND",
				"message": "Unable to resolve the UI asset root for the Go backend.",
			},
		})
		return
	}

	body, err := os.ReadFile(filepath.Join(h.uiRootPath, fileName))
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]any{
			"error": map[string]any{
				"code":    "STATIC_ASSET_READ_ERROR",
				"message": "Unable to load the requested UI asset.",
			},
		})
		return
	}

	w.Header().Set("Cache-Control", uiStaticCacheControl)
	w.Header().Set("Content-Type", contentType)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}
