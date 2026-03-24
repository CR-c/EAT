package tasktemplates

type Template struct {
	ID    string   `json:"id"`
	Roles []string `json:"roles"`
}

type Summary struct {
	ID        string   `json:"id"`
	NodeCount int      `json:"nodeCount"`
	Roles     []string `json:"roles"`
}

var definitions = []Template{
	{ID: "full-stack-web-app", Roles: []string{"architect", "backend", "database", "frontend", "tester", "integration"}},
	{ID: "backend-api", Roles: []string{"architect", "backend", "database", "tester", "integration"}},
	{ID: "frontend-feature", Roles: []string{"architect", "frontend", "integration", "tester"}},
	{ID: "repo-wide-refactor", Roles: []string{"architect", "refactor", "verifier", "integration"}},
}

func List() []Summary {
	result := make([]Summary, 0, len(definitions))
	for _, definition := range definitions {
		result = append(result, Summary{
			ID:        definition.ID,
			NodeCount: len(definition.Roles),
			Roles:     append([]string(nil), definition.Roles...),
		})
	}
	return result
}
