import { Archive, FolderPlus, GitBranch, PauseCircle, PlayCircle, Search, Trash2, Zap } from "lucide-react"
import { useDeferredValue, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"

import { getProject, listProjectTasks } from "@/lib/api/projects"
import { archiveTask, deleteTask, pauseTask, resumeTask } from "@/lib/api/tasks"
import { useAsyncResource } from "@/hooks/use-async-resource"
import { usePreferences } from "@/lib/preferences"
import { getPilotTheme } from "@/lib/pilot-theme"
import { cn } from "@/lib/utils"
import { TaskActionDialog } from "@/features/tasks/components/task-action-dialog"
import { isTaskArchived, isTaskOperational } from "@/lib/task-view"
import type { TaskRecord } from "@/lib/types"

type TaskFilter = "all" | "active" | "archived"
type TaskActionMode = "archive" | "delete" | "pause" | "resume" | "blocked"

export function ProjectTasksPage() {
  const { projectId = "" } = useParams()
  const { pilot } = usePreferences()
  const theme = getPilotTheme(pilot)
  const isRei = pilot === "rei"
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<TaskFilter>("active")
  const [taskAction, setTaskAction] = useState<{ mode: TaskActionMode; task: TaskRecord } | null>(null)
  const deferredQuery = useDeferredValue(query)

  const project = useAsyncResource({
    deps: [projectId],
    initialData: undefined,
    load: async (signal) => getProject(projectId, signal),
  })

  const tasks = useAsyncResource({
    deps: [projectId],
    initialData: undefined,
    load: async (signal) => listProjectTasks(projectId, true, signal),
  })

  const filtered = useMemo(
    () =>
      (tasks.data?.tasks ?? []).filter((task) => {
        const haystack = `${task.id} ${task.title}`.toLowerCase()
        const matchesSearch = haystack.includes(deferredQuery.trim().toLowerCase())
        const matchesFilter =
          filter === "all" || (filter === "archived" ? isTaskArchived(task) : !isTaskArchived(task))
        return matchesSearch && matchesFilter
      }),
    [deferredQuery, filter, tasks.data?.tasks],
  )

  async function handleTaskAction({ deleteBranches }: { deleteBranches: boolean }) {
    if (!taskAction) {
      return
    }

    if (taskAction.mode === "archive") {
      await archiveTask(taskAction.task.id, deleteBranches)
    } else if (taskAction.mode === "delete") {
      await deleteTask(taskAction.task.id, deleteBranches)
    } else if (taskAction.mode === "pause") {
      await pauseTask(taskAction.task.id)
    } else if (taskAction.mode === "resume") {
      await resumeTask(taskAction.task.id)
    }

    setTaskAction(null)
    tasks.reload()
  }

  function openAction(mode: "archive" | "delete" | "pause" | "resume", task: TaskRecord) {
    if ((mode === "archive" || mode === "delete") && isTaskOperational(task)) {
      setTaskAction({ mode: "blocked", task })
      return
    }

    setTaskAction({ mode, task })
  }

  return (
    <>
      <TaskActionDialog
        mode={taskAction?.mode ?? null}
        onConfirm={handleTaskAction}
        onOpenChange={(open) => {
          if (!open) {
            setTaskAction(null)
          }
        }}
        open={Boolean(taskAction)}
        task={taskAction?.task}
      />

      <div className="relative z-10 flex h-full flex-col p-8">
        <div className={cn("mb-6 flex items-end justify-between border-b pb-4", theme.sidebarBorder)}>
          <div>
            <div className={cn("mb-1 font-mono text-sm tracking-[0.2em]", theme.pageSub)}>OPERATIONAL_HUB //</div>
            <h2 className={cn("font-mono text-3xl font-black tracking-widest", theme.pageTitle)}>任务指挥中心</h2>
          </div>
          <Link
            className={cn("flex items-center rounded-sm border px-5 py-2 font-mono text-sm shadow-lg", theme.actionBtn)}
            to={`/projects/${projectId}/tasks/new`}
          >
            <FolderPlus className="mr-2 h-4 w-4" />
            发布新任务
          </Link>
        </div>

        <div className="mb-6 flex flex-col items-center justify-between space-y-4 sm:flex-row sm:space-y-0">
          <div className={cn("flex space-x-1 border-b font-mono text-sm", theme.sidebarBorder)}>
            {[
              { key: "all", label: "全部任务" },
              { key: "active", label: "活跃作战" },
              { key: "archived", label: "已归档案" },
            ].map((tab) => (
              <button
                key={tab.key}
                className={cn(
                  "border-b-2 px-6 py-2.5 tracking-wider transition-all",
                  filter === tab.key ? theme.tabActive : theme.tabInactive,
                )}
                onClick={() => setFilter(tab.key as TaskFilter)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="group relative w-full sm:w-72">
            <Search className={cn("absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors", isRei ? "text-blue-400 group-focus-within:text-cyan-500" : "text-purple-500 group-focus-within:text-green-400")} />
            <input
              className={cn("w-full rounded-sm border py-2 pl-9 pr-4 font-mono text-sm outline-none transition-all", theme.inputBg)}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="检索任务代号或名称..."
              type="text"
              value={query}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-8 pr-2">
          {tasks.error ? (
            <div className={cn("rounded-sm border p-6 font-mono text-sm", theme.cardBg)}>{tasks.error}</div>
          ) : (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              {filtered.map((task) => (
                <article
                  key={task.id}
                  className={cn("group relative flex min-h-[260px] flex-col rounded-sm border p-5 transition-all duration-300", theme.cardBg)}
                >
                  <Link className="absolute inset-0 z-0" to={`/projects/${projectId}/workbench?taskId=${task.id}`} />
                  <div className="relative z-10 mb-3 flex items-center justify-between">
                    <TaskStatus status={task.status} theme={theme} />
                    <div className={cn("font-mono text-xs tracking-widest opacity-60", theme.cardSub)}>{task.id}</div>
                  </div>
                  <div className="relative z-10 flex-1">
                    <h3 className={cn("mb-2 text-lg font-bold tracking-wide", theme.cardTitle)}>{task.title}</h3>
                    <p className={cn("text-sm leading-relaxed", theme.cardSub)}>{task.description}</p>
                  </div>
                  <div className={cn("relative z-10 mt-4 flex items-center justify-between rounded-sm border p-2.5 font-mono text-xs", theme.pathBg)}>
                    <div className="flex items-center overflow-hidden">
                      <GitBranch className={cn("mr-2 h-3.5 w-3.5 shrink-0", theme.pathLabel)} />
                      <span className="max-w-[80px] truncate" title={task.baseBranch}>
                        {task.baseBranch}
                      </span>
                      <span className="mx-1">→</span>
                      <span className={cn("truncate font-bold", isRei ? "text-cyan-600" : "text-green-400")} title={task.taskBranchName ?? ""}>
                        {task.taskBranchName ?? "自动生成"}
                      </span>
                    </div>
                  </div>
                  <div className="relative z-10 mt-3">
                    <TokenUsageBadges isRei={isRei} tokens={task.tokens} />
                  </div>
                  <div className={cn("relative z-10 mt-4 flex items-center justify-between border-t pt-4", isRei ? "border-blue-100/50" : "border-white/5")}>
                    <div className={cn("h-1 flex-1 overflow-hidden rounded-full", isRei ? "bg-blue-100" : "bg-white/10")}>
                      <div
                        className={cn("h-full transition-all duration-1000", isRei ? "bg-cyan-400" : "bg-green-400")}
                        style={{ width: `${getTaskProgress(task.status)}%` }}
                      />
                    </div>
                    <div className="ml-4 flex shrink-0 items-center space-x-1">
                      <button
                        className={cn("rounded-sm p-1.5 transition-colors", theme.btnGhost)}
                        onClick={(event) => {
                          event.preventDefault()
                          openAction(task.status === "PAUSED" ? "resume" : "pause", task)
                        }}
                        type="button"
                      >
                        {task.status === "PAUSED" ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                      </button>
                      <button
                        className={cn("rounded-sm p-1.5 transition-colors", theme.btnGhost)}
                        onClick={(event) => {
                          event.preventDefault()
                          openAction("archive", task)
                        }}
                        type="button"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                      <button
                        className={cn("rounded-sm p-1.5 transition-colors", theme.btnDanger)}
                        onClick={(event) => {
                          event.preventDefault()
                          openAction("delete", task)
                        }}
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className={cn("absolute left-0 top-0 h-2 w-2 border-l-2 border-t-2", theme.cardCorner)} />
                  <div className={cn("absolute bottom-0 right-0 h-2 w-2 border-b-2 border-r-2", theme.cardCorner)} />
                </article>
              ))}
              {!tasks.isLoading && filtered.length === 0 ? (
                <div className={cn("col-span-1 rounded-sm border border-dashed p-8 text-center font-mono text-sm lg:col-span-3", isRei ? "border-blue-200 bg-white/50 text-blue-400" : "border-purple-500/30 bg-black/20 text-purple-500/70")}>
                  未检索到符合条件的任务。
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className={cn("mt-4 font-mono text-xs", theme.cardSub)}>
          {project.data?.project.path ?? "正在同步项目上下文..."}
        </div>
      </div>
    </>
  )
}

function TokenUsageBadges({
  isRei,
  tokens,
}: {
  isRei: boolean
  tokens?: Record<string, number> | null
}) {
  const entries = tokens ? Object.entries(tokens) : []
  const items: Array<[string, number]> = entries.length > 0 ? entries : [["codex-cli", 0]]

  return (
    <div className="flex flex-wrap gap-2">
      {items.map(([cli, amount]) => (
        <span
          key={cli}
          className={cn(
            "flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[0.65rem]",
            isRei
              ? "border-indigo-200 bg-indigo-50 text-indigo-600"
              : "border-indigo-500/50 bg-indigo-900/30 text-indigo-400",
          )}
        >
          <Zap className="mr-1 h-3 w-3 opacity-70" />
          {cli}: {formatTokenAmount(amount)}
        </span>
      ))}
    </div>
  )
}

function formatTokenAmount(amount: number) {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)}m`
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(amount >= 10_000 ? 0 : 1)}k`
  }
  return String(amount)
}

function getTaskProgress(status: string) {
  switch (status) {
    case "DRAFT":
      return 8
    case "CLARIFYING":
      return 16
    case "PLANNING":
    case "PLAN_REVIEW":
      return 32
    case "EXECUTING":
    case "ACTION_REQUIRED":
      return 62
    case "MERGING":
    case "REVIEWING":
      return 84
    case "COMPLETED":
      return 100
    case "PAUSED":
      return 48
    default:
      return 20
  }
}

function TaskStatus({
  status,
  theme,
}: {
  status: string
  theme: ReturnType<typeof getPilotTheme>
}) {
  if (status === "EXECUTING") {
    return <span className={cn("rounded-sm border px-2 py-0.5 font-mono text-xs font-bold tracking-wider", theme.badgeExec)}>[ 执行中 ]</span>
  }
  if (status === "PLAN_REVIEW" || status === "PLANNING") {
    return <span className={cn("rounded-sm border px-2 py-0.5 font-mono text-xs font-bold tracking-wider", theme.badgeWarn.replace("red", "amber").replace("orange", "yellow"))}>[ 计划审阅 ]</span>
  }
  if (status === "PAUSED") {
    return <span className={cn("rounded-sm border px-2 py-0.5 font-mono text-xs tracking-wider", theme.badgeDraft)}>[ 已暂停 ]</span>
  }
  if (status === "COMPLETED") {
    return <span className={cn("rounded-sm border px-2 py-0.5 font-mono text-xs tracking-wider", theme.cleanBg)}>[ 已合并 ]</span>
  }
  return <span className={cn("rounded-sm border px-2 py-0.5 font-mono text-xs tracking-wider", theme.badgeDraft)}>[ {status} ]</span>
}
