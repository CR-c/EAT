package task

import (
	"context"
	"sort"
	"strings"
)

func (s *Service) GetTaskBoard(ctx context.Context, taskID string) (*GetTaskBoardResult, *Error) {
	taskRecord, err := s.repository.FindTaskByID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_READ_FAILED", err.Error(), nil)
	}
	if taskRecord == nil {
		return nil, failure(ErrorCodeTaskNotFound, "Task not found.", map[string]any{"taskId": taskID})
	}

	sessions, err := s.repository.ListSessionsByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_SESSIONS_READ_FAILED", err.Error(), nil)
	}
	subTasks, err := s.repository.ListSubTasksByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_SUBTASKS_READ_FAILED", err.Error(), nil)
	}
	mailboxMessages, err := s.repository.ListMailboxMessagesByTaskID(ctx, taskID)
	if err != nil {
		return nil, failure("TASK_MAILBOX_MESSAGES_READ_FAILED", err.Error(), nil)
	}
	integrationView, errPayload := s.buildTaskIntegrationView(ctx, taskRecord, subTasks)
	if errPayload != nil {
		return nil, errPayload
	}

	return &GetTaskBoardResult{
		Board: s.buildTaskBoardSnapshot(taskRecord, sessions, subTasks, mailboxMessages, integrationView),
	}, nil
}

func (s *Service) buildTaskBoardSnapshot(taskRecord *Task, sessions []Session, subTasks []SubTask, mailboxMessages []MailboxMessage, integrationView map[string]any) map[string]any {
	sortedSubTasks := sortSubTasksForDisplay(subTasks)
	actionRequiredItems := buildBoardActionRequiredItems(mailboxMessages)
	activity := buildBoardActivityEntries(sessions, mailboxMessages, sortedSubTasks)
	graphNodes := buildBoardGraphNodes(sessions, sortedSubTasks, mailboxMessages, actionRequiredItems)
	graphEdges := buildBoardGraphEdges(sortedSubTasks, mailboxMessages)

	return map[string]any{
		"activity":            activity,
		"actionRequiredItems": actionRequiredItems,
		"graph": map[string]any{
			"nodes": graphNodes,
			"edges": graphEdges,
		},
		"integration": integrationView,
		"list": map[string]any{
			"members": buildBoardListMembers(sessions, sortedSubTasks),
		},
		"riskSummary": map[string]any{
			"failedLaunches":      0,
			"integrationFailures": 0,
			"mailboxBlockers":     countMailboxMessagesByType(mailboxMessages, mailboxMessageTypeBlocker),
			"mergeConflicts":      0,
			"requiresAck":         countMailboxAcks(mailboxMessages),
			"reviewRequired":      countSubTasksByStatuses(sortedSubTasks, "REWORK_REQUIRED", "DISCARD_PENDING"),
		},
		"summary": map[string]any{
			"accepted":       countSubTasksByStatuses(sortedSubTasks, "ACCEPTED"),
			"actionRequired": len(actionRequiredItems),
			"blocked":        countSubTasksByStatuses(sortedSubTasks, "BLOCKED"),
			"failed":         countSubTasksByStatuses(sortedSubTasks, "FAILED"),
			"merged":         countSubTasksByStatuses(sortedSubTasks, "MERGED"),
			"pending":        countSubTasksByStatuses(sortedSubTasks, "PENDING", "READY"),
			"reviewPending":  countSubTasksByStatuses(sortedSubTasks, "REVIEW_PENDING"),
			"running":        countSubTasksByStatuses(sortedSubTasks, "RUNNING"),
		},
		"workflow": buildBoardWorkflowSummary(sortedSubTasks, actionRequiredItems),
		"task": map[string]any{
			"id":        taskRecord.ID,
			"lastError": taskRecord.LastError,
			"status":    taskRecord.Status,
			"title":     taskRecord.Title,
		},
	}
}

func buildBoardActionRequiredItems(mailboxMessages []MailboxMessage) []map[string]any {
	items := make([]map[string]any, 0)
	for _, message := range mailboxMessages {
		if message.MessageType != mailboxMessageTypeBlocker && message.MessageType != mailboxMessageTypeReviewRequest && message.MessageType != mailboxMessageTypeTestRequest {
			continue
		}
		items = append(items, map[string]any{
			"createdAt": message.CreatedAt,
			"kind":      message.MessageType,
			"owner":     "LEADER",
			"primaryAction": func() string {
				if message.TargetType == mailboxTargetLead {
					return "OPEN_MAILBOX"
				}
				return "SEND_NOTE"
			}(),
			"severity": func() int {
				if message.MessageType == mailboxMessageTypeBlocker {
					return 18
				}
				return 25
			}(),
			"subTaskId":  nullableString(message.TargetSubTaskID, message.SenderSubTaskID),
			"summary":    trimStringTo(message.Content, 280),
			"targetType": message.TargetType,
		})
	}
	sort.SliceStable(items, func(i, j int) bool {
		return stringValue(items[i]["createdAt"]) > stringValue(items[j]["createdAt"])
	})
	for index := range items {
		items[index]["id"] = items[index]["kind"].(string) + ":" + firstNonEmpty(stringValue(items[index]["subTaskId"]), "task") + ":" + stringValue(index)
	}
	return items
}

func buildBoardActivityEntries(sessions []Session, mailboxMessages []MailboxMessage, subTasks []SubTask) []map[string]any {
	subTaskByID := make(map[string]SubTask, len(subTasks))
	for _, subTask := range subTasks {
		subTaskByID[subTask.ID] = subTask
	}

	entries := make([]map[string]any, 0, len(sessions)+len(mailboxMessages))
	for _, session := range sessions {
		if session.StartedAt != nil {
			summary := "Lead session started."
			if session.SubTaskID != nil {
				title := subTaskByID[derefString(session.SubTaskID)].Title
				if title == "" {
					title = derefString(session.SubTaskID)
				}
				summary = title + " session started."
			}
			entries = append(entries, map[string]any{
				"createdAt": session.StartedAt,
				"id":        "session-start:" + session.ID,
				"kind":      "SESSION_STARTED",
				"subTaskId": session.SubTaskID,
				"summary":   summary,
			})
		}
		if session.EndedAt != nil {
			summary := "Lead session ended with " + session.Status + "."
			if session.SubTaskID != nil {
				title := subTaskByID[derefString(session.SubTaskID)].Title
				if title == "" {
					title = derefString(session.SubTaskID)
				}
				summary = title + " session ended with " + session.Status + "."
			}
			entries = append(entries, map[string]any{
				"createdAt": session.EndedAt,
				"id":        "session-end:" + session.ID,
				"kind":      "SESSION_ENDED",
				"subTaskId": session.SubTaskID,
				"summary":   summary,
			})
		}
	}
	for _, message := range mailboxMessages {
		senderLabel := strings.ToLower(message.SenderType)
		if message.SenderSubTaskID != nil {
			if subTask, ok := subTaskByID[*message.SenderSubTaskID]; ok && subTask.Title != "" {
				senderLabel = subTask.Title
			}
		}
		targetLabel := strings.ToLower(message.TargetType)
		if message.TargetSubTaskID != nil {
			if subTask, ok := subTaskByID[*message.TargetSubTaskID]; ok && subTask.Title != "" {
				targetLabel = subTask.Title
			}
		}
		entries = append(entries, map[string]any{
			"createdAt": message.CreatedAt,
			"id":        "mailbox:" + message.ID,
			"kind":      "MAILBOX_MESSAGE",
			"subTaskId": nullableString(message.TargetSubTaskID, message.SenderSubTaskID),
			"summary":   senderLabel + " sent " + message.MessageType + " to " + targetLabel + ".",
		})
	}
	sort.SliceStable(entries, func(i, j int) bool {
		return stringValue(entries[i]["createdAt"]) > stringValue(entries[j]["createdAt"])
	})
	if len(entries) > 50 {
		return entries[:50]
	}
	return entries
}

func buildBoardGraphNodes(sessions []Session, subTasks []SubTask, mailboxMessages []MailboxMessage, actionRequiredItems []map[string]any) []map[string]any {
	nodes := make([]map[string]any, 0, len(subTasks))
	for _, subTask := range subTasks {
		inboxCount := 0
		outboxCount := 0
		blockerCount := 0
		for _, message := range mailboxMessages {
			if derefString(message.TargetSubTaskID) == subTask.ID {
				inboxCount++
				if message.MessageType == mailboxMessageTypeBlocker {
					blockerCount++
				}
			}
			if derefString(message.SenderSubTaskID) == subTask.ID {
				outboxCount++
			}
		}
		latestSession := latestSessionByType(sessions, sessionTypeWorker, subTask.ID)
		requiresAction := false
		for _, item := range actionRequiredItems {
			if stringValue(item["subTaskId"]) == subTask.ID {
				requiresAction = true
				break
			}
		}
		nodes = append(nodes, map[string]any{
			"subTaskId":                 subTask.ID,
			"title":                     subTask.Title,
			"role":                      firstNonEmpty(derefString(subTask.Role), subTask.BranchSuffix, "worker"),
			"status":                    subTask.Status,
			"agentType":                 subTask.AgentType,
			"branchName":                subTask.BranchName,
			"executionOrder":            subTask.ExecutionOrder,
			"mailboxInboxCount":         inboxCount,
			"mailboxOutboxCount":        outboxCount,
			"latestActivitySummary":     firstNonEmpty(derefString(subTask.RunSummary), buildDerivedRunSummary(subTask)),
			"latestMergeStatus":         nil,
			"latestSessionStatus":       pointerStringValue(latestSession, func(value *Session) *string { return stringPointerValue(value.Status) }),
			"requiresAction":            requiresAction,
			"unresolvedMailboxBlockers": blockerCount,
		})
	}
	return nodes
}

func buildBoardGraphEdges(subTasks []SubTask, mailboxMessages []MailboxMessage) []map[string]any {
	subTaskByBranchSuffix := make(map[string]SubTask, len(subTasks))
	for _, subTask := range subTasks {
		subTaskByBranchSuffix[subTask.BranchSuffix] = subTask
	}
	edges := make([]map[string]any, 0)
	for _, subTask := range subTasks {
		for _, branchSuffix := range subTask.DependencyBranchSuffixes {
			upstreamSubTask, ok := subTaskByBranchSuffix[branchSuffix]
			dependencySatisfied := ok && isDependencySatisfiedStatus(upstreamSubTask.Status)
			handoffCount := 0
			unresolvedBlockerCount := 0
			for _, message := range mailboxMessages {
				if derefString(message.SenderSubTaskID) == upstreamSubTask.ID && derefString(message.TargetSubTaskID) == subTask.ID {
					handoffCount++
				}
				if derefString(message.TargetSubTaskID) == subTask.ID && (message.MessageType == mailboxMessageTypeBlocker || message.MessageType == mailboxMessageTypeReviewRequest || message.MessageType == mailboxMessageTypeTestRequest) {
					unresolvedBlockerCount++
				}
			}
			state := "SATISFIED"
			if !dependencySatisfied {
				state = "BLOCKING"
			} else if unresolvedBlockerCount > 0 {
				state = "ATTENTION"
			} else if handoffCount > 0 {
				state = "HANDOFF_READY"
			}
			edges = append(edges, map[string]any{
				"from":                   firstNonEmpty(upstreamSubTask.ID, branchSuffix),
				"fromBranchSuffix":       branchSuffix,
				"handoffCount":           handoffCount,
				"isBlocking":             !dependencySatisfied || unresolvedBlockerCount > 0,
				"state":                  state,
				"to":                     subTask.ID,
				"unresolvedBlockerCount": unresolvedBlockerCount,
			})
		}
	}
	return edges
}

func buildBoardListMembers(sessions []Session, subTasks []SubTask) []map[string]any {
	items := make([]map[string]any, 0, len(subTasks))
	for _, subTask := range subTasks {
		latestSession := latestSessionByType(sessions, sessionTypeWorker, subTask.ID)
		items = append(items, map[string]any{
			"agentType":                subTask.AgentType,
			"branchName":               subTask.BranchName,
			"dependencyBranchSuffixes": subTask.DependencyBranchSuffixes,
			"latestSessionStatus":      pointerStringValue(latestSession, func(value *Session) *string { return stringPointerValue(value.Status) }),
			"role":                     firstNonEmpty(derefString(subTask.Role), subTask.BranchSuffix, "worker"),
			"runSummary":               firstNonEmpty(derefString(subTask.RunSummary), buildDerivedRunSummary(subTask)),
			"status":                   subTask.Status,
			"subTaskId":                subTask.ID,
			"title":                    subTask.Title,
		})
	}
	return items
}

func buildBoardWorkflowSummary(subTasks []SubTask, actionRequiredItems []map[string]any) map[string]any {
	completed := 0
	waiting := 0
	for _, subTask := range subTasks {
		if subTask.Status == "ACCEPTED" || subTask.Status == "CANCELLED" || subTask.Status == "DISCARDED" || subTask.Status == "MERGED" {
			completed++
		}
		if subTask.Status == "BLOCKED" || subTask.Status == "PENDING" || subTask.Status == "READY" || subTask.Status == "REVIEW_PENDING" {
			waiting++
		}
	}
	manualAttentionCount := 0
	systemAttentionCount := 0
	for _, item := range actionRequiredItems {
		if stringValue(item["owner"]) == "USER" {
			manualAttentionCount++
		} else {
			systemAttentionCount++
		}
	}
	return map[string]any{
		"completed":            completed,
		"manualAttentionCount": manualAttentionCount,
		"systemAttentionCount": systemAttentionCount,
		"total":                len(subTasks),
		"waiting":              waiting,
	}
}

func countSubTasksByStatuses(subTasks []SubTask, statuses ...string) int {
	allowed := make(map[string]bool, len(statuses))
	for _, status := range statuses {
		allowed[status] = true
	}
	count := 0
	for _, subTask := range subTasks {
		if allowed[subTask.Status] {
			count++
		}
	}
	return count
}

func countMailboxMessagesByType(messages []MailboxMessage, messageType string) int {
	count := 0
	for _, message := range messages {
		if message.MessageType == messageType {
			count++
		}
	}
	return count
}

func countMailboxAcks(messages []MailboxMessage) int {
	count := 0
	for _, message := range messages {
		if message.RequiresAck {
			count++
		}
	}
	return count
}
