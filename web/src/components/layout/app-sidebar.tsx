import {
  ChevronDown,
  FolderGit2,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  Triangle,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom"

import { listProjects } from "@/lib/api/projects"
import { useAsyncResource } from "@/hooks/use-async-resource"
import { getPilotTitle } from "@/lib/i18n"
import { subscribeProjectRegistryChanged } from "@/lib/project-events"
import { usePreferences } from "@/lib/preferences"
import { getPilotTheme, getProjectColor } from "@/lib/pilot-theme"
import type { ProjectRecord } from "@/lib/types"
import { cn } from "@/lib/utils"

const sidebarOpenStorageKey = "eat.web.sidebar.open"

const navItems = [
  { key: "console", to: "/console", icon: LayoutDashboard },
  { key: "projects", to: "/projects", icon: FolderGit2 },
] as const

function getStoredSidebarOpen() {
  return window.localStorage.getItem(sidebarOpenStorageKey) !== "0"
}

export function AppSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { projectId } = useParams()
  const { locale, pilot, setPilot, t } = usePreferences()
  const theme = getPilotTheme(pilot)
  const isRei = pilot === "rei"
  const [isSidebarOpen, setIsSidebarOpen] = useState(getStoredSidebarOpen)
  const [isProjectsMenuExpanded, setIsProjectsMenuExpanded] = useState(true)

  const projects = useAsyncResource({
    deps: [],
    initialData: [],
    load: async (signal) => {
      const response = await listProjects(signal)
      return response.projects
    },
  })
  const allProjects = useMemo(() => {
    const uniqueProjects = new Map<string, ProjectRecord>()
    for (const project of projects.data ?? []) {
      uniqueProjects.set(project.id, project)
    }
    return Array.from(uniqueProjects.values())
  }, [projects.data])

  useEffect(() => {
    window.localStorage.setItem(sidebarOpenStorageKey, isSidebarOpen ? "1" : "0")
  }, [isSidebarOpen])

  useEffect(() => subscribeProjectRegistryChanged(projects.reload), [projects.reload])

  const pinnedProjects = useMemo(() => {
    return allProjects
      .filter((project) => project.isPinned)
      .sort((left, right) => (left.pinnedOrder ?? Number.MAX_SAFE_INTEGER) - (right.pinnedOrder ?? Number.MAX_SAFE_INTEGER))
  }, [allProjects])

  function handleProjectsTrigger() {
    if (isSidebarOpen) {
      setIsProjectsMenuExpanded(true)
      navigate("/projects")
      return
    }

    setIsProjectsMenuExpanded((current) => {
      const next = !current
      if (next && !location.pathname.startsWith("/projects")) {
        navigate("/projects")
      }
      return next
    })
  }

  return (
    <aside
      className={cn(
        "relative z-20 flex h-screen shrink-0 flex-col border-r backdrop-blur-xl transition-all duration-300 ease-in-out",
        isSidebarOpen ? "w-64" : "w-20",
        theme.sidebar,
        theme.sidebarBorder,
      )}
    >
      <button
        className={cn(
          "absolute -right-3.5 top-8 z-30 rounded-full border p-1 shadow-md transition-all",
          isRei
            ? "border-blue-200 bg-white text-blue-500 hover:bg-blue-50"
            : "border-purple-500 bg-black text-purple-400 hover:bg-purple-900/50",
        )}
        onClick={() => setIsSidebarOpen((current) => !current)}
        type="button"
      >
        {isSidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
      </button>

      <div
        className={cn(
          "relative flex h-20 flex-col justify-center overflow-hidden border-b transition-colors duration-500",
          isSidebarOpen ? "px-6" : "items-center px-0",
          theme.sidebarBorder,
        )}
      >
        <div
          className="absolute right-0 top-0 h-full w-16"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg,transparent,transparent 4px,${theme.gridLines} 4px,${theme.gridLines} 8px)`,
          }}
        />
        <div className={cn("z-10 flex items-center font-black tracking-widest", theme.logo, isSidebarOpen ? "text-2xl" : "text-xl")}>
          <Triangle className={cn("h-6 w-6", isSidebarOpen && "mr-2", theme.logoIcon)} />
          {isSidebarOpen ? <span>E.A.T.</span> : null}
        </div>
        {isSidebarOpen ? (
          <div className={cn("z-10 mt-1 whitespace-nowrap font-mono text-[0.65rem] tracking-widest", theme.logoSub)}>
            {t("header.localFirst")}
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "relative z-10 flex-1 overflow-y-auto py-6 font-mono text-sm",
          isSidebarOpen ? "space-y-2 px-4" : "space-y-2 px-2",
        )}
      >
        {isSidebarOpen ? (
          <div className={cn("mb-2 pl-2 text-[10px] tracking-widest", theme.sysMenu)}>
            {t("nav.systemMenu")} {t("common.subtitleSlash")}
          </div>
        ) : null}

        {navItems.map((item) =>
          item.key === "projects" ? (
            <div key={item.key} className="pt-2">
              <div
                className={cn(
                  "flex w-full items-center justify-between rounded-sm border transition-all duration-300",
                  location.pathname.startsWith("/projects") ? theme.menuActive : theme.menuInactive,
                )}
              >
                <NavLink
                  className={cn(
                    "flex flex-1 items-center py-3",
                    isSidebarOpen ? "justify-start px-4" : "justify-center px-0",
                  )}
                  onClick={(event) => {
                    event.preventDefault()
                    handleProjectsTrigger()
                  }}
                  to={item.to}
                >
                  <item.icon className={cn("h-4 w-4", isSidebarOpen && "mr-3")} />
                  {isSidebarOpen ? <span>{t(`nav.${item.key}`)}</span> : null}
                </NavLink>
                {isSidebarOpen ? (
                  <button
                    className={cn("py-3 pl-2 pr-4 transition-colors hover:text-current", !isProjectsMenuExpanded && "opacity-50")}
                    onClick={() => setIsProjectsMenuExpanded((current) => !current)}
                    type="button"
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform", !isProjectsMenuExpanded && "-rotate-90")} />
                  </button>
                ) : null}
              </div>

              <div className={cn("mt-1 space-y-1 overflow-hidden", !isProjectsMenuExpanded && "hidden")}>
                {pinnedProjects.map((project) => {
                  const isSelected = project?.id === projectId
                  if (!project) {
                    return null
                  }
                  const color = project.color ?? getProjectColor(project.id)
                  return (
                    <button
                      key={project.id}
                      className={cn(
                        "group flex w-full items-center py-2 transition-all duration-200",
                        isSidebarOpen ? "justify-start px-6" : "justify-center px-0",
                        isSelected ? (isRei ? "bg-blue-50/50" : "bg-white/5") : "hover:bg-white/5",
                      )}
                      onClick={() => navigate(`/projects/${project.id}/tasks`)}
                      title={!isSidebarOpen ? project.name : undefined}
                      type="button"
                    >
                      {isSidebarOpen ? (
                        <>
                          <div
                            className={cn(
                              "h-2.5 w-2.5 shrink-0 rounded-full transition-transform",
                              isSelected && "scale-125 ring-2 ring-offset-1",
                            )}
                            style={{ backgroundColor: color }}
                          />
                          <span
                            className={cn(
                              "ml-3 truncate text-[0.75rem] font-mono transition-colors",
                              isSelected
                                ? isRei
                                  ? "font-bold text-blue-700"
                                  : "font-bold text-purple-300"
                                : theme.cardSub,
                            )}
                          >
                            {project.name}
                          </span>
                        </>
                      ) : (
                        <div
                          className="flex h-7 w-7 items-center justify-center rounded-sm border text-[0.65rem] font-bold shadow-sm transition-transform group-hover:scale-110"
                          style={{ backgroundColor: `${color}20`, borderColor: `${color}50`, color }}
                        >
                          {project.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <NavLink
              key={item.key}
              className={({ isActive }) =>
                cn(
                  "flex w-full items-center rounded-sm border py-3 transition-all duration-300",
                  isSidebarOpen ? "justify-start px-4" : "justify-center px-0",
                  isActive ? theme.menuActive : theme.menuInactive,
                )
              }
              title={item.key}
              to={item.to}
            >
              <item.icon className={cn("h-4 w-4", isSidebarOpen && "mr-3")} />
              {isSidebarOpen ? <span>{t(`nav.${item.key}`)}</span> : null}
            </NavLink>
          ),
        )}
      </div>

      <div className={cn("z-10 flex flex-col space-y-2 border-t p-4 font-mono", theme.sidebarBorder)}>
        <button
          className={cn(
            "flex w-full items-center justify-center rounded-sm border py-2.5 transition-all",
            isRei
              ? "border-blue-300 bg-white/80 text-blue-600 hover:bg-blue-50"
              : "border-purple-500/50 bg-black/50 text-purple-400 hover:bg-purple-900/30",
          )}
          onClick={() => setPilot(isRei ? "shinji" : "rei")}
          title={t("pilot.toggleTo", { pilot: getPilotTitle(locale, isRei ? "shinji" : "rei") })}
          type="button"
        >
          <RefreshCw className={cn("h-4 w-4", isSidebarOpen && "mr-2")} />
          {isSidebarOpen ? <span className="text-xs">PILOT: {getPilotTitle(locale, pilot)}</span> : null}
        </button>
        <NavLink
          className={({ isActive }) =>
            cn(
              "flex w-full items-center rounded-sm border py-3 transition-all duration-300",
              isSidebarOpen ? "justify-start px-4" : "justify-center px-0",
              isActive ? theme.menuActive : theme.menuInactive,
            )
          }
          title={t("nav.settings")}
          to="/settings"
        >
          <Settings className={cn("h-4 w-4", isSidebarOpen && "mr-3")} />
          {isSidebarOpen ? <span>{t("nav.settings")}</span> : null}
        </NavLink>
      </div>
    </aside>
  )
}
