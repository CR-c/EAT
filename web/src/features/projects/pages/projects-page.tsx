import { FolderPlus, Search } from "lucide-react"
import { useDeferredValue, useState } from "react"

import { deleteProject, getProjectRepoStatus, listProjectTasks, listProjects } from "@/lib/api/projects"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { useAsyncResource } from "@/hooks/use-async-resource"
import { usePreferences } from "@/lib/preferences"
import { ProjectCard } from "@/features/projects/components/project-card"
import { RegisterProjectDialog } from "@/features/projects/components/register-project-dialog"
import { UnregisterProjectDialog } from "@/features/projects/components/unregister-project-dialog"
import { isTaskExecutionTreeActive } from "@/lib/task-view"
import type { ProjectRecord, RepoStatus } from "@/lib/types"

interface ProjectViewModel {
  activeTaskCount: number
  allTaskCount: number
  project: ProjectRecord
  repoStatus?: RepoStatus
}

export function ProjectsPage() {
  const { t } = usePreferences()
  const [query, setQuery] = useState("")
  const [registerOpen, setRegisterOpen] = useState(false)
  const [projectPendingUnregister, setProjectPendingUnregister] = useState<ProjectViewModel | null>(null)
  const deferredQuery = useDeferredValue(query)

  const resource = useAsyncResource({
    deps: [],
    load: async (signal) => {
      const { projects } = await listProjects(signal)
      const enriched = await Promise.all(
        projects.map(async (project) => {
          const [repoStatusResponse, taskResponse] = await Promise.all([
            getProjectRepoStatus(project.id, signal),
            listProjectTasks(project.id, true, signal),
          ])

          return {
            activeTaskCount: taskResponse.tasks.filter(isTaskExecutionTreeActive).length,
            allTaskCount: taskResponse.tasks.length,
            project,
            repoStatus: repoStatusResponse.repoStatus,
          } satisfies ProjectViewModel
        }),
      )

      return enriched
    },
  })

  const filtered = (resource.data ?? []).filter(({ project }) =>
    project.name.toLowerCase().includes(deferredQuery.trim().toLowerCase()),
  )

  return (
    <>
      <RegisterProjectDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onRegistered={resource.reload}
      />
      <UnregisterProjectDialog
        open={Boolean(projectPendingUnregister)}
        onOpenChange={(open) => {
          if (!open) {
            setProjectPendingUnregister(null)
          }
        }}
        onConfirm={async () => {
          if (!projectPendingUnregister) {
            return
          }
          await deleteProject(projectPendingUnregister.project.id)
          setProjectPendingUnregister(null)
          resource.reload()
        }}
        projectName={projectPendingUnregister?.project.name ?? ""}
        taskCount={projectPendingUnregister?.allTaskCount ?? 0}
      />

      <div className="grid h-full gap-6">
        <Card>
          <CardHeader className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-sm uppercase tracking-[0.28em] text-cyan-700/75 dark:text-cyan-200/80">
                {t("projectsSubtitle")}
              </div>
              <CardTitle className="text-4xl">{t("projectsTitle")}</CardTitle>
              <CardDescription className="mt-2">
                React Router drives the prototype, while data comes from the Go backend.
              </CardDescription>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
              <div className="relative min-w-[280px]">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-11"
                  placeholder={t("projectSearch")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <Button className="rounded-[1.4rem]" onClick={() => setRegisterOpen(true)}>
                <FolderPlus className="h-4 w-4" />
                {t("registerProject")}
              </Button>
            </div>
          </CardHeader>
        </Card>

        <ScrollArea className="min-h-0">
          {resource.isLoading ? (
            <div className="grid gap-5 pr-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-[320px]" />
              ))}
            </div>
          ) : resource.error ? (
            <Card>
              <CardContent className="pt-6">
                <div className="mb-3 text-sm text-red-600 dark:text-red-300">{resource.error}</div>
                <Button variant="secondary" onClick={resource.reload}>
                  {t("retry")}
                </Button>
              </CardContent>
            </Card>
          ) : filtered.length ? (
            <div className="grid gap-5 pr-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((item) => (
                <ProjectCard
                  key={item.project.id}
                  activeTaskCount={item.activeTaskCount}
                  onUnregister={() => setProjectPendingUnregister(item)}
                  project={item.project}
                  repoStatus={item.repoStatus}
                  totalTaskCount={item.allTaskCount}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">{t("noProjects")}</CardContent>
            </Card>
          )}
        </ScrollArea>
      </div>
    </>
  )
}
