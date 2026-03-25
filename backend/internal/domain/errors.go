package domain

import "fmt"

type Error struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

func (e *Error) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func NewError(code, message string, details map[string]any) *Error {
	return &Error{
		Code:    code,
		Message: message,
		Details: details,
	}
}
