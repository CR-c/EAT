package agent

import "sync"

type Registry struct {
	mu       sync.RWMutex
	adapters map[string]Adapter
}

func NewRegistry() *Registry {
	return &Registry{
		adapters: make(map[string]Adapter),
	}
}

func (r *Registry) Register(adapter Adapter) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.adapters[adapter.Name()] = adapter
}

func (r *Registry) Get(name string) Adapter {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.adapters[name]
}
