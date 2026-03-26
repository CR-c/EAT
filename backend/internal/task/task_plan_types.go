package task

import "eat/backend/internal/tasktemplates"

type CreateGuidedTaskRequest struct {
	CreateTaskRequest
	TemplateID string `json:"templateId"`
	AgentType  string `json:"agentType"`
}

type CreateGuidedTaskResult struct {
	Task        *Task                  `json:"task"`
	Attachments []Attachment           `json:"attachments"`
	CurrentPlan tasktemplates.Plan     `json:"currentPlan"`
	Template    tasktemplates.Template `json:"template"`
}

type PlanSeedRequest struct {
	TemplateID string `json:"templateId"`
	AgentType  string `json:"agentType"`
}

type PlanSeedResult struct {
	Task        *Task                  `json:"task"`
	CurrentPlan tasktemplates.Plan     `json:"currentPlan"`
	Template    tasktemplates.Template `json:"template"`
}

type UpdateCurrentPlanResult struct {
	Task        *Task              `json:"task"`
	CurrentPlan tasktemplates.Plan `json:"currentPlan"`
}

type ReplanAnnotation struct {
	NodeID       string `json:"nodeId"`
	BranchSuffix string `json:"branchSuffix"`
	Title        string `json:"title"`
	Note         string `json:"note"`
}

type ReplanRequest struct {
	Reason      string             `json:"reason"`
	Annotations []ReplanAnnotation `json:"annotations"`
}

type ReplanResult struct {
	Task           *Task              `json:"task"`
	CurrentPlan    tasktemplates.Plan `json:"currentPlan"`
	ChangeSummary  []string           `json:"changeSummary"`
	PlanVersion    int64              `json:"planVersion"`
	RequestedAt    string             `json:"requestedAt"`
	RequestMessage *Message           `json:"requestMessage,omitempty"`
}

type ApprovePlanResult struct {
	ApprovalReady    bool               `json:"approvalReady"`
	ApprovedSnapshot *PlanSnapshot      `json:"approvedSnapshot,omitempty"`
	CurrentPlan      tasktemplates.Plan `json:"currentPlan"`
	Idempotent       bool               `json:"idempotent"`
	Sessions         []Session          `json:"sessions,omitempty"`
	SubTasks         []SubTask          `json:"subTasks"`
	Task             *Task              `json:"task"`
}

type RestorePlanSnapshotResult struct {
	CurrentPlan tasktemplates.Plan `json:"currentPlan"`
	SnapshotID  string             `json:"snapshotId"`
	Task        *Task              `json:"task"`
}

type RestorePlanSnapshotRequest struct {
	SnapshotID string `json:"snapshotId"`
}
