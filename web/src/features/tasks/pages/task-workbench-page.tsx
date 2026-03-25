import { Activity, AlertTriangle, FolderKanban, GitBranch, MessagesSquare, Users } from "lucide-react"
import { useParams, useSearchParams } from "react-router-dom"

import { getProject, listProjectTasks } from "@/lib/api/projects"
import { getTask } from "@/lib/api/tasks"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useAsyncResource } from "@/hooks/use-async-resource"
import { formatDateTime } from "@/lib/format"
import { usePreferences } from "@/lib/preferences"
import { TaskStatusBadge } from "@/features/tasks/components/task-status-badge"

function toArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []
}

export function TaskWorkbenchPage() {
  const { projectId = "" } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const taskId = searchParams.get("taskId")
  const { t } = usePreferences()

  const project = useAsyncResource({
    deps: [projectId],
    load: async (signal) => getProject(projectId, signal),
  })

  const tasks = useAsyncResource({
    deps: [projectId],
    load: async (signal) => listProjectTasks(projectId, true, signal),
  })

  const detail = useAsyncResource({
    deps: [taskId],
    initialData: undefined,
    load: async (signal) => {
      if (!taskId) {
        return undefined
      }
      return getTask(taskId, signal)
    },
  })

  const board = detail.data?.board ?? {}
  const summary = (board.summary ?? {}) as Record<string, number>
  const risk = (board.riskSummary ?? {}) as Record<string, number>
  const activity = toArray(board.activity)
  const actionRequiredItems = toArray(board.actionRequiredItems)
  const teamMembers = toArray((detail.data?.team ?? {})["members"])

  return (
    <div className="grid h-full gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="min-h-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <FolderKanban className="h-5 w-5 text-cyan-700 dark:text-cyan-200" />
            {project.data?.project.name ?? "Project"}
          </CardTitle>
          <CardDescription>Route-driven workbench with live task detail from the Go backend.</CardDescription>
        </CardHeader>
        <CardContent className="min-h-0">
          <ScrollArea className="h-[calc(100dvh-18rem)] pr-4">
            <div className="grid gap-3">
              {(tasks.data?.tasks ?? []).map((task) => (
                <button
                  key={task.id}
                  className={`rounded-[1.4rem] border p-4 text-left transition-colors ${
                    task.id === taskId
                      ? "border-cyan-300/60 bg-cyan-500/10"
                      : "border-white/40 bg-white/45 hover:bg-white/60 dark:border-white/10 dark:bg-white/6"
                  }`}
                  onClick={() => setSearchParams({ taskId: task.id })}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{task.title}</div>
                    <TaskStatusBadge status={task.status} />
                  </div>
                  <div className="mt-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">{task.id}</div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <ScrollArea className="min-h-0">
        {!taskId ? (
          <Card>
            <CardContent className="flex min-h-[320px] items-center justify-center pt-6 text-muted-foreground">
              {t("workbenchEmpty")}
            </CardContent>
          </Card>
        ) : detail.isLoading ? (
          <div className="grid gap-5 pr-4">
            <Skeleton className="h-[180px]" />
            <Skeleton className="h-[420px]" />
          </div>
        ) : detail.error ? (
          <Card>
            <CardContent className="pt-6 text-red-600 dark:text-red-300">{detail.error}</CardContent>
          </Card>
        ) : detail.data ? (
          <div className="grid gap-5 pr-4">
            <Card>
              <CardHeader className="gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-3xl">{detail.data.task.title}</CardTitle>
                    <CardDescription className="mt-2">{detail.data.task.description}</CardDescription>
                  </div>
                  <TaskStatusBadge status={detail.data.task.status} />
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-[1.4rem] border border-white/40 bg-white/50 p-4 dark:border-white/10 dark:bg-white/6">
                    <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Task Branch</div>
                    <div className="mt-2 flex items-center gap-2 font-medium">
                      <GitBranch className="h-4 w-4 text-cyan-700 dark:text-cyan-200" />
                      {detail.data.task.taskBranchName ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-[1.4rem] border border-white/40 bg-white/50 p-4 dark:border-white/10 dark:bg-white/6">
                    <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Summary</div>
                    <div className="mt-2 text-sm">
                      {summary.running ?? 0} running, {summary.reviewPending ?? 0} review
                    </div>
                  </div>
                  <div className="rounded-[1.4rem] border border-white/40 bg-white/50 p-4 dark:border-white/10 dark:bg-white/6">
                    <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{t("actionRequired")}</div>
                    <div className="mt-2 text-sm">{summary.actionRequired ?? 0} items</div>
                  </div>
                  <div className="rounded-[1.4rem] border border-white/40 bg-white/50 p-4 dark:border-white/10 dark:bg-white/6">
                    <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{t("risk")}</div>
                    <div className="mt-2 text-sm">
                      {risk.mailboxBlockers ?? 0} blockers, {risk.reviewRequired ?? 0} review-required
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-cyan-700 dark:text-cyan-200" />
                    {t("team")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {teamMembers.map((member) => (
                    <div
                      key={String(member.subtaskId)}
                      className="rounded-[1.4rem] border border-white/40 bg-white/50 p-4 dark:border-white/10 dark:bg-white/6"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">{String(member.displayName ?? member.title ?? member.role ?? "Member")}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{String(member.agentType ?? "—")}</div>
                        </div>
                        <TaskStatusBadge status={String(member.status ?? "PENDING")} />
                      </div>
                      <Separator className="my-3" />
                      <div className="text-sm text-muted-foreground">{String(member.runSummary ?? "—")}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="grid gap-5">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-cyan-700 dark:text-cyan-200" />
                      {t("actionRequired")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {actionRequiredItems.length ? (
                      actionRequiredItems.map((item) => (
                        <div
                          key={String(item.id)}
                          className="rounded-[1.3rem] border border-red-400/25 bg-red-400/8 p-4"
                        >
                          <div className="font-medium">{String(item.kind)}</div>
                          <div className="mt-2 text-sm text-muted-foreground">{String(item.summary)}</div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[1.3rem] border border-white/40 bg-white/50 p-4 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/6">
                        No actionable mailbox item right now.
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessagesSquare className="h-5 w-5 text-cyan-700 dark:text-cyan-200" />
                      Messages
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {detail.data.messages.slice(-5).map((message) => (
                      <div
                        key={message.id}
                        className="rounded-[1.3rem] border border-white/40 bg-white/50 p-4 text-sm dark:border-white/10 dark:bg-white/6"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <Badge variant="secondary">{message.role}</Badge>
                          <span className="text-xs text-muted-foreground">{formatDateTime(message.createdAt)}</span>
                        </div>
                        <div>{message.content}</div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-cyan-700 dark:text-cyan-200" />
                  {t("activity")}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {activity.length ? (
                  activity.map((entry) => (
                    <div
                      key={String(entry.id)}
                      className="rounded-[1.3rem] border border-white/40 bg-white/50 p-4 text-sm dark:border-white/10 dark:bg-white/6"
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <Badge variant="outline">{String(entry.kind)}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(String(entry.createdAt ?? ""))}
                        </span>
                      </div>
                      <div>{String(entry.summary ?? "—")}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">No board activity yet.</div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </ScrollArea>
    </div>
  )
}
