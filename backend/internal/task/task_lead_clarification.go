package task

import (
	"context"
	"fmt"
	"strings"
	"time"

	"eat/backend/internal/agent"
	"eat/backend/internal/project"
)

const leadTurnTimeout = 2 * time.Minute

func (s *Service) runClarificationLeadTurn(
	ctx context.Context,
	taskRecord *Task,
	userContent string,
) (*agent.LeadTurnResult, *project.Project, *Error) {
	if taskRecord == nil {
		return nil, nil, failure(ErrorCodeTaskNotFound, "Task not found.", nil)
	}

	projectRecord, err := s.projectRepository.FindProjectByID(ctx, taskRecord.ProjectID)
	if err != nil {
		return nil, nil, failure("PROJECT_READ_FAILED", err.Error(), nil)
	}
	if projectRecord == nil {
		return nil, nil, failure(ErrorCodeProjectNotFound, "Project not found.", map[string]any{"projectId": taskRecord.ProjectID})
	}

	healthSnapshot := s.agentService.GetHealth(ctx)[taskRecord.LeadAgentType]
	failureReason := healthSnapshot.OrchestrationFailureReason
	if failureReason == nil {
		failureReason = healthSnapshot.FailureReason
	}
	if !healthSnapshot.OrchestrationAvailable {
		return nil, nil, failure(
			ErrorCodeLeadAgentUnhealthy,
			"Lead agent orchestration runtime is unavailable and cannot reply to clarification messages.",
			map[string]any{
				"leadAgentType": taskRecord.LeadAgentType,
				"failureReason": failureReason,
			},
		)
	}

	attachments, err := s.repository.ListAttachmentsByTaskID(ctx, taskRecord.ID)
	if err != nil {
		return nil, nil, failure("TASK_ATTACHMENTS_READ_FAILED", err.Error(), nil)
	}
	messages, err := s.repository.ListMessagesByTaskID(ctx, taskRecord.ID)
	if err != nil {
		return nil, nil, failure("TASK_MESSAGES_READ_FAILED", err.Error(), nil)
	}

	prompt := buildClarificationLeadPrompt(taskRecord, projectRecord, attachments, messages, userContent)
	turnCtx, cancel := context.WithTimeout(ctx, leadTurnTimeout)
	defer cancel()

	result, runErr := s.agentService.RunLeadTurn(turnCtx, taskRecord.LeadAgentType, agent.LeadTurnConfig{
		Prompt:  prompt,
		WorkDir: projectRecord.Path,
	})
	if runErr != nil {
		return nil, nil, failure("TASK_LEAD_REPLY_FAILED", runErr.Error(), map[string]any{
			"leadAgentType": taskRecord.LeadAgentType,
			"taskId":        taskRecord.ID,
		})
	}

	return result, projectRecord, nil
}

func (s *Service) persistClarificationTurn(
	ctx context.Context,
	taskRecord *Task,
	userContent string,
	agentContent string,
	rawOutput string,
	nextStatus *string,
) (*Task, *Session, bool, *Message, *Message, *Error) {
	var (
		nextTask       *Task
		sessionRecord  *Session
		sessionCreated bool
		userMessage    *Message
		agentMessage   *Message
	)

	txErr := s.repository.RunInTransaction(ctx, func(repository *Repository) error {
		currentTask, err := repository.FindTaskByID(ctx, taskRecord.ID)
		if err != nil {
			return err
		}
		if currentTask == nil {
			return fmt.Errorf("task %s no longer exists", taskRecord.ID)
		}

		if nextStatus != nil {
			nextTask, err = repository.UpdateTask(ctx, taskRecord.ID, UpdateTaskInput{
				Status:       nextStatus,
				LastError:    nil,
				SetLastError: true,
			})
			if err != nil {
				return err
			}
		} else {
			nextTask = currentTask
		}

		sessionRecord, sessionCreated, err = ensureLiveLeadSessionForTask(ctx, repository, currentTask)
		if err != nil {
			return err
		}

		userMessage, err = repository.CreateMessage(ctx, CreateMessageInput{
			TaskID:  taskRecord.ID,
			Role:    messageRoleUser,
			Content: userContent,
		})
		if err != nil {
			return err
		}

		agentMessage, err = repository.CreateMessage(ctx, CreateMessageInput{
			TaskID:  taskRecord.ID,
			Role:    messageRoleAgent,
			Content: agentContent,
		})
		if err != nil {
			return err
		}

		outputChunk := strings.TrimSpace(rawOutput)
		if outputChunk == "" {
			outputChunk = strings.TrimSpace(agentContent)
		}
		if outputChunk != "" {
			if err := repository.AppendSessionOutput(ctx, sessionRecord.ID, outputChunk+"\n"); err != nil {
				return err
			}
			sessionRecord, err = repository.FindSessionByID(ctx, sessionRecord.ID)
			if err != nil {
				return err
			}
		}

		return nil
	})
	if txErr != nil {
		return nil, nil, false, nil, nil, failure("TASK_MESSAGE_CREATE_FAILED", txErr.Error(), map[string]any{"taskId": taskRecord.ID})
	}

	return nextTask, sessionRecord, sessionCreated, userMessage, agentMessage, nil
}

func ensureLiveLeadSessionForTask(ctx context.Context, repository *Repository, taskRecord *Task) (*Session, bool, error) {
	sessions, err := repository.ListSessionsByTaskID(ctx, taskRecord.ID)
	if err != nil {
		return nil, false, err
	}
	for index := len(sessions) - 1; index >= 0; index-- {
		session := sessions[index]
		if session.SessionType == sessionTypeLead && isLiveSessionStatus(session.Status) {
			return &session, false, nil
		}
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	sessionRecord, err := repository.CreateSession(ctx, CreateSessionInput{
		TaskID:      taskRecord.ID,
		AgentType:   taskRecord.LeadAgentType,
		SessionType: sessionTypeLead,
		SandboxType: resolveLeadSandboxType(nil, taskRecord.LeadAgentType),
		Status:      sessionStatusRunning,
		StartedAt:   &now,
		CreatedAt:   now,
		UpdatedAt:   now,
	})
	if err != nil {
		return nil, false, err
	}
	return sessionRecord, true, nil
}

func buildClarificationLeadPrompt(
	taskRecord *Task,
	projectRecord *project.Project,
	attachments []Attachment,
	messages []Message,
	pendingUserContent string,
) string {
	var builder strings.Builder

	builder.WriteString("You are the Lead Agent for EAT and you are in the clarification stage.\n")
	builder.WriteString("Your job is to reply to the operator's latest clarification message.\n")
	builder.WriteString("Do not write code. Do not generate a plan. Do not output JSON.\n")
	builder.WriteString("Reply in concise Simplified Chinese unless the operator is clearly using another language.\n")
	builder.WriteString("If requirements are already clear, summarize the confirmed constraints and ask at most one sharp follow-up question if needed.\n")
	builder.WriteString("If critical information is missing, ask no more than three concrete clarification questions.\n\n")

	builder.WriteString("Task context:\n")
	builder.WriteString(fmt.Sprintf("- Project: %s\n", projectRecord.Name))
	builder.WriteString(fmt.Sprintf("- Project path: %s\n", projectRecord.Path))
	builder.WriteString(fmt.Sprintf("- Task title: %s\n", taskRecord.Title))
	builder.WriteString(fmt.Sprintf("- Base branch: %s\n", taskRecord.BaseBranch))
	builder.WriteString(fmt.Sprintf("- Task branch: %s\n", derefString(taskRecord.TaskBranchName)))
	builder.WriteString("- Task description:\n")
	builder.WriteString(strings.TrimSpace(taskRecord.Description))
	builder.WriteString("\n\n")

	builder.WriteString("Attachments:\n")
	if len(attachments) == 0 {
		builder.WriteString("- None\n")
	} else {
		for _, attachment := range attachments {
			builder.WriteString(fmt.Sprintf("- %s (%s)\n", attachment.FileName, attachment.FileType))
		}
	}

	builder.WriteString("\nConversation so far:\n")
	if len(messages) == 0 {
		builder.WriteString("- No previous turns.\n")
	} else {
		for _, message := range messages {
			builder.WriteString(fmt.Sprintf("- %s: %s\n", message.Role, strings.TrimSpace(message.Content)))
		}
	}

	builder.WriteString(fmt.Sprintf("\nLatest operator message:\n%s\n\n", strings.TrimSpace(pendingUserContent)))
	builder.WriteString("Now write the next lead reply.")

	return builder.String()
}
