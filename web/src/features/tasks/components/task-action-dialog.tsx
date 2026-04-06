import { AlertTriangle, Archive, LoaderCircle, PauseCircle, PlayCircle, XCircle } from "lucide-react"
import type { ReactNode } from "react"
import { useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { usePreferences } from "@/lib/preferences"
import { getPilotTheme } from "@/lib/pilot-theme"
import { cn } from "@/lib/utils"
import type { TaskRecord } from "@/lib/types"

type TaskActionMode = "archive" | "delete" | "pause" | "resume" | "blocked"

interface TaskActionDialogProps {
  mode: TaskActionMode | null
  onConfirm: (options: { deleteBranches: boolean }) => Promise<void>
  onOpenChange: (open: boolean) => void
  open: boolean
  task?: TaskRecord | null
}

export function TaskActionDialog({
  mode,
  onConfirm,
  onOpenChange,
  open,
  task,
}: TaskActionDialogProps) {
  const { pilot, t } = usePreferences()
  const theme = getPilotTheme(pilot)
  const [deleteBranches, setDeleteBranches] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!task || !mode) {
    return null
  }

  const isPaused = task.status === "PAUSED"
  const config: Record<
    TaskActionMode,
    { confirmText: string; content: string; icon: ReactNode; title: string; tone: string }
  > = {
    archive: {
      confirmText: t("task.action.archive.confirm"),
      content: t("task.action.archive.content", { taskId: task.id, title: task.title }),
      icon: <Archive className={cn("h-6 w-6", theme.modalTitleInfo)} />,
      title: t("task.action.archive.title"),
      tone: `${theme.modalTitleInfo} border-blue-500/30 bg-blue-500/10`,
    },
    blocked: {
      confirmText: t("common.acknowledge"),
      content: t("task.action.blocked.content", { taskId: task.id }),
      icon: <XCircle className="h-6 w-6 text-red-500" />,
      title: t("task.action.blocked.title"),
      tone: "text-red-500 border-red-500/30 bg-red-500/10",
    },
    delete: {
      confirmText: t("task.action.delete.confirm"),
      content: t("task.action.delete.content", { taskId: task.id, title: task.title }),
      icon: <AlertTriangle className="h-6 w-6 text-red-500" />,
      title: t("task.action.delete.title"),
      tone: "text-red-500 border-red-500/30 bg-red-500/10",
    },
    pause: {
      confirmText: t("task.action.pause.confirm"),
      content: t("task.action.pause.content", { taskId: task.id }),
      icon: <PauseCircle className={cn("h-6 w-6", theme.modalTitleInfo)} />,
      title: t("task.action.pause.title"),
      tone: `${theme.modalTitleInfo} border-blue-500/30 bg-blue-500/10`,
    },
    resume: {
      confirmText: t("task.action.resume.confirm"),
      content: t("task.action.resume.content", { taskId: task.id }),
      icon: <PlayCircle className={cn("h-6 w-6", theme.modalTitleInfo)} />,
      title: t("task.action.resume.title"),
      tone: `${theme.modalTitleInfo} border-blue-500/30 bg-blue-500/10`,
    },
  }

  async function handleConfirm() {
    setIsSubmitting(true)
    setError(null)
    try {
      await onConfirm({ deleteBranches })
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t(`task.action.${mode}.title`))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-md rounded-sm border p-6", theme.modalBox)}>
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{ backgroundImage: theme.grid, backgroundSize: "20px 20px" }}
        />
        <DialogHeader className="relative z-10">
          <div className="flex items-start">
            <div className={cn("mr-4 rounded-full border p-3", config[mode].tone)}>{config[mode].icon}</div>
            <div>
              <DialogTitle className={cn("mb-2 text-lg font-bold tracking-wider", config[mode].tone.split(" ")[0])}>
                {config[mode].title}
              </DialogTitle>
              <p className={cn("font-mono text-sm leading-relaxed", theme.cardSub)}>{config[mode].content}</p>
            </div>
          </div>
        </DialogHeader>

        {mode === "delete" ? (
          <label className="relative z-10 flex cursor-pointer items-center gap-3 rounded-sm border border-red-500/20 bg-red-500/5 p-3">
            <input checked={deleteBranches} onChange={(event) => setDeleteBranches(event.target.checked)} type="checkbox" />
            <span className="font-mono text-sm text-red-400">
              {t("task.action.deleteBranch")}
              <br />
              <span className="font-bold">{task.taskBranchName ?? t("common.autoBranch")}</span>
            </span>
          </label>
        ) : null}

        {mode === "pause" || mode === "resume" ? (
          <div className={cn("relative z-10 rounded-sm border p-3 font-mono text-xs", theme.pathBg)}>
            {t("common.status")}: {t(`status.${task.status}`)}
            <br />
            {t("common.stage")}: {isPaused && mode === "resume" ? t("task.action.resume.target") : t("task.action.pause.target")}
          </div>
        ) : null}

        {error ? <div className="relative z-10 font-mono text-sm text-red-500">{error}</div> : null}

        <DialogFooter className="relative z-10">
          {mode !== "blocked" ? (
            <button className={cn("rounded-sm border px-4 py-2 font-mono text-sm transition-colors", theme.btnGhost)} onClick={() => onOpenChange(false)} type="button">
              {t("common.cancel")}
            </button>
          ) : null}
          <button
            className={cn(
              "flex items-center rounded-sm border px-4 py-2 font-mono text-sm transition-colors",
              mode === "delete" || mode === "blocked"
                ? "border-red-500/50 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white"
                : theme.pageSub.includes("blue")
                  ? "border-blue-300 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white"
                  : "border-green-500/50 bg-green-900/30 text-green-400 hover:bg-green-500 hover:text-black",
            )}
            disabled={isSubmitting}
            onClick={mode === "blocked" ? () => onOpenChange(false) : handleConfirm}
            type="button"
          >
            {isSubmitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
            {config[mode].confirmText}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
