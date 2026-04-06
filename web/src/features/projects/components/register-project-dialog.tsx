import { AlertTriangle, CornerLeftUp, Folder, FolderOpen, FolderPlus, LoaderCircle, TerminalSquare } from "lucide-react"
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
import { emitProjectRegistryChanged } from "@/lib/project-events"
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
  const { t, pilot } = usePreferences()
  const theme = getPilotTheme(pilot)
  const isRei = pilot === "rei"
  const [pathInput, setPathInput] = useState("")
  const [browsePath, setBrowsePath] = useState("")
  const [projectColor, setProjectColor] = useState(PRESET_COLORS[0])
  const [isPinned, setIsPinned] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState("")
  const [duplicateWarningOpen, setDuplicateWarningOpen] = useState(false)
  const [pathHint, setPathHint] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setPathInput("")
      setBrowsePath("")
      setProjectColor(PRESET_COLORS[0])
      setIsPinned(false)
      setSelectedBranch("")
      setDuplicateWarningOpen(false)
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
  const branchCandidates = Array.from(
    new Set(
      [
        browse.data?.repoStatus?.defaultBranch,
        browse.data?.repoStatus?.currentBranch,
        ...(browse.data?.repoStatus?.recentBranches ?? []),
      ].filter((branch): branch is string => Boolean(branch)),
    ),
  )

  useEffect(() => {
    if (!browse.data?.isGitRepository) {
      if (selectedBranch) {
        setSelectedBranch("")
      }
      return
    }

    if (selectedBranch && branchCandidates.includes(selectedBranch)) {
      return
    }

    setSelectedBranch(branchCandidates[0] ?? "")
  }, [branchCandidates, browse.data?.isGitRepository, selectedBranch])

  async function handleSubmit() {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      await createProject({
        color: projectColor,
        defaultBranch: browse.data?.isGitRepository ? selectedBranch : undefined,
        isPinned,
        path: targetPath,
      })
      emitProjectRegistryChanged()
      onOpenChange(false)
      onRegistered()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("projects.register")
      if (message.toLowerCase().includes("already registered")) {
        setDuplicateWarningOpen(true)
        return
      }
      setSubmitError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
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
                {t("projects.register")}
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden">
            <div>
              <label className={cn("mb-2 block font-mono text-xs", theme.cardSub)}>{t("projects.registerPath")}</label>
              <div className="relative">
                <TerminalSquare className={cn("absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2", isRei ? "text-blue-400" : "text-purple-500")} />
                <input
                  className={cn("w-full rounded-sm border py-2.5 pl-9 pr-4 font-mono text-sm outline-none transition-all", theme.inputBg)}
                  onChange={(event) => {
                    setPathInput(event.target.value)
                    setPathHint(null)
                    setSubmitError(null)
                  }}
                  placeholder={t("projects.pathHint")}
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
              <label className={cn("mb-2 block font-mono text-xs", theme.cardSub)}>{t("projects.registerColor")}</label>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pl-2">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      aria-label={`${t("projects.registerColor")} ${color}`}
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
                    title={t("projects.registerColor")}
                  >
                    <input
                      className="absolute -left-2 -top-2 h-12 w-12 cursor-pointer opacity-0"
                      onChange={(event) => setProjectColor(event.target.value)}
                      type="color"
                      value={projectColor}
                    />
                    <div className="pointer-events-none h-full w-full" style={{ backgroundColor: projectColor }} />
                  </label>
                  <span className={cn("ml-1 font-mono text-[0.65rem] uppercase opacity-60", theme.cardSub)}>{projectColor}</span>
                </div>

                <div className="ml-auto flex items-center gap-3">
                  <div className={cn("h-5 w-px", isRei ? "bg-blue-200" : "bg-white/20")} />
                  <label
                    className={cn(
                      "group flex cursor-pointer items-center gap-2 rounded-sm border px-2.5 py-1.5 font-mono text-[0.7rem] transition-colors",
                      isPinned
                        ? isRei
                          ? "border-blue-300 bg-blue-50/80 text-blue-700"
                          : "border-green-500/40 bg-green-900/20 text-green-300"
                        : theme.inputBg,
                    )}
                  >
                    <input
                      checked={isPinned}
                      className="sr-only"
                      onChange={(event) => setIsPinned(event.target.checked)}
                      type="checkbox"
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-3.5 w-3.5 items-center justify-center rounded-[2px] border transition-colors",
                        isPinned
                          ? isRei
                            ? "border-blue-500 bg-blue-500"
                            : "border-green-400 bg-green-400"
                          : isRei
                            ? "border-slate-400 bg-white/70"
                            : "border-white/20 bg-black/30",
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-[1px] transition-opacity",
                          isPinned
                            ? isRei
                              ? "bg-white opacity-100"
                              : "bg-black opacity-100"
                            : "opacity-0",
                        )}
                      />
                    </span>
                    <span className={cn("tracking-wide", theme.cardSub)}>{t("projects.markProject")}</span>
                  </label>
                </div>
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
                <span className="flex-1 truncate font-bold">{currentPath || t("common.directoryBrowse")}</span>
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
                      <span>{t("projects.goParent")}</span>
                    </button>
                  ) : null}

                  {!browse.isLoading && entries.length === 0 ? (
                    <div className={cn("px-3 py-4 text-center font-mono text-xs opacity-50", theme.cardSub)}>
                      {t("projects.noDirectories")}
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

              {browse.data?.isGitRepository && branchCandidates.length > 0 ? (
                <div className={cn("flex items-center gap-3 border-t px-3 py-2.5", isRei ? "border-blue-200/70 bg-white/45" : "border-white/10 bg-black/30")}>
                  <label className={cn("shrink-0 font-mono text-[0.65rem] tracking-wide", theme.cardSub)}>
                    {t("projects.registerBranch")}
                  </label>
                  <select
                    className={cn("min-w-0 flex-1 rounded-sm border px-3 py-2 font-mono text-sm outline-none transition-all", theme.inputBg)}
                    onChange={(event) => setSelectedBranch(event.target.value)}
                    value={selectedBranch}
                  >
                    {branchCandidates.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            {submitError ? <div className="font-mono text-sm text-red-500">{submitError}</div> : null}
          </div>

          <DialogFooter className="relative z-10 mt-6">
            <button
              className={cn("rounded-sm border px-5 py-2 font-mono text-sm transition-colors", theme.btnGhost)}
              onClick={() => onOpenChange(false)}
              type="button"
            >
              {t("common.cancel")}
            </button>
            <button
              className={cn(
                "flex items-center rounded-sm border px-5 py-2 font-mono text-sm transition-colors",
                isRei ? "border-blue-300 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white" : "border-green-500/50 bg-green-900/30 text-green-400 hover:bg-green-500 hover:text-black",
              )}
              disabled={isSubmitting || !targetPath || (browse.data?.isGitRepository && !selectedBranch)}
              onClick={handleSubmit}
              type="button"
            >
              {isSubmitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("projects.registerConfirm")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={duplicateWarningOpen} onOpenChange={setDuplicateWarningOpen}>
        <DialogContent className={cn("max-w-md rounded-sm border p-6", theme.modalBox)}>
          <div
            className="pointer-events-none absolute inset-0 opacity-10"
            style={{ backgroundImage: theme.grid, backgroundSize: "20px 20px" }}
          />
          <DialogHeader className="relative z-10">
            <div className="flex items-start">
              <div className="mr-4 rounded-full border border-orange-500/30 bg-orange-500/10 p-3">
                <AlertTriangle className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <DialogTitle className={cn("mb-1 text-lg font-bold tracking-wider", theme.modalTitle)}>
                  {t("projects.duplicateTitle")}
                </DialogTitle>
                <p className={cn("mt-2 font-mono text-sm leading-relaxed", theme.cardSub)}>
                  {t("projects.duplicateRegistered", { path: targetPath || pathInput.trim() })}
                  <br />
                  <br />
                  <span className={cn("inline-block rounded-sm border px-2 py-1", theme.pathBg)}>
                    {t("projects.registerDuplicateBranch", { branch: selectedBranch || browse.data?.repoStatus?.defaultBranch || t("projects.unidentified") })}
                  </span>
                  <br />
                  <br />
                  {t("projects.duplicateHint")}
                </p>
              </div>
            </div>
          </DialogHeader>

          <DialogFooter className="relative z-10">
            <button
              className="rounded-sm border border-orange-500/50 bg-orange-500/10 px-4 py-2 font-mono text-sm text-orange-500 transition-colors hover:bg-orange-500 hover:text-white"
              onClick={() => setDuplicateWarningOpen(false)}
              type="button"
            >
              {t("common.acknowledge")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
