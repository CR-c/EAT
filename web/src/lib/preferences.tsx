/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react"

import type { Locale, Pilot } from "@/lib/types"

type Dictionary = Record<string, string>

const dictionaries: Record<Locale, Dictionary> = {
  "zh-CN": {
    appName: "E.A.T.",
    console: "系统控制台",
    projects: "项目档案库",
    settings: "系统配置",
    taskCenter: "任务中心",
    workbench: "工作台",
    dockerReady: "Docker 就绪",
    dockerOffline: "Docker 离线",
    localFirst: "本地优先",
    locale: "语言",
    themePilot: "驾驶员",
    projectsTitle: "本地项目库",
    projectsSubtitle: "目标选择",
    projectSearch: "检索项目名称...",
    registerProject: "注册新项目",
    unregisterProject: "取消注册项目",
    tasksTitle: "任务指挥中心",
    tasksSubtitle: "Operational Hub",
    taskSearch: "检索任务代号或名称...",
    newTask: "发布新任务",
    activeTasks: "活跃作战",
    archivedTasks: "已归档案",
    allTasks: "全部任务",
    overview: "总览",
    actionRequired: "需要处理",
    execution: "执行态",
    review: "审查态",
    ready: "就绪",
    failed: "失败",
    running: "运行中",
    noProjects: "未发现符合条件的项目记录。",
    noTasks: "未检索到符合条件的任务。",
    loading: "正在同步本地数据...",
    retry: "重试",
    path: "路径",
    baseBranch: "基线",
    registerPath: "项目路径",
    browseRepo: "浏览仓库",
    cancel: "取消",
    confirm: "确认",
    create: "创建",
    title: "标题",
    description: "描述",
    leadAgent: "Lead Agent",
    workbenchEmpty: "选择一个任务以查看 team、board 与实时上下文。",
    detail: "详情",
    activity: "活动",
    team: "团队",
    risk: "风险",
    metrics: "指标",
    sandboxPolicy: "沙箱策略",
    availableAgents: "可用 Agent",
    pilotRei: "00 绫波丽",
    pilotShinji: "01 碇真嗣",
    settingsDescription: "前端偏好和后端运行策略在这里统一查看。",
    taskModalPause: "挂起任务执行流？",
    taskModalResume: "恢复任务执行流？",
    taskModalArchive: "归档当前任务？",
    taskModalDelete: "删除当前任务？",
    deleteBranches: "同时清理任务主分支",
    notAvailable: "当前 Go API 尚未暴露该操作。",
    unregisterProjectBlocked: "该项目仍存在执行态任务树，需先结束这些执行中的任务后再取消注册。",
    unregisterProjectHint: "该操作只移除 EAT 注册记录，不会删除仓库目录或代码文件。",
  },
  en: {
    appName: "E.A.T.",
    console: "Console",
    projects: "Projects",
    settings: "Settings",
    taskCenter: "Task Center",
    workbench: "Workbench",
    dockerReady: "Docker Ready",
    dockerOffline: "Docker Offline",
    localFirst: "Local-first",
    locale: "Locale",
    themePilot: "Pilot",
    projectsTitle: "Project Library",
    projectsSubtitle: "Target Selection",
    projectSearch: "Search projects...",
    registerProject: "Register Project",
    unregisterProject: "Unregister Project",
    tasksTitle: "Task Command Center",
    tasksSubtitle: "Operational Hub",
    taskSearch: "Search tasks...",
    newTask: "Create Task",
    activeTasks: "Active",
    archivedTasks: "Archived",
    allTasks: "All",
    overview: "Overview",
    actionRequired: "Action Required",
    execution: "Execution",
    review: "Review",
    ready: "Ready",
    failed: "Failed",
    running: "Running",
    noProjects: "No matching projects were found.",
    noTasks: "No matching tasks were found.",
    loading: "Syncing local data...",
    retry: "Retry",
    path: "Path",
    baseBranch: "Base",
    registerPath: "Project Path",
    browseRepo: "Browse Repos",
    cancel: "Cancel",
    confirm: "Confirm",
    create: "Create",
    title: "Title",
    description: "Description",
    leadAgent: "Lead Agent",
    workbenchEmpty: "Pick a task to inspect team, board, and live context.",
    detail: "Detail",
    activity: "Activity",
    team: "Team",
    risk: "Risk",
    metrics: "Metrics",
    sandboxPolicy: "Sandbox Policy",
    availableAgents: "Available Agents",
    pilotRei: "00 Rei Ayanami",
    pilotShinji: "01 Shinji Ikari",
    settingsDescription: "Frontend preferences and backend runtime policy live here.",
    taskModalPause: "Pause this task flow?",
    taskModalResume: "Resume this task flow?",
    taskModalArchive: "Archive this task?",
    taskModalDelete: "Delete this task?",
    deleteBranches: "Clean up the task branch too",
    notAvailable: "This action is not exposed by the current Go API.",
    unregisterProjectBlocked: "This project still has active execution task trees. Finish them before unregistering.",
    unregisterProjectHint: "This only removes the EAT registry record. Repository files stay untouched.",
  },
}

interface PreferencesContextValue {
  locale: Locale
  pilot: Pilot
  setLocale: (locale: Locale) => void
  setPilot: (pilot: Pilot) => void
  t: (key: string) => string
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

const localeStorageKey = "eat.web.locale"
const pilotStorageKey = "eat.web.pilot"

function getStoredLocale(): Locale {
  const stored = window.localStorage.getItem(localeStorageKey)
  return stored === "en" ? "en" : "zh-CN"
}

function getStoredPilot(): Pilot {
  const stored = window.localStorage.getItem(pilotStorageKey)
  return stored === "shinji" ? "shinji" : "rei"
}

export function PreferencesProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>(() => getStoredLocale())
  const [pilot, setPilotState] = useState<Pilot>(() => getStoredPilot())

  useEffect(() => {
    window.localStorage.setItem(localeStorageKey, locale)
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    window.localStorage.setItem(pilotStorageKey, pilot)
    document.documentElement.dataset.pilot = pilot
    document.documentElement.classList.toggle("dark", pilot === "shinji")
  }, [pilot])

  const value = useMemo<PreferencesContextValue>(
    () => ({
      locale,
      pilot,
      setLocale: (nextLocale) => {
        startTransition(() => setLocaleState(nextLocale))
      },
      setPilot: (nextPilot) => {
        startTransition(() => setPilotState(nextPilot))
      },
      t: (key) => dictionaries[locale][key] ?? dictionaries["zh-CN"][key] ?? key,
    }),
    [locale, pilot],
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (!context) {
    throw new Error("usePreferences must be used within PreferencesProvider.")
  }
  return context
}
