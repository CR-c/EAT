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

interface UnregisterProjectDialogProps {
  open: boolean
  onConfirm: () => Promise<void>
  onOpenChange: (open: boolean) => void
  projectName: string
  taskCount: number
}

export function UnregisterProjectDialog({
  open,
  onConfirm,
  onOpenChange,
  projectName,
  taskCount,
}: UnregisterProjectDialogProps) {
  const { t } = usePreferences()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blocked = taskCount > 0

  async function handleConfirm() {
    setIsSubmitting(true)
    setError(null)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unregister project failed.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("unregisterProject")}</DialogTitle>
          <DialogDescription>
            {projectName} · {t("unregisterProjectHint")}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-[1.4rem] border border-white/40 bg-white/50 p-4 text-sm dark:border-white/10 dark:bg-white/6">
          {blocked ? t("unregisterProjectBlocked") : t("unregisterProjectHint")}
        </div>

        {blocked ? (
          <div className="rounded-[1.3rem] border border-red-400/25 bg-red-400/8 p-4 text-sm text-red-700 dark:text-red-200">
            Active execution task trees: {taskCount}
          </div>
        ) : null}

        {error ? <div className="text-sm text-red-600 dark:text-red-300">{error}</div> : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button disabled={blocked || isSubmitting} variant="destructive" onClick={handleConfirm}>
            {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
