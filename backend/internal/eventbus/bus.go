package eventbus

import "sync"

type Event struct {
	Name string `json:"name"`
	Data []byte `json:"data,omitempty"`
}

type Bus struct {
	mu          sync.RWMutex
	subscribers map[string]map[chan Event]struct{}
}

func New() *Bus {
	return &Bus{
		subscribers: make(map[string]map[chan Event]struct{}),
	}
}

func (b *Bus) Subscribe(topic string, buffer int) (<-chan Event, func()) {
	if buffer <= 0 {
		buffer = 16
	}

	ch := make(chan Event, buffer)

	b.mu.Lock()
	if _, ok := b.subscribers[topic]; !ok {
		b.subscribers[topic] = make(map[chan Event]struct{})
	}
	b.subscribers[topic][ch] = struct{}{}
	b.mu.Unlock()

	return ch, func() {
		b.mu.Lock()
		defer b.mu.Unlock()

		if subscribers, ok := b.subscribers[topic]; ok {
			if _, exists := subscribers[ch]; exists {
				delete(subscribers, ch)
				close(ch)
			}
			if len(subscribers) == 0 {
				delete(b.subscribers, topic)
			}
		}
	}
}

func (b *Bus) Publish(topic string, event Event) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	for ch := range b.subscribers[topic] {
		select {
		case ch <- event:
		default:
		}
	}
}
