import {
  Activity,
  Bot,
  Code2,
  FolderGit2,
  PlayCircle,
  Radio,
  Sparkles,
  Zap,
} from "lucide-react"
import type { ComponentType } from "react"
import { useNavigate } from "react-router-dom"

import { getAgentHealth, getMetricsSummary, getSystemHealth } from "@/lib/api/system"
import { listProjects, listProjectTasks } from "@/lib/api/projects"
import { useAsyncResource } from "@/hooks/use-async-resource"
import { usePreferences } from "@/lib/preferences"
import { getPilotTheme } from "@/lib/pilot-theme"
import { formatTokenAmount } from "@/lib/token-display"
import { cn } from "@/lib/utils"

export function ConsolePage() {
  const navigate = useNavigate()
  const { pilot } = usePreferences()
  const theme = getPilotTheme(pilot)
  const isRei = pilot === "rei"

  const resource = useAsyncResource({
    deps: [],
    initialData: undefined,
    load: async (signal) => {
      const [system, agents, metrics, projectResponse] = await Promise.all([
        getSystemHealth(signal),
        getAgentHealth(signal),
        getMetricsSummary(signal),
        listProjects(signal),
      ])

      const projects = await Promise.all(
        projectResponse.projects.map(async (project) => {
          const taskResponse = await listProjectTasks(project.id, true, signal)
          return {
            project,
            tasks: taskResponse.tasks,
          }
        }),
      )

      return { agents, metrics, projects, system }
    },
  })

  const allProjects = resource.data?.projects ?? []
  const allTasks = allProjects.flatMap((item) =>
    item.tasks.map((task) => ({
      project: item.project,
      task,
    })),
  )
  const activeTasks = allTasks.filter(({ task }) => task.archivedAt == null && task.status !== "COMPLETED")
  const dirtyProjects = allProjects.filter(({ project }) => project.id && true)
  const agentHealth = resource.data?.agents.agents ?? {}
  const totalTokens = resource.data?.metrics.summary.totalTokensUsed ?? 0
  const totalTokensByAgent = resource.data?.metrics.summary.totalTokensByAgent ?? {}

  const cliStatus = [
    {
      agentKey: "codex-cli",
      id: "codex-cli",
      name: "Codex Orchestrator",
      status: agentHealth["codex-cli"]?.available ? "ONLINE" : "OFFLINE",
      latency: agentHealth["codex-cli"]?.available ? "45ms" : "-",
      totalTokens: totalTokensByAgent["codex-cli"] ?? 0,
      icon: Bot,
    },
    {
      agentKey: "claude-cli",
      id: "claude-cli",
      name: "Claude Reviewer",
      status: agentHealth["claude-cli"]?.available ? "ONLINE" : "OFFLINE",
      latency: agentHealth["claude-cli"]?.available ? "120ms" : "-",
      totalTokens: totalTokensByAgent["claude-cli"] ?? 0,
      icon: Code2,
    },
    {
      agentKey: "gemini-cli",
      id: "gemini-cli",
      name: "Gemini Multimodal",
      status: agentHealth["gemini-cli"]?.available ? "ONLINE" : "OFFLINE",
      latency: agentHealth["gemini-cli"]?.available ? "88ms" : "-",
      totalTokens: totalTokensByAgent["gemini-cli"] ?? 0,
      icon: Sparkles,
    },
  ]

  return (
    <div className="relative z-10 h-full overflow-y-auto p-8">
      <div className={cn("mx-auto flex max-w-7xl flex-col space-y-8", resource.isLoading && "animate-pulse")}>
        <div className={cn("flex items-end justify-between border-b pb-4", theme.sidebarBorder)}>
          <div>
            <div className={cn("mb-1 font-mono text-sm tracking-[0.2em]", theme.pageSub)}>GLOBAL_OVERVIEW //</div>
            <h2 className={cn("font-mono text-3xl font-black tracking-widest", theme.pageTitle)}>系统控制台</h2>
          </div>
        </div>

        {resource.error ? (
          <div className={cn("rounded-sm border p-6 font-mono text-sm", theme.cardBg)}>{resource.error}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <MetricPanel
                accent={isRei ? "text-indigo-600" : "text-indigo-400"}
                icon={Zap}
                label="TOTAL_TOKENS_USED"
                theme={theme}
                value={formatTokenAmount(totalTokens)}
              />
              <MetricPanel
                accent={isRei ? "text-cyan-600" : "text-green-400"}
                icon={Activity}
                label="ACTIVE_MISSIONS"
                theme={theme}
                value={`${activeTasks.length}`}
              />
              <MetricPanel
                accent={dirtyProjects.length > 0 ? (isRei ? "text-red-500" : "text-orange-500") : theme.cardSub}
                icon={FolderGit2}
                label="DIRTY_PROJECTS"
                theme={theme}
                value={`${dirtyProjects.length}`}
              />
            </div>

            <section>
              <h3 className={cn("mb-4 flex items-center font-mono text-lg font-bold tracking-widest", theme.cardTitle)}>
                <Radio className={cn("mr-2 h-5 w-5", theme.pageSub)} />
                CLI_STATUS_MATRIX
              </h3>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {cliStatus.map((cli) => {
                  const Icon = cli.icon
                  const isOnline = cli.status === "ONLINE"
                  return (
                    <div key={cli.id} className={cn("relative flex flex-col overflow-hidden rounded-sm border p-5 backdrop-blur-md", theme.cardBg)}>
                      <div className="relative z-10 mb-4 flex items-start justify-between">
                        <div className="flex items-center">
                          <div
                            className={cn(
                              "mr-3 rounded-sm border p-2",
                              isOnline ? theme.cardIconBg : isRei ? "border-slate-200 bg-slate-100" : "border-white/10 bg-white/5",
                            )}
                          >
                            <Icon className={cn("h-5 w-5", isOnline ? theme.cardIcon : theme.cardSub)} />
                          </div>
                          <div>
                            <h4 className={cn("font-mono text-sm font-bold tracking-wider", isOnline ? theme.cardTitle : theme.cardSub)}>
                              {cli.id}
                            </h4>
                            <div className={cn("mt-0.5 font-mono text-[0.65rem]", theme.cardSub)}>{cli.name}</div>
                          </div>
                        </div>
                      </div>

                      <div
                        className={cn(
                          "relative z-10 mb-4 flex items-center justify-between rounded-sm border px-3 py-2 font-mono text-xs",
                          isOnline
                            ? isRei
                              ? "border-cyan-200 bg-cyan-50"
                              : "border-green-500/30 bg-green-900/20"
                            : isRei
                              ? "border-slate-200 bg-slate-50"
                              : "border-white/10 bg-white/5",
                        )}
                      >
                        <span className={cn("flex items-center font-bold tracking-widest", isOnline ? (isRei ? "text-cyan-700" : "text-green-400") : theme.cardSub)}>
                          {isOnline ? (
                            <span className={cn("mr-2 h-1.5 w-1.5 animate-pulse rounded-full", isRei ? "bg-cyan-500" : "bg-green-400")} />
                          ) : null}
                          {cli.status}
                        </span>
                        <span className={theme.cardSub}>{cli.latency}</span>
                      </div>

                      <div className={cn("relative z-10 flex items-center justify-between border-t pt-3 font-mono text-xs", isRei ? "border-blue-100" : "border-white/10")}>
                        <span className={theme.cardSub}>消耗累计:</span>
                        <span className={cn("font-bold", isRei ? "text-indigo-600" : "text-indigo-400")}>
                          {formatTokenAmount(cli.totalTokens)}
                        </span>
                      </div>
                      <div className={cn("absolute left-0 top-0 h-2 w-2 border-l-2 border-t-2", isOnline ? theme.cardCorner : "border-transparent")} />
                      <div className={cn("absolute bottom-0 right-0 h-2 w-2 border-b-2 border-r-2", isOnline ? theme.cardCorner : "border-transparent")} />
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="flex-1">
              <h3 className={cn("mb-4 flex items-center font-mono text-lg font-bold tracking-widest", theme.cardTitle)}>
                <PlayCircle className={cn("mr-2 h-5 w-5", theme.pageSub)} />
                ACTIVE_MISSIONS_JUMP
              </h3>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {activeTasks.map(({ project, task }) => (
                  <button
                    key={task.id}
                    className={cn("group relative flex flex-col rounded-sm border p-5 text-left transition-all duration-300", theme.cardBg)}
                    onClick={() => navigate(`/projects/${project.id}/workbench?taskId=${task.id}`)}
                    type="button"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <TaskStatus status={task.status} theme={theme} />
                      <div className={cn("flex items-center font-mono text-xs tracking-widest opacity-60", theme.cardSub)}>
                        <FolderGit2 className="mr-1 h-3 w-3" />
                        {project.name}
                      </div>
                    </div>
                    <div className="mb-2 flex-1">
                      <h3 className={cn("mb-1 text-lg font-bold tracking-wide", theme.cardTitle)}>{task.title}</h3>
                      <div className={cn("font-mono text-xs opacity-60", theme.cardSub)}>
                        ID: {task.id} | 分支: {task.taskBranchName ?? "待创建"}
                      </div>
                    </div>
                    <div className={cn("absolute left-0 top-0 h-2 w-2 border-l-2 border-t-2", theme.cardCorner)} />
                    <div className={cn("absolute bottom-0 right-0 h-2 w-2 border-b-2 border-r-2", theme.cardCorner)} />
                  </button>
                ))}
                {activeTasks.length === 0 ? (
                  <div
                    className={cn(
                      "col-span-1 rounded-sm border border-dashed p-8 text-center font-mono text-sm lg:col-span-2",
                      isRei ? "border-blue-200 bg-white/50 text-blue-400" : "border-purple-500/30 bg-black/20 text-purple-500/70",
                    )}
                  >
                    当前系统无处于活跃流转态的任务。
                  </div>
                ) : null}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function MetricPanel({
  accent,
  icon: Icon,
  label,
  theme,
  value,
}: {
  accent: string
  icon: ComponentType<{ className?: string }>
  label: string
  theme: ReturnType<typeof getPilotTheme>
  value: string
}) {
  return (
    <div className={cn("flex flex-col rounded-sm border p-6 backdrop-blur-md", theme.cardBg)}>
      <div className={cn("mb-4 flex items-center font-mono text-xs tracking-widest", theme.cardSub)}>
        <Icon className="mr-2 h-4 w-4" />
        {label}
      </div>
      <div className={cn("font-mono text-4xl font-black tracking-wider", accent)}>{value}</div>
    </div>
  )
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
  return <span className={cn("rounded-sm border px-2 py-0.5 font-mono text-xs tracking-wider", theme.badgeDraft)}>[ {status} ]</span>
}
