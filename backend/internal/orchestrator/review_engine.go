package orchestrator

import "sync"

type ReviewEngine struct {
	pending sync.Map
}

func (re *ReviewEngine) MaybeStart(taskID string, run func()) {
	once, _ := re.pending.LoadOrStore(taskID, &sync.Once{})
	once.(*sync.Once).Do(func() {
		defer re.pending.Delete(taskID)
		run()
	})
}
