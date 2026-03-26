import type { Pilot } from "@/lib/types"

export interface PilotTheme {
  bg: string
  shell: string
  sidebar: string
  sidebarBorder: string
  grid: string
  gridLines: string
  blurPrimary: string
  blurSecondary: string
  blurTertiary: string
  logo: string
  logoIcon: string
  logoSub: string
  sysMenu: string
  menuActive: string
  menuInactive: string
  pageTitle: string
  pageSub: string
  cardBg: string
  cardTitle: string
  cardSub: string
  cardCorner: string
  cardIconBg: string
  cardIcon: string
  dirtyBg: string
  dirtyDot: string
  dirtyPing: string
  dirtyText: string
  cleanBg: string
  pathBg: string
  pathLabel: string
  branchBg: string
  taskBg: string
  actionBtn: string
  inputBg: string
  tabActive: string
  tabInactive: string
  badgeExec: string
  badgeWarn: string
  badgeDraft: string
  btnGhost: string
  btnDanger: string
  modalOverlay: string
  modalBox: string
  modalTitle: string
  modalTitleInfo: string
  treeItemHover: string
  treePathBar: string
  chatUser: string
  chatAgent: string
  terminalBg: string
  dagLine: string
  dagNodeReady: string
  dagNodeActive: string
}

export function getPilotTheme(pilot: Pilot): PilotTheme {
  if (pilot === "rei") {
    return {
      bg: "bg-[#f0f8ff] text-slate-800 selection:bg-blue-200",
      shell: "bg-white/35",
      sidebar: "bg-white/60",
      sidebarBorder: "border-blue-200/60",
      grid:
        "linear-gradient(rgba(59,130,246,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.1) 1px, transparent 1px)",
      gridLines: "rgba(59,130,246,0.1)",
      blurPrimary: "bg-blue-400/20",
      blurSecondary: "bg-cyan-300/20",
      blurTertiary: "bg-white/40",
      logo: "text-cyan-600",
      logoIcon: "text-blue-500 fill-blue-500/20",
      logoSub: "text-blue-400",
      sysMenu: "text-blue-500/70",
      menuActive: "bg-blue-50/80 border-blue-300 text-cyan-600 shadow-[inset_4px_0_0_#06b6d4]",
      menuInactive: "border-transparent text-slate-500 hover:bg-blue-50/50 hover:text-blue-600",
      pageTitle: "text-slate-800 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]",
      pageSub: "text-blue-500",
      cardBg:
        "bg-white/60 border-blue-200/60 hover:border-cyan-400/80 hover:shadow-[0_0_25px_rgba(6,182,212,0.15)]",
      cardTitle: "text-slate-800",
      cardSub: "text-slate-500",
      cardCorner: "border-blue-400/50 group-hover:border-cyan-500",
      cardIconBg:
        "bg-blue-50 border-blue-200 group-hover:bg-cyan-50 group-hover:border-cyan-300",
      cardIcon: "text-blue-500 group-hover:text-cyan-600",
      dirtyBg: "bg-red-50 border-red-200",
      dirtyDot: "bg-red-500",
      dirtyPing: "bg-red-400",
      dirtyText: "text-red-500",
      cleanBg: "border-blue-200 text-blue-400 bg-white/50",
      pathBg: "bg-white/80 border-blue-100 text-slate-500",
      pathLabel: "text-blue-500",
      branchBg: "bg-blue-50 border-blue-200 text-slate-600",
      taskBg: "bg-cyan-50 border-cyan-200 text-cyan-600",
      actionBtn:
        "bg-white/50 border-blue-300 text-cyan-600 hover:bg-white hover:shadow-[0_0_15px_rgba(59,130,246,0.2)]",
      inputBg:
        "bg-white/60 border-blue-200 text-slate-800 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 placeholder:text-blue-300",
      tabActive:
        "border-cyan-500 text-cyan-600 bg-gradient-to-t from-cyan-500/10 to-transparent",
      tabInactive: "border-transparent text-slate-500 hover:text-blue-500 hover:border-blue-300",
      badgeExec:
        "bg-cyan-100/80 border-cyan-300 text-cyan-700 shadow-[0_0_8px_rgba(6,182,212,0.3)]",
      badgeWarn:
        "bg-red-100/80 border-red-300 text-red-700 shadow-[0_0_8px_rgba(239,68,68,0.3)]",
      badgeDraft: "bg-slate-200/80 border-slate-300 text-slate-600",
      btnGhost: "text-blue-400 hover:text-cyan-600 hover:bg-cyan-50",
      btnDanger: "text-blue-400 hover:text-red-500 hover:bg-red-50",
      modalOverlay: "bg-white/40 backdrop-blur-sm",
      modalBox: "bg-white/90 border-blue-300 shadow-[0_0_40px_rgba(59,130,246,0.2)]",
      modalTitle: "text-red-500",
      modalTitleInfo: "text-blue-600",
      treeItemHover: "hover:bg-blue-50",
      treePathBar: "bg-blue-50 border-blue-200 text-blue-600",
      chatUser: "bg-blue-100 border-blue-200 text-slate-800",
      chatAgent: "bg-white/80 border-cyan-200 text-slate-800",
      terminalBg: "bg-[#1e1e1e] border-blue-300 text-green-400 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]",
      dagLine: "text-blue-400",
      dagNodeReady: "bg-white/60 border-blue-200",
      dagNodeActive: "bg-cyan-50/80 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]",
    }
  }

  return {
    bg: "bg-[#0a0a0a] text-slate-200 selection:bg-purple-500/30",
    shell: "bg-black/30",
    sidebar: "bg-black/40",
    sidebarBorder: "border-purple-500/30",
    grid:
      "linear-gradient(rgba(168,85,247,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,0.2) 1px, transparent 1px)",
    gridLines: "rgba(168,85,247,0.1)",
    blurPrimary: "bg-purple-900/30",
    blurSecondary: "bg-green-900/20",
    blurTertiary: "bg-orange-900/10",
    logo: "text-green-400",
    logoIcon: "text-purple-500 fill-purple-500/20",
    logoSub: "text-purple-400",
    sysMenu: "text-purple-500/70",
    menuActive: "bg-purple-900/40 border-purple-500 text-green-400 shadow-[inset_4px_0_0_#22c55e]",
    menuInactive: "border-transparent text-slate-400 hover:bg-white/5 hover:text-purple-300",
    pageTitle: "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]",
    pageSub: "text-purple-500",
    cardBg:
      "bg-black/40 border-white/10 hover:border-green-400/60 hover:shadow-[0_0_25px_rgba(34,197,94,0.15)]",
    cardTitle: "text-slate-100",
    cardSub: "text-slate-500",
    cardCorner: "border-purple-500/50 group-hover:border-green-400",
    cardIconBg:
      "bg-purple-900/50 border-purple-500/50 group-hover:bg-green-900/30 group-hover:border-green-400/50",
    cardIcon: "text-purple-400 group-hover:text-green-400",
    dirtyBg: "bg-orange-500/10 border-orange-500/50",
    dirtyDot: "bg-orange-500",
    dirtyPing: "bg-orange-400",
    dirtyText: "text-orange-400",
    cleanBg: "border-slate-700 text-slate-500",
    pathBg: "bg-black/50 border-white/5 text-slate-400",
    pathLabel: "text-purple-500",
    branchBg: "bg-purple-900/30 border-purple-500/30 text-slate-300",
    taskBg: "bg-green-900/20 border-green-500/20 text-green-400",
    actionBtn:
      "bg-purple-600/20 border-purple-500 text-green-400 hover:bg-purple-600/40 hover:shadow-[0_0_20px_rgba(34,197,94,0.3)]",
    inputBg:
      "bg-black/60 border-purple-500/50 text-green-400 focus:border-green-400 focus:ring-2 focus:ring-green-400/20 placeholder:text-purple-900",
    tabActive:
      "border-green-400 text-green-400 bg-gradient-to-t from-green-400/10 to-transparent",
    tabInactive: "border-transparent text-slate-500 hover:text-purple-400 hover:border-purple-500/50",
    badgeExec:
      "bg-green-900/30 border-green-500/50 text-green-400 shadow-[0_0_8px_rgba(34,197,94,0.3)]",
    badgeWarn:
      "bg-orange-900/30 border-orange-500/50 text-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.3)]",
    badgeDraft: "bg-white/5 border-white/10 text-slate-400",
    btnGhost: "text-slate-500 hover:text-green-400 hover:bg-green-400/10",
    btnDanger: "text-slate-500 hover:text-red-500 hover:bg-red-500/10",
    modalOverlay: "bg-black/60 backdrop-blur-sm",
    modalBox: "bg-[#0a0a0a] border-orange-500/50 shadow-[0_0_40px_rgba(249,115,22,0.15)]",
    modalTitle: "text-orange-500",
    modalTitleInfo: "text-purple-400",
    treeItemHover: "hover:bg-purple-900/30",
    treePathBar: "bg-purple-900/20 border-purple-500/30 text-purple-400",
    chatUser: "bg-purple-900/40 border-purple-500/50 text-slate-200",
    chatAgent: "bg-black/60 border-green-500/30 text-slate-200",
    terminalBg: "bg-black/80 border-green-500/50 text-green-400 shadow-[inset_0_0_20px_rgba(34,197,94,0.1)]",
    dagLine: "text-purple-500/50",
    dagNodeReady: "bg-black/40 border-white/10",
    dagNodeActive: "bg-green-900/20 border-green-400 shadow-[0_0_15px_rgba(34,197,94,0.2)]",
  }
}

const projectColors = ["#3b82f6", "#22c55e", "#a855f7", "#f97316", "#eab308", "#ef4444", "#06b6d4"]

export function getProjectColor(seed: string) {
  const value = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return projectColors[value % projectColors.length]
}
