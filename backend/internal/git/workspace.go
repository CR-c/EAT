package git

import "path/filepath"

func ResolveWorktreePath(rootPath, taskID, branchSuffix string) string {
	return filepath.Join(rootPath, ".eat", "worktrees", taskID, branchSuffix)
}
