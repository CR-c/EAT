import { CornerLeftUp, Folder, FolderOpen, FolderPlus, LoaderCircle, TerminalSquare } from "lucide-react"
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

const PRESET_COLORS = ["#eab308", "#f97316", "#ef4444", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7"]

export function RegisterProjectDialog({
  onOpenChange,
  onRegistered,
  open,
}: RegisterProjectDialogProps) {
  const { pilot } = usePreferences()
  const theme = getPilotTheme(pilot)
  const isRei = pilot === "rei"
  const [pathInput, setPathInput] = useState("")
  const [browsePath, setBrowsePath] = useState("")
  const [projectColor, setProjectColor] = useState(PRESET_COLORS[0])
  const [pathHint, setPathHint] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setPathInput("")
      setBrowsePath("")
      setProjectColor(PRESET_COLORS[0])
      setPathHint(null)
      setSubmitError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const nextPath = pathInput.trim()
    const timer = window.setTimeout(() => {
      setBrowsePath(nextPath)
    }, 240)

    return () => window.clearTimeout(timer)
  }, [open, pathInput])

  const browse = useAsyncResource({
    deps: [open, browsePath],
    initialData: undefined,
    load: async (signal) => {
      if (!open) {
        return undefined
      }
      return browseDirectories(browsePath, signal)
    },
  })

  useEffect(() => {
    if (!open || pathInput.trim() || !browse.data?.currentPath) {
      return
    }
    setPathInput(browse.data.currentPath)
    setBrowsePath(browse.data.currentPath)
  }, [browse.data?.currentPath, open, pathInput])

  useEffect(() => {
    if (!open) {
      return
    }

    if (!pathInput.trim()) {
      setPathHint(null)
      return
    }

    setPathHint(browse.error)
  }, [browse.error, open, pathInput])

  function handlePathSelect(nextPath: string) {
    setPathInput(nextPath)
    setBrowsePath(nextPath)
    setPathHint(null)
  }

  const currentPath = browse.data?.currentPath ?? ""
  const isWaitingForBrowse = browse.isLoading || pathInput.trim() !== browsePath
  const targetPath = !browse.error && !isWaitingForBrowse ? currentPath : ""
  const parentPath = browse.data?.parentPath ?? null
  const entries = browse.data?.entries ?? []

  async function handleSubmit() {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      await createProject({ color: projectColor, path: targetPath })
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
      <DialogContent className={cn("max-h-[90vh] max-w-2xl gap-0 overflow-hidden rounded-sm border p-6", theme.modalBox)}>
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{ backgroundImage: theme.grid, backgroundSize: "20px 20px" }}
        />
        <DialogHeader className="relative z-10 mb-6">
          <div className="flex items-center">
            <div className={cn("mr-3 rounded-sm border p-2", isRei ? "border-cyan-200 bg-cyan-50" : "border-green-500/30 bg-green-900/20")}>
              <FolderPlus className={cn("h-5 w-5", isRei ? "text-cyan-600" : "text-green-400")} />
            </div>
            <DialogTitle className={cn("font-mono text-xl font-bold tracking-wider", isRei ? "text-cyan-700" : "text-green-400")}>
              注册本地新项目
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden">
          <div>
            <label className={cn("mb-2 block font-mono text-xs", theme.cardSub)}>[ TARGET_PATH ] 手动输入路径</label>
            <div className="relative">
              <TerminalSquare className={cn("absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2", isRei ? "text-blue-400" : "text-purple-500")} />
              <input
                className={cn("w-full rounded-sm border py-2.5 pl-9 pr-4 font-mono text-sm outline-none transition-all", theme.inputBg)}
                onChange={(event) => {
                  setPathInput(event.target.value)
                  setPathHint(null)
                  setSubmitError(null)
                }}
                placeholder="输入本地 Git 仓库绝对路径..."
                type="text"
                value={pathInput}
              />
            </div>
            {pathHint ? (
              <div className={cn("mt-2 font-mono text-[0.65rem]", isRei ? "text-red-500/80" : "text-orange-400/80")}>
                {pathHint}
              </div>
            ) : null}
          </div>

          <div>
            <label className={cn("mb-2 block font-mono text-xs", theme.cardSub)}>[ PROJECT_COLOR ] 标识颜色</label>
            <div className="flex flex-wrap items-center gap-3 pl-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  aria-label={`选择项目颜色 ${color}`}
                  className={cn(
                    "h-6 w-6 rounded-full transition-transform",
                    projectColor === color
                      ? isRei
                        ? "scale-125 ring-2 ring-blue-400 ring-offset-1 ring-offset-white"
                        : "scale-125 ring-2 ring-green-400 ring-offset-1 ring-offset-[#0a0a0a]"
                      : "opacity-70 hover:scale-110 hover:opacity-100",
                  )}
                  onClick={() => setProjectColor(color)}
                  style={{ backgroundColor: color }}
                  type="button"
                />
              ))}
              <div className={cn("mx-1 h-5 w-px", isRei ? "bg-blue-200" : "bg-white/20")} />
              <label
                className="relative flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-slate-400 shadow-sm transition-transform hover:scale-110"
                title="打开调色板选择自定义颜色"
              >
                <input
                  className="absolute -left-2 -top-2 h-12 w-12 cursor-pointer opacity-0"
                  onChange={(event) => setProjectColor(event.target.value)}
                  type="color"
                  value={projectColor}
                />
                <div className="h-full w-full pointer-events-none" style={{ backgroundColor: projectColor }} />
              </label>
              <span className={cn("ml-1 font-mono text-[0.65rem] uppercase opacity-60", theme.cardSub)}>{projectColor}</span>
            </div>
          </div>

          <div
            className={cn(
              "mt-2 flex shrink-0 flex-col overflow-hidden rounded-sm border",
              isRei ? "border-blue-400/30" : "border-purple-500/30",
            )}
          >
            <div className={cn("flex items-center border-b px-3 py-2 font-mono text-xs tracking-wide", theme.treePathBar)}>
              <FolderOpen className="mr-2 h-3.5 w-3.5" />
              <span className="flex-1 truncate font-bold">{currentPath || "浏览目录"}</span>
              {browse.isLoading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
            </div>

            <ScrollArea className={cn("h-[17rem] max-h-[17rem] shrink-0", isRei ? "bg-white/40" : "bg-black/20")}>
              <div className="grid gap-1 p-2 pr-3">
                {parentPath ? (
                  <button
                    className={cn("flex min-h-10 items-center rounded-sm px-3 py-2 text-left font-mono text-sm transition-colors", theme.treeItemHover, theme.cardSub)}
                    onClick={() => handlePathSelect(parentPath)}
                    type="button"
                  >
                    <CornerLeftUp className="mr-3 h-4 w-4" />
                    <span>.. (返回上级)</span>
                  </button>
                ) : null}

                {!browse.isLoading && entries.length === 0 ? (
                  <div className={cn("px-3 py-4 text-center font-mono text-xs opacity-50", theme.cardSub)}>
                    当前目录下未发现文件夹。
                  </div>
                ) : null}

                {entries.map((entry) => (
                  <button
                    key={entry.path}
                    className={cn("group flex min-h-10 items-center justify-between rounded-sm px-3 py-2.5 text-left font-mono text-sm transition-colors", theme.treeItemHover)}
                    onClick={() => handlePathSelect(entry.path)}
                    type="button"
                  >
                    <span className="flex items-center overflow-hidden">
                      <Folder
                        className={cn(
                          "mr-3 h-4 w-4 shrink-0",
                          entry.isGitRepository
                            ? isRei
                              ? "fill-cyan-500/20 text-cyan-500"
                              : "fill-green-400/20 text-green-400"
                            : isRei
                              ? "text-blue-400"
                              : "text-purple-500",
                        )}
                      />
                      <span className={cn("truncate", theme.cardTitle)}>{entry.name}</span>
                    </span>
                    {entry.isGitRepository ? (
                      <span
                        className={cn(
                          "rounded-sm border px-1.5 py-0.5 text-[0.6rem] opacity-70 transition-opacity group-hover:opacity-100",
                          isRei
                            ? "border-cyan-200 bg-cyan-50 text-cyan-600"
                            : "border-green-500/50 bg-green-900/30 text-green-400",
                        )}
                      >
                        GIT
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {submitError ? <div className="font-mono text-sm text-red-500">{submitError}</div> : null}
        </div>

        <DialogFooter className="relative z-10 mt-6">
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
            disabled={isSubmitting || !targetPath}
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
