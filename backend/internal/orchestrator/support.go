package orchestrator

import "eat/backend/internal/domain"

func stringPointerValue(value string) *string {
	return domain.StringPointerValue(value)
}

func cloneJSONMap(value map[string]any) map[string]any {
	return domain.CloneJSONMap(value)
}

func nullableString(values ...*string) any {
	return domain.NullableString(values...)
}

func firstNonEmpty(values ...string) string {
	return domain.FirstNonEmpty(values...)
}
