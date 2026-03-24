package git

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
)

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

func ResolveRevision(ctx context.Context, workDir, revision string) (string, error) {
	output, err := Run(ctx, workDir, "rev-parse", revision+"^{commit}")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(output), nil
}

func BranchExists(ctx context.Context, workDir, branchName string) bool {
	_, err := Run(ctx, workDir, "show-ref", "--verify", "--quiet", "refs/heads/"+branchName)
	return err == nil
}

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

func EnsureBranchExists(ctx context.Context, workDir, branchName, baseCommitSHA string) error {
	if BranchExists(ctx, workDir, branchName) {
		return nil
	}
	_, err := Run(ctx, workDir, "branch", branchName, baseCommitSHA)
	return err
}
