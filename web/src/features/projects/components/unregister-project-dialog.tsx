import { AlertTriangle, LoaderCircle, XCircle } from "lucide-react"
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
  const { pilot } = usePreferences()
  const theme = getPilotTheme(pilot)
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
      <DialogContent className={cn("max-w-md rounded-sm border p-6", theme.modalBox)}>
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{ backgroundImage: theme.grid, backgroundSize: "20px 20px" }}
        />
        <DialogHeader className="relative z-10">
          <div className="flex items-start">
            <div className={cn("mr-4 rounded-full border p-3", blocked ? "border-red-500/30 bg-red-500/10" : "border-orange-500/30 bg-orange-500/10")}>
              {blocked ? <XCircle className="h-6 w-6 text-red-500" /> : <AlertTriangle className="h-6 w-6 text-orange-500" />}
            </div>
            <div>
              <DialogTitle className={cn("mb-1 text-lg font-bold tracking-wider", blocked ? "text-red-500" : theme.modalTitle)}>
                {blocked ? "操作被拦截：存在活跃任务" : "确认移除项目注册？"}
              </DialogTitle>
              <p className={cn("mt-2 font-mono text-sm leading-relaxed", theme.cardSub)}>
                {blocked ? (
                  <>
                    目标项目 <span className="font-bold text-slate-300">[{projectName}]</span> 当前仍有{" "}
                    <span className="font-bold text-red-500">{taskCount}</span> 个活跃任务正在执行中。
                    <br />
                    <br />
                    <span className="text-red-400">请先结束执行中的任务树，再尝试取消注册。</span>
                  </>
                ) : (
                  <>
                    即将移除对项目 <span className="font-bold text-slate-300">[{projectName}]</span> 的接管。
                    <br />
                    <br />
                    <span className={cn("inline-block rounded-sm border px-2 py-1", theme.pathBg)}>
                      此操作仅去除 EAT 注册记录，不会删除本地仓库。
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
        </DialogHeader>

        {error ? <div className="relative z-10 font-mono text-sm text-red-500">{error}</div> : null}

        <DialogFooter className="relative z-10">
          {blocked ? (
            <button
              className="rounded-sm border border-red-500/50 bg-red-500/10 px-4 py-2 font-mono text-sm text-red-500 transition-colors hover:bg-red-500 hover:text-white"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              收到 (ACKNOWLEDGE)
            </button>
          ) : (
            <>
              <button className={cn("rounded-sm border px-4 py-2 font-mono text-sm transition-colors", theme.btnGhost)} onClick={() => onOpenChange(false)} type="button">
                取消 (CANCEL)
              </button>
              <button
                className="flex items-center rounded-sm border border-red-500/50 bg-red-500/10 px-4 py-2 font-mono text-sm text-red-500 transition-colors hover:bg-red-500 hover:text-white"
                disabled={isSubmitting}
                onClick={handleConfirm}
                type="button"
              >
                {isSubmitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                确认移除
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
