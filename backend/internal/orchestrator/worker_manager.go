package orchestrator

import (
	"context"
	"sync"
	"time"
)

type WorkerEntry struct {
	StartedAt    time.Time
	LastOutputAt time.Time
	Cancel       context.CancelFunc
	PID          int
	SessionID    string
	TaskID       string
}

type WorkerManager struct {
	mu      sync.Mutex
	workers map[string]*WorkerEntry
}

func NewWorkerManager() *WorkerManager {
	return &WorkerManager{
		workers: make(map[string]*WorkerEntry),
	}
}

func (wm *WorkerManager) Set(subTaskID string, entry *WorkerEntry) {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	wm.workers[subTaskID] = entry
}

func (wm *WorkerManager) Delete(subTaskID string) {
	wm.mu.Lock()
	defer wm.mu.Unlock()
	delete(wm.workers, subTaskID)
}
