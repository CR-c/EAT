package domain

import "strings"

func StringPointerValue(value string) *string {
	if value == "" {
		return nil
	}
	copied := value
	return &copied
}

func CloneJSONMap(value map[string]any) map[string]any {
	if value == nil {
		return nil
	}
	result := make(map[string]any, len(value))
	for key, item := range value {
		result[key] = item
	}
	return result
}

func NullableString(values ...*string) any {
	for _, value := range values {
		if value != nil && *value != "" {
			return *value
		}
	}
	return nil
}

func FirstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
