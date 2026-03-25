package project

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/user"
	"path/filepath"
	"sort"
	"strings"

	"eat/backend/internal/git"
)

const (
	ErrorCodeInvalidRequestBody       = "INVALID_REQUEST_BODY"
	ErrorCodePathRequired             = "PATH_REQUIRED"
	ErrorCodePathAccessDenied         = "PATH_ACCESS_DENIED"
	ErrorCodeProjectHasTasksAttached  = "PROJECT_HAS_TASKS_ATTACHED"
	ErrorCodeProjectAlreadyRegistered = "PROJECT_ALREADY_REGISTERED"
	ErrorCodeProjectNotFound          = "PROJECT_NOT_FOUND"
	ErrorCodePathNotAbsolute          = "PATH_NOT_ABSOLUTE"
	ErrorCodePathNotFound             = "PATH_NOT_FOUND"
	ErrorCodePathNotDirectory         = "PATH_NOT_DIRECTORY"
	ErrorCodeNotGitRepository         = "NOT_GIT_REPOSITORY"
	ErrorCodeBareGitRepository        = "BARE_GIT_REPOSITORY"
)

const defaultDirectoryEntryLimit = 200
const taskPausedReasonPrefix = "Paused by operator from "

type Error struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

type Service struct {
	repository *Repository
}

type RegisterInput struct {
	Path string `json:"path"`
}

type RepoStatus struct {
	DefaultBranch  *string  `json:"defaultBranch"`
	CurrentBranch  *string  `json:"currentBranch"`
	IsDirty        bool     `json:"isDirty"`
	RecentBranches []string `json:"recentBranches"`
}

type DirectoryEntry struct {
	Name            string `json:"name"`
	Path            string `json:"path"`
	IsGitRepository bool   `json:"isGitRepository"`
	IsSymlink       bool   `json:"isSymlink"`
}

type DirectoryRoot struct {
	Kind string `json:"kind"`
	Path string `json:"path"`
}

type BrowseResult struct {
	CurrentPath     string           `json:"currentPath"`
	Entries         []DirectoryEntry `json:"entries"`
	IsGitRepository bool             `json:"isGitRepository"`
	ParentPath      *string          `json:"parentPath"`
	Roots           []DirectoryRoot  `json:"roots"`
}

func NewService(repository *Repository) *Service {
	return &Service{repository: repository}
}

func (s *Service) RegisterProject(ctx context.Context, input RegisterInput) (*Project, *RepoStatus, *Error) {
	projectPath := strings.TrimSpace(input.Path)
	if projectPath == "" {
		return nil, nil, failure(ErrorCodePathRequired, "Project path is required.", nil)
	}

	canonicalPath, repoStatus, validationError := validateAndProbeRepository(ctx, projectPath)
	if validationError != nil {
		return nil, nil, validationError
	}

	existingProject, err := s.repository.FindProjectByPath(ctx, canonicalPath)
	if err != nil {
		return nil, nil, failure("PROJECT_READ_FAILED", err.Error(), nil)
	}
	if existingProject != nil {
		return nil, nil, failure(
			ErrorCodeProjectAlreadyRegistered,
			"A project with the same normalized path is already registered.",
			map[string]any{
				"path":      existingProject.Path,
				"projectId": existingProject.ID,
			},
		)
	}

	defaultBranch := ""
	if repoStatus.DefaultBranch != nil {
		defaultBranch = *repoStatus.DefaultBranch
	}

	projectRecord, err := s.repository.CreateProject(ctx, filepath.Base(canonicalPath), canonicalPath, defaultBranch)
	if err != nil {
		return nil, nil, failure("PROJECT_CREATE_FAILED", err.Error(), nil)
	}

	return projectRecord, repoStatus, nil
}

func (s *Service) ListProjects(ctx context.Context) ([]Project, error) {
	return s.repository.ListProjects(ctx)
}

func (s *Service) GetProject(ctx context.Context, projectID string) (*Project, *RepoStatus, *Error) {
	projectRecord, err := s.repository.FindProjectByID(ctx, projectID)
	if err != nil {
		return nil, nil, failure("PROJECT_READ_FAILED", err.Error(), nil)
	}
	if projectRecord == nil {
		return nil, nil, failure(ErrorCodeProjectNotFound, "Project not found.", map[string]any{"projectId": projectID})
	}

	_, repoStatus, validationError := validateAndProbeRepository(ctx, projectRecord.Path)
	if validationError != nil {
		return nil, nil, validationError
	}

	return projectRecord, repoStatus, nil
}

func (s *Service) GetProjectRepoStatus(ctx context.Context, projectID string) (*RepoStatus, *Error) {
	projectRecord, err := s.repository.FindProjectByID(ctx, projectID)
	if err != nil {
		return nil, failure("PROJECT_READ_FAILED", err.Error(), nil)
	}
	if projectRecord == nil {
		return nil, failure(ErrorCodeProjectNotFound, "Project not found.", map[string]any{"projectId": projectID})
	}

	_, repoStatus, validationError := validateAndProbeRepository(ctx, projectRecord.Path)
	if validationError != nil {
		return nil, validationError
	}

	return repoStatus, nil
}

func (s *Service) DeleteProject(ctx context.Context, projectID string) (*Project, *Error) {
	projectRecord, err := s.repository.FindProjectByID(ctx, projectID)
	if err != nil {
		return nil, failure("PROJECT_READ_FAILED", err.Error(), nil)
	}
	if projectRecord == nil {
		return nil, failure(ErrorCodeProjectNotFound, "Project not found.", map[string]any{"projectId": projectID})
	}

	taskCount, err := s.repository.CountActiveExecutionTasksByProjectID(ctx, projectID, taskPausedReasonPrefix)
	if err != nil {
		return nil, failure("PROJECT_TASK_COUNT_FAILED", err.Error(), map[string]any{"projectId": projectID})
	}
	if taskCount > 0 {
		return nil, failure(
			ErrorCodeProjectHasTasksAttached,
			"The project still has active execution task trees and cannot be unregistered yet.",
			map[string]any{
				"projectId": projectID,
				"taskCount": taskCount,
			},
		)
	}

	deletedProject, err := s.repository.DeleteProject(ctx, projectID)
	if err != nil {
		return nil, failure("PROJECT_DELETE_FAILED", err.Error(), map[string]any{"projectId": projectID})
	}

	return deletedProject, nil
}

func (s *Service) BrowseDirectories(ctx context.Context, requestedPath string, includeHidden bool) (*BrowseResult, *Error) {
	_ = ctx
	normalizedPath := strings.TrimSpace(requestedPath)
	if normalizedPath == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return nil, failure("PATH_RESOLUTION_FAILED", err.Error(), nil)
		}
		normalizedPath = homeDir
	}
	normalizedPath = filepath.Clean(normalizedPath)

	if !filepath.IsAbs(normalizedPath) {
		return nil, failure(ErrorCodePathNotAbsolute, "Directory path must be absolute.", nil)
	}

	stats, err := os.Stat(normalizedPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, failure(ErrorCodePathNotFound, "Directory path does not exist.", map[string]any{"path": normalizedPath})
		}
		if os.IsPermission(err) {
			return nil, failure(ErrorCodePathAccessDenied, "Directory path cannot be read.", map[string]any{"path": normalizedPath})
		}
		return nil, failure("PATH_STAT_FAILED", err.Error(), nil)
	}
	if !stats.IsDir() {
		return nil, failure(ErrorCodePathNotDirectory, "Directory path must point to a directory.", map[string]any{"path": normalizedPath})
	}

	currentPath, err := filepath.EvalSymlinks(normalizedPath)
	if err != nil {
		if os.IsPermission(err) {
			return nil, failure(ErrorCodePathAccessDenied, "Directory path cannot be read.", map[string]any{"path": normalizedPath})
		}
		return nil, failure("PATH_RESOLVE_FAILED", err.Error(), nil)
	}

	entries, err := os.ReadDir(currentPath)
	if err != nil {
		if os.IsPermission(err) {
			return nil, failure(ErrorCodePathAccessDenied, "Directory path cannot be read.", map[string]any{"path": currentPath})
		}
		return nil, failure("PATH_READ_FAILED", err.Error(), nil)
	}

	directories := make([]DirectoryEntry, 0)
	for _, entry := range entries {
		if !includeHidden && strings.HasPrefix(entry.Name(), ".") {
			continue
		}

		entryPath := filepath.Join(currentPath, entry.Name())
		metadata, ok := readDirectoryMetadata(entryPath, entry)
		if !ok {
			continue
		}

		directories = append(directories, DirectoryEntry{
			Name:            entry.Name(),
			Path:            entryPath,
			IsGitRepository: metadata.isGitRepository,
			IsSymlink:       metadata.isSymlink,
		})
	}

	sort.Slice(directories, func(i, j int) bool {
		if directories[i].IsGitRepository != directories[j].IsGitRepository {
			return directories[i].IsGitRepository
		}
		return strings.ToLower(directories[i].Name) < strings.ToLower(directories[j].Name)
	})

	if len(directories) > defaultDirectoryEntryLimit {
		directories = directories[:defaultDirectoryEntryLimit]
	}

	var parentPath *string
	parent := filepath.Dir(currentPath)
	if parent != currentPath {
		parentPath = &parent
	}

	roots, err := buildDirectoryRoots()
	if err != nil {
		return nil, failure("ROOT_DISCOVERY_FAILED", err.Error(), nil)
	}

	return &BrowseResult{
		CurrentPath:     currentPath,
		Entries:         directories,
		IsGitRepository: hasGitMarker(currentPath),
		ParentPath:      parentPath,
		Roots:           roots,
	}, nil
}

type directoryMetadata struct {
	isGitRepository bool
	isSymlink       bool
}

func readDirectoryMetadata(entryPath string, entry os.DirEntry) (directoryMetadata, bool) {
	if entry.IsDir() {
		return directoryMetadata{isGitRepository: hasGitMarker(entryPath)}, true
	}
	if entry.Type()&os.ModeSymlink == 0 {
		return directoryMetadata{}, false
	}

	stats, err := os.Stat(entryPath)
	if err != nil || !stats.IsDir() {
		return directoryMetadata{}, false
	}

	return directoryMetadata{
		isGitRepository: hasGitMarker(entryPath),
		isSymlink:       true,
	}, true
}

func buildDirectoryRoots() ([]DirectoryRoot, error) {
	workingDir, err := os.Getwd()
	if err != nil {
		return nil, err
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		if currentUser, userErr := user.Current(); userErr == nil {
			homeDir = currentUser.HomeDir
		} else {
			return nil, err
		}
	}

	rootPath := string(filepath.Separator)
	if volume := filepath.VolumeName(workingDir); volume != "" {
		rootPath = volume + string(filepath.Separator)
	}

	candidates := []DirectoryRoot{
		{Kind: "root", Path: rootPath},
		{Kind: "home", Path: homeDir},
		{Kind: "workspace", Path: workingDir},
	}

	seen := make(map[string]bool)
	roots := make([]DirectoryRoot, 0, len(candidates))
	for _, candidate := range candidates {
		if candidate.Path == "" {
			continue
		}
		resolvedPath, err := filepath.EvalSymlinks(candidate.Path)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) || os.IsPermission(err) {
				continue
			}
			return nil, err
		}
		if !seen[resolvedPath] {
			seen[resolvedPath] = true
			roots = append(roots, DirectoryRoot{Kind: candidate.Kind, Path: resolvedPath})
		}
	}

	return roots, nil
}

func validateAndProbeRepository(ctx context.Context, inputPath string) (string, *RepoStatus, *Error) {
	if !filepath.IsAbs(inputPath) {
		return "", nil, failure(ErrorCodePathNotAbsolute, "Repository path must be absolute.", nil)
	}

	normalizedPath := filepath.Clean(inputPath)
	stats, err := os.Stat(normalizedPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", nil, failure(ErrorCodePathNotFound, "Repository path does not exist.", nil)
		}
		return "", nil, failure("PATH_STAT_FAILED", err.Error(), nil)
	}
	if !stats.IsDir() {
		return "", nil, failure(ErrorCodePathNotDirectory, "Repository path must be a directory.", nil)
	}

	canonicalPath, err := filepath.EvalSymlinks(normalizedPath)
	if err != nil {
		return "", nil, failure("PATH_RESOLVE_FAILED", err.Error(), nil)
	}

	isBareRepository, err := gitBoolean(ctx, canonicalPath, "rev-parse", "--is-bare-repository")
	if err == nil && isBareRepository {
		return "", nil, failure(ErrorCodeBareGitRepository, "Bare git repositories are not supported.", nil)
	}

	insideWorktree, err := gitBoolean(ctx, canonicalPath, "rev-parse", "--is-inside-work-tree")
	if err != nil || !insideWorktree {
		return "", nil, failure(ErrorCodeNotGitRepository, "The selected path is not a non-bare git repository.", nil)
	}

	repoStatus, err := probeRepositoryStatus(ctx, canonicalPath)
	if err != nil {
		return "", nil, failure("REPO_PROBE_FAILED", err.Error(), nil)
	}

	return canonicalPath, repoStatus, nil
}

func probeRepositoryStatus(ctx context.Context, repoPath string) (*RepoStatus, error) {
	defaultBranch, _ := detectDefaultBranch(ctx, repoPath)
	currentBranch, _ := detectCurrentBranch(ctx, repoPath)
	isDirty, _ := detectDirtyState(ctx, repoPath)
	recentBranches, _ := detectRecentBranches(ctx, repoPath, 10)

	return &RepoStatus{
		DefaultBranch:  defaultBranch,
		CurrentBranch:  currentBranch,
		IsDirty:        isDirty,
		RecentBranches: recentBranches,
	}, nil
}

func detectDefaultBranch(ctx context.Context, repoPath string) (*string, error) {
	remoteHead, err := gitString(ctx, repoPath, "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD")
	if err == nil {
		value := strings.TrimPrefix(remoteHead, "origin/")
		return &value, nil
	}

	if _, err := git.Run(ctx, repoPath, "show-ref", "--verify", "--quiet", "refs/heads/main"); err == nil {
		value := "main"
		return &value, nil
	}
	if _, err := git.Run(ctx, repoPath, "show-ref", "--verify", "--quiet", "refs/heads/master"); err == nil {
		value := "master"
		return &value, nil
	}

	currentBranch, err := detectCurrentBranch(ctx, repoPath)
	if err == nil && currentBranch != nil {
		return currentBranch, nil
	}

	recentBranches, err := detectRecentBranches(ctx, repoPath, 1)
	if err == nil && len(recentBranches) > 0 {
		value := recentBranches[0]
		return &value, nil
	}

	return nil, nil
}

func detectCurrentBranch(ctx context.Context, repoPath string) (*string, error) {
	currentBranch, err := gitString(ctx, repoPath, "symbolic-ref", "--quiet", "--short", "HEAD")
	if err != nil {
		return nil, err
	}
	return &currentBranch, nil
}

func detectDirtyState(ctx context.Context, repoPath string) (bool, error) {
	status, err := gitString(ctx, repoPath, "status", "--porcelain=v1", "--untracked-files=normal")
	if err != nil {
		return false, err
	}
	return status != "", nil
}

func detectRecentBranches(ctx context.Context, repoPath string, limit int) ([]string, error) {
	if limit <= 0 {
		return []string{}, nil
	}

	branches, err := gitString(
		ctx,
		repoPath,
		"for-each-ref",
		fmt.Sprintf("--count=%d", limit),
		"--sort=-committerdate",
		"--format=%(refname:short)",
		"refs/heads",
	)
	if err != nil || branches == "" {
		return []string{}, nil
	}

	return strings.FieldsFunc(branches, func(r rune) bool { return r == '\n' || r == '\r' }), nil
}

func gitBoolean(ctx context.Context, repoPath string, args ...string) (bool, error) {
	value, err := gitString(ctx, repoPath, args...)
	if err != nil {
		return false, err
	}
	return value == "true", nil
}

func gitString(ctx context.Context, repoPath string, args ...string) (string, error) {
	output, err := git.Run(ctx, repoPath, args...)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(output), nil
}

func hasGitMarker(targetPath string) bool {
	_, err := os.Stat(filepath.Join(targetPath, ".git"))
	return err == nil
}

func failure(code, message string, details map[string]any) *Error {
	return &Error{Code: code, Message: message, Details: details}
}
