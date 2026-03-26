package metrics

import (
	"context"
	"database/sql"
	"encoding/json"
	"slices"
	"sort"
	"strings"
	"time"
)

const (
	cleanupWarningMessagePrefix = "Cleanup warning: "
	launchFailureMessagePrefix  = "Launch failure: "
)

type Service struct {
	db *sql.DB
}

type SummaryResponse struct {
	Summary Summary `json:"summary"`
}

type ExportResponse struct {
	GeneratedAt string          `json:"generatedAt"`
	Summary     Summary         `json:"summary"`
	Tasks       []TaskMetricRow `json:"tasks"`
}

type Summary struct {
	CleanupWarningCount               int                 `json:"cleanupWarningCount"`
	CompletionRateAfterPlanApproval   *float64            `json:"completionRateAfterPlanApproval"`
	Definitions                       map[string]string   `json:"definitions"`
	EarlyReworkAdoptionRate           *float64            `json:"earlyReworkAdoptionRate"`
	FailedWorkerSessionCount          int                 `json:"failedWorkerSessionCount"`
	MergeConflictCount                int                 `json:"mergeConflictCount"`
	MergeConflictSurfacingAccuracy    *float64            `json:"mergeConflictSurfacingAccuracy"`
	MedianPlanApprovalToFirstOutputMs *int64              `json:"medianPlanApprovalToFirstWorkerOutputMs"`
	RebaseRetryCount                  int                 `json:"rebaseRetryCount"`
	RetryToReviewConversionRate       *float64            `json:"retryToReviewConversionRate"`
	SandboxLaunchFailureCount         int                 `json:"sandboxLaunchFailureCount"`
	TasksCompleted                    int                 `json:"tasksCompleted"`
	TasksEnteredExecuting             int                 `json:"tasksEnteredExecuting"`
	TotalTokensByAgent                map[string]int64    `json:"totalTokensByAgent"`
	TotalTokensUsed                   int64               `json:"totalTokensUsed"`
	UnavailableMetrics                []UnavailableMetric `json:"unavailableMetrics"`
	WorkerCrashDetectionRate          *float64            `json:"workerCrashDetectionRate"`
}

type UnavailableMetric struct {
	Metric string `json:"metric"`
	Reason string `json:"reason"`
}

type TaskMetricRow struct {
	CleanupWarningCount       int     `json:"cleanupWarningCount"`
	CompletedAt               *string `json:"completedAt"`
	CreatedAt                 string  `json:"createdAt"`
	FailedWorkerSessionCount  int     `json:"failedWorkerSessionCount"`
	FirstWorkerOutputAt       *string `json:"firstWorkerOutputAt"`
	MergeConflictCount        int     `json:"mergeConflictCount"`
	PlanApprovedAt            *string `json:"planApprovedAt"`
	ProjectID                 string  `json:"projectId"`
	RebaseRetryCount          int     `json:"rebaseRetryCount"`
	RetryCount                int64   `json:"retryCount"`
	SandboxLaunchFailureCount int     `json:"sandboxLaunchFailureCount"`
	Status                    string  `json:"status"`
	TaskID                    string  `json:"taskId"`
	Title                     string  `json:"title"`
	WorkerSessionCount        int     `json:"workerSessionCount"`
}

type taskRecord struct {
	ID               string
	ProjectID        string
	Title            string
	Status           string
	ApprovedPlanJSON *string
	CreatedAt        string
	UpdatedAt        string
}

type subTaskRecord struct {
	ID         string
	TaskID     string
	RetryCount int64
}

type sessionRecord struct {
	ID            string
	TaskID        string
	SubTaskID     *string
	SessionType   string
	Status        string
	EndedAt       *string
	ExitCode      *int64
	FirstOutputAt *string
	OutputBuffer  string
	CreatedAt     string
}

type messageRecord struct {
	TaskID    string
	Role      string
	Content   string
	CreatedAt string
}

type reviewRecord struct {
	SubTaskID string
	SessionID *string
	Phase     string
	Decision  string
	CreatedAt string
}

type mergeRecord struct {
	SubTaskID       string
	Operation       string
	Status          string
	ConflictSummary *string
}

type planSnapshotRecord struct {
	TaskID    string
	Source    string
	CreatedAt string
}

type cleanupWarning struct {
	TaskID       string
	CreatedAt    string
	Reason       string
	WorktreePath string
}

type launchFailure struct {
	TaskID    string
	SubTaskID *string
	CreatedAt string
	Kind      string
	Reason    string
}

type tokenUsageRecord struct {
	AgentType   string
	TotalTokens int64
}

type dataset struct {
	Tasks           []taskRecord
	SubTasks        []subTaskRecord
	Sessions        []sessionRecord
	TokenUsage      []tokenUsageRecord
	Messages        []messageRecord
	ReviewRecords   []reviewRecord
	MergeRecords    []mergeRecord
	PlanSnapshots   []planSnapshotRecord
	CleanupWarnings []cleanupWarning
	LaunchFailures  []launchFailure
}

func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

func (s *Service) GetSummary(ctx context.Context) (*SummaryResponse, error) {
	data, err := s.loadDataset(ctx)
	if err != nil {
		return nil, err
	}

	return &SummaryResponse{
		Summary: buildMetricsSummary(data),
	}, nil
}

func (s *Service) ExportMetrics(ctx context.Context) (*ExportResponse, error) {
	data, err := s.loadDataset(ctx)
	if err != nil {
		return nil, err
	}

	return &ExportResponse{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Summary:     buildMetricsSummary(data),
		Tasks:       buildTaskMetricRows(data),
	}, nil
}

func (s *Service) loadDataset(ctx context.Context) (*dataset, error) {
	tasks, err := queryTasks(ctx, s.db)
	if err != nil {
		return nil, err
	}
	subTasks, err := querySubTasks(ctx, s.db)
	if err != nil {
		return nil, err
	}
	sessions, err := querySessions(ctx, s.db)
	if err != nil {
		return nil, err
	}
	tokenUsage, err := queryTokenUsage(ctx, s.db)
	if err != nil {
		return nil, err
	}
	messages, err := queryMessages(ctx, s.db)
	if err != nil {
		return nil, err
	}
	reviewRecords, err := queryReviewRecords(ctx, s.db)
	if err != nil {
		return nil, err
	}
	mergeRecords, err := queryMergeRecords(ctx, s.db)
	if err != nil {
		return nil, err
	}
	planSnapshots, err := queryPlanSnapshots(ctx, s.db)
	if err != nil {
		return nil, err
	}

	data := &dataset{
		Tasks:         tasks,
		SubTasks:      subTasks,
		Sessions:      sessions,
		TokenUsage:    tokenUsage,
		Messages:      messages,
		ReviewRecords: reviewRecords,
		MergeRecords:  mergeRecords,
		PlanSnapshots: planSnapshots,
	}

	for _, message := range messages {
		if warning := parseCleanupWarningMessage(message); warning != nil {
			data.CleanupWarnings = append(data.CleanupWarnings, *warning)
		}
		if failure := parseLaunchFailureMessage(message); failure != nil {
			data.LaunchFailures = append(data.LaunchFailures, *failure)
		}
	}

	return data, nil
}

func buildMetricsSummary(data *dataset) Summary {
	tasksEnteredExecuting := 0
	tasksCompleted := 0
	for _, task := range data.Tasks {
		if task.ApprovedPlanJSON != nil && strings.TrimSpace(*task.ApprovedPlanJSON) != "" {
			tasksEnteredExecuting++
		}
		if task.Status == "COMPLETED" {
			tasksCompleted++
		}
	}

	var crashedWorkerSessions []sessionRecord
	var detectedWorkerCrashes []sessionRecord
	for _, session := range data.Sessions {
		if session.SessionType == "WORKER" && session.ExitCode != nil && *session.ExitCode != 0 {
			crashedWorkerSessions = append(crashedWorkerSessions, session)
			if session.Status == "FAILED" && session.EndedAt != nil && strings.TrimSpace(*session.EndedAt) != "" {
				detectedWorkerCrashes = append(detectedWorkerCrashes, session)
			}
		}
	}

	var mergeConflicts []mergeRecord
	var rebaseRetries []mergeRecord
	for _, record := range data.MergeRecords {
		if record.Operation == "MERGE" && record.Status == "CONFLICT" {
			mergeConflicts = append(mergeConflicts, record)
		}
		if record.Operation == "REBASE" {
			rebaseRetries = append(rebaseRetries, record)
		}
	}

	retrySessions := resolveRetrySessions(data.Sessions)
	retrySessionsWithReview := 0
	for _, session := range retrySessions {
		for _, record := range data.ReviewRecords {
			if record.Phase == "INCREMENTAL" && record.SessionID != nil && *record.SessionID == session.ID {
				retrySessionsWithReview++
				break
			}
		}
	}

	var actionableIncrementalReviews []reviewRecord
	for _, record := range data.ReviewRecords {
		if record.Phase == "INCREMENTAL" && slices.Contains([]string{"REJECTED", "REWORK"}, record.Decision) {
			actionableIncrementalReviews = append(actionableIncrementalReviews, record)
		}
	}

	earlyReworkAdoptions := 0
	for _, record := range actionableIncrementalReviews {
		if hasEarlyReworkAdoption(record, data.Sessions, data.ReviewRecords) {
			earlyReworkAdoptions++
		}
	}

	firstOutputDurations := resolveFirstOutputDurationsMS(data.Tasks, data.Sessions, data.PlanSnapshots)
	missingFirstOutputTiming := resolveTasksMissingFirstOutputTiming(data.Tasks, data.Sessions, data.PlanSnapshots)
	totalTokensByAgent, totalTokensUsed := summarizeTokenUsage(data.TokenUsage)

	return Summary{
		CleanupWarningCount:             len(data.CleanupWarnings),
		CompletionRateAfterPlanApproval: safeRate(tasksCompleted, tasksEnteredExecuting),
		Definitions: map[string]string{
			"completionRateAfterPlanApproval": "tasks reaching COMPLETED divided by tasks with approved plans",
			"mergeConflictSurfacingAccuracy":  "merge conflicts with a persisted conflict summary divided by all merge conflicts",
			"retryToReviewConversionRate":     "retry worker sessions with a persisted incremental review divided by all retry worker sessions",
			"workerCrashDetectionRate":        "failed worker sessions persisted with FAILED status divided by worker sessions exiting non-zero",
		},
		EarlyReworkAdoptionRate:           safeRate(earlyReworkAdoptions, len(actionableIncrementalReviews)),
		FailedWorkerSessionCount:          len(crashedWorkerSessions),
		MergeConflictCount:                len(mergeConflicts),
		MergeConflictSurfacingAccuracy:    safeRate(countConflictSummaries(mergeConflicts), len(mergeConflicts)),
		MedianPlanApprovalToFirstOutputMs: median(firstOutputDurations),
		RebaseRetryCount:                  len(rebaseRetries),
		RetryToReviewConversionRate:       safeRate(retrySessionsWithReview, len(retrySessions)),
		SandboxLaunchFailureCount:         countSandboxLaunchFailures(data.LaunchFailures),
		TasksCompleted:                    tasksCompleted,
		TasksEnteredExecuting:             tasksEnteredExecuting,
		TotalTokensByAgent:                totalTokensByAgent,
		TotalTokensUsed:                   totalTokensUsed,
		UnavailableMetrics:                buildUnavailableMetrics(missingFirstOutputTiming),
		WorkerCrashDetectionRate:          safeRate(len(detectedWorkerCrashes), len(crashedWorkerSessions)),
	}
}

func buildTaskMetricRows(data *dataset) []TaskMetricRow {
	subTasksByTaskID := make(map[string][]subTaskRecord)
	for _, subTask := range data.SubTasks {
		subTasksByTaskID[subTask.TaskID] = append(subTasksByTaskID[subTask.TaskID], subTask)
	}

	sessionsByTaskID := make(map[string][]sessionRecord)
	for _, session := range data.Sessions {
		sessionsByTaskID[session.TaskID] = append(sessionsByTaskID[session.TaskID], session)
	}

	subTaskToTaskID := make(map[string]string)
	for _, subTask := range data.SubTasks {
		subTaskToTaskID[subTask.ID] = subTask.TaskID
	}

	mergeRecordsByTaskID := make(map[string][]mergeRecord)
	for _, record := range data.MergeRecords {
		taskID := subTaskToTaskID[record.SubTaskID]
		if taskID == "" {
			continue
		}
		mergeRecordsByTaskID[taskID] = append(mergeRecordsByTaskID[taskID], record)
	}

	cleanupWarningsByTaskID := make(map[string][]cleanupWarning)
	for _, warning := range data.CleanupWarnings {
		cleanupWarningsByTaskID[warning.TaskID] = append(cleanupWarningsByTaskID[warning.TaskID], warning)
	}

	launchFailuresByTaskID := make(map[string][]launchFailure)
	for _, failure := range data.LaunchFailures {
		launchFailuresByTaskID[failure.TaskID] = append(launchFailuresByTaskID[failure.TaskID], failure)
	}

	approvedSnapshotsByTaskID := make(map[string][]planSnapshotRecord)
	for _, snapshot := range data.PlanSnapshots {
		if snapshot.Source == "APPROVED" {
			approvedSnapshotsByTaskID[snapshot.TaskID] = append(approvedSnapshotsByTaskID[snapshot.TaskID], snapshot)
		}
	}

	rows := make([]TaskMetricRow, 0, len(data.Tasks))
	for _, task := range data.Tasks {
		taskSubTasks := subTasksByTaskID[task.ID]
		taskSessions := sessionsByTaskID[task.ID]
		taskMergeRecords := mergeRecordsByTaskID[task.ID]
		approvalSnapshot := firstSnapshot(approvedSnapshotsByTaskID[task.ID])
		firstWorkerOutputAt := firstWorkerOutput(taskSessions)

		var completedAt *string
		if isTerminalTaskStatus(task.Status) {
			completedAt = stringPointer(task.UpdatedAt)
		}

		rows = append(rows, TaskMetricRow{
			CleanupWarningCount:       len(cleanupWarningsByTaskID[task.ID]),
			CompletedAt:               completedAt,
			CreatedAt:                 task.CreatedAt,
			FailedWorkerSessionCount:  countFailedWorkerSessions(taskSessions),
			FirstWorkerOutputAt:       firstWorkerOutputAt,
			MergeConflictCount:        countMergeConflicts(taskMergeRecords),
			PlanApprovedAt:            approvalSnapshot,
			ProjectID:                 task.ProjectID,
			RebaseRetryCount:          countRebaseRetries(taskMergeRecords),
			RetryCount:                sumRetryCount(taskSubTasks),
			SandboxLaunchFailureCount: countSandboxLaunchFailures(launchFailuresByTaskID[task.ID]),
			Status:                    task.Status,
			TaskID:                    task.ID,
			Title:                     task.Title,
			WorkerSessionCount:        countWorkerSessions(taskSessions),
		})
	}

	return rows
}

func resolveRetrySessions(sessions []sessionRecord) []sessionRecord {
	grouped := make(map[string][]sessionRecord)
	for _, session := range sessions {
		if session.SessionType != "WORKER" || session.SubTaskID == nil {
			continue
		}
		grouped[*session.SubTaskID] = append(grouped[*session.SubTaskID], session)
	}

	var retrySessions []sessionRecord
	for _, subTaskSessions := range grouped {
		sort.Slice(subTaskSessions, func(i, j int) bool {
			return compareTimestamp(subTaskSessions[i].CreatedAt, subTaskSessions[j].CreatedAt) < 0
		})
		if len(subTaskSessions) > 1 {
			retrySessions = append(retrySessions, subTaskSessions[1:]...)
		}
	}

	return retrySessions
}

func hasEarlyReworkAdoption(review reviewRecord, sessions []sessionRecord, reviewRecords []reviewRecord) bool {
	var candidateSessions []sessionRecord
	for _, session := range sessions {
		if session.SessionType == "WORKER" && session.SubTaskID != nil && *session.SubTaskID == review.SubTaskID && compareTimestamp(session.CreatedAt, review.CreatedAt) > 0 {
			candidateSessions = append(candidateSessions, session)
		}
	}
	if len(candidateSessions) == 0 {
		return false
	}
	sort.Slice(candidateSessions, func(i, j int) bool {
		return compareTimestamp(candidateSessions[i].CreatedAt, candidateSessions[j].CreatedAt) < 0
	})
	subsequentSession := candidateSessions[0]

	var finalReviews []reviewRecord
	for _, record := range reviewRecords {
		if record.SubTaskID == review.SubTaskID && record.Phase == "FINAL" {
			finalReviews = append(finalReviews, record)
		}
	}
	if len(finalReviews) == 0 {
		return true
	}
	sort.Slice(finalReviews, func(i, j int) bool {
		return compareTimestamp(finalReviews[i].CreatedAt, finalReviews[j].CreatedAt) < 0
	})

	return compareTimestamp(subsequentSession.CreatedAt, finalReviews[0].CreatedAt) < 0
}

func resolveFirstOutputDurationsMS(tasks []taskRecord, sessions []sessionRecord, snapshots []planSnapshotRecord) []int64 {
	approvedSnapshots := make(map[string]planSnapshotRecord)
	for _, snapshot := range snapshots {
		if snapshot.Source == "APPROVED" {
			approvedSnapshots[snapshot.TaskID] = snapshot
		}
	}

	sessionsByTaskID := make(map[string][]sessionRecord)
	for _, session := range sessions {
		sessionsByTaskID[session.TaskID] = append(sessionsByTaskID[session.TaskID], session)
	}

	var durations []int64
	for _, task := range tasks {
		if task.ApprovedPlanJSON == nil || strings.TrimSpace(*task.ApprovedPlanJSON) == "" {
			continue
		}
		approvedSnapshot, ok := approvedSnapshots[task.ID]
		if !ok {
			continue
		}
		firstOutputAt := firstWorkerOutput(sessionsByTaskID[task.ID])
		if firstOutputAt == nil {
			continue
		}
		duration := compareTimestamp(*firstOutputAt, approvedSnapshot.CreatedAt)
		if duration >= 0 {
			durations = append(durations, duration)
		}
	}
	return durations
}

func resolveTasksMissingFirstOutputTiming(tasks []taskRecord, sessions []sessionRecord, snapshots []planSnapshotRecord) []string {
	approvedSnapshots := make(map[string]planSnapshotRecord)
	for _, snapshot := range snapshots {
		if snapshot.Source == "APPROVED" {
			approvedSnapshots[snapshot.TaskID] = snapshot
		}
	}

	sessionsByTaskID := make(map[string][]sessionRecord)
	for _, session := range sessions {
		sessionsByTaskID[session.TaskID] = append(sessionsByTaskID[session.TaskID], session)
	}

	var missing []string
	for _, task := range tasks {
		if task.ApprovedPlanJSON == nil || strings.TrimSpace(*task.ApprovedPlanJSON) == "" {
			continue
		}
		_, hasApprovedSnapshot := approvedSnapshots[task.ID]
		hasOutputWithoutTimestamp := false
		for _, session := range sessionsByTaskID[task.ID] {
			if session.SessionType == "WORKER" && strings.TrimSpace(session.OutputBuffer) != "" && (session.FirstOutputAt == nil || strings.TrimSpace(*session.FirstOutputAt) == "") {
				hasOutputWithoutTimestamp = true
				break
			}
		}
		if !hasApprovedSnapshot || hasOutputWithoutTimestamp {
			missing = append(missing, task.ID)
		}
	}
	return missing
}

func buildUnavailableMetrics(taskIDs []string) []UnavailableMetric {
	unavailable := []UnavailableMetric{
		{
			Metric: "routingCorrectness",
			Reason: "No persisted cross-session routing audit exists in the local database.",
		},
	}

	if len(taskIDs) > 0 {
		unavailable = append(unavailable, UnavailableMetric{
			Metric: "medianPlanApprovalToFirstWorkerOutputMs",
			Reason: "Missing persisted first-output timestamps for task ids: " + strings.Join(taskIDs, ", ") + ".",
		})
	}

	return unavailable
}

func parseCleanupWarningMessage(message messageRecord) *cleanupWarning {
	if message.Role != "SYSTEM" || !strings.HasPrefix(message.Content, cleanupWarningMessagePrefix) {
		return nil
	}

	var payload struct {
		WorktreePath string `json:"worktreePath"`
		Reason       string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(message.Content[len(cleanupWarningMessagePrefix):]), &payload); err != nil {
		return nil
	}
	if strings.TrimSpace(payload.WorktreePath) == "" || strings.TrimSpace(payload.Reason) == "" {
		return nil
	}

	return &cleanupWarning{
		TaskID:       message.TaskID,
		CreatedAt:    message.CreatedAt,
		Reason:       strings.TrimSpace(payload.Reason),
		WorktreePath: strings.TrimSpace(payload.WorktreePath),
	}
}

func parseLaunchFailureMessage(message messageRecord) *launchFailure {
	if message.Role != "SYSTEM" || !strings.HasPrefix(message.Content, launchFailureMessagePrefix) {
		return nil
	}

	var payload struct {
		Kind      string `json:"kind"`
		Reason    string `json:"reason"`
		SubTaskID string `json:"subTaskId"`
	}
	if err := json.Unmarshal([]byte(message.Content[len(launchFailureMessagePrefix):]), &payload); err != nil {
		return nil
	}
	if strings.TrimSpace(payload.Kind) == "" || strings.TrimSpace(payload.Reason) == "" {
		return nil
	}

	return &launchFailure{
		TaskID:    message.TaskID,
		CreatedAt: message.CreatedAt,
		Kind:      strings.TrimSpace(payload.Kind),
		Reason:    strings.TrimSpace(payload.Reason),
		SubTaskID: stringPointer(payload.SubTaskID),
	}
}

func queryTasks(ctx context.Context, db *sql.DB) ([]taskRecord, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, project_id, title, status, approved_plan_json, created_at, updated_at
		FROM tasks
		ORDER BY created_at ASC, id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []taskRecord
	for rows.Next() {
		var record taskRecord
		if err := rows.Scan(&record.ID, &record.ProjectID, &record.Title, &record.Status, &record.ApprovedPlanJSON, &record.CreatedAt, &record.UpdatedAt); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func querySubTasks(ctx context.Context, db *sql.DB) ([]subTaskRecord, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, task_id, retry_count
		FROM sub_tasks
		ORDER BY created_at ASC, id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []subTaskRecord
	for rows.Next() {
		var record subTaskRecord
		if err := rows.Scan(&record.ID, &record.TaskID, &record.RetryCount); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func querySessions(ctx context.Context, db *sql.DB) ([]sessionRecord, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, task_id, sub_task_id, session_type, status, ended_at, exit_code, first_output_at, output_buffer, created_at
		FROM agent_sessions
		ORDER BY created_at ASC, id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []sessionRecord
	for rows.Next() {
		var record sessionRecord
		if err := rows.Scan(&record.ID, &record.TaskID, &record.SubTaskID, &record.SessionType, &record.Status, &record.EndedAt, &record.ExitCode, &record.FirstOutputAt, &record.OutputBuffer, &record.CreatedAt); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func queryMessages(ctx context.Context, db *sql.DB) ([]messageRecord, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT task_id, role, content, created_at
		FROM messages
		ORDER BY created_at ASC, id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []messageRecord
	for rows.Next() {
		var record messageRecord
		if err := rows.Scan(&record.TaskID, &record.Role, &record.Content, &record.CreatedAt); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func queryTokenUsage(ctx context.Context, db *sql.DB) ([]tokenUsageRecord, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT agent_type, COALESCE(SUM(total_tokens), 0) AS total_tokens
		FROM session_token_usage
		GROUP BY agent_type
		ORDER BY agent_type ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []tokenUsageRecord
	for rows.Next() {
		var record tokenUsageRecord
		if err := rows.Scan(&record.AgentType, &record.TotalTokens); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func queryReviewRecords(ctx context.Context, db *sql.DB) ([]reviewRecord, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT sub_task_id, session_id, phase, decision, created_at
		FROM review_records
		ORDER BY created_at ASC, id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []reviewRecord
	for rows.Next() {
		var record reviewRecord
		if err := rows.Scan(&record.SubTaskID, &record.SessionID, &record.Phase, &record.Decision, &record.CreatedAt); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func queryMergeRecords(ctx context.Context, db *sql.DB) ([]mergeRecord, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT sub_task_id, operation, status, conflict_summary
		FROM merge_records
		ORDER BY created_at ASC, id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []mergeRecord
	for rows.Next() {
		var record mergeRecord
		if err := rows.Scan(&record.SubTaskID, &record.Operation, &record.Status, &record.ConflictSummary); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func queryPlanSnapshots(ctx context.Context, db *sql.DB) ([]planSnapshotRecord, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT task_id, source, created_at
		FROM plan_snapshots
		ORDER BY created_at ASC, id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []planSnapshotRecord
	for rows.Next() {
		var record planSnapshotRecord
		if err := rows.Scan(&record.TaskID, &record.Source, &record.CreatedAt); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func countConflictSummaries(records []mergeRecord) int {
	count := 0
	for _, record := range records {
		if record.ConflictSummary != nil && strings.TrimSpace(*record.ConflictSummary) != "" {
			count++
		}
	}
	return count
}

func countSandboxLaunchFailures(failures []launchFailure) int {
	count := 0
	for _, failure := range failures {
		if failure.Kind == "SANDBOX_LAUNCH_FAILURE" {
			count++
		}
	}
	return count
}

func summarizeTokenUsage(records []tokenUsageRecord) (map[string]int64, int64) {
	summary := make(map[string]int64, len(records))
	var total int64
	for _, record := range records {
		agentType := strings.TrimSpace(record.AgentType)
		if agentType == "" {
			continue
		}
		summary[agentType] += record.TotalTokens
		total += record.TotalTokens
	}
	return summary, total
}

func countFailedWorkerSessions(sessions []sessionRecord) int {
	count := 0
	for _, session := range sessions {
		if session.SessionType == "WORKER" && session.ExitCode != nil && *session.ExitCode != 0 {
			count++
		}
	}
	return count
}

func countMergeConflicts(records []mergeRecord) int {
	count := 0
	for _, record := range records {
		if record.Operation == "MERGE" && record.Status == "CONFLICT" {
			count++
		}
	}
	return count
}

func countRebaseRetries(records []mergeRecord) int {
	count := 0
	for _, record := range records {
		if record.Operation == "REBASE" {
			count++
		}
	}
	return count
}

func countWorkerSessions(sessions []sessionRecord) int {
	count := 0
	for _, session := range sessions {
		if session.SessionType == "WORKER" {
			count++
		}
	}
	return count
}

func sumRetryCount(subTasks []subTaskRecord) int64 {
	var total int64
	for _, subTask := range subTasks {
		total += subTask.RetryCount
	}
	return total
}

func firstWorkerOutput(sessions []sessionRecord) *string {
	var timestamps []string
	for _, session := range sessions {
		if session.SessionType == "WORKER" && session.FirstOutputAt != nil && strings.TrimSpace(*session.FirstOutputAt) != "" {
			timestamps = append(timestamps, *session.FirstOutputAt)
		}
	}
	if len(timestamps) == 0 {
		return nil
	}
	sort.Strings(timestamps)
	return &timestamps[0]
}

func firstSnapshot(snapshots []planSnapshotRecord) *string {
	if len(snapshots) == 0 {
		return nil
	}
	sort.Slice(snapshots, func(i, j int) bool {
		return compareTimestamp(snapshots[i].CreatedAt, snapshots[j].CreatedAt) < 0
	})
	return &snapshots[0].CreatedAt
}

func safeRate(numerator, denominator int) *float64 {
	if denominator == 0 {
		return nil
	}
	value := float64(numerator) / float64(denominator)
	rounded := float64(int(value*10000+0.5)) / 10000
	return &rounded
}

func median(values []int64) *int64 {
	if len(values) == 0 {
		return nil
	}
	sort.Slice(values, func(i, j int) bool { return values[i] < values[j] })
	mid := len(values) / 2
	if len(values)%2 == 1 {
		return &values[mid]
	}
	medianValue := (values[mid-1] + values[mid]) / 2
	return &medianValue
}

func compareTimestamp(left, right string) int64 {
	return timeValue(left) - timeValue(right)
}

func timeValue(raw string) int64 {
	timestamp, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		timestamp, err = time.Parse(time.RFC3339, raw)
		if err != nil {
			return 0
		}
	}
	return timestamp.UnixMilli()
}

func isTerminalTaskStatus(status string) bool {
	return status == "CANCELLED" || status == "COMPLETED" || status == "FAILED"
}

func stringPointer(value string) *string {
	normalized := strings.TrimSpace(value)
	if normalized == "" {
		return nil
	}
	return &normalized
}
