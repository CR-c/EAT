package orchestrator

import "fmt"

type DependencyNode struct {
	Name         string
	Dependencies []string
}

func ValidateDependencyGraph(nodes []DependencyNode) error {
	inDegree := make(map[string]int, len(nodes))
	adjacency := make(map[string][]string, len(nodes))

	for _, node := range nodes {
		inDegree[node.Name] += 0
		for _, dep := range node.Dependencies {
			adjacency[dep] = append(adjacency[dep], node.Name)
			inDegree[node.Name]++
		}
	}

	queue := make([]string, 0, len(inDegree))
	for node, degree := range inDegree {
		if degree == 0 {
			queue = append(queue, node)
		}
	}

	visited := 0
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		visited++

		for _, next := range adjacency[current] {
			inDegree[next]--
			if inDegree[next] == 0 {
				queue = append(queue, next)
			}
		}
	}

	if visited != len(inDegree) {
		cycleNodes := make([]string, 0)
		for node, degree := range inDegree {
			if degree > 0 {
				cycleNodes = append(cycleNodes, node)
			}
		}
		return fmt.Errorf("circular dependency detected: %v", cycleNodes)
	}

	return nil
}
