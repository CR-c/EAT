package api

import "net/http"

func (h *Handler) StartIntegrationRun(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "integration run start")
}
func (h *Handler) RetryIntegrationRun(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "integration run retry")
}
func (h *Handler) RollbackIntegrationRun(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "integration run rollback")
}
func (h *Handler) DequeueIntegrationQueueItem(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "integration queue dequeue")
}
