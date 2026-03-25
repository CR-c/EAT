import { Cpu, Languages } from "lucide-react"
import { Link, useLocation, useParams } from "react-router-dom"

import { getProject } from "@/lib/api/projects"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useAsyncResource } from "@/hooks/use-async-resource"
import { usePreferences } from "@/lib/preferences"
import { getSystemHealth } from "@/lib/api/system"

export function AppHeader() {
  const location = useLocation()
  const { projectId } = useParams()
  const { locale, pilot, setLocale, setPilot, t } = usePreferences()

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
    load: getSystemHealth,
  })

  const title = location.pathname.startsWith("/projects")
    ? t("projects")
    : location.pathname.startsWith("/settings")
      ? t("settings")
      : t("console")

  return (
    <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-white/45 bg-[var(--app-shell)] px-8 backdrop-blur-2xl dark:border-white/10">
      <div className="min-w-0">
        {project.data ? (
          <div className="space-y-2">
            <div className="font-heading text-2xl font-semibold tracking-tight">{project.data.name}</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                asChild
                size="sm"
                variant={location.pathname.endsWith("/tasks") ? "default" : "secondary"}
              >
                <Link to={`/projects/${projectId}/tasks`}>{t("taskCenter")}</Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant={location.pathname.includes("/workbench") ? "default" : "secondary"}
              >
                <Link to={`/projects/${projectId}/workbench`}>{t("workbench")}</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-sm uppercase tracking-[0.28em] text-cyan-700/80 dark:text-cyan-200/80">
              {t("localFirst")}
            </div>
            <div className="font-heading text-3xl font-semibold tracking-tight">{title}</div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden rounded-full border border-white/45 bg-white/55 px-4 py-2 text-sm text-muted-foreground backdrop-blur-xl dark:border-white/10 dark:bg-white/6 lg:flex lg:items-center lg:gap-2">
          <Cpu className="h-4 w-4" />
          <span>
            {system.data?.docker.available ? t("dockerReady") : t("dockerOffline")}
          </span>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-white/45 bg-white/55 p-1.5 backdrop-blur-xl dark:border-white/10 dark:bg-white/6">
          <Languages className="ml-2 h-4 w-4 text-muted-foreground" />
          <Select value={locale} onValueChange={(value) => setLocale(value as "zh-CN" | "en")}>
            <SelectTrigger className="h-9 w-[110px] border-0 bg-transparent px-2 shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zh-CN">zh-CN</SelectItem>
              <SelectItem value="en">en</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          size="sm"
          variant="secondary"
          className={cn("rounded-full", pilot === "shinji" && "border-cyan-400/20")}
          onClick={() => setPilot(pilot === "rei" ? "shinji" : "rei")}
        >
          {pilot === "rei" ? t("pilotRei") : t("pilotShinji")}
        </Button>
      </div>
    </header>
  )
}
