export function formatDateTime(value?: string | null) {
  if (!value) {
    return "—"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export function formatRelativeCount(value?: number | null, suffix = "") {
  if (value === undefined || value === null) {
    return "—"
  }
  return `${value}${suffix}`
}

export function formatPercent(value?: number | null) {
  if (value === undefined || value === null) {
    return "—"
  }
  return `${Math.round(value * 100)}%`
}
