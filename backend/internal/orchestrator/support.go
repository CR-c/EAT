package orchestrator

func stringPointerValue(value string) *string {
	if value == "" {
		return nil
	}
	copied := value
	return &copied
}

func cloneJSONMap(value map[string]any) map[string]any {
	if value == nil {
		return nil
	}
	result := make(map[string]any, len(value))
	for key, item := range value {
		result[key] = item
	}
	return result
}

func nullableString(values ...*string) any {
	for _, value := range values {
		if value != nil && *value != "" {
			return *value
		}
	}
	return nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
