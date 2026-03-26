package task

type IntegrationMutationResult struct {
	IntegrationRun       *IntegrationRun       `json:"integrationRun"`
	IntegrationQueueItem *IntegrationQueueItem `json:"integrationQueueItem"`
	Task                 *Task                 `json:"task"`
}
