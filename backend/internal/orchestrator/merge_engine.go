package orchestrator

import "sync"

type MergeEngine struct {
	projectLocks sync.Map
	taskLocks    sync.Map
}

func (me *MergeEngine) getProjectLock(projectPath string) *sync.Mutex {
	lock, _ := me.projectLocks.LoadOrStore(projectPath, &sync.Mutex{})
	return lock.(*sync.Mutex)
}

func (me *MergeEngine) getTaskLock(taskID string) *sync.Mutex {
	lock, _ := me.taskLocks.LoadOrStore(taskID, &sync.Mutex{})
	return lock.(*sync.Mutex)
}
