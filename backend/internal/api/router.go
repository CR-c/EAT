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
		r.Get("/project-directories", handler.BrowseProjects)

		r.Route("/projects", func(r chi.Router) {
			r.Post("/", handler.CreateProject)
			r.Get("/", handler.ListProjects)
			r.Get("/{projectId}", handler.GetProject)
			r.Delete("/{projectId}", handler.DeleteProject)
			r.Get("/{projectId}/repository-status", handler.GetProjectRepoStatus)
			r.Put("/{projectId}/preferences", handler.UpdateProjectPreferences)
			r.Get("/{projectId}/tasks", handler.ListProjectTasks)
		})

		r.Route("/agents", func(r chi.Router) {
			r.Get("/", handler.ListAgents)
			r.Get("/health", handler.AgentHealth)
		})

		r.Route("/system", func(r chi.Router) {
			r.Get("/health", handler.SystemHealth)
			r.Get("/docker", handler.DockerHealth)
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
			r.Get("/runtime", handler.GetTaskRuntime)
			r.Get("/diff", handler.GetTaskDiff)
			r.Get("/preview", handler.GetTaskPreview)
			r.Post("/preview-sessions", handler.StartTaskPreview)
			r.Delete("/preview-sessions/current", handler.StopTaskPreview)
			r.Post("/clarification-sessions", handler.StartClarification)
			r.Post("/messages", handler.SendTaskMessage)
			r.Delete("/lead-sessions/current", handler.StopLeadSession)
			r.Post("/requirement-confirmations", handler.ConfirmRequirements)
			r.Post("/mailbox-messages", handler.SendMailboxMessage)
			r.Put("/plan", handler.UpdateCurrentPlan)
			r.Post("/plan-seeds", handler.PlanSeed)
			r.Post("/plan-approvals", handler.ApprovePlan)
			r.Post("/replan-requests", handler.RequestReplan)
			r.Post("/archives", handler.ArchiveTask)
			r.Delete("/archives/current", handler.UnarchiveTask)
			r.Post("/pauses", handler.PauseTask)
			r.Delete("/", handler.DeleteTask)
			r.Delete("/pauses/current", handler.ResumeTask)
			r.Post("/integration-runs", handler.StartIntegrationRun)
			r.Post("/plan-snapshot-restores", handler.RestorePlanSnapshot)
		})

		r.Route("/subtasks/{subTaskId}", func(r chi.Router) {
			r.Post("/retry-requests", handler.RetrySubTask)
			r.Post("/rework-requests", handler.ReworkSubTask)
			r.Post("/cancellations", handler.CancelSubTask)
			r.Post("/reassignments", handler.ReassignSubTask)
			r.Post("/agent-changes", handler.ChangeSubTaskAgent)
			r.Post("/discard-confirmations", handler.ConfirmDiscardSubTask)
			r.Post("/rebase-retries", handler.RebaseRetrySubTask)
		})

		r.Route("/integration-runs/{integrationRunId}", func(r chi.Router) {
			r.Post("/retry-requests", handler.RetryIntegrationRun)
			r.Post("/rollback-requests", handler.RollbackIntegrationRun)
		})

		r.Route("/integration-queue-items/{integrationQueueItemId}", func(r chi.Router) {
			r.Post("/dequeue-requests", handler.DequeueIntegrationQueueItem)
		})
	})

	router.Get("/*", handler.HandleUIRoute)

	return router
}
