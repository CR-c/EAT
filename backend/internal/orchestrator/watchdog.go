package orchestrator

import "time"

type Watchdog struct {
	Manager *WorkerManager
}

func (w *Watchdog) Scan(hardTimeout time.Duration) []string {
	w.Manager.mu.Lock()
	defer w.Manager.mu.Unlock()

	expired := make([]string, 0)
	now := time.Now()
	for subTaskID, entry := range w.Manager.workers {
		if now.Sub(entry.StartedAt) >= hardTimeout {
			expired = append(expired, subTaskID)
		}
	}

	return expired
}
