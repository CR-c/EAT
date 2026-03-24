package git

import (
	"context"
	"strings"
)

func BranchMergedInto(ctx context.Context, workDir, sourceBranch, targetBranch string) (bool, error) {
	output, err := Run(ctx, workDir, "branch", "--merged", targetBranch)
	if err != nil {
		return false, err
	}

	for _, line := range strings.Split(output, "\n") {
		if strings.TrimSpace(strings.TrimPrefix(line, "*")) == sourceBranch {
			return true, nil
		}
	}

	return false, nil
}
