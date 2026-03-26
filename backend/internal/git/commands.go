package git

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

// Run executes a git command and returns stdout.
func Run(ctx context.Context, workDir string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = workDir

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("git %v: %w: %s", args, err, stderr.String())
	}

	return stdout.String(), nil
}

// CaptureResult holds the result of a git command that may fail gracefully.
type CaptureResult struct {
	OK     bool
	Stdout string
	Stderr string
}

// RunCapture executes a git command and captures success/failure without error.
func RunCapture(ctx context.Context, workDir string, args ...string) CaptureResult {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = workDir

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return CaptureResult{OK: false, Stdout: strings.TrimSpace(stdout.String()), Stderr: strings.TrimSpace(stderr.String())}
	}
	return CaptureResult{OK: true, Stdout: strings.TrimSpace(stdout.String()), Stderr: strings.TrimSpace(stderr.String())}
}

// ResolveRevision resolves a revision to a commit SHA.
func ResolveRevision(ctx context.Context, workDir, revision string) (string, error) {
	output, err := Run(ctx, workDir, "rev-parse", revision+"^{commit}")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(output), nil
}

// BranchExists checks if a local branch exists.
func BranchExists(ctx context.Context, workDir, branchName string) bool {
	_, err := Run(ctx, workDir, "show-ref", "--verify", "--quiet", "refs/heads/"+branchName)
	return err == nil
}

// ResolveUniqueBranchName finds an unused branch name based on the desired name.
func ResolveUniqueBranchName(ctx context.Context, workDir, desiredBranchName string) (string, error) {
	attempt := 0
	for {
		candidate := desiredBranchName
		if attempt > 0 {
			candidate = fmt.Sprintf("%s-%d", desiredBranchName, attempt)
		}
		if !BranchExists(ctx, workDir, candidate) {
			return candidate, nil
		}
		attempt++
	}
}

// ValidateBranchName verifies that a value is a valid local branch name.
func ValidateBranchName(ctx context.Context, workDir, branchName string) error {
	result := RunCapture(ctx, workDir, "check-ref-format", "--branch", branchName)
	if !result.OK {
		return fmt.Errorf("invalid branch name %q: %s", branchName, result.Stderr)
	}
	return nil
}

// EnsureBranchExists creates a branch if it doesn't exist.
func EnsureBranchExists(ctx context.Context, workDir, branchName, baseCommitSHA string) error {
	if BranchExists(ctx, workDir, branchName) {
		return nil
	}
	_, err := Run(ctx, workDir, "branch", branchName, baseCommitSHA)
	return err
}

// BranchMergedInto checks if sourceBranch is already merged into targetBranch.
func BranchMergedInto(ctx context.Context, workDir, sourceBranch, targetBranch string) bool {
	_, err := Run(ctx, workDir, "merge-base", "--is-ancestor", sourceBranch, targetBranch)
	return err == nil
}

// ComputeDeterministicBranchName generates a deterministic branch name.
func ComputeDeterministicBranchName(taskID, branchSuffix string) string {
	return fmt.Sprintf("eat/%s/%s", taskID, branchSuffix)
}

// ResolveWorktreePath computes a unique worktree path for a subtask.
func ResolveWorktreePath(projectPath, taskID, branchSuffix string) (string, error) {
	worktreeRoot := filepath.Join(os.TempDir(), ".eat-worktrees", filepath.Base(projectPath), taskID)
	if err := os.MkdirAll(worktreeRoot, 0o755); err != nil {
		return "", fmt.Errorf("create worktree root: %w", err)
	}
	desiredPath := filepath.Join(worktreeRoot, branchSuffix)
	attempt := 0
	for {
		candidate := desiredPath
		if attempt > 0 {
			candidate = fmt.Sprintf("%s-%d", desiredPath, attempt)
		}
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate, nil
		}
		attempt++
	}
}

// IsGitWorktree checks if a path is a git worktree.
func IsGitWorktree(worktreePath string) bool {
	_, err := os.Stat(filepath.Join(worktreePath, ".git"))
	return err == nil
}

// EnsureWorktree creates a git worktree if it doesn't already exist.
func EnsureWorktree(ctx context.Context, repoPath, worktreePath, branchName string) error {
	if IsGitWorktree(worktreePath) {
		return nil
	}
	_, err := Run(ctx, repoPath, "worktree", "add", "--checkout", worktreePath, branchName)
	return err
}

// RemoveWorktree removes a git worktree.
func RemoveWorktree(ctx context.Context, repoPath, worktreePath string) error {
	if _, err := os.Stat(worktreePath); os.IsNotExist(err) {
		_ = PruneWorktrees(ctx, repoPath)
		return nil
	}
	result := RunCapture(ctx, repoPath, "worktree", "remove", "--force", worktreePath)
	_ = PruneWorktrees(ctx, repoPath)
	if !result.OK {
		// Fallback: remove directory directly
		_ = os.RemoveAll(worktreePath)
	}
	return nil
}

// GetCurrentBranch returns the current branch name, or empty string if detached.
func GetCurrentBranch(ctx context.Context, repoPath string) string {
	output, err := Run(ctx, repoPath, "symbolic-ref", "--quiet", "--short", "HEAD")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(output)
}

// IsWorkingTreeDirty checks if the working tree has uncommitted changes.
func IsWorkingTreeDirty(ctx context.Context, repoPath string) bool {
	output, err := Run(ctx, repoPath, "status", "--porcelain=v1", "--untracked-files=normal")
	if err != nil {
		return true
	}
	return strings.TrimSpace(output) != ""
}

// CheckoutBranch checks out a branch.
func CheckoutBranch(ctx context.Context, repoPath, branchName string) CaptureResult {
	return RunCapture(ctx, repoPath, "checkout", branchName)
}

// MergeBranch merges sourceBranch into the current branch with --no-ff.
func MergeBranch(ctx context.Context, repoPath, sourceBranch string) CaptureResult {
	return RunCapture(ctx, repoPath, "merge", "--no-ff", "--no-edit", sourceBranch)
}

// AbortMerge aborts an in-progress merge.
func AbortMerge(ctx context.Context, repoPath string) CaptureResult {
	return RunCapture(ctx, repoPath, "merge", "--abort")
}

// RebaseBranch rebases onto baseBranch.
func RebaseBranch(ctx context.Context, repoPath, baseBranch string) CaptureResult {
	return RunCapture(ctx, repoPath, "rebase", baseBranch)
}

// AbortRebase aborts an in-progress rebase.
func AbortRebase(ctx context.Context, repoPath string) CaptureResult {
	return RunCapture(ctx, repoPath, "rebase", "--abort")
}

// StageAllFiles stages all changes.
func StageAllFiles(ctx context.Context, repoPath string) CaptureResult {
	return RunCapture(ctx, repoPath, "add", "--all")
}

// CommitMerge commits with a message.
func CommitMerge(ctx context.Context, repoPath, message string) CaptureResult {
	return RunCapture(ctx, repoPath, "commit", "--no-edit", "-m", message)
}

// DeleteBranch deletes a local branch.
func DeleteBranch(ctx context.Context, repoPath, branchName string) CaptureResult {
	if !BranchExists(ctx, repoPath, branchName) {
		return CaptureResult{OK: true}
	}
	return RunCapture(ctx, repoPath, "branch", "--delete", "--force", branchName)
}

// PruneWorktrees prunes stale worktree entries.
func PruneWorktrees(ctx context.Context, repoPath string) error {
	_, err := Run(ctx, repoPath, "worktree", "prune", "--expire", "now")
	return err
}

// DiffStat returns a summary of changes between two refs.
func DiffStat(ctx context.Context, repoPath, baseRef, headRef string) (string, error) {
	output, err := Run(ctx, repoPath, "diff", "--stat", baseRef+"..."+headRef)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(output), nil
}

// DiffOutput returns the full diff between two refs (limited size for review).
func DiffOutput(ctx context.Context, repoPath, baseRef, headRef string, maxBytes int) (string, error) {
	output, err := Run(ctx, repoPath, "diff", baseRef+"..."+headRef)
	if err != nil {
		return "", err
	}
	result := strings.TrimSpace(output)
	if maxBytes > 0 && len(result) > maxBytes {
		result = result[:maxBytes] + "\n... (truncated)"
	}
	return result, nil
}

type DiffFileSummary struct {
	Path      string
	Previous  *string
	Type      string
	Additions int64
	Deletions int64
	Patch     string
}

func DiffFiles(ctx context.Context, repoPath, baseRef, headRef string, maxPatchBytes int) ([]DiffFileSummary, error) {
	rangeRef := baseRef + "..." + headRef
	statusOutput, err := Run(ctx, repoPath, "diff", "--name-status", "--find-renames", rangeRef)
	if err != nil {
		return nil, err
	}

	lines := strings.Split(strings.TrimSpace(statusOutput), "\n")
	files := make([]DiffFileSummary, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parts := strings.Split(line, "\t")
		if len(parts) < 2 {
			continue
		}

		status := normalizeDiffStatus(parts[0])
		path := parts[len(parts)-1]
		var previous *string
		if len(parts) >= 3 {
			previous = stringPointer(parts[1])
		}

		additions, deletions, err := diffNumStatForPath(ctx, repoPath, rangeRef, path)
		if err != nil {
			return nil, err
		}
		patch, err := diffPatchForPath(ctx, repoPath, rangeRef, path, maxPatchBytes)
		if err != nil {
			return nil, err
		}

		files = append(files, DiffFileSummary{
			Path:      path,
			Previous:  previous,
			Type:      status,
			Additions: additions,
			Deletions: deletions,
			Patch:     patch,
		})
	}

	return files, nil
}

func diffNumStatForPath(ctx context.Context, repoPath, rangeRef, path string) (int64, int64, error) {
	output, err := Run(ctx, repoPath, "diff", "--numstat", "--find-renames", rangeRef, "--", path)
	if err != nil {
		return 0, 0, err
	}
	line := strings.TrimSpace(output)
	if line == "" {
		return 0, 0, nil
	}

	parts := strings.Fields(line)
	if len(parts) < 2 {
		return 0, 0, nil
	}

	additions, _ := strconv.ParseInt(strings.ReplaceAll(parts[0], "-", "0"), 10, 64)
	deletions, _ := strconv.ParseInt(strings.ReplaceAll(parts[1], "-", "0"), 10, 64)
	return additions, deletions, nil
}

func diffPatchForPath(ctx context.Context, repoPath, rangeRef, path string, maxPatchBytes int) (string, error) {
	output, err := Run(ctx, repoPath, "diff", "--find-renames", "--unified=3", rangeRef, "--", path)
	if err != nil {
		return "", err
	}
	patch := strings.TrimSpace(output)
	if maxPatchBytes > 0 && len(patch) > maxPatchBytes {
		patch = patch[:maxPatchBytes] + "\n... (truncated)"
	}
	return patch, nil
}

func normalizeDiffStatus(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "M"
	}
	switch value[0] {
	case 'A':
		return "A"
	case 'C':
		return "C"
	case 'D':
		return "D"
	case 'M':
		return "M"
	case 'R':
		return "R"
	case 'T':
		return "T"
	default:
		return strings.ToUpper(string(value[0]))
	}
}

func stringPointer(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
