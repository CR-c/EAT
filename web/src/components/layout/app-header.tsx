import { ChevronRight, FolderPlus, KanbanSquare, Languages, TerminalSquare } from "lucide-react"
import type { ReactNode } from "react"
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom"

import { getProject } from "@/lib/api/projects"
import { getSystemHealth } from "@/lib/api/system"
import { getPlatformContext } from "@/lib/platform"
import { useAsyncResource } from "@/hooks/use-async-resource"
import { usePreferences } from "@/lib/preferences"
import { getPilotTheme, getProjectColor } from "@/lib/pilot-theme"
import { cn } from "@/lib/utils"

export function AppHeader() {
  const location = useLocation()
  const { projectId } = useParams()
  const [searchParams] = useSearchParams()
  const { locale, pilot, setLocale, t } = usePreferences()
  const theme = getPilotTheme(pilot)
  const platform = getPlatformContext()
  const isRei = pilot === "rei"

  const project = useAsyncResource({
    deps: [projectId],
    initialData: undefined,
    load: async (signal) => {
      if (!projectId) {
        return undefined
      }
      const response = await getProject(projectId, signal)
      return response.project
    },
  })

  const system = useAsyncResource({
    deps: [],
    initialData: undefined,
    load: getSystemHealth,
  })

  const selectedTask = searchParams.get("taskId")
  const isTaskCenter = location.pathname.endsWith("/tasks")
  const isCreateTask = location.pathname.endsWith("/tasks/new")
  const isWorkbench = location.pathname.includes("/workbench")

  return (
    <header
      className={cn(
        "relative z-10 flex h-16 items-center justify-between border-b px-6 backdrop-blur-md",
        theme.shell,
        theme.sidebarBorder,
      )}
    >
      <div className="flex min-w-0 items-center">
        {project.data ? (
          <div className="flex min-w-0 items-center font-mono">
            <span className={cn("flex items-center truncate font-bold tracking-wider", theme.pageSub)}>
              <div
                className="mr-2 h-2 w-2 rounded-full"
                style={{ backgroundColor: project.data.color ?? getProjectColor(project.data.id) }}
              />
              {project.data.name}
            </span>
            <ChevronRight className="mx-3 h-4 w-4 text-slate-400" />
            <div
              className={cn(
                "flex items-center space-x-2 rounded-sm border p-1",
                isRei ? "border-blue-200/50 bg-white/50" : "border-purple-900/50 bg-black/50",
              )}
            >
              <HeaderLink active={isTaskCenter} themeClass={isTaskCenter ? theme.tabActive : theme.tabInactive} to={`/projects/${projectId}/tasks`}>
                <TerminalSquare className="mr-2 h-3 w-3" />
                {t("header.taskCenter")}
              </HeaderLink>
              <HeaderLink active={isWorkbench} themeClass={isWorkbench ? theme.tabActive : theme.tabInactive} to={`/projects/${projectId}/workbench${selectedTask ? `?taskId=${selectedTask}` : ""}`}>
                <KanbanSquare className="mr-2 h-3 w-3" />
                {selectedTask ? t("header.workbenchWithTask", { taskId: selectedTask }) : t("header.workbench")}
              </HeaderLink>
              {isCreateTask ? (
                <span className={cn("flex items-center rounded-sm px-4 py-1.5 text-xs tracking-wider", theme.tabActive)}>
                  <FolderPlus className="mr-2 h-3 w-3" />
                  {t("common.publishTask")}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <div className={cn("font-mono text-sm tracking-[0.2em]", theme.pageSub)}>
              {(system.data?.status === "healthy" ? t("header.localFirst") : t("header.systemOffline"))} {t("common.subtitleSlash")}
            </div>
            <div className={cn("font-mono text-2xl font-black tracking-widest", theme.pageTitle)}>
              {location.pathname.startsWith("/settings")
                ? t("header.settingsTitle")
                : location.pathname.startsWith("/projects")
                  ? t("header.projectsTitle")
                  : t("header.consoleTitle")}
            </div>
          </div>
        )}
      </div>

      <div
        className={cn(
          "flex items-center gap-2 rounded-sm border px-3 py-2 font-mono text-xs",
          isRei ? "border-blue-200/50 bg-white/60 text-blue-600" : "border-purple-500/30 bg-black/40 text-purple-300",
        )}
      >
        {platform.kind === "desktop-hosted" ? (
          <div className={cn("rounded-sm border px-2 py-1", theme.pathBg)}>
            desktop {platform.shell ?? "host"}
          </div>
        ) : (
          <div className={cn("rounded-sm border px-2 py-1", theme.pathBg)}>
            web
          </div>
        )}
        <Languages className="h-4 w-4" />
        <button
          className={cn("rounded-sm px-2 py-1 transition-colors", locale === "zh-CN" ? theme.tabActive : theme.tabInactive)}
          onClick={() => setLocale("zh-CN")}
          type="button"
        >
          zh-CN
        </button>
        <button
          className={cn("rounded-sm px-2 py-1 transition-colors", locale === "en" ? theme.tabActive : theme.tabInactive)}
          onClick={() => setLocale("en")}
          type="button"
        >
          en
        </button>
      </div>
    </header>
  )
}

function HeaderLink({
  active,
  children,
  themeClass,
  to,
}: {
  active: boolean
  children: ReactNode
  themeClass: string
  to: string
}) {
  return (
    <Link
      className={cn(
        "flex items-center rounded-sm px-4 py-1.5 text-xs tracking-wider transition-all",
        active && "font-semibold",
        themeClass,
      )}
      to={to}
    >
      {children}
    </Link>
  )
}
