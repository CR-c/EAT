import { Badge } from "@/components/ui/badge"
import { getTaskStatusLabel } from "@/lib/i18n"
import { usePreferences } from "@/lib/preferences"
import { getTaskStatusTone } from "@/lib/task-view"

export function TaskStatusBadge({ status }: { status: string }) {
  const { locale } = usePreferences()
  return <Badge variant={getTaskStatusTone(status)}>{getTaskStatusLabel(locale, status)}</Badge>
}
