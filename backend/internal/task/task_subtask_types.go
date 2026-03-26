package task

type RetrySubTaskRequest struct {
	Description string `json:"description"`
}

type ReworkSubTaskRequest struct {
	Description string `json:"description"`
}

type ReassignSubTaskRequest struct {
	AgentType   string `json:"agentType"`
	Description string `json:"description"`
}

type ChangeSubTaskAgentRequest struct {
	AgentType   string `json:"agentType"`
	Description string `json:"description"`
}

type SubTaskMutationResult struct {
	Session *Session `json:"session"`
	SubTask *SubTask `json:"subTask"`
	Task    *Task    `json:"task"`
}

type RebaseRetrySubTaskResult struct {
	MergeStatus string   `json:"mergeStatus"`
	SubTask     *SubTask `json:"subTask"`
	Task        *Task    `json:"task"`
}

type dependencyScheduleResult struct {
	ReleasedSessions []Session
	ReleasedSubTasks []SubTask
	Task             *Task
}
