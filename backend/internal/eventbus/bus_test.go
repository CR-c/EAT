package eventbus

import "testing"

func TestPublishSubscribe(t *testing.T) {
	bus := New()
	ch, unsubscribe := bus.Subscribe("task:123", 1)
	defer unsubscribe()

	bus.Publish("task:123", Event{Name: "subtask:status"})

	event := <-ch
	if event.Name != "subtask:status" {
		t.Fatalf("unexpected event name: %s", event.Name)
	}
}
