package api

import (
	"net/http"

	"eat/backend/internal/project"
	"github.com/go-chi/chi/v5"
)

func (h *Handler) CreateProject(w http.ResponseWriter, r *http.Request) {
	var input project.RegisterInput
	if err := decodeJSON(r, &input); err != nil {
		respondProjectError(w, &project.Error{
			Code:    project.ErrorCodeInvalidRequestBody,
			Message: "Request body must be valid JSON.",
		})
		return
	}

	projectRecord, repoStatus, serviceError := h.projectService.RegisterProject(r.Context(), input)
	if serviceError != nil {
		respondProjectError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusCreated, map[string]any{
		"project":    projectRecord,
		"repoStatus": repoStatus,
	})
}

func (h *Handler) ListProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := h.projectService.ListProjects(r.Context())
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]any{
			"error": map[string]any{
				"code":    "PROJECT_LIST_FAILED",
				"message": err.Error(),
			},
		})
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{"projects": projects})
}

func (h *Handler) BrowseProjects(w http.ResponseWriter, r *http.Request) {
	result, serviceError := h.projectService.BrowseDirectories(
		r.Context(),
		r.URL.Query().Get("path"),
		r.URL.Query().Get("hidden") == "1",
	)
	if serviceError != nil {
		respondProjectError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, result)
}

func (h *Handler) GetProject(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")

	projectRecord, repoStatus, serviceError := h.projectService.GetProject(r.Context(), projectID)
	if serviceError != nil {
		respondProjectError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"project":    projectRecord,
		"repoStatus": repoStatus,
	})
}

func (h *Handler) GetProjectRepoStatus(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	repoStatus, serviceError := h.projectService.GetProjectRepoStatus(r.Context(), projectID)
	if serviceError != nil {
		respondProjectError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"projectId":  projectID,
		"repoStatus": repoStatus,
	})
}

func (h *Handler) UpdateProjectPreferences(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")

	var input project.UpdateProjectPreferencesInput
	if err := decodeJSON(r, &input); err != nil {
		respondProjectError(w, &project.Error{
			Code:    project.ErrorCodeInvalidRequestBody,
			Message: "Request body must be valid JSON.",
		})
		return
	}

	projectRecord, serviceError := h.projectService.UpdateProjectPreferences(r.Context(), projectID, input)
	if serviceError != nil {
		respondProjectError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"project": projectRecord,
	})
}

func (h *Handler) DeleteProject(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")

	projectRecord, serviceError := h.projectService.DeleteProject(r.Context(), projectID)
	if serviceError != nil {
		respondProjectError(w, serviceError)
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"project": projectRecord,
	})
}
