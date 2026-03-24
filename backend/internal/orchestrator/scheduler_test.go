package orchestrator

import "testing"

func TestValidateDependencyGraphDetectsCycle(t *testing.T) {
	err := ValidateDependencyGraph([]DependencyNode{
		{Name: "a", Dependencies: []string{"c"}},
		{Name: "b", Dependencies: []string{"a"}},
		{Name: "c", Dependencies: []string{"b"}},
	})
	if err == nil {
		t.Fatal("expected cycle error")
	}
}

func TestValidateDependencyGraphAcceptsAcyclicGraph(t *testing.T) {
	err := ValidateDependencyGraph([]DependencyNode{
		{Name: "frontend"},
		{Name: "backend", Dependencies: []string{"frontend"}},
	})
	if err != nil {
		t.Fatalf("unexpected validation error: %v", err)
	}
}
