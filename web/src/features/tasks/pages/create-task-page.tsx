import {
  ArrowLeft,
  Bot,
  FileText,
  GitBranch,
  GitMerge,
  PlayCircle,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react"
import type { ChangeEvent, ComponentType } from "react"
import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { getProject } from "@/lib/api/projects"
import { createTask } from "@/lib/api/tasks"
import { getAgents } from "@/lib/api/system"
import { getAgentDescription } from "@/lib/i18n"
import { useAsyncResource } from "@/hooks/use-async-resource"
import { usePreferences } from "@/lib/preferences"
import { getPilotTheme } from "@/lib/pilot-theme"
import { cn } from "@/lib/utils"

interface PendingAttachment {
  contentBase64: string
  fileName: string
  fileType: string
  mimeType: string
  sizeLabel: string
}

export function CreateTaskPage() {
  const navigate = useNavigate()
  const { projectId = "" } = useParams()
  const { locale, pilot, t } = usePreferences()
  const theme = getPilotTheme(pilot)
  const isRei = pilot === "rei"
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [leadAgentType, setLeadAgentType] = useState("")
  const [baseBranch, setBaseBranch] = useState("")
  const [taskBranch, setTaskBranch] = useState("")
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const project = useAsyncResource({
    deps: [projectId],
    initialData: undefined,
    load: async (signal) => getProject(projectId, signal),
  })

  const agents = useAsyncResource({
    deps: [],
    initialData: undefined,
    load: getAgents,
  })

  useEffect(() => {
    if (!project.data?.project) {
      return
    }
    const defaultBranchName = project.data.repoStatus?.defaultBranch ?? project.data.project.defaultBranch
    setBaseBranch(defaultBranchName)
    setTaskBranch(`eat/${slugify(project.data.project.name || "task")}-${Math.random().toString(36).slice(2, 8)}`)
  }, [project.data])

  useEffect(() => {
    const candidate = agents.data?.leadCandidates.find((item) => item.selectable)
    if (candidate && !leadAgentType) {
      setLeadAgentType(candidate.agentName)
    }
  }, [agents.data, leadAgentType])

  const branchCandidates = useMemo(
    () =>
      Array.from(
        new Set(
          [
            project.data?.project.defaultBranch,
            project.data?.repoStatus?.defaultBranch,
            ...(project.data?.repoStatus?.recentBranches ?? []),
          ].filter(Boolean),
        ),
      ) as string[],
    [project.data],
  )

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    const next = await Promise.all(files.map(toAttachment))
    setAttachments((current) => [...current, ...next])
    event.target.value = ""
  }

  async function handleCreate() {
    if (!project.data?.project) {
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const response = await createTask({
        attachments: attachments.map((item) => ({
          contentBase64: item.contentBase64,
          fileName: item.fileName,
          filePath: "",
          fileType: item.fileType,
          mimeType: item.mimeType,
        })),
        baseBranch,
        description,
        leadAgentType,
        projectId: project.data.project.id,
        taskBranchName: taskBranch,
        title,
      })
      navigate(`/projects/${project.data.project.id}/workbench?taskId=${response.task.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("task.create.submit"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const agentCards =
    agents.data?.leadCandidates.map((candidate) => ({
      id: candidate.agentName,
      desc: getAgentDescription(locale, candidate.agentName, candidate.capabilities.description),
      icon:
        candidate.agentName === "gemini-cli"
          ? Sparkles
          : candidate.agentName === "codex-cli"
            ? Bot
            : FileText,
      models: [candidate.runtimeMode],
      name: candidate.agentName,
      selectable: candidate.selectable,
    })) ?? []

  return (
    <div className="relative z-10 flex h-full flex-col p-8">
      <div className={cn("mb-6 flex items-center border-b pb-4", theme.sidebarBorder)}>
        <Link
          className={cn("mr-4 rounded-sm border p-2 transition-colors", theme.btnGhost, isRei ? "border-blue-200 hover:border-blue-400" : "border-purple-500/30 hover:border-green-400/50")}
          to={`/projects/${projectId}/tasks`}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <div className={cn("mb-1 font-mono text-sm tracking-[0.2em]", theme.pageSub)}>
            {t("task.create.subtitle")} {t("common.subtitleSlash")}
          </div>
          <h2 className={cn("font-mono text-2xl font-black tracking-widest", theme.pageTitle)}>{t("task.create.title")}</h2>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto pb-10">
        <section className={cn("relative rounded-sm border p-5 backdrop-blur-md", theme.cardBg)}>
          <TagLabel isRei={isRei} label={t("task.create.sectionBasic")} />
          <div className="mt-5 space-y-4">
            <FieldLabel label={t("task.create.titleLabel")} required theme={theme} />
            <input
              className={cn("w-full rounded-sm border px-3 py-2 font-mono text-sm outline-none transition-all", theme.inputBg)}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("task.create.titlePlaceholder")}
              type="text"
              value={title}
            />

            <div>
              <FieldLabel label={t("task.create.descriptionLabel")} theme={theme} />
              <textarea
                className={cn("w-full resize-none rounded-sm border px-3 py-2 font-mono text-sm outline-none transition-all", theme.inputBg)}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("task.create.descriptionPlaceholder")}
                rows={4}
                value={description}
              />
            </div>

            <div>
              <FieldLabel label={t("task.create.uploadLabel")} theme={theme} />
              <label
                className={cn(
                  "group flex w-full cursor-pointer flex-col items-center justify-center rounded-sm border border-dashed p-4 transition-colors",
                  isRei
                    ? "border-blue-300 bg-blue-50/50 hover:bg-blue-100/50"
                    : "border-purple-500/30 bg-purple-900/10 hover:bg-purple-900/30",
                )}
              >
                <input className="hidden" multiple onChange={handleFileChange} type="file" />
                <UploadCloud className={cn("mb-2 h-6 w-6 opacity-60 transition-opacity group-hover:opacity-100", isRei ? "text-blue-500" : "text-purple-400")} />
                <span className={cn("text-xs font-mono opacity-60 transition-opacity group-hover:opacity-100", theme.cardSub)}>
                  {t("task.create.attachmentsHint")}
                </span>
              </label>

              {attachments.length ? (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {attachments.map((file, index) => (
                    <div key={`${file.fileName}-${index}`} className={cn("flex items-center justify-between rounded-sm border px-3 py-2 font-mono text-xs", theme.pathBg)}>
                      <div className="flex items-center overflow-hidden">
                        <FileText className={cn("mr-2 h-3.5 w-3.5 shrink-0", theme.pathLabel)} />
                        <span className="max-w-[150px] truncate">{file.fileName}</span>
                        <span className="ml-2 opacity-50">{file.sizeLabel}</span>
                      </div>
                      <button
                        className="p-1 transition-colors hover:text-red-500"
                        onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                        type="button"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className={cn("relative rounded-sm border p-5 backdrop-blur-md", theme.cardBg)}>
          <TagLabel isRei={isRei} label={t("task.create.sectionGit")} />
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <FieldLabel icon={GitBranch} label={t("common.baseBranch")} theme={theme} />
              <select
                className={cn("w-full appearance-none rounded-sm border px-3 py-2 font-mono text-sm outline-none transition-all", theme.inputBg)}
                onChange={(event) => setBaseBranch(event.target.value)}
                value={baseBranch}
              >
                {branchCandidates.map((branch) => (
                  <option key={branch} className="bg-white text-slate-800 dark:bg-slate-950 dark:text-slate-100" value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel icon={GitMerge} label={t("task.create.targetBranchLabel")} required theme={theme} />
              <input
                className={cn("w-full rounded-sm border px-3 py-2 font-mono text-sm outline-none transition-all", theme.inputBg)}
                onChange={(event) => setTaskBranch(event.target.value)}
                placeholder={t("task.create.branchPlaceholder")}
                type="text"
                value={taskBranch}
              />
              <div className={cn("mt-2 font-mono text-[11px]", theme.cardSub)}>
                {t("task.create.branchHint")}
              </div>
            </div>
          </div>
        </section>

        <section className={cn("relative rounded-sm border p-5 backdrop-blur-md", theme.cardBg)}>
          <TagLabel isRei={isRei} label={t("task.create.leadAgentSection")} />
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {agentCards.map((agent) => {
              const Icon = agent.icon
              const isSelected = leadAgentType === agent.id
              return (
                <button
                  key={agent.id}
                  className={cn(
                    "flex h-full flex-col justify-between rounded-sm border p-3 text-left transition-all",
                    isSelected
                      ? isRei
                        ? "border-cyan-400 bg-cyan-50 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                        : "border-green-400 bg-green-900/30 shadow-[inset_2px_0_0_#4ade80]"
                      : theme.inputBg,
                    !agent.selectable && "cursor-not-allowed opacity-50",
                  )}
                  disabled={!agent.selectable}
                  onClick={() => setLeadAgentType(agent.id)}
                  type="button"
                >
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center text-sm font-bold tracking-wider">
                        <Icon className={cn("mr-1.5 h-4 w-4", isSelected ? (isRei ? "text-cyan-600" : "text-green-400") : theme.cardSub)} />
                        <span className={isSelected ? (isRei ? "text-cyan-700" : "text-green-400") : theme.cardTitle}>{agent.name}</span>
                      </div>
                    </div>
                    <p className={cn("mb-3 font-mono text-[0.65rem]", theme.cardSub)}>{agent.desc}</p>
                  </div>
                  {isSelected ? (
                    <div className="mt-auto border-t pt-2" style={{ borderColor: isRei ? "rgba(6,182,212,0.2)" : "rgba(74,222,128,0.2)" }}>
                      <div className={cn("rounded-sm border px-2 py-1 font-mono text-xs", isRei ? "border-cyan-200 bg-white text-cyan-700" : "border-green-500/50 bg-black/50 text-green-400")}>
                        {agent.models[0]}
                      </div>
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>
        </section>
      </div>

      {error ? <div className="mt-4 font-mono text-sm text-red-500">{error}</div> : null}

      <div className={cn("mt-auto flex items-center justify-end space-x-4 border-t pt-4", isRei ? "border-blue-200/20" : "border-purple-500/20")}>
        <Link className={cn("rounded-sm border px-6 py-2 font-mono text-sm tracking-widest transition-colors", theme.btnGhost, isRei ? "border-blue-200" : "border-purple-500/30")} to={`/projects/${projectId}/tasks`}>
          {t("task.create.abandon")}
        </Link>
        <button
          className={cn(
            "flex items-center rounded-sm border px-6 py-2 font-mono text-sm font-bold tracking-widest transition-all",
            !title.trim() || !description.trim() || !leadAgentType || !baseBranch || isSubmitting
              ? "cursor-not-allowed border-slate-500 bg-transparent text-slate-500 opacity-50"
              : isRei
                ? "border-cyan-400 bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)] hover:bg-cyan-600"
                : "border-green-400 bg-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.4)] hover:bg-green-400",
          )}
          disabled={!title.trim() || !description.trim() || !leadAgentType || !baseBranch || isSubmitting}
          onClick={handleCreate}
          type="button"
        >
          <PlayCircle className="mr-2 h-4 w-4" />
          {isSubmitting ? t("task.create.submitting") : t("task.create.submit")}
        </button>
      </div>
    </div>
  )
}

function FieldLabel({
  icon: Icon,
  label,
  required,
  theme,
}: {
  icon?: ComponentType<{ className?: string }>
  label: string
  required?: boolean
  theme: ReturnType<typeof getPilotTheme>
}) {
  return (
    <label className={cn("mb-1.5 block font-mono text-xs", theme.cardSub)}>
      <span className="flex items-center">
        {Icon ? <Icon className="mr-1.5 h-3.5 w-3.5" /> : null}
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </span>
    </label>
  )
}

function TagLabel({ isRei, label }: { isRei: boolean; label: string }) {
  return (
    <div
      className={cn(
        "absolute left-0 top-0 px-3 py-0.5 font-mono text-[0.65rem] font-bold tracking-widest",
        isRei ? "bg-blue-100 text-blue-700" : "bg-purple-900/50 text-purple-300",
      )}
    >
      {label}
    </div>
  )
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18)
}

async function toAttachment(file: File): Promise<PendingAttachment> {
  const contentBase64 = await readFileAsBase64(file)
  return {
    contentBase64,
    fileName: file.name,
    fileType: inferAttachmentType(file.name, file.type),
    mimeType: file.type || "application/octet-stream",
    sizeLabel: formatBytes(file.size),
  }
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      resolve(result.split(",").at(-1) ?? "")
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function inferAttachmentType(fileName: string, mimeType: string) {
  if (mimeType.startsWith("image/")) {
    return "IMAGE"
  }
  if (
    fileName.endsWith(".go") ||
    fileName.endsWith(".ts") ||
    fileName.endsWith(".tsx") ||
    fileName.endsWith(".js") ||
    fileName.endsWith(".jsx") ||
    fileName.endsWith(".json") ||
    fileName.endsWith(".css") ||
    fileName.endsWith(".html")
  ) {
    return "CODE"
  }
  if (fileName.endsWith(".pdf")) {
    return "DOCUMENT"
  }
  return "DOCUMENT"
}

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
