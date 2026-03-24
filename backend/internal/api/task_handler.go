package api

import "net/http"

func (h *Handler) ListTaskTemplates(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "task template listing")
}
func (h *Handler) CreateGuidedTask(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "guided task creation")
}
func (h *Handler) CreateTask(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "task creation")
}
func (h *Handler) ListProjectTasks(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "project task listing")
}
func (h *Handler) GetTask(w http.ResponseWriter, r *http.Request)     { notImplemented(w, "task detail") }
func (h *Handler) GetTaskTeam(w http.ResponseWriter, r *http.Request) { notImplemented(w, "task team") }
func (h *Handler) GetTaskBoard(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "task board")
}
func (h *Handler) StartClarification(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "clarification start")
}
func (h *Handler) SendTaskMessage(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "task messaging")
}
func (h *Handler) StopLeadSession(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "lead session stop")
}
func (h *Handler) ConfirmRequirements(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "requirements confirmation")
}
func (h *Handler) SendMailboxMessage(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "mailbox message")
}
func (h *Handler) UpdateCurrentPlan(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "current plan update")
}
func (h *Handler) PlanSeed(w http.ResponseWriter, r *http.Request) { notImplemented(w, "plan seed") }
func (h *Handler) ApprovePlan(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "plan approval")
}
func (h *Handler) ArchiveTask(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "task archive")
}
func (h *Handler) UnarchiveTask(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "task unarchive")
}
func (h *Handler) PauseTask(w http.ResponseWriter, r *http.Request) { notImplemented(w, "task pause") }
func (h *Handler) DeleteTask(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "task deletion")
}
func (h *Handler) ResumeTask(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "task resume")
}
func (h *Handler) RestorePlanSnapshot(w http.ResponseWriter, r *http.Request) {
	notImplemented(w, "plan snapshot restore")
}
