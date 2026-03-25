import { LoaderCircle } from "lucide-react"
import { useEffect, useState } from "react"

import { getAgents } from "@/lib/api/system"
import { createTask } from "@/lib/api/tasks"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAsyncResource } from "@/hooks/use-async-resource"
import { usePreferences } from "@/lib/preferences"
import type { ProjectRecord, RepoStatus } from "@/lib/types"

interface CreateTaskDialogProps {
  open: boolean
  onCreated: () => void
  onOpenChange: (open: boolean) => void
  project: ProjectRecord
  repoStatus?: RepoStatus
}

export function CreateTaskDialog({
  onCreated,
  onOpenChange,
  open,
  project,
  repoStatus,
}: CreateTaskDialogProps) {
  const { t } = usePreferences()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [leadAgentType, setLeadAgentType] = useState("")
  const [baseBranch, setBaseBranch] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const agents = useAsyncResource({
    deps: [open],
    initialData: undefined,
    load: async (signal) => {
      if (!open) {
        return undefined
      }
      return getAgents(signal)
    },
  })

  useEffect(() => {
    if (!open) {
      return
    }
    setTitle("")
    setDescription("")
    setError(null)
    setBaseBranch(repoStatus?.defaultBranch ?? project.defaultBranch)
  }, [open, project.defaultBranch, repoStatus?.defaultBranch])

  useEffect(() => {
    const firstCandidate = agents.data?.leadCandidates.find((candidate) => candidate.selectable)
    if (firstCandidate && !leadAgentType) {
      setLeadAgentType(firstCandidate.agentName)
    }
  }, [agents.data, leadAgentType])

  async function handleCreate() {
    setIsSubmitting(true)
    setError(null)
    try {
      await createTask({
        baseBranch,
        description,
        leadAgentType,
        projectId: project.id,
        title,
      })
      onOpenChange(false)
      onCreated()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Create task failed.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const branchCandidates = Array.from(
    new Set(
      [project.defaultBranch, repoStatus?.defaultBranch, ...(repoStatus?.recentBranches ?? [])].filter(
        (branch): branch is string => Boolean(branch),
      ),
    ),
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newTask")}</DialogTitle>
          <DialogDescription>
            Create a task through the Go backend with the current project as target.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">{t("title")}</label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">{t("description")}</label>
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm font-medium">{t("leadAgent")}</label>
              <Select value={leadAgentType} onValueChange={setLeadAgentType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select lead agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.data?.leadCandidates.map((candidate) => (
                    <SelectItem key={candidate.agentName} value={candidate.agentName}>
                      {candidate.agentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">{t("baseBranch")}</label>
              <Select value={baseBranch} onValueChange={setBaseBranch}>
                <SelectTrigger>
                  <SelectValue placeholder="Select base branch" />
                </SelectTrigger>
                <SelectContent>
                  {branchCandidates.map((branch) => (
                    <SelectItem key={branch} value={branch}>
                      {branch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error ? <div className="text-sm text-red-600 dark:text-red-300">{error}</div> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            disabled={isSubmitting || !title.trim() || !description.trim() || !leadAgentType || !baseBranch}
            onClick={handleCreate}
          >
            {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
