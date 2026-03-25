import { Badge } from "@/components/ui/badge"
import { getTaskStatusTone } from "@/lib/task-view"

export function TaskStatusBadge({ status }: { status: string }) {
  return <Badge variant={getTaskStatusTone(status)}>{status}</Badge>
}
