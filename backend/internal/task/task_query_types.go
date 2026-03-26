package task

type Detail struct {
	Task            *Task            `json:"task"`
	Messages        []Message        `json:"messages"`
	Attachments     []Attachment     `json:"attachments"`
	PlanSnapshots   []PlanSnapshot   `json:"planSnapshots"`
	Sessions        []Session        `json:"sessions"`
	SubTasks        []SubTask        `json:"subTasks"`
	CleanupWarnings []string         `json:"cleanupWarnings"`
	MailboxMessages []MailboxMessage `json:"mailboxMessages"`
	Board           map[string]any   `json:"board"`
	Integration     map[string]any   `json:"integration"`
	Runtime         map[string]any   `json:"runtime"`
	Team            map[string]any   `json:"team"`
}

type DiffFile struct {
	Path      string  `json:"path"`
	Previous  *string `json:"previousPath,omitempty"`
	Type      string  `json:"type"`
	Additions int64   `json:"additions"`
	Deletions int64   `json:"deletions"`
	Patch     string  `json:"patch,omitempty"`
}

type DiffResult struct {
	Task      *Task          `json:"task"`
	BaseRef   string         `json:"baseRef"`
	HeadRef   string         `json:"headRef"`
	Available bool           `json:"available"`
	Reason    string         `json:"reason,omitempty"`
	Summary   map[string]any `json:"summary"`
	Files     []DiffFile     `json:"files"`
}

type GetTaskTeamResult struct {
	Team map[string]any `json:"team"`
}

type GetTaskBoardResult struct {
	Board map[string]any `json:"board"`
}
