import { Activity, Bot, FolderGit2, PlayCircle, Radio, Sparkles, Zap } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { listProjects, listProjectTasks } from "@/lib/api/projects"
import { getAgentHealth, getMetricsSummary, getSystemHealth } from "@/lib/api/system"
import { getTaskStatusLabel } from "@/lib/i18n"
import { useAsyncResource } from "@/hooks/use-async-resource"
import { usePreferences } from "@/lib/preferences"
import { getPilotTheme } from "@/lib/pilot-theme"
import { formatTokenAmount } from "@/lib/token-display"
import { cn } from "@/lib/utils"

export function ConsolePage() {
  const navigate = useNavigate()
  const { locale, pilot, t } = usePreferences()
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
  const agentHealth = resource.data?.agents.agents ?? {}
  const totalTokens = resource.data?.metrics.summary.totalTokensUsed ?? 0

  const cliStatus = [
    {
      id: "codex-cli",
      status: agentHealth["codex-cli"]?.available ? t("common.online") : t("common.offline"),
      latency: agentHealth["codex-cli"]?.available ? "45ms" : "-",
      icon: Bot,
    },
    {
      id: "claude-cli",
      status: agentHealth["claude-cli"]?.available ? t("common.online") : t("common.offline"),
      latency: agentHealth["claude-cli"]?.available ? "120ms" : "-",
      icon: Radio,
    },
    {
      id: "gemini-cli",
      status: agentHealth["gemini-cli"]?.available ? t("common.online") : t("common.offline"),
      latency: agentHealth["gemini-cli"]?.available ? "88ms" : "-",
      icon: Sparkles,
    },
  ]

  return (
    <div className="relative z-10 h-full overflow-y-auto p-8">
      <div className={cn("mx-auto flex max-w-7xl flex-col space-y-8", resource.isLoading && "animate-pulse")}>
        <div className={cn("flex flex-col justify-between space-y-4 border-b pb-4 md:flex-row md:items-end md:space-y-0", theme.sidebarBorder)}>
          <div>
            <div className={cn("mb-1 font-mono text-sm tracking-[0.2em]", theme.pageSub)}>
              {t("console.subtitle")} {t("common.subtitleSlash")}
            </div>
            <h2 className={cn("font-mono text-3xl font-black tracking-widest", theme.pageTitle)}>{t("console.title")}</h2>
          </div>

          <div className="flex flex-col items-start space-y-2 md:items-end">
            <div className={cn("flex flex-wrap items-center gap-3 rounded-sm border px-3 py-1.5 font-mono text-xs", isRei ? "border-blue-200 bg-white/50" : "border-purple-500/30 bg-black/40")}>
              <span className={cn("flex items-center", isRei ? "text-indigo-600" : "text-indigo-400")}>
                <Zap className="mr-1 h-3.5 w-3.5" />
                {formatTokenAmount(totalTokens)}
              </span>
              <span className="opacity-30">|</span>
              <span className={cn("flex items-center", isRei ? "text-cyan-600" : "text-green-400")}>
                <Activity className="mr-1 h-3.5 w-3.5" />
                {t("common.taskCount", { count: activeTasks.length })}
              </span>
              <span className="opacity-30">|</span>
              <span className={cn("flex items-center", theme.cardSub)}>
                <FolderGit2 className="mr-1 h-3.5 w-3.5" />
                {t("common.projectCount", { count: allProjects.length })}
              </span>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[0.65rem]">
              {cliStatus.map((cli) => {
                const online = cli.status === t("common.online")
                const Icon = cli.icon
                return (
                  <span key={cli.id} className={cn("flex items-center", online ? (isRei ? "text-cyan-700" : "text-green-400") : theme.cardSub)}>
                    <span className={cn("mr-1.5 h-1.5 w-1.5 rounded-full", online ? (isRei ? "animate-pulse bg-cyan-500" : "animate-pulse bg-green-400") : "bg-slate-500")} />
                    <Icon className="mr-1 h-3 w-3" />
                    {cli.id} ({online ? cli.latency : cli.status})
                  </span>
                )
              })}
            </div>
          </div>
        </div>

        {resource.error ? (
          <div className={cn("rounded-sm border p-6 font-mono text-sm", theme.cardBg)}>{resource.error}</div>
        ) : (
          <section className="flex-1">
            <h3 className={cn("mb-4 flex items-center font-mono text-lg font-bold tracking-widest", theme.cardTitle)}>
              <PlayCircle className={cn("mr-2 h-5 w-5", theme.pageSub)} />
              {t("console.activeZone")}
            </h3>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
              {activeTasks.map(({ project, task }) => (
                <button
                  key={task.id}
                  className={cn("group relative flex flex-col rounded-sm border p-5 text-left transition-all duration-300", theme.cardBg)}
                  onClick={() => navigate(`/projects/${project.id}/workbench?taskId=${task.id}`)}
                  type="button"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <TaskStatus locale={locale} status={task.status} theme={theme} />
                    <div className={cn("flex items-center font-mono text-xs tracking-widest opacity-60", theme.cardSub)}>
                      <FolderGit2 className="mr-1 h-3 w-3" />
                      {project.name}
                    </div>
                  </div>
                  <div className="mb-2 flex-1">
                    <h3 className={cn("mb-1 text-lg font-bold tracking-wide", theme.cardTitle)}>{task.title}</h3>
                    <div className={cn("font-mono text-xs opacity-60", theme.cardSub)}>
                      ID: {task.id} | {t("common.branch")}: {task.taskBranchName ?? t("common.pending")}
                    </div>
                  </div>
                  <div className={cn("absolute left-0 top-0 h-2 w-2 border-l-2 border-t-2", theme.cardCorner)} />
                  <div className={cn("absolute bottom-0 right-0 h-2 w-2 border-b-2 border-r-2", theme.cardCorner)} />
                </button>
              ))}
              {activeTasks.length === 0 ? (
                <div
                  className={cn(
                    "col-span-full rounded-sm border border-dashed p-8 text-center font-mono text-sm",
                    isRei ? "border-blue-200 bg-white/50 text-blue-400" : "border-purple-500/30 bg-black/20 text-purple-500/70",
                  )}
                >
                  {t("console.noActiveTasks")}
                </div>
              ) : null}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function TaskStatus({
  locale,
  status,
  theme,
}: {
  locale: "zh-CN" | "en"
  status: string
  theme: ReturnType<typeof getPilotTheme>
}) {
  const label = getTaskStatusLabel(locale, status)

  if (status === "EXECUTING") {
    return <span className={cn("rounded-sm border px-2 py-0.5 font-mono text-xs font-bold tracking-wider", theme.badgeExec)}>[ {label} ]</span>
  }
  if (status === "PLAN_REVIEW" || status === "PLANNING") {
    return <span className={cn("rounded-sm border px-2 py-0.5 font-mono text-xs font-bold tracking-wider", theme.badgeWarn.replace("red", "amber").replace("orange", "yellow"))}>[ {label} ]</span>
  }
  if (status === "PAUSED") {
    return <span className={cn("rounded-sm border px-2 py-0.5 font-mono text-xs tracking-wider", theme.badgeDraft)}>[ {label} ]</span>
  }
  if (status === "COMPLETED") {
    return <span className={cn("rounded-sm border px-2 py-0.5 font-mono text-xs tracking-wider", theme.cleanBg)}>[ {label} ]</span>
  }

  return <span className={cn("rounded-sm border px-2 py-0.5 font-mono text-xs tracking-wider", theme.badgeDraft)}>[ {label} ]</span>
}
