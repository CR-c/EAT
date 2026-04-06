import { Archive, Pause, Play, Trash2 } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { usePreferences } from "@/lib/preferences"
import { getTaskProgress } from "@/lib/task-view"
import type { TaskRecord } from "@/lib/types"
import { TaskStatusBadge } from "@/features/tasks/components/task-status-badge"

interface TaskCardProps {
  projectId: string
  task: TaskRecord
  onAction: (mode: "archive" | "delete" | "pause" | "resume", task: TaskRecord) => void
}

export function TaskCard({ onAction, projectId, task }: TaskCardProps) {
  const { t } = usePreferences()

  return (
    <Card className="h-full transition-transform hover:-translate-y-1">
      <CardHeader className="gap-4">
        <div className="flex items-start justify-between gap-3">
          <TaskStatusBadge status={task.status} />
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{task.id}</div>
        </div>
        <div>
          <Link className="font-heading text-xl font-semibold hover:text-cyan-700 dark:hover:text-cyan-200" to={`/projects/${projectId}/workbench?taskId=${task.id}`}>
            {task.title}
          </Link>
          <p className="mt-2 line-clamp-4 text-sm text-muted-foreground">{task.description}</p>
        </div>
      </CardHeader>

      <CardContent className="flex h-full flex-col gap-4">
        <div className="rounded-[1.4rem] border border-white/40 bg-white/55 p-4 text-sm dark:border-white/10 dark:bg-white/6">
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.25em] text-muted-foreground">
            <span>{task.baseBranch}</span>
            <span>{task.taskBranchName ?? t("common.autoBranch")}</span>
          </div>
          <Progress value={getTaskProgress(task)} />
        </div>

        <div className="mt-auto flex items-center justify-between">
          <Button asChild variant="secondary">
            <Link to={`/projects/${projectId}/workbench?taskId=${task.id}`}>{t("common.open")}</Link>
          </Button>

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onAction(task.status === "PAUSED" ? "resume" : "pause", task)}
                >
                  {task.status === "PAUSED" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{task.status === "PAUSED" ? t("common.resume") : t("common.pause")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" onClick={() => onAction("archive", task)}>
                  <Archive className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("task.action.archive.confirm")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" onClick={() => onAction("delete", task)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("common.delete")}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
