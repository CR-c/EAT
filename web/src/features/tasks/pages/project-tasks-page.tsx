import { FolderPlus, Search } from "lucide-react"
import { useDeferredValue, useState } from "react"
import { useParams } from "react-router-dom"

import { getProject, listProjectTasks } from "@/lib/api/projects"
import { archiveTask, deleteTask, pauseTask, resumeTask } from "@/lib/api/tasks"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAsyncResource } from "@/hooks/use-async-resource"
import { usePreferences } from "@/lib/preferences"
import { CreateTaskDialog } from "@/features/tasks/components/create-task-dialog"
import { TaskActionDialog } from "@/features/tasks/components/task-action-dialog"
import { TaskCard } from "@/features/tasks/components/task-card"
import { isTaskArchived, isTaskOperational } from "@/lib/task-view"
import type { TaskRecord } from "@/lib/types"

type TaskFilter = "all" | "active" | "archived"
type TaskActionMode = "archive" | "delete" | "pause" | "resume" | "blocked"

export function ProjectTasksPage() {
  const { projectId = "" } = useParams()
  const { t } = usePreferences()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<TaskFilter>("active")
  const [createOpen, setCreateOpen] = useState(false)
  const [taskAction, setTaskAction] = useState<{ mode: TaskActionMode; task: TaskRecord } | null>(null)
  const deferredQuery = useDeferredValue(query)

  const project = useAsyncResource({
    deps: [projectId],
    load: async (signal) => getProject(projectId, signal),
  })

  const tasks = useAsyncResource({
    deps: [projectId],
    load: async (signal) => listProjectTasks(projectId, true, signal),
  })

  const filtered = (tasks.data?.tasks ?? []).filter((task) => {
    const haystack = `${task.id} ${task.title}`.toLowerCase()
    const matchesSearch = haystack.includes(deferredQuery.trim().toLowerCase())
    const matchesFilter =
      filter === "all" || (filter === "archived" ? isTaskArchived(task) : !isTaskArchived(task))
    return matchesSearch && matchesFilter
  })

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
      {project.data?.project ? (
        <CreateTaskDialog
          open={createOpen}
          onCreated={tasks.reload}
          onOpenChange={setCreateOpen}
          project={project.data.project}
          repoStatus={project.data.repoStatus}
        />
      ) : null}

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

      <div className="grid h-full gap-6">
        <Card>
          <CardHeader className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-sm uppercase tracking-[0.28em] text-cyan-700/75 dark:text-cyan-200/80">
                {t("tasksSubtitle")}
              </div>
              <CardTitle className="text-4xl">{t("tasksTitle")}</CardTitle>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
              <div className="relative min-w-[280px]">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-11"
                  placeholder={t("taskSearch")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <Button className="rounded-[1.4rem]" onClick={() => setCreateOpen(true)}>
                <FolderPlus className="h-4 w-4" />
                {t("newTask")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <Tabs value={filter} onValueChange={(value) => setFilter(value as TaskFilter)}>
              <TabsList>
                <TabsTrigger value="all">{t("allTasks")}</TabsTrigger>
                <TabsTrigger value="active">{t("activeTasks")}</TabsTrigger>
                <TabsTrigger value="archived">{t("archivedTasks")}</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="text-sm text-muted-foreground">
              {project.data?.project.path ?? project.error ?? t("loading")}
            </div>
          </CardContent>
        </Card>

        <ScrollArea className="min-h-0">
          {tasks.isLoading ? (
            <div className="grid gap-5 pr-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-[320px]" />
              ))}
            </div>
          ) : tasks.error ? (
            <Card>
              <CardContent className="pt-6">
                <div className="mb-3 text-sm text-red-600 dark:text-red-300">{tasks.error}</div>
                <Button variant="secondary" onClick={tasks.reload}>
                  {t("retry")}
                </Button>
              </CardContent>
            </Card>
          ) : filtered.length ? (
            <div className="grid gap-5 pr-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((task) => (
                <TaskCard key={task.id} onAction={openAction} projectId={projectId} task={task} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">{t("noTasks")}</CardContent>
            </Card>
          )}
        </ScrollArea>
      </div>
    </>
  )
}
