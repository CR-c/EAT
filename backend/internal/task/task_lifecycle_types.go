package task

type CreateTaskRequest struct {
	ProjectID            string                  `json:"projectId"`
	Title                string                  `json:"title"`
	Description          string                  `json:"description"`
	LeadAgentType        string                  `json:"leadAgentType"`
	BaseBranch           string                  `json:"baseBranch"`
	TaskBranchName       string                  `json:"taskBranchName"`
	BaseBranchMode       string                  `json:"baseBranchMode"`
	BaseBranchStartPoint string                  `json:"baseBranchStartPoint"`
	Attachments          []AttachmentCreateInput `json:"attachments"`
}

type AttachmentCreateInput struct {
	FileName      string `json:"fileName"`
	FilePath      string `json:"filePath"`
	FileType      string `json:"fileType"`
	MimeType      string `json:"mimeType"`
	ContentBase64 string `json:"contentBase64"`
}

type CreateTaskResult struct {
	Task        *Task        `json:"task"`
	Attachments []Attachment `json:"attachments"`
}

type StartClarificationRequest struct {
	Content string `json:"content"`
}

type StartClarificationResult struct {
	Session *Session `json:"session"`
	Task    *Task    `json:"task"`
}

type SendTaskMessageRequest struct {
	Content string `json:"content"`
}

type SendTaskMessageResult struct {
	Message *Message `json:"message"`
	Task    *Task    `json:"task"`
}

type TaskCleanupResult struct {
	CleanedBranches  []string `json:"cleanedBranches"`
	CleanedWorktrees []string `json:"cleanedWorktrees"`
}

type ArchiveTaskRequest struct {
	DeleteBranches bool `json:"deleteBranches"`
}

type ArchiveTaskResult struct {
	BranchCleanup TaskCleanupResult `json:"branchCleanup"`
	Task          *Task             `json:"task"`
}

type UnarchiveTaskResult struct {
	Task *Task `json:"task"`
}

type PauseTaskResult struct {
	Task *Task `json:"task"`
}

type DeleteTaskRequest struct {
	DeleteBranches bool `json:"deleteBranches"`
}

type DeleteTaskResult struct {
	BranchCleanup TaskCleanupResult `json:"branchCleanup"`
	Task          *Task             `json:"task"`
}

type ResumeTaskResult struct {
	Task *Task `json:"task"`
}

type StopLeadSessionResult struct {
	Task *Task `json:"task"`
}

type ConfirmRequirementsResult struct {
	Message *Message `json:"message"`
	Task    *Task    `json:"task"`
}
