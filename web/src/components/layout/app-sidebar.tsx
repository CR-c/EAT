import { Cpu, FolderGit2, LayoutDashboard, RefreshCw, Settings } from "lucide-react"
import { NavLink } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { usePreferences } from "@/lib/preferences"

const navItems = [
  { to: "/console", icon: LayoutDashboard, key: "console" },
  { to: "/projects", icon: FolderGit2, key: "projects" },
  { to: "/settings", icon: Settings, key: "settings" },
] as const

export function AppSidebar() {
  const { pilot, setPilot, t } = usePreferences()

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-white/45 bg-[var(--app-shell)] px-5 py-6 backdrop-blur-2xl dark:border-white/10">
      <div className="rounded-[2rem] border border-white/40 bg-[var(--app-shell-strong)] p-5 shadow-[0_20px_70px_rgba(56,189,248,0.12)] dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-700 dark:text-cyan-200">
            <Cpu className="h-6 w-6" />
          </div>
          <div>
            <div className="font-heading text-xl font-bold tracking-[0.22em]">{t("appName")}</div>
            <div className="text-xs tracking-[0.28em] text-muted-foreground">{t("localFirst")}</div>
          </div>
        </div>
      </div>

      <nav className="mt-6 grid gap-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-[1.5rem] border px-4 py-3 text-sm font-medium transition-all",
                isActive
                  ? "border-cyan-300/60 bg-white/72 text-foreground shadow-lg dark:border-cyan-400/25 dark:bg-white/8"
                  : "border-transparent text-muted-foreground hover:border-white/40 hover:bg-white/45 hover:text-foreground dark:hover:border-white/10 dark:hover:bg-white/5",
              )
            }
          >
            <item.icon className="h-4 w-4" />
            <span>{t(item.key)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto rounded-[2rem] border border-white/40 bg-[var(--app-shell-strong)] p-4 dark:border-white/10">
        <div className="mb-3 text-xs uppercase tracking-[0.28em] text-muted-foreground">{t("themePilot")}</div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="w-full justify-between rounded-[1.4rem]"
              variant="secondary"
              onClick={() => setPilot(pilot === "rei" ? "shinji" : "rei")}
            >
              <span>{pilot === "rei" ? t("pilotRei") : t("pilotShinji")}</span>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("themePilot")}</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  )
}
