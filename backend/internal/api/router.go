package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
)

func NewRouter(handler *Handler) http.Handler {
	router := chi.NewRouter()
	router.Use(chiMiddleware.RequestID)
	router.Use(chiMiddleware.RealIP)
	router.Use(chiMiddleware.Recoverer)
	router.Use(loggingMiddleware)
	router.Use(corsMiddleware)

	router.Get("/", handler.HandleRoot)
	router.Get("/app.css", handler.HandleStaticAsset)
	router.Get("/app.js", handler.HandleStaticAsset)
	router.Get("/view-model.js", handler.HandleStaticAsset)

	router.Route("/api", func(r chi.Router) {
		r.Route("/projects", func(r chi.Router) {
			r.Post("/", handler.CreateProject)
			r.Get("/", handler.ListProjects)
			r.Get("/browse", handler.BrowseProjects)
			r.Get("/{projectId}", handler.GetProject)
			r.Get("/{projectId}/repo-status", handler.GetProjectRepoStatus)
			r.Get("/{projectId}/tasks", handler.ListProjectTasks)
		})

		r.Route("/agents", func(r chi.Router) {
			r.Get("/", handler.ListAgents)
			r.Get("/health", handler.AgentHealth)
		})

		r.Route("/system", func(r chi.Router) {
			r.Get("/health", handler.SystemHealth)
			r.Get("/docker-health", handler.DockerHealth)
			r.Get("/sandbox-policy", handler.SandboxPolicy)
		})

		r.Route("/metrics", func(r chi.Router) {
			r.Get("/summary", handler.MetricsSummary)
			r.Get("/export", handler.MetricsExport)
		})

		r.Get("/task-templates", handler.ListTaskTemplates)
		r.Post("/guided-tasks", handler.CreateGuidedTask)
		r.Post("/tasks", handler.CreateTask)

		r.Route("/tasks/{taskId}", func(r chi.Router) {
			r.Get("/", handler.GetTask)
			r.Get("/events", handler.TaskEvents)
			r.Get("/team", handler.GetTaskTeam)
			r.Get("/board", handler.GetTaskBoard)
			r.Get("/preview", handler.GetTaskPreview)
			r.Post("/preview/start", handler.StartTaskPreview)
			r.Post("/preview/stop", handler.StopTaskPreview)
			r.Post("/start-clarification", handler.StartClarification)
			r.Post("/messages", handler.SendTaskMessage)
			r.Post("/stop-lead-session", handler.StopLeadSession)
			r.Post("/confirm-requirements", handler.ConfirmRequirements)
			r.Post("/mailbox", handler.SendMailboxMessage)
			r.Put("/current-plan", handler.UpdateCurrentPlan)
			r.Post("/plan-seed", handler.PlanSeed)
			r.Post("/approve-plan", handler.ApprovePlan)
			r.Post("/archive", handler.ArchiveTask)
			r.Post("/unarchive", handler.UnarchiveTask)
			r.Post("/pause", handler.PauseTask)
			r.Delete("/", handler.DeleteTask)
			r.Post("/resume", handler.ResumeTask)
			r.Post("/integration-runs", handler.StartIntegrationRun)
			r.Post("/restore-plan-snapshot", handler.RestorePlanSnapshot)
		})

		r.Route("/subtasks/{subTaskId}", func(r chi.Router) {
			r.Post("/retry", handler.RetrySubTask)
			r.Post("/rework", handler.ReworkSubTask)
			r.Post("/cancel", handler.CancelSubTask)
			r.Post("/reassign", handler.ReassignSubTask)
			r.Post("/change-agent", handler.ChangeSubTaskAgent)
			r.Post("/confirm-discard", handler.ConfirmDiscardSubTask)
			r.Post("/rebase-retry", handler.RebaseRetrySubTask)
		})

		r.Route("/integration-runs/{integrationRunId}", func(r chi.Router) {
			r.Post("/retry", handler.RetryIntegrationRun)
			r.Post("/rollback", handler.RollbackIntegrationRun)
		})

		r.Route("/integration-queue-items/{integrationQueueItemId}", func(r chi.Router) {
			r.Post("/dequeue", handler.DequeueIntegrationQueueItem)
		})
	})

	router.Get("/*", handler.HandleUIRoute)

	return router
}
