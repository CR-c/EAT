import {
  Activity,
  ArrowDown,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  FileDiff,
  FilePlus,
  FileText,
  FolderOpen,
  GitBranch,
  MessageSquare,
  Network,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Send,
  Terminal,
  TerminalSquare,
  X,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"

import {
  approvePlan,
  confirmRequirements,
  getTaskDiff,
  getTask,
  getTaskRuntime,
  requestTaskReplan,
  sendTaskMessage,
  startClarification,
} from "@/lib/api/tasks"
import { listProjectTasks } from "@/lib/api/projects"
import { getTaskStatusLabel, getWorkbenchStageLabel, translate } from "@/lib/i18n"
import { useAsyncResource } from "@/hooks/use-async-resource"
import { usePreferences } from "@/lib/preferences"
import { getPilotTheme } from "@/lib/pilot-theme"
import { cn } from "@/lib/utils"
import type { SubTaskRecord, TaskDetail, TaskDiff, TaskRecord, TaskRuntime, TaskSession } from "@/lib/types"

type WorkbenchStage = "CLARIFYING" | "PLAN_REVIEW" | "EXECUTING" | "COMPLETED"

interface PlanNode {
  acceptance_criteria?: string[]
  branch_suffix?: string
  depends_on?: string[]
  description?: string
  recommended_agent?: string
  role?: string
  title?: string
}

interface DiffFile {
  additions: number
  deletions: number
  diff: string
  path: string
  type: string
}

export function TaskWorkbenchPage() {
  const { projectId = "" } = useParams()
  const [searchParams] = useSearchParams()
  const { locale, pilot, t } = usePreferences()
  const theme = getPilotTheme(pilot)
  const taskId = searchParams.get("taskId")
  const [chatInput, setChatInput] = useState("")
  const [annotatingNode, setAnnotatingNode] = useState<string | null>(null)
  const [nodeAnnotations, setNodeAnnotations] = useState<Record<string, string>>({})
  const [activeNodeId, setActiveNodeId] = useState<string>("LEAD_AGENT")
  const [selectedDiffFile, setSelectedDiffFile] = useState<DiffFile | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [isMutating, setIsMutating] = useState(false)
  const [liveDetail, setLiveDetail] = useState<TaskDetail | undefined>(undefined)
  const [liveRuntime, setLiveRuntime] = useState<TaskRuntime | undefined>(undefined)
  const detailRef = useRef<TaskDetail | undefined>(undefined)
  const runtimeRef = useRef<TaskRuntime | undefined>(undefined)
  const reloadTimerRef = useRef<number | null>(null)
  const reloadActionsRef = useRef({
    detailReload: () => {},
    runtimeReload: () => {},
    diffReload: () => {},
    tasksReload: () => {},
  })

  const tasks = useAsyncResource({
    deps: [projectId],
    initialData: undefined,
    load: async (signal) => listProjectTasks(projectId, true, signal),
  })

  const detail = useAsyncResource({
    deps: [taskId],
    initialData: undefined,
    load: async (signal) => {
      if (!taskId) {
        return undefined
      }
      return getTask(taskId, signal)
    },
  })

  const runtime = useAsyncResource({
    deps: [taskId],
    initialData: undefined as TaskRuntime | undefined,
    load: async (signal) => {
      if (!taskId) {
        return undefined
      }
      return getTaskRuntime(taskId, signal)
    },
  })

  const diff = useAsyncResource({
    deps: [taskId],
    initialData: undefined as TaskDiff | undefined,
    load: async (signal) => {
      if (!taskId) {
        return undefined
      }
      return getTaskDiff(taskId, signal)
    },
  })

  const effectiveDetail = liveDetail ?? detail.data
  const effectiveRuntime = liveRuntime ?? runtime.data ?? detail.data?.runtime
  const task = effectiveDetail?.task
  const stage = deriveWorkbenchStage(task)
  const parsedPlan = useMemo(() => parseTaskPlan(effectiveDetail), [effectiveDetail])
  const planLayers = useMemo(() => groupPlanNodes(parsedPlan.nodes), [parsedPlan.nodes])
  const graphNodes = useMemo(
    () => getExecutionNodes(effectiveDetail, effectiveRuntime, locale),
    [effectiveDetail, effectiveRuntime, locale],
  )
  const activeNode = graphNodes.find((node) => node.id === activeNodeId) ?? graphNodes[0]
  const diffFiles = useMemo(() => buildDiffFiles(diff.data), [diff.data])

  useEffect(() => {
    reloadActionsRef.current = {
      detailReload: detail.reload,
      runtimeReload: runtime.reload,
      diffReload: diff.reload,
      tasksReload: tasks.reload,
    }
  }, [detail.reload, diff.reload, runtime.reload, tasks.reload])

  useEffect(() => {
    setLiveDetail(detail.data)
  }, [detail.data])

  useEffect(() => {
    setLiveRuntime(runtime.data ?? detail.data?.runtime)
  }, [detail.data?.runtime, runtime.data])

  useEffect(() => {
    detailRef.current = effectiveDetail
  }, [effectiveDetail])

  useEffect(() => {
    runtimeRef.current = effectiveRuntime
  }, [effectiveRuntime])

  useEffect(() => {
    if (!taskId) {
      setLiveDetail(undefined)
      setLiveRuntime(undefined)
      return
    }

    const source = new EventSource(`/api/tasks/${encodeURIComponent(taskId)}/events`)
    const integrationEvents = new Set([
      "integration:queued",
      "integration:started",
      "integration:gate-result",
      "integration:completed",
      "integration:failed",
    ])
    const liveEvents = new Set([
      "session:started",
      "session:output",
      "session:ended",
      "subtask:status",
      "task:status",
      ...integrationEvents,
    ])

    const scheduleReload = (scope: "runtime" | "full") => {
      if (reloadTimerRef.current !== null) {
        return
      }
      reloadTimerRef.current = window.setTimeout(() => {
        reloadTimerRef.current = null
        if (scope === "full") {
          reloadActionsRef.current.detailReload()
          reloadActionsRef.current.diffReload()
          reloadActionsRef.current.tasksReload()
        }
        reloadActionsRef.current.runtimeReload()
      }, 500)
    }

    const handleEvent = (eventName: string, event: MessageEvent<string>) => {
      if (!liveEvents.has(eventName)) {
        return
      }
      const payload = parseSSEPayload(event.data)
      if (!payload) {
        return
      }

      setLiveDetail((current) =>
        applyRealtimeEventToDetail(current ?? detailRef.current, eventName, payload, new Date().toISOString()),
      )
      setLiveRuntime((current) =>
        applyRealtimeEventToRuntime(current ?? runtimeRef.current, eventName, payload),
      )

      if (integrationEvents.has(eventName)) {
        scheduleReload("full")
      }
    }

    const listeners: Array<{ name: string; handler: (event: MessageEvent<string>) => void }> = []
    liveEvents.forEach((name) => {
      const handler = (event: MessageEvent<string>) => handleEvent(name, event)
      listeners.push({ name, handler })
      source.addEventListener(name, handler)
    })

    source.onerror = () => {
      scheduleReload("runtime")
    }

    return () => {
      listeners.forEach(({ name, handler }) => source.removeEventListener(name, handler))
      source.close()
      if (reloadTimerRef.current !== null) {
        window.clearTimeout(reloadTimerRef.current)
        reloadTimerRef.current = null
      }
    }
  }, [taskId])

  useEffect(() => {
    if (graphNodes.length > 0) {
      setActiveNodeId((current) => (graphNodes.some((node) => node.id === current) ? current : graphNodes[0].id))
    }
  }, [graphNodes])

  useEffect(() => {
    if (!selectedDiffFile && diffFiles.length > 0 && stage === "COMPLETED") {
      setSelectedDiffFile(diffFiles[0])
    }
  }, [diffFiles, selectedDiffFile, stage])

  async function handleSendMessage() {
    if (!taskId || !chatInput.trim()) {
      return
    }

    setIsMutating(true)
    setMutationError(null)
    try {
      if (task?.status === "DRAFT") {
        await startClarification(taskId, { content: chatInput.trim() })
      } else {
        await sendTaskMessage(taskId, { content: chatInput.trim() })
      }
      setChatInput("")
      detail.reload()
      diff.reload()
      runtime.reload()
      tasks.reload()
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : t("common.send"))
    } finally {
      setIsMutating(false)
    }
  }

  async function handleConfirmRequirements() {
    if (!taskId) {
      return
    }
    setIsMutating(true)
    setMutationError(null)
    try {
      await confirmRequirements(taskId)
      detail.reload()
      diff.reload()
      runtime.reload()
      tasks.reload()
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : t("task.workbench.confirmRequirements"))
    } finally {
      setIsMutating(false)
    }
  }

  async function handleApprovePlan() {
    if (!taskId) {
      return
    }
    setIsMutating(true)
    setMutationError(null)
    try {
      await approvePlan(taskId)
      detail.reload()
      diff.reload()
      runtime.reload()
      tasks.reload()
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : t("task.workbench.approvePlan"))
    } finally {
      setIsMutating(false)
    }
  }

  async function handleReplanWithAnnotations() {
    if (!taskId) {
      return
    }
    const feedback = Object.entries(nodeAnnotations)
      .map(([id, note]) => t("task.workbench.replanNote", { nodeId: id, note }))
      .join("\n")
    setIsMutating(true)
    setMutationError(null)
    try {
      await requestTaskReplan(taskId, {
        annotations: Object.entries(nodeAnnotations).map(([nodeId, note]) => ({ nodeId, note })),
        reason: feedback || t("task.workbench.replanDefaultReason"),
      })
      setNodeAnnotations({})
      detail.reload()
      diff.reload()
      runtime.reload()
      tasks.reload()
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : t("task.workbench.planReject"))
    } finally {
      setIsMutating(false)
    }
  }

  return (
    <div className="relative z-10 flex h-full flex-col overflow-hidden">
      <WorkbenchTopBar locale={locale} stage={stage} task={task} theme={theme} />
      {mutationError ? (
        <div className="border-b border-red-500/30 bg-red-500/10 px-6 py-3 font-mono text-xs text-red-500">
          {mutationError}
        </div>
      ) : null}

      {!taskId ? (
        <EmptyWorkbench theme={theme} />
      ) : detail.isLoading && !effectiveDetail ? (
        <div className={cn("flex h-full items-center justify-center font-mono text-sm", theme.cardSub)}>{t("common.loadingWorkbench")}</div>
      ) : detail.error && !effectiveDetail ? (
        <div className={cn("m-8 rounded-sm border p-6 font-mono text-sm", theme.cardBg)}>{detail.error}</div>
      ) : effectiveDetail ? (
        <>
          {(stage === "CLARIFYING" || task?.status === "DRAFT") && (
            <ClarifyingView
              chatInput={chatInput}
              detail={effectiveDetail}
              isMutating={isMutating}
              onConfirmRequirements={handleConfirmRequirements}
              onInputChange={setChatInput}
              onSendMessage={handleSendMessage}
              theme={theme}
            />
          )}
          {stage === "PLAN_REVIEW" && (
            <PlanReviewView
              annotatingNode={annotatingNode}
              isMutating={isMutating}
              nodeAnnotations={nodeAnnotations}
              onApprovePlan={handleApprovePlan}
              onFinishAnnotating={() => setAnnotatingNode(null)}
              onNodeAnnotationChange={(nodeId, value) =>
                setNodeAnnotations((current) => ({ ...current, [nodeId]: value }))
              }
              onNodeClick={setAnnotatingNode}
              onReplan={handleReplanWithAnnotations}
              planLayers={planLayers}
              task={task}
              theme={theme}
            />
          )}
          {stage === "EXECUTING" && (
            <ExecutingView
              activeNode={activeNode}
              activeNodeId={activeNodeId}
              detail={effectiveDetail}
              nodes={graphNodes}
              onSelectNode={setActiveNodeId}
              theme={theme}
            />
          )}
          {stage === "COMPLETED" && (
            <CompletedView
              detail={effectiveDetail}
              diff={diff.data}
              diffFiles={diffFiles}
              onSelectDiffFile={setSelectedDiffFile}
              selectedDiffFile={selectedDiffFile}
              theme={theme}
            />
          )}
        </>
      ) : null}
    </div>
  )
}

function WorkbenchTopBar({
  locale,
  stage,
  task,
  theme,
}: {
  locale: "zh-CN" | "en"
  stage: WorkbenchStage
  task?: TaskRecord
  theme: ReturnType<typeof getPilotTheme>
}) {
  const stages: WorkbenchStage[] = ["CLARIFYING", "PLAN_REVIEW", "EXECUTING", "COMPLETED"]
  const currentIndex = stages.indexOf(stage)

  return (
    <div className={cn("flex h-16 shrink-0 items-center justify-between border-b bg-black/10 px-6 backdrop-blur-sm", theme.sidebarBorder)}>
      <div className="flex min-w-0 items-center font-mono">
        <Link className={cn("mr-3 rounded-sm border p-1.5 transition-colors", theme.btnGhost)} to="..">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        {task ? (
          <>
            <div className={cn("mr-3 rounded-sm border px-2 py-0.5 font-mono text-xs font-bold tracking-wider", theme.branchBg)}>
              {task.id}
            </div>
            <span className={cn("mr-4 max-w-xs truncate font-bold", theme.cardTitle)}>{task.title}</span>
            <div className={cn("flex items-center rounded-sm border px-2 py-1 text-xs", theme.pathBg)}>
              <GitBranch className={cn("mr-1.5 h-3 w-3", theme.pathLabel)} />
              {task.taskBranchName ?? translate(locale, "common.autoBranch")}
            </div>
          </>
        ) : null}
      </div>
      <div className="flex items-center space-x-2 overflow-x-auto font-mono text-[0.65rem] tracking-widest">
        {stages.map((item, index) => {
          const isActive = index === currentIndex
          const isPassed = index < currentIndex
          const style = isActive
            ? theme.tabActive
            : isPassed
              ? theme.branchBg
              : theme.badgeDraft
          return (
            <div key={item} className="flex shrink-0 items-center">
              <div className={cn("rounded-sm border px-2 py-1 transition-all duration-500", style)}>{getWorkbenchStageLabel(locale, item)}</div>
              {index < stages.length - 1 ? <ChevronRight className={cn("mx-1 h-3 w-3", isPassed ? theme.pageSub : theme.cardSub)} /> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ClarifyingView({
  chatInput,
  detail,
  isMutating,
  onConfirmRequirements,
  onInputChange,
  onSendMessage,
  theme,
}: {
  chatInput: string
  detail: TaskDetail
  isMutating: boolean
  onConfirmRequirements: () => void
  onInputChange: (value: string) => void
  onSendMessage: () => void
  theme: ReturnType<typeof getPilotTheme>
}) {
  const { locale, t } = usePreferences()
  const docReady = detail.messages.length > 0
  const specLines = buildSpecContent(detail, locale)

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className={cn("flex w-1/2 flex-col border-r", theme.sidebarBorder)}>
        <div className={cn("border-b p-4 font-mono text-xs font-bold tracking-widest", theme.treePathBar)}>
          <TerminalSquare className="mr-2 inline-block h-4 w-4" />
          {t("task.workbench.commandCli")} {t("common.subtitleSlash")}
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto p-6 pb-6">
          {detail.messages.length === 0 ? (
            <ChatBubble content={t("task.workbench.chatSystemBoot")} role="agent" theme={theme} />
          ) : (
            detail.messages.map((message) => (
              <ChatBubble key={message.id} content={message.content} role={message.role === "USER" ? "user" : "agent"} theme={theme} />
            ))
          )}
        </div>
        <div className={cn("border-t p-6", theme.sidebarBorder, theme.shell)}>
          <div className="relative flex items-center">
            <MessageSquare className={cn("absolute left-4 h-5 w-5 opacity-50", theme.pageSub)} />
            <input
              className={cn("w-full rounded-sm border py-3 pl-12 pr-12 font-mono text-sm outline-none transition-all shadow-sm", theme.inputBg)}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onSendMessage()
                }
              }}
              placeholder={t("task.workbench.chatPlaceholder")}
              type="text"
              value={chatInput}
            />
            <button
              className={cn(
                "absolute right-2 rounded-sm p-1.5 transition-colors",
                chatInput.trim()
                  ? pilotButton(theme)
                  : "bg-transparent text-slate-500 opacity-30",
              )}
              disabled={!chatInput.trim() || isMutating}
              onClick={onSendMessage}
              type="button"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className={cn("relative flex w-1/2 flex-col", theme.shell)}>
        <div className={cn("flex items-center justify-between border-b p-4", theme.sidebarBorder)}>
          <div className={cn("flex items-center font-mono text-xs font-bold tracking-widest", theme.pageSub)}>
            <FileText className="mr-2 h-4 w-4" />
            {t("task.workbench.specFile")}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8">
          <div className={cn("space-y-2 font-mono text-sm leading-relaxed", theme.cardTitle)}>
            {specLines.map((line, index) =>
              line.type === "h1" ? (
                <h1 key={index} className="text-2xl font-bold">
                  {line.value}
                </h1>
              ) : line.type === "h2" ? (
                <h2 key={index} className="pt-4 text-xl font-bold">
                  {line.value}
                </h2>
              ) : line.type === "li" ? (
                <li key={index} className="ml-5">
                  {line.value}
                </li>
              ) : line.type === "break" ? (
                <div key={index} className="h-3" />
              ) : (
                <p key={index}>{line.value}</p>
              ),
            )}
          </div>
        </div>
        <div className={cn("flex justify-end border-t p-4", theme.sidebarBorder, theme.shell)}>
          <button
            className={cn(
              "flex items-center rounded-sm border px-6 py-2.5 font-mono text-sm font-bold tracking-widest shadow-lg transition-all",
              !docReady ? "cursor-not-allowed border-slate-500 text-slate-500 opacity-50" : pilotButton(theme),
            )}
            disabled={!docReady || isMutating || detail.task.status !== "CLARIFYING"}
            onClick={onConfirmRequirements}
            type="button"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {t("task.workbench.confirmRequirements")}
          </button>
        </div>
      </div>
    </div>
  )
}

function PlanReviewView({
  annotatingNode,
  isMutating,
  nodeAnnotations,
  onApprovePlan,
  onFinishAnnotating,
  onNodeAnnotationChange,
  onNodeClick,
  onReplan,
  planLayers,
  task,
  theme,
}: {
  annotatingNode: string | null
  isMutating: boolean
  nodeAnnotations: Record<string, string>
  onApprovePlan: () => void
  onFinishAnnotating: () => void
  onNodeAnnotationChange: (nodeId: string, value: string) => void
  onNodeClick: (nodeId: string) => void
  onReplan: () => void
  planLayers: PlanNode[][]
  task?: TaskRecord
  theme: ReturnType<typeof getPilotTheme>
}) {
  const { t } = usePreferences()
  const hasAnnotations = Object.keys(nodeAnnotations).length > 0

  return (
    <div className="relative flex h-full flex-col overflow-y-auto p-8">
      <div className="mb-6 text-center">
        <h3 className={cn("mb-2 flex items-center justify-center font-mono text-xl font-bold tracking-widest", theme.pageSub)}>
          <Network className="mr-2 h-5 w-5" />
          {t("task.workbench.planReviewTitle")}
        </h3>
        <p className={cn("font-mono text-sm", theme.cardSub)}>
          {t("task.workbench.planHelp")}
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center space-y-6 pb-20">
        {planLayers.length === 0 ? (
          <div className={cn("w-full rounded-sm border border-dashed p-10 text-center font-mono text-sm", theme.cardBg)}>
            {t("task.workbench.planEmpty")}
          </div>
        ) : (
          planLayers.map((layer, layerIndex) => (
            <div key={layerIndex} className={cn("flex w-full flex-col items-center gap-6", layer.length > 1 && "md:flex-row")}>
              {layer.map((node, nodeIndex) => {
                const nodeId = node.branch_suffix ?? `NODE_${layerIndex + 1}_${nodeIndex + 1}`
                const note = nodeAnnotations[nodeId]
                const isEditing = annotatingNode === nodeId
                return (
                  <div
                    key={nodeId}
                    className={cn(
                      "relative w-full cursor-pointer rounded-sm border p-5 shadow-lg transition-all hover:-translate-y-1",
                      note ? theme.badgeWarn.replace("text-", "border-").replace("shadow-", "shadow-none ") : theme.cardBg,
                      layer.length > 1 && "md:flex-1",
                    )}
                    onClick={() => onNodeClick(nodeId)}
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <div className={cn("rounded-sm border px-1.5 py-0.5 font-mono text-[0.65rem] font-bold tracking-widest", theme.branchBg)}>
                        {nodeId}
                      </div>
                      <div className={cn("flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[0.65rem]", theme.taskBg)}>
                        <Bot className="mr-1 h-3 w-3" />
                        {node.recommended_agent ?? task?.leadAgentType ?? "agent"}
                      </div>
                    </div>
                    <h4 className={cn("mb-2 text-sm font-bold", theme.cardTitle)}>{node.title ?? node.role ?? t("task.workbench.unnamedNode")}</h4>
                    <p className={cn("text-sm", theme.cardSub)}>{node.description}</p>
                    {node.depends_on?.length ? (
                      <div className={cn("mb-2 mt-3 font-mono text-[0.65rem] opacity-60", theme.cardSub)}>
                        {t("task.workbench.dependencies")}: [{node.depends_on.join(", ")}]
                      </div>
                    ) : null}
                    {isEditing ? (
                      <div className="mt-3" onClick={(event) => event.stopPropagation()}>
                        <textarea
                          autoFocus
                          className={cn("w-full rounded-sm border px-2 py-1 font-mono text-xs outline-none", theme.inputBg)}
                          onChange={(event) => onNodeAnnotationChange(nodeId, event.target.value)}
                          placeholder={t("task.workbench.writeNote")}
                          rows={2}
                          value={note ?? ""}
                        />
                        <button
                          className={cn("mt-1 rounded-sm px-2 py-0.5 text-xs transition-colors", theme.btnGhost)}
                          onClick={onFinishAnnotating}
                          type="button"
                        >
                          {t("task.workbench.noteDone")}
                        </button>
                      </div>
                    ) : note ? (
                      <div className={cn("mt-3 rounded-sm border p-2 font-mono text-xs", theme.pathBg)}>
                        {t("task.workbench.note")}: {note}
                      </div>
                    ) : null}
                  </div>
                )
              })}
              {layerIndex < planLayers.length - 1 ? <ArrowDown className={cn("h-6 w-6 animate-bounce opacity-50", theme.dagLine)} /> : null}
            </div>
          ))
        )}
      </div>

      <div className={cn("absolute bottom-0 left-0 flex w-full justify-center space-x-6 bg-gradient-to-t pt-12", pilotGradient(theme))}>
        <button
          className={cn("rounded-sm border px-8 py-3 font-mono text-sm tracking-widest transition-colors", theme.btnGhost)}
          onClick={onReplan}
          type="button"
        >
          {hasAnnotations ? t("task.workbench.planRejectWithNotes") : t("task.workbench.planReject")}
        </button>
        <button
          className={cn(
            "flex items-center rounded-sm border px-10 py-3 font-mono text-sm font-bold tracking-widest transition-all",
            task?.status !== "PLAN_REVIEW" || isMutating
              ? "cursor-not-allowed border-slate-500 text-slate-500 opacity-50"
              : pilotButton(theme),
          )}
          disabled={task?.status !== "PLAN_REVIEW" || isMutating}
          onClick={onApprovePlan}
          type="button"
        >
          <PlayCircle className="mr-2 h-5 w-5" />
          {t("task.workbench.approvePlan")}
        </button>
      </div>
    </div>
  )
}

function ExecutingView({
  activeNode,
  activeNodeId,
  detail,
  nodes,
  onSelectNode,
  theme,
}: {
  activeNode?: ExecutionNode
  activeNodeId: string
  detail: TaskDetail
  nodes: ExecutionNode[]
  onSelectNode: (nodeId: string) => void
  theme: ReturnType<typeof getPilotTheme>
}) {
  const { t } = usePreferences()
  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className={cn("flex w-1/3 max-w-[320px] shrink-0 flex-col border-r", theme.sidebarBorder, theme.shell)}>
        <div className={cn("flex items-center justify-between border-b p-4 font-mono text-xs font-bold tracking-widest", theme.treePathBar)}>
          <span>
            {t("task.workbench.workerStatus")} {t("common.subtitleSlash")}
          </span>
          <Activity className="h-4 w-4 animate-pulse" />
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {nodes.map((node) => (
            <button
              key={node.id}
              className={cn(
                "w-full rounded-sm border p-3 text-left transition-all duration-300",
                node.id === activeNodeId ? theme.dagNodeActive : theme.dagNodeReady,
                node.status === "running" ? "opacity-100" : "opacity-70 hover:opacity-100",
              )}
              onClick={() => onSelectNode(node.id)}
              type="button"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className={cn("font-mono text-xs font-bold", node.id === activeNodeId ? theme.pageSub : theme.cardTitle)}>{node.id}</div>
                {node.status === "running" ? (
                  <div className={cn("h-2 w-2 animate-ping rounded-full", theme.pageSub)} />
                ) : node.status === "done" ? (
                  <CheckCircle2 className={cn("h-3 w-3", theme.pageSub)} />
                ) : (
                  <PauseCircle className={cn("h-3 w-3 opacity-30", theme.cardSub)} />
                )}
              </div>
              <div className={cn("mb-2 truncate text-sm", node.id === activeNodeId ? theme.pageSub : theme.cardTitle)}>{node.name}</div>
              <div className="flex items-center justify-between font-mono text-[0.65rem]">
                <span className={cn("flex items-center", theme.cardSub)}>
                  <Bot className="mr-1 h-3 w-3 opacity-50" />
                  {node.agent}
                </span>
                {node.branch ? <span className={cn("max-w-[120px] truncate rounded-sm border px-1.5 py-0.5", theme.pathBg)}>{node.branch}</span> : null}
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col bg-[#1e1e1e]">
        <div className="flex h-10 items-center justify-between border-b border-[#333] bg-[#252526] px-4 font-mono text-xs text-slate-300">
          <div className="flex items-center">
            <Terminal className="mr-2 h-4 w-4" />
            bash - {activeNode?.id ?? "LEAD_AGENT"}
          </div>
          <div className="rounded-sm border border-white/10 px-2 py-0.5 text-slate-400">
            {detail.board ? t("task.workbench.boardLinked") : t("task.workbench.localBuffer")}
          </div>
        </div>
        <div className={cn("flex-1 overflow-y-auto p-6 font-mono text-sm leading-relaxed whitespace-pre-wrap", theme.terminalBg)}>
          {activeNode?.logs ?? t("task.workbench.runtimeNoLogs")}
          {activeNode?.status === "running" ? <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-current align-middle" /> : null}
        </div>
      </div>
    </div>
  )
}

function CompletedView({
  detail,
  diff,
  diffFiles,
  onSelectDiffFile,
  selectedDiffFile,
  theme,
}: {
  detail: TaskDetail
  diff?: TaskDiff
  diffFiles: DiffFile[]
  onSelectDiffFile: (file: DiffFile | null) => void
  selectedDiffFile: DiffFile | null
  theme: ReturnType<typeof getPilotTheme>
}) {
  const { locale, t } = usePreferences()
  const fileTree = buildFileTree(diffFiles)

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className={cn("flex w-64 flex-col border-r", theme.sidebarBorder, theme.shell)}>
        <div className={cn("flex items-center justify-between border-b p-4 font-mono text-xs font-bold tracking-widest", theme.treePathBar)}>
          <span className="flex items-center">
            <FolderOpen className="mr-2 h-4 w-4" />
            {t("task.workbench.files")}
          </span>
          <span className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-500">
            +{diff?.summary.additions ?? 0} / -{diff?.summary.deletions ?? 0}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="mb-3 mt-2 px-2">
            <div className={cn("w-full rounded-sm border py-1.5 pl-8 pr-3 font-mono text-xs", theme.inputBg)}>
              {t("task.workbench.fileFilter")}
            </div>
          </div>
          <div className="font-mono text-xs">
            <FileTreeNode
              node={fileTree}
              onSelect={onSelectDiffFile}
              selected={selectedDiffFile}
              theme={theme}
            />
          </div>
        </div>
        <div className={cn("border-t p-4", theme.sidebarBorder, theme.shell)}>
          <div className={cn("rounded-sm border px-3 py-2 font-mono text-xs", theme.pathBg)}>
            {diff?.available ? t("task.workbench.diffReady", { baseRef: diff.baseRef, headRef: diff.headRef }) : diff?.reason ?? t("task.workbench.diffEmpty")}
          </div>
        </div>
      </div>

      {selectedDiffFile ? (
        <div className="flex flex-1 flex-col border-r bg-[#1e1e1e]">
          <div className="flex h-10 items-center justify-between border-b border-[#333] bg-[#252526] px-4 font-mono text-xs text-slate-300">
            <div className="flex items-center">
              <span className="mr-3 font-bold">{selectedDiffFile.path.split("/").pop()}</span>
              {selectedDiffFile.additions > 0 ? <span className="mr-2 text-emerald-500">+{selectedDiffFile.additions}</span> : null}
              {selectedDiffFile.deletions > 0 ? <span className="text-red-500">-{selectedDiffFile.deletions}</span> : null}
            </div>
            <div className="flex items-center space-x-3 text-slate-500">
              <RefreshCw className="h-3.5 w-3.5" />
              <FilePlus className="h-3.5 w-3.5" />
              <button onClick={() => onSelectDiffFile(null)} type="button">
                <X className="h-4 w-4 hover:text-red-400" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-[#1e1e1e] py-2 font-mono text-[0.8rem] leading-relaxed">
            {(selectedDiffFile.diff || t("task.workbench.diffPlaceholder")).split("\n").map((line, index) => {
              const { bgClass, lineClass } = getDiffLineClasses(line)
              return (
                <div key={`${line}-${index}`} className={cn("flex px-4 py-0.5 hover:bg-white/5", bgClass)}>
                  <span className="mr-4 w-10 shrink-0 select-none text-right opacity-40">{index + 1}</span>
                  <span className={cn("break-all", lineClass)}>{line}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className={cn("flex flex-1 items-center justify-center font-mono text-sm", theme.shell, theme.cardSub)}>
          <div className="flex flex-col items-center">
            <FileDiff className="mb-4 h-12 w-12 opacity-20" />
            {t("task.workbench.selectNodeFile")}
          </div>
        </div>
      )}

      <div className={cn("relative flex w-[320px] shrink-0 flex-col", theme.shell)}>
        <div className={cn("flex items-center justify-between border-b p-4", theme.sidebarBorder)}>
          <div className={cn("flex items-center font-mono text-xs font-bold tracking-widest", theme.pageSub)}>
            <Bot className="mr-2 h-4 w-4" />
            {t("task.workbench.leadAgentReview")}
          </div>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4 pb-32">
          <ChatBubble
            content={t("task.workbench.reviewPatch")}
            role="agent"
            theme={theme}
          />
          <div className={cn("rounded-sm border p-3 font-mono text-xs", theme.pathBg)}>
            {t("task.workbench.summary.taskStatus")}: {getTaskStatusLabel(locale, detail.task.status)}
            <br />
            {t("task.workbench.summary.subTasks")}: {detail.subTasks.length}
            <br />
            {t("task.workbench.summary.historyMessages")}: {detail.messages.length}
          </div>
        </div>
        <div className={cn("absolute bottom-0 left-0 right-0 bg-gradient-to-t p-4 pt-12", pilotGradient(theme))}>
          <div className="relative flex w-full items-center">
            <input
              className={cn("w-full rounded-sm border py-2 pl-3 pr-8 font-mono text-xs outline-none transition-all shadow-sm", theme.inputBg)}
              placeholder={t("task.workbench.reviewPlaceholder")}
              readOnly
              type="text"
            />
            <button className="absolute right-2 rounded-sm p-1 text-slate-500 opacity-30" type="button">
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyWorkbench({ theme }: { theme: ReturnType<typeof getPilotTheme> }) {
  const { t } = usePreferences()
  return (
    <div className="flex h-full items-center justify-center">
      <div className={cn("rounded-sm border border-dashed px-8 py-10 font-mono text-sm", theme.cardBg)}>
        {t("task.empty")}
      </div>
    </div>
  )
}

function ChatBubble({
  content,
  role,
  theme,
}: {
  content: string
  role: "agent" | "user"
  theme: ReturnType<typeof getPilotTheme>
}) {
  const { t } = usePreferences()
  return (
    <div className={cn("flex", role === "user" ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] rounded-sm border p-4 backdrop-blur-md", role === "user" ? theme.chatUser : theme.chatAgent)}>
        <div className="mb-2 flex items-center font-mono text-[0.65rem] opacity-60">
          {role === "user" ? <RefreshCw className="mr-1 h-3 w-3" /> : <Bot className="mr-1 h-3 w-3" />}
          {role === "user" ? t("task.workbench.role.user") : t("task.workbench.role.agent")}
        </div>
        <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed">{content}</div>
      </div>
    </div>
  )
}

function parseSSEPayload(data: string): Record<string, unknown> | null {
  if (!data) {
    return null
  }
  try {
    return JSON.parse(data) as Record<string, unknown>
  } catch {
    return null
  }
}

function applyRealtimeEventToDetail(
  detail: TaskDetail | undefined,
  eventName: string,
  payload: Record<string, unknown>,
  eventAt: string,
): TaskDetail | undefined {
  if (!detail) {
    return detail
  }

  if (eventName === "task:status") {
    const nextStatus = asString(payload.status)
    if (!nextStatus) {
      return detail
    }
    const reason = asNullableString(payload.reason)
    return {
      ...detail,
      task: {
        ...detail.task,
        status: nextStatus,
        lastError: reason,
      },
    }
  }

  if (eventName === "subtask:status") {
    const subTaskID = asString(payload.subTaskId) ?? asString(payload.id)
    if (!subTaskID) {
      return detail
    }
    const subTasks = detail.subTasks.map((subTask) => {
      if (subTask.id !== subTaskID) {
        return subTask
      }
      return patchSubTaskFromPayload(subTask, payload)
    })
    return { ...detail, subTasks }
  }

  if (eventName === "session:started" || eventName === "session:ended" || eventName === "session:output") {
    const sessions = patchSessionsFromPayload(detail.sessions, eventName, payload)
    if (sessions === detail.sessions) {
      return detail
    }
    return { ...detail, sessions }
  }

  if (eventName.startsWith("integration:")) {
    return {
      ...detail,
      integration: {
        ...detail.integration,
        realtime: {
          eventName,
          eventAt,
          payload,
        },
      },
    }
  }

  return detail
}

function applyRealtimeEventToRuntime(
  runtime: TaskRuntime | undefined,
  eventName: string,
  payload: Record<string, unknown>,
): TaskRuntime | undefined {
  if (!runtime) {
    return runtime
  }

  if (eventName === "task:status") {
    const nextStatus = asString(payload.status)
    if (!nextStatus) {
      return runtime
    }
    const nextWorkspaceStage = workspaceStageForTaskStatus(nextStatus)
    return {
      ...runtime,
      taskStatus: nextStatus,
      workspaceStage: nextWorkspaceStage,
      workspaceStageLabel: nextWorkspaceStage,
    }
  }

  if (eventName === "subtask:status") {
    const subTaskID = asString(payload.subTaskId) ?? asString(payload.id)
    if (!subTaskID) {
      return runtime
    }
    const status = asString(payload.status)
    const title = asString(payload.title)
    const agentType = asString(payload.agentType)
    const branchName = asNullableString(payload.branchName)
    let patched = false
    const nodes = runtime.nodes.map((node) => {
      if (node.subTaskId !== subTaskID && node.id !== subTaskID) {
        return node
      }
      patched = true
      return {
        ...node,
        title: title ?? node.title,
        status: status ?? node.status,
        agentType: agentType ?? node.agentType,
        branchName: branchName ?? node.branchName,
        errorReason: asNullableString(payload.lastError) ?? node.errorReason,
      }
    })
    if (!patched) {
      return runtime
    }
    return {
      ...runtime,
      nodes,
      summary: summarizeRuntime(nodes),
    }
  }

  if (eventName === "session:started" || eventName === "session:ended" || eventName === "session:output") {
    const sessionID = asString(payload.sessionId)
    const subTaskID = asString(payload.subTaskId)
    const nodeID = subTaskID ?? "lead"
    let patched = false
    const nodes = runtime.nodes.map((node) => {
      const isLeadNode = node.nodeType === "LEAD" || node.id === "lead"
      const matchesBySubTask = subTaskID ? node.subTaskId === subTaskID || node.id === subTaskID : false
      const matchesBySession = sessionID ? node.sessionId === sessionID : false
      const matchesLead = !subTaskID && isLeadNode
      if (!matchesBySubTask && !matchesBySession && !matchesLead && node.id !== nodeID) {
        return node
      }
      patched = true
      if (eventName === "session:output") {
        const chunk = asString(payload.chunk)
        if (!chunk) {
          return node
        }
        return {
          ...node,
          sessionId: sessionID ?? node.sessionId,
          logsPreview: trimTail(node.logsPreview + chunk, 4000),
          status: node.status === "PENDING" ? "RUNNING" : node.status,
        }
      }
      if (eventName === "session:started") {
        return {
          ...node,
          sessionId: sessionID ?? node.sessionId,
          startedAt: asNullableString(payload.startedAt) ?? node.startedAt,
          status: "RUNNING",
        }
      }
      const sessionStatus = asString(payload.status)
      return {
        ...node,
        sessionId: sessionID ?? node.sessionId,
        endedAt: asNullableString(payload.endedAt) ?? node.endedAt,
        exitCode: asNullableNumber(payload.exitCode) ?? node.exitCode,
        status: mapSessionStatusToNodeStatus(sessionStatus, node.status),
        errorReason: sessionStatus === "FAILED" ? `Session ${sessionID ?? ""} failed.` : node.errorReason,
      }
    })
    if (!patched) {
      return runtime
    }
    return {
      ...runtime,
      nodes,
      summary: summarizeRuntime(nodes),
    }
  }

  return runtime
}

function patchSubTaskFromPayload(subTask: SubTaskRecord, payload: Record<string, unknown>): SubTaskRecord {
  return {
    ...subTask,
    title: asString(payload.title) ?? subTask.title,
    description: asString(payload.description) ?? subTask.description,
    branchSuffix: asString(payload.branchSuffix) ?? subTask.branchSuffix,
    branchName: asNullableString(payload.branchName) ?? subTask.branchName,
    agentType: asString(payload.agentType) ?? subTask.agentType,
    status: asString(payload.status) ?? subTask.status,
    lastError: asNullableString(payload.lastError) ?? subTask.lastError,
    retryCount: asNumber(payload.retryCount) ?? subTask.retryCount,
    displayName: asNullableString(payload.displayName) ?? subTask.displayName,
    assignmentSource: asNullableString(payload.assignmentSource) ?? subTask.assignmentSource,
    runSummary: asNullableString(payload.runSummary) ?? subTask.runSummary,
  }
}

function patchSessionsFromPayload(
  sessions: TaskSession[],
  eventName: string,
  payload: Record<string, unknown>,
): TaskSession[] {
  const sessionID = asString(payload.sessionId) ?? asString(payload.id)
  if (!sessionID) {
    return sessions
  }
  const existingIndex = sessions.findIndex((session) => session.id === sessionID)
  const existing = existingIndex >= 0 ? sessions[existingIndex] : undefined
  const next = patchSession(existing, eventName, payload)
  if (!next) {
    return sessions
  }
  if (existingIndex < 0) {
    return [...sessions, next]
  }
  const patched = [...sessions]
  patched[existingIndex] = next
  return patched
}

function patchSession(
  existing: TaskSession | undefined,
  eventName: string,
  payload: Record<string, unknown>,
): TaskSession | null {
  const now = new Date().toISOString()
  const outputBufferMaxBytes = asNumber(payload.outputBufferMaxBytes) ?? existing?.outputBufferMaxBytes ?? 65536
  const baseline: TaskSession = existing ?? {
    id: asString(payload.sessionId) ?? asString(payload.id) ?? "",
    taskId: asString(payload.taskId) ?? "",
    subTaskId: asNullableString(payload.subTaskId),
    agentType: asString(payload.agentType) ?? "",
    sessionType: asString(payload.sessionType) ?? "WORKER",
    sandboxType: asString(payload.sandboxType) ?? "DOCKER",
    containerId: asNullableString(payload.containerId),
    status: asString(payload.status) ?? "PENDING",
    pid: asNullableNumber(payload.pid),
    startedAt: asNullableString(payload.startedAt),
    endedAt: asNullableString(payload.endedAt),
    exitCode: asNullableNumber(payload.exitCode),
    logPath: asNullableString(payload.logPath),
    firstOutputAt: asNullableString(payload.firstOutputAt),
    outputBuffer: asString(payload.outputBuffer) ?? "",
    outputBufferMaxBytes,
    createdAt: now,
    updatedAt: now,
  }
  if (!baseline.id) {
    return null
  }

  if (eventName === "session:output") {
    const chunk = asString(payload.chunk)
    if (!chunk) {
      return baseline
    }
    return {
      ...baseline,
      firstOutputAt: baseline.firstOutputAt ?? now,
      outputBuffer: trimTail((baseline.outputBuffer ?? "") + chunk, outputBufferMaxBytes),
      status: baseline.status === "PENDING" ? "RUNNING" : baseline.status,
      updatedAt: now,
    }
  }

  return {
    ...baseline,
    taskId: asString(payload.taskId) ?? baseline.taskId,
    subTaskId: asNullableString(payload.subTaskId) ?? baseline.subTaskId,
    agentType: asString(payload.agentType) ?? baseline.agentType,
    sessionType: asString(payload.sessionType) ?? baseline.sessionType,
    sandboxType: asString(payload.sandboxType) ?? baseline.sandboxType,
    containerId: asNullableString(payload.containerId) ?? baseline.containerId,
    status: asString(payload.status) ?? baseline.status,
    pid: asNullableNumber(payload.pid) ?? baseline.pid,
    startedAt: asNullableString(payload.startedAt) ?? baseline.startedAt,
    endedAt: asNullableString(payload.endedAt) ?? baseline.endedAt,
    exitCode: asNullableNumber(payload.exitCode) ?? baseline.exitCode,
    logPath: asNullableString(payload.logPath) ?? baseline.logPath,
    firstOutputAt: asNullableString(payload.firstOutputAt) ?? baseline.firstOutputAt,
    outputBuffer: asString(payload.outputBuffer) ?? baseline.outputBuffer,
    outputBufferMaxBytes,
    updatedAt: now,
  }
}

function summarizeRuntime(nodes: TaskRuntime["nodes"]): TaskRuntime["summary"] {
  let running = 0
  let waiting = 0
  let failed = 0
  let workerCount = 0

  nodes.forEach((node) => {
    if (node.nodeType === "SUBTASK") {
      workerCount += 1
    }
    if (node.status === "RUNNING" || node.status === "EXECUTING") {
      running += 1
      return
    }
    if (node.status === "FAILED" || node.status === "CANCELLED" || node.status === "DISCARD_PENDING" || node.status === "REWORK_REQUIRED") {
      failed += 1
      return
    }
    if (node.status === "PENDING" || node.status === "BLOCKED" || node.status === "READY" || node.status === "REVIEW_PENDING") {
      waiting += 1
    }
  })

  return {
    failed,
    running,
    total: nodes.length,
    waiting,
    workerCount,
  }
}

function mapSessionStatusToNodeStatus(sessionStatus: string | undefined, fallback: string): string {
  switch (sessionStatus) {
    case "RUNNING":
      return "RUNNING"
    case "COMPLETED":
      return "REVIEW_PENDING"
    case "FAILED":
      return "FAILED"
    case "CANCELLED":
      return "CANCELLED"
    default:
      return fallback
  }
}

function workspaceStageForTaskStatus(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "COMPLETED"
    case "EXECUTING":
    case "ACTION_REQUIRED":
    case "REVIEWING":
    case "MERGING":
      return "EXECUTING"
    case "PLAN_REVIEW":
    case "PLANNING":
      return "PLAN_REVIEW"
    default:
      return "CLARIFYING"
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null
  }
  return asString(value)
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  return undefined
}

function asNullableNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null
  }
  return asNumber(value)
}

function trimTail(value: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return value
  }
  if (value.length <= maxBytes) {
    return value
  }
  return value.slice(value.length - maxBytes)
}

function deriveWorkbenchStage(task?: TaskRecord): WorkbenchStage {
  switch (task?.workspaceStage ?? task?.status) {
    case "COMPLETED":
      return "COMPLETED"
    case "EXECUTING":
      return "EXECUTING"
    case "PLAN_REVIEW":
      return "PLAN_REVIEW"
    default:
      return "CLARIFYING"
  }
}

function buildSpecContent(detail: TaskDetail, locale: "zh-CN" | "en") {
  const lines = [
    `# ${translate(locale, "task.workbench.spec.title", { title: detail.task.title })}`,
    "",
    `## ${translate(locale, "task.workbench.spec.goal")}`,
    detail.task.description || translate(locale, "task.workbench.spec.goalEmpty"),
    "",
    `## ${translate(locale, "task.workbench.spec.context")}`,
    `- ${translate(locale, "task.workbench.spec.taskId", { taskId: detail.task.id })}`,
    `- ${translate(locale, "task.workbench.spec.leadAgent", { agent: detail.task.leadAgentType })}`,
    `- ${translate(locale, "task.workbench.spec.baseBranch", { branch: detail.task.baseBranch })}`,
    `- ${translate(locale, "task.workbench.spec.taskBranch", { branch: detail.task.taskBranchName ?? translate(locale, "common.autoGenerated") })}`,
    "",
    `## ${translate(locale, "task.workbench.spec.attachments")}`,
    ...(detail.attachments.length
      ? detail.attachments.map((item) => `- ${translate(locale, "task.workbench.spec.attachmentItem", { name: item.fileName, type: item.fileType })}`)
      : [`- ${translate(locale, "task.workbench.spec.attachmentsEmpty")}`]),
    "",
    `## ${translate(locale, "task.workbench.spec.messages")}`,
    ...(detail.messages.length
      ? detail.messages.slice(-3).map((item) => `- [${item.role}] ${item.content}`)
      : [`- ${translate(locale, "task.workbench.spec.messagesEmpty")}`]),
  ]
  return lines.map((line) => {
    if (line.startsWith("# ")) {
      return { type: "h1" as const, value: line.slice(2) }
    }
    if (line.startsWith("## ")) {
      return { type: "h2" as const, value: line.slice(3) }
    }
    if (line.startsWith("- ")) {
      return { type: "li" as const, value: line.slice(2) }
    }
    if (!line) {
      return { type: "break" as const, value: "" }
    }
    return { type: "p" as const, value: line }
  })
}

function parseTaskPlan(detail?: TaskDetail) {
  const rawPlan = detail?.task.currentPlanJson ?? detail?.task.approvedPlanJson
  if (!rawPlan) {
    return { nodes: [] as PlanNode[] }
  }
  try {
    const parsed = JSON.parse(rawPlan) as { nodes?: PlanNode[]; subtasks?: PlanNode[] }
    return { nodes: parsed.nodes?.length ? parsed.nodes : (parsed.subtasks ?? []) }
  } catch {
    return { nodes: [] as PlanNode[] }
  }
}

function groupPlanNodes(nodes: PlanNode[]) {
  if (nodes.length === 0) {
    return []
  }

  const byId = new Map<string, PlanNode>()
  nodes.forEach((node, index) => {
    byId.set(node.branch_suffix ?? `node-${index}`, node)
  })

  const memo = new Map<string, number>()
  const getDepth = (node: PlanNode): number => {
    const nodeId = node.branch_suffix ?? ""
    if (memo.has(nodeId)) {
      return memo.get(nodeId) ?? 0
    }
    const deps = (node.depends_on ?? []).map((dep) => byId.get(dep)).filter(Boolean) as PlanNode[]
    const depth = deps.length ? Math.max(...deps.map(getDepth)) + 1 : 0
    memo.set(nodeId, depth)
    return depth
  }

  const layers = new Map<number, PlanNode[]>()
  nodes.forEach((node) => {
    const depth = getDepth(node)
    const group = layers.get(depth) ?? []
    group.push(node)
    layers.set(depth, group)
  })
  return [...layers.entries()].sort((a, b) => a[0] - b[0]).map((entry) => entry[1])
}

interface ExecutionNode {
  agent: string
  branch?: string
  id: string
  logs: string
  name: string
  status: "done" | "pending" | "running"
}

function getExecutionNodes(detail?: TaskDetail, runtime?: TaskRuntime, locale: "zh-CN" | "en" = "zh-CN"): ExecutionNode[] {
  if (!detail) {
    return []
  }
  if (runtime?.nodes?.length) {
    return runtime.nodes.map((node) => ({
      agent: node.agentType,
      branch: node.branchName ?? undefined,
      id: node.id,
      logs: node.logsPreview || translate(locale, "task.workbench.runtimeNoLogs"),
      name: node.title,
      status:
        node.status === "RUNNING" || node.status === "EXECUTING"
          ? "running"
          : node.status === "MERGED" || node.status === "ACCEPTED" || node.status === "COMPLETED"
            ? "done"
            : "pending",
    }))
  }

  const leadSession = detail.sessions.find((session) => session.sessionType === "LEAD")
  const leadNode: ExecutionNode = {
    agent: detail.task.leadAgentType,
    branch: detail.task.taskBranchName ?? undefined,
    id: "LEAD_AGENT",
    logs: leadSession?.outputBuffer || translate(locale, "task.workbench.runtimeLeadWaiting"),
    name: translate(locale, "task.workbench.runtimeNodeName"),
    status: detail.task.status === "EXECUTING" ? "running" : detail.task.status === "COMPLETED" ? "done" : "pending",
  }

  const nodes = detail.subTasks.map((subTask) => {
    const session = detail.sessions.find((item) => item.subTaskId === subTask.id)
    return {
      agent: subTask.agentType,
      branch: subTask.branchName ?? undefined,
      id: subTask.branchSuffix || subTask.id,
      logs:
        session?.outputBuffer ||
        translate(locale, "task.workbench.runtimeNodeLog", {
          status: translate(locale, `status.${subTask.status}`),
          title: subTask.title,
          worktree: subTask.worktreePath ?? translate(locale, "task.workbench.runtimePending"),
        }),
      name: subTask.displayName ?? subTask.title,
      status:
        subTask.status === "RUNNING"
          ? "running"
          : subTask.status === "MERGED" || subTask.status === "ACCEPTED"
            ? "done"
            : "pending",
    } satisfies ExecutionNode
  })

  return [leadNode, ...nodes]
}

function buildDiffFiles(diff?: TaskDiff): DiffFile[] {
  return (
    diff?.files.map((file) => ({
      additions: file.additions,
      deletions: file.deletions,
      diff: file.patch ?? "",
      path: file.path,
      type: file.type,
    })) ?? []
  )
}

interface FileTreeNodeValue {
  children?: Record<string, FileTreeNodeValue>
  fileData?: DiffFile
  name: string
  path: string
  type: "file" | "folder"
}

function buildFileTree(files: DiffFile[]) {
  const root: FileTreeNodeValue = { children: {}, name: "root", path: "", type: "folder" }
  files.forEach((file) => {
    const parts = file.path.split("/")
    let current = root
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        current.children![part] = { fileData: file, name: part, path: file.path, type: "file" }
      } else {
        if (!current.children![part]) {
          current.children![part] = {
            children: {},
            name: part,
            path: parts.slice(0, index + 1).join("/"),
            type: "folder",
          }
        }
        current = current.children![part]
      }
    })
  })
  return root
}

function FileTreeNode({
  node,
  onSelect,
  selected,
  theme,
}: {
  node: FileTreeNodeValue
  onSelect: (file: DiffFile) => void
  selected: DiffFile | null
  theme: ReturnType<typeof getPilotTheme>
}) {
  const [open, setOpen] = useState(true)
  if (node.name === "root") {
    return (
      <div className="py-2">
        {Object.values(node.children ?? {}).map((child) => (
          <FileTreeNode key={child.path} node={child} onSelect={onSelect} selected={selected} theme={theme} />
        ))}
      </div>
    )
  }

  if (node.type === "folder") {
    return (
      <div>
        <button
          className={cn("flex w-full items-center justify-between py-1.5 pr-3 text-left transition-colors", theme.treeItemHover)}
          onClick={() => setOpen((current) => !current)}
          style={{ paddingLeft: 12 }}
          type="button"
        >
          <div className="flex items-center overflow-hidden">
            <ChevronRight className={cn("mr-1 h-3 w-3 transition-transform", open && "rotate-90", theme.cardSub)} />
            <FolderOpen className={cn("mr-2 h-4 w-4 shrink-0", theme.pageSub)} />
            <span className={cn("truncate font-mono text-sm", theme.cardTitle)}>{node.name}</span>
          </div>
        </button>
        {open ? (
          <div>
            {Object.values(node.children ?? {}).map((child) => (
              <FileTreeNode key={child.path} node={child} onSelect={onSelect} selected={selected} theme={theme} />
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  const isSelected = selected?.path === node.path
  return (
    <button
      className={cn("flex w-full items-center justify-between py-1.5 pr-3 text-left transition-colors", isSelected ? theme.dagNodeActive : theme.treeItemHover)}
      onClick={() => node.fileData && onSelect(node.fileData)}
      style={{ paddingLeft: 28 }}
      type="button"
    >
      <div className="flex items-center overflow-hidden">
        <FileText className={cn("mr-2 h-4 w-4 shrink-0", isSelected ? theme.pageSub : theme.cardSub)} />
        <span className={cn("truncate font-mono text-sm", isSelected ? theme.pageSub : theme.cardTitle)}>{node.name}</span>
      </div>
      {node.fileData ? (
        <div className="ml-2 flex shrink-0 space-x-2 font-mono text-[0.65rem] opacity-80">
          {node.fileData.additions > 0 ? <span className="text-emerald-500">+{node.fileData.additions}</span> : null}
          {node.fileData.deletions > 0 ? <span className="text-red-500">-{node.fileData.deletions}</span> : null}
        </div>
      ) : null}
    </button>
  )
}

function getDiffLineClasses(line: string) {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return { bgClass: "bg-emerald-900/20", lineClass: "text-emerald-400" }
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return { bgClass: "bg-red-900/20", lineClass: "text-red-400" }
  }
  if (line.startsWith("@@")) {
    return { bgClass: "bg-blue-900/20", lineClass: "text-blue-400" }
  }
  return { bgClass: "bg-transparent", lineClass: "text-slate-300" }
}

function pilotButton(theme: ReturnType<typeof getPilotTheme>) {
  return theme.pageSub.includes("blue")
    ? "border-cyan-400 bg-cyan-500 text-white hover:bg-cyan-600"
    : "border-green-400 bg-green-500 text-black hover:bg-green-400"
}

function pilotGradient(theme: ReturnType<typeof getPilotTheme>) {
  return theme.pageSub.includes("blue")
    ? "from-[#f0f8ff] via-[#f0f8ff]/90 to-transparent"
    : "from-[#0a0a0a] via-[#0a0a0a]/90 to-transparent"
}
