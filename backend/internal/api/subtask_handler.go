package api

import "net/http"

func (h *Handler) RetrySubTask(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "subtask retry")
}
func (h *Handler) ReworkSubTask(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "subtask rework")
}
func (h *Handler) CancelSubTask(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "subtask cancel")
}
func (h *Handler) ReassignSubTask(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "subtask reassign")
}
func (h *Handler) ChangeSubTaskAgent(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "subtask change-agent")
}
func (h *Handler) ConfirmDiscardSubTask(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "subtask discard confirmation")
}
func (h *Handler) RebaseRetrySubTask(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "subtask rebase retry")
}
