package api

import "net/http"

func (h *Handler) MetricsSummary(w http.ResponseWriter, r *http.Request) {
	result, err := h.metricsService.GetSummary(r.Context())
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]any{
			"error": map[string]any{
				"code":    "METRICS_SUMMARY_FAILED",
				"message": err.Error(),
			},
		})
		return
	}

	respondJSON(w, http.StatusOK, result)
}
func (h *Handler) MetricsExport(w http.ResponseWriter, r *http.Request) {
	result, err := h.metricsService.ExportMetrics(r.Context())
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]any{
			"error": map[string]any{
				"code":    "METRICS_EXPORT_FAILED",
				"message": err.Error(),
			},
		})
		return
	}

	respondJSON(w, http.StatusOK, result)
}
