import { Folder, FolderOpen, LoaderCircle, TerminalSquare } from "lucide-react"
import { useEffect, useState } from "react"

import { browseDirectories, createProject } from "@/lib/api/projects"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAsyncResource } from "@/hooks/use-async-resource"
import { usePreferences } from "@/lib/preferences"
import { getPilotTheme } from "@/lib/pilot-theme"
import { cn } from "@/lib/utils"

interface RegisterProjectDialogProps {
  onOpenChange: (open: boolean) => void
  onRegistered: () => void
  open: boolean
}

export function RegisterProjectDialog({
  onOpenChange,
  onRegistered,
  open,
}: RegisterProjectDialogProps) {
  const { pilot } = usePreferences()
  const theme = getPilotTheme(pilot)
  const isRei = pilot === "rei"
  const [pathInput, setPathInput] = useState("")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setPathInput("")
      setSubmitError(null)
    }
  }, [open])

  const browse = useAsyncResource({
    deps: [open, pathInput],
    initialData: undefined,
    load: async (signal) => {
      if (!open) {
        return undefined
      }
      return browseDirectories(pathInput, signal)
    },
  })

  const currentPath = browse.data?.currentPath ?? pathInput

  async function handleSubmit() {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      await createProject({ path: currentPath })
      onOpenChange(false)
      onRegistered()
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : "Register project failed.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-2xl rounded-sm border p-6", theme.modalBox)}>
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{ backgroundImage: theme.grid, backgroundSize: "20px 20px" }}
        />
        <DialogHeader className="relative z-10">
          <div className="mb-2 flex items-center">
            <div className={cn("mr-3 rounded-sm border p-2", isRei ? "border-cyan-200 bg-cyan-50" : "border-green-500/30 bg-green-900/20")}>
              <FolderOpen className={cn("h-5 w-5", isRei ? "text-cyan-600" : "text-green-400")} />
            </div>
            <DialogTitle className={cn("font-mono text-xl font-bold tracking-wider", isRei ? "text-cyan-700" : "text-green-400")}>
              注册本地新项目
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="relative z-10 grid gap-4">
          <div>
            <label className={cn("mb-2 block font-mono text-xs", theme.cardSub)}>[ TARGET_PATH ] 手动输入路径</label>
            <div className="relative">
              <TerminalSquare className={cn("absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2", theme.pageSub)} />
              <input
                className={cn("w-full rounded-sm border py-2.5 pl-9 pr-4 font-mono text-sm outline-none transition-all", theme.inputBg)}
                onChange={(event) => setPathInput(event.target.value)}
                placeholder="输入本地 Git 仓库绝对路径..."
                type="text"
                value={pathInput}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
            <div className={cn("rounded-sm border p-4", theme.cardBg)}>
              <div className={cn("mb-3 font-mono text-xs uppercase tracking-[0.25em]", theme.cardSub)}>Roots</div>
              <div className="grid gap-2">
                {browse.data?.roots.map((root) => (
                  <button
                    key={root.path}
                    className={cn("rounded-sm border px-3 py-2 text-left font-mono text-xs transition-colors", theme.btnGhost)}
                    onClick={() => setPathInput(root.path)}
                    type="button"
                  >
                    {root.kind}: {root.path}
                  </button>
                ))}
              </div>
            </div>

            <div className={cn("overflow-hidden rounded-sm border", theme.cardBg)}>
              <div className={cn("flex items-center justify-between border-b px-4 py-3 font-mono text-sm", theme.treePathBar)}>
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" />
                  <span className="truncate">{browse.data?.currentPath ?? "浏览目录"}</span>
                </div>
                {browse.isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              </div>

              <ScrollArea className="h-[320px] p-2">
                <div className="grid gap-1 p-2">
                  {browse.data?.parentPath ? (
                    <button
                      className={cn("rounded-sm px-3 py-2 text-left font-mono text-sm transition-colors", theme.treeItemHover)}
                      onClick={() => setPathInput(browse.data?.parentPath ?? "")}
                      type="button"
                    >
                      .. (返回上级)
                    </button>
                  ) : null}

                  {browse.data?.entries.map((entry) => (
                    <button
                      key={entry.path}
                      className={cn("flex items-center justify-between rounded-sm px-3 py-2.5 text-left font-mono text-sm transition-colors", theme.treeItemHover)}
                      onClick={() => setPathInput(entry.path)}
                      type="button"
                    >
                      <span className="flex items-center overflow-hidden">
                        <Folder className={cn("mr-3 h-4 w-4 shrink-0", entry.isGitRepository ? (isRei ? "text-cyan-500" : "text-green-400") : theme.pageSub)} />
                        <span className={theme.cardTitle}>{entry.name}</span>
                      </span>
                      {entry.isGitRepository ? (
                        <span className={cn("rounded-sm border px-1.5 py-0.5 text-[0.6rem]", isRei ? "border-cyan-200 bg-cyan-50 text-cyan-600" : "border-green-500/50 bg-green-900/30 text-green-400")}>
                          GIT
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          {submitError ? <div className="font-mono text-sm text-red-500">{submitError}</div> : null}
        </div>

        <DialogFooter className="relative z-10">
          <button
            className={cn("rounded-sm border px-5 py-2 font-mono text-sm transition-colors", theme.btnGhost)}
            onClick={() => onOpenChange(false)}
            type="button"
          >
            取消 (CANCEL)
          </button>
          <button
            className={cn(
              "flex items-center rounded-sm border px-5 py-2 font-mono text-sm transition-colors",
              isRei ? "border-blue-300 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white" : "border-green-500/50 bg-green-900/30 text-green-400 hover:bg-green-500 hover:text-black",
            )}
            disabled={isSubmitting || !currentPath}
            onClick={handleSubmit}
            type="button"
          >
            {isSubmitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
            确认注册
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
