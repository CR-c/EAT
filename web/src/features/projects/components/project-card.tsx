import { AlertTriangle, FolderGit2, Trash2 } from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ProjectRecord, RepoStatus } from "@/lib/types"
import { usePreferences } from "@/lib/preferences"

interface ProjectCardProps {
  activeTaskCount: number
  onUnregister: (project: ProjectRecord) => void
  project: ProjectRecord
  repoStatus?: RepoStatus
  totalTaskCount: number
}

export function ProjectCard({ activeTaskCount, onUnregister, project, repoStatus, totalTaskCount }: ProjectCardProps) {
  const { t } = usePreferences()
  const dirty = repoStatus?.isDirty ?? false

  return (
    <Card className="group h-full overflow-hidden transition-transform hover:-translate-y-1">
      <CardHeader className="gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-[1.4rem] border border-cyan-400/20 bg-cyan-400/12 text-cyan-700 dark:text-cyan-200">
              <FolderGit2 className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>{project.name}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{project.id}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={dirty ? "destructive" : "secondary"}>
              {dirty ? "Dirty" : "Clean"}
            </Badge>
            <Button size="icon" variant="ghost" onClick={() => onUnregister(project)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex h-full flex-col gap-5">
        <div className="rounded-[1.4rem] border border-white/40 bg-white/55 p-4 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/6">
          <div className="mb-2 text-xs uppercase tracking-[0.25em] text-cyan-700/75 dark:text-cyan-200/80">
            {t("path")}
          </div>
          <div className="break-all text-foreground/85">{project.path}</div>
        </div>

        <div className="flex items-center justify-between gap-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{t("baseBranch")}</div>
            <div className="mt-1 font-medium">{project.defaultBranch || repoStatus?.defaultBranch || "—"}</div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant="outline">
              {t("activeTasks")}: {activeTaskCount}
            </Badge>
            <span className="text-xs text-muted-foreground">All tasks: {totalTaskCount}</span>
          </div>
        </div>

        <Button asChild className="mt-auto rounded-[1.4rem]">
          <Link to={`/projects/${project.id}/tasks`}>Open Project</Link>
        </Button>

        {repoStatus?.recentBranches?.length ? (
          <div className="rounded-[1.4rem] border border-white/40 bg-white/45 p-4 dark:border-white/10 dark:bg-white/6">
            <div className="mb-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Recent Branches
            </div>
            <div className="flex flex-wrap gap-2">
              {repoStatus.recentBranches.slice(0, 4).map((branch) => (
                <Badge key={branch} variant="secondary">
                  {branch}
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            <span>No recent branch metadata.</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
