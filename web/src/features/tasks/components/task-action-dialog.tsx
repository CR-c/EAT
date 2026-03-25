import { LoaderCircle } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { usePreferences } from "@/lib/preferences"
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
  const { t } = usePreferences()
  const [deleteBranches, setDeleteBranches] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!task || !mode) {
    return null
  }

  const copy: Record<TaskActionMode, { title: string; description: string }> = {
    archive: {
      title: t("taskModalArchive"),
      description: `Task ${task.id} will leave the active board and remain queryable in the archive.`,
    },
    blocked: {
      title: t("actionRequired"),
      description:
        "This operation is blocked while the task is still active. Pause or finish the task first.",
    },
    delete: {
      title: t("taskModalDelete"),
      description:
        "This removes the task record from the current project. The Go backend still enforces task lifecycle rules.",
    },
    pause: {
      title: t("taskModalPause"),
      description:
        "Worker sessions will be cancelled and the task will move to ACTION_REQUIRED until resumed.",
    },
    resume: {
      title: t("taskModalResume"),
      description: "The task will re-enter its next executable lifecycle step.",
    },
  }

  async function handleConfirm() {
    setIsSubmitting(true)
    setError(null)
    try {
      await onConfirm({ deleteBranches })
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Task action failed.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy[mode].title}</DialogTitle>
          <DialogDescription>{copy[mode].description}</DialogDescription>
        </DialogHeader>

        <div className="rounded-[1.4rem] border border-white/40 bg-white/50 p-4 text-sm dark:border-white/10 dark:bg-white/6">
          <div className="font-medium">{task.title}</div>
          <div className="mt-2 text-muted-foreground">{task.id}</div>
        </div>

        {mode === "delete" ? (
          <label className="flex items-center gap-3 rounded-[1.2rem] border border-red-400/30 bg-red-400/8 px-4 py-3 text-sm">
            <input checked={deleteBranches} onChange={(event) => setDeleteBranches(event.target.checked)} type="checkbox" />
            <span>{t("deleteBranches")}</span>
          </label>
        ) : null}

        {error ? <div className="text-sm text-red-600 dark:text-red-300">{error}</div> : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button disabled={isSubmitting} onClick={mode === "blocked" ? () => onOpenChange(false) : handleConfirm}>
            {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
