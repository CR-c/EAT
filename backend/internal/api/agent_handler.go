package api

import "net/http"

func (h *Handler) ListAgents(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "agent directory")
}
func (h *Handler) AgentHealth(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "agent health")
}
