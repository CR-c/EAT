import { FolderGit2, FolderPlus, Search, Trash2, Zap } from "lucide-react"
import { useDeferredValue, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { deleteProject, getProjectRepoStatus, listProjectTasks, listProjects, updateProjectPreferences } from "@/lib/api/projects"
import { useAsyncResource } from "@/hooks/use-async-resource"
import { usePreferences } from "@/lib/preferences"
import { getPilotTheme, getProjectColor } from "@/lib/pilot-theme"
import { cn } from "@/lib/utils"
import { RegisterProjectDialog } from "@/features/projects/components/register-project-dialog"
import { UnregisterProjectDialog } from "@/features/projects/components/unregister-project-dialog"
import { emitProjectRegistryChanged } from "@/lib/project-events"
import { isTaskExecutionTreeActive } from "@/lib/task-view"
import type { ProjectRecord, RepoStatus } from "@/lib/types"

interface ProjectViewModel {
  activeTaskCount: number
  allTaskCount: number
  project: ProjectRecord
  repoStatus?: RepoStatus
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
    <div className="mt-3 flex flex-wrap gap-2">
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

export function ProjectsPage() {
  const navigate = useNavigate()
  const { pilot } = usePreferences()
  const theme = getPilotTheme(pilot)
  const isRei = pilot === "rei"
  const [query, setQuery] = useState("")
  const [registerOpen, setRegisterOpen] = useState(false)
  const [projectPendingUnregister, setProjectPendingUnregister] = useState<ProjectViewModel | null>(null)
  const deferredQuery = useDeferredValue(query)

  const resource = useAsyncResource({
    deps: [],
    initialData: undefined,
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

  const filtered = useMemo(
    () =>
      (resource.data ?? []).filter(({ project }) =>
        project.name.toLowerCase().includes(deferredQuery.trim().toLowerCase()),
      ),
    [deferredQuery, resource.data],
  )

  async function handleTogglePin(project: ProjectRecord) {
    const nextPinned = !project.isPinned
    const nextPinnedOrder = project.isPinned
      ? null
      : Math.max(
          0,
          ...((resource.data ?? [])
            .filter((item) => item.project.isPinned)
            .map((item) => item.project.pinnedOrder ?? 0)),
        ) + 1

    resource.setData((current) =>
      current?.map((item) =>
        item.project.id === project.id
          ? {
              ...item,
              project: {
                ...item.project,
                isPinned: nextPinned,
                pinnedOrder: nextPinnedOrder,
              },
            }
          : item,
      ),
    )

    await updateProjectPreferences(project.id, {
      color: project.color ?? getProjectColor(project.id),
      isPinned: nextPinned,
      pinnedOrder: nextPinnedOrder,
    })
    emitProjectRegistryChanged()
    resource.reload()
  }

  return (
    <>
      <RegisterProjectDialog open={registerOpen} onOpenChange={setRegisterOpen} onRegistered={resource.reload} />
      <UnregisterProjectDialog
        onConfirm={async () => {
          if (!projectPendingUnregister) {
            return
          }
          await deleteProject(projectPendingUnregister.project.id)
          emitProjectRegistryChanged()
          setProjectPendingUnregister(null)
          resource.reload()
        }}
        onOpenChange={(open) => {
          if (!open) {
            setProjectPendingUnregister(null)
          }
        }}
        open={Boolean(projectPendingUnregister)}
        projectName={projectPendingUnregister?.project.name ?? ""}
        taskCount={projectPendingUnregister?.allTaskCount ?? 0}
      />

      <div className="relative z-10 h-full overflow-y-auto p-8">
        <div className="mx-auto flex max-w-7xl flex-col">
          <div className={cn("mb-10 flex flex-col space-y-4 border-b pb-4 sm:flex-row sm:items-end sm:justify-between sm:space-y-0", theme.sidebarBorder)}>
            <div>
              <div className={cn("mb-1 font-mono text-sm tracking-[0.2em]", theme.pageSub)}>目标选择 //</div>
              <h2 className={cn("font-mono text-3xl font-black tracking-widest", theme.pageTitle)}>本地项目库</h2>
            </div>
            <div className="flex items-center space-x-4">
              <div className="group relative w-full sm:w-64">
                <Search className={cn("absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors", isRei ? "text-blue-400 group-focus-within:text-cyan-500" : "text-purple-500 group-focus-within:text-green-400")} />
                <input
                  className={cn("w-full rounded-sm border py-2 pl-9 pr-4 font-mono text-sm outline-none transition-all", theme.inputBg)}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="检索项目名称..."
                  type="text"
                  value={query}
                />
              </div>
              <button
                className={cn("flex shrink-0 items-center rounded-sm border px-5 py-2 font-mono text-sm transition-all", theme.actionBtn)}
                onClick={() => setRegisterOpen(true)}
                type="button"
              >
                <FolderPlus className="mr-2 h-4 w-4" />
                注册新项目
              </button>
            </div>
          </div>

          {resource.error ? (
            <div className={cn("rounded-sm border p-6 font-mono text-sm", theme.cardBg)}>{resource.error}</div>
          ) : (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              {filtered.map((item) => {
                const color = item.project.color ?? getProjectColor(item.project.id)
                const dirty = item.repoStatus?.isDirty ?? false
                const tokenUsage = item.project.tokens
                return (
                  <button
                    key={item.project.id}
                    className={cn("group relative flex flex-col overflow-hidden rounded-sm border p-6 text-left transition-all duration-500 hover:-translate-y-1", theme.cardBg)}
                    onClick={() => navigate(`/projects/${item.project.id}/tasks`)}
                    type="button"
                  >
                    <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 bg-gradient-to-bl from-blue-500/10 to-transparent" />
                    <div className="relative z-10 mb-6 flex items-start justify-between">
                      <div className="flex items-start">
                        <div className={cn("rounded-sm border p-2.5 transition-colors", theme.cardIconBg)}>
                          <FolderGit2 className={cn("h-6 w-6 transition-colors", theme.cardIcon)} />
                        </div>
                        <div className="ml-4">
                          <h3 className={cn("flex items-center text-xl font-bold tracking-wide", theme.cardTitle)}>
                            <div className="mr-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                            {item.project.name}
                          </h3>
                          <div className={cn("mt-1 font-mono text-xs", theme.cardSub)}>系统编号: {item.project.id}</div>
                        </div>
                      </div>
                      {dirty ? (
                        <div className={cn("flex items-center rounded-sm border px-2 py-1", theme.dirtyBg)}>
                          <span className="relative mr-2 flex h-2 w-2">
                            <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", theme.dirtyPing)} />
                            <span className={cn("relative inline-flex h-2 w-2 rounded-full", theme.dirtyDot)} />
                          </span>
                          <span className={cn("font-mono text-[0.6rem] tracking-widest", theme.dirtyText)}>未提交</span>
                        </div>
                      ) : (
                        <div className={cn("shrink-0 rounded-sm px-2 py-1 font-mono text-[0.6rem] tracking-widest", theme.cleanBg)}>
                          已同步
                        </div>
                      )}
                    </div>

                    <div className={cn("mb-6 truncate rounded-sm border p-2 font-mono text-xs", theme.pathBg)} title={item.project.path}>
                      <span className={cn("mr-2", theme.pathLabel)}>路径:</span>
                      {item.project.path}
                    </div>

                    <div className="relative z-10 mb-6">
                      <TokenUsageBadges isRei={isRei} tokens={tokenUsage} />
                    </div>

                    <div className={cn("relative z-10 mt-auto flex items-center justify-between border-t pt-4 font-mono text-xs", isRei ? "border-blue-100" : "border-white/10")}>
                      <div className={cn("flex items-center", theme.cardSub)}>
                        <span className={cn("mr-2", theme.pathLabel)}>基线:</span>
                        <span className={cn("rounded-sm px-2 py-0.5", theme.branchBg)}>
                          {item.project.defaultBranch || item.repoStatus?.defaultBranch || "main"}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className={cn("rounded-sm border px-2 py-0.5", item.activeTaskCount > 0 ? theme.taskBg : theme.cleanBg)}>
                          活跃任务: {item.activeTaskCount}
                        </div>
                        <button
                          className={cn(
                            "rounded-sm border px-3 py-1 font-mono text-[0.65rem] transition-colors",
                            item.project.isPinned
                              ? isRei
                                ? "border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200"
                                : "border-orange-500/50 bg-orange-500/20 text-orange-400 hover:bg-orange-500/40"
                              : theme.btnGhost,
                          )}
                          onClick={(event) => {
                            event.stopPropagation()
                            void handleTogglePin(item.project)
                          }}
                          type="button"
                        >
                          {item.project.isPinned ? "取消标记" : "标 记"}
                        </button>
                        <button
                          className={cn("rounded-sm p-1 transition-colors", theme.btnDanger)}
                          onClick={(event) => {
                            event.stopPropagation()
                            setProjectPendingUnregister(item)
                          }}
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className={cn("absolute left-0 top-0 h-2 w-2 border-l-2 border-t-2", theme.cardCorner)} />
                    <div className={cn("absolute bottom-0 right-0 h-2 w-2 border-b-2 border-r-2", theme.cardCorner)} />
                  </button>
                )
              })}

              {!resource.isLoading && filtered.length === 0 ? (
                <div className={cn("col-span-1 rounded-sm border border-dashed p-8 text-center font-mono text-sm lg:col-span-2", isRei ? "border-blue-200 bg-white/50 text-blue-400" : "border-purple-500/30 bg-black/20 text-purple-500/70")}>
                  未发现符合条件的项目记录。
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
