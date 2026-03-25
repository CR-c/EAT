import { Folder, FolderOpen, LoaderCircle, TerminalSquare } from "lucide-react"
import { useEffect, useState } from "react"

import { browseDirectories, createProject } from "@/lib/api/projects"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAsyncResource } from "@/hooks/use-async-resource"
import { usePreferences } from "@/lib/preferences"

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
  const { t } = usePreferences()
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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("registerProject")}</DialogTitle>
          <DialogDescription>
            Browse local directories, then register a Git repository through the Go backend.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{t("registerPath")}</div>
            <div className="relative">
              <TerminalSquare className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-11" value={pathInput} onChange={(event) => setPathInput(event.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
            <div className="rounded-[1.6rem] border border-white/40 bg-white/50 p-4 dark:border-white/10 dark:bg-white/6">
              <div className="mb-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">Roots</div>
              <div className="grid gap-2">
                {browse.data?.roots.map((root) => (
                  <Button
                    key={root.path}
                    variant="ghost"
                    className="justify-start rounded-[1.2rem]"
                    onClick={() => setPathInput(root.path)}
                  >
                    {root.kind}: {root.path}
                  </Button>
                ))}
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-white/40 bg-white/50 dark:border-white/10 dark:bg-white/6">
              <div className="flex items-center justify-between border-b border-white/40 px-4 py-3 text-sm dark:border-white/10">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-cyan-600 dark:text-cyan-200" />
                  <span className="truncate">{browse.data?.currentPath ?? t("browseRepo")}</span>
                </div>
                {browse.isLoading && <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>

              <ScrollArea className="h-[320px] p-2">
                <div className="grid gap-1 p-2">
                  {browse.data?.parentPath ? (
                    <Button
                      variant="ghost"
                      className="justify-start rounded-[1.1rem]"
                      onClick={() => setPathInput(browse.data?.parentPath ?? "")}
                    >
                      ..
                    </Button>
                  ) : null}

                  {browse.data?.entries.map((entry) => (
                    <button
                      key={entry.path}
                      className="flex items-center justify-between rounded-[1.1rem] px-3 py-2 text-left text-sm transition-colors hover:bg-white/60 dark:hover:bg-white/6"
                      onClick={() => setPathInput(entry.path)}
                      type="button"
                    >
                      <span className="flex items-center gap-3">
                        <Folder className="h-4 w-4 text-cyan-600 dark:text-cyan-200" />
                        <span>{entry.name}</span>
                      </span>
                      {entry.isGitRepository ? <span className="text-xs text-cyan-700 dark:text-cyan-200">GIT</span> : null}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          {submitError ? <div className="text-sm text-red-600 dark:text-red-300">{submitError}</div> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button disabled={isSubmitting || !currentPath} onClick={handleSubmit}>
            {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
