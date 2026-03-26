import { Gauge, Globe2, Palette } from "lucide-react"
import type { ComponentType, ReactNode } from "react"

import { getDockerHealth, getSandboxPolicy } from "@/lib/api/system"
import { useAsyncResource } from "@/hooks/use-async-resource"
import { usePreferences } from "@/lib/preferences"
import { getPilotTheme } from "@/lib/pilot-theme"
import { cn } from "@/lib/utils"

export function SettingsPage() {
  const { locale, pilot, setLocale, setPilot } = usePreferences()
  const theme = getPilotTheme(pilot)
  const isRei = pilot === "rei"

  const resource = useAsyncResource({
    deps: [],
    initialData: undefined,
    load: async (signal) => {
      const [docker, policy] = await Promise.all([getDockerHealth(signal), getSandboxPolicy(signal)])
      return { docker, policy }
    },
  })

  return (
    <div className="relative z-10 h-full overflow-y-auto p-8">
      <div className="mx-auto flex max-w-4xl flex-col">
        <div className={cn("flex items-end justify-between border-b pb-4", theme.sidebarBorder)}>
          <div>
            <div className={cn("mb-1 font-mono text-sm tracking-[0.2em]", theme.pageSub)}>SYSTEM_PREFERENCES //</div>
            <h2 className={cn("font-mono text-3xl font-black tracking-widest", theme.pageTitle)}>系统全局配置</h2>
          </div>
        </div>

        <div className="mt-8 space-y-6">
          <section className={cn("relative rounded-sm border p-6 backdrop-blur-md", theme.cardBg)}>
            <div className={cn("absolute left-0 top-0 px-3 py-0.5 font-mono text-[0.65rem] font-bold tracking-widest", isRei ? "bg-blue-100 text-blue-700" : "bg-purple-900/50 text-purple-300")}>
              [ 01_UI_THEME ]
            </div>
            <div className="mt-5 space-y-4">
              <label className={cn("block font-mono text-xs", theme.cardSub)}>界面操作终端主题 (PILOT_THEME)</label>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <PilotCard
                  active={pilot === "rei"}
                  description="冰蓝清新亮色调 / 适合明亮环境"
                  onClick={() => setPilot("rei")}
                  theme={theme}
                  title="00_绫波丽 (Rei)"
                  tone="rei"
                />
                <PilotCard
                  active={pilot === "shinji"}
                  description="暴走暗夜紫绿色调 / 适合极客环境"
                  onClick={() => setPilot("shinji")}
                  theme={theme}
                  title="01_碇真嗣 (Shinji)"
                  tone="shinji"
                />
              </div>
            </div>
          </section>

          <section className={cn("grid gap-4 md:grid-cols-2", resource.isLoading && "animate-pulse")}>
            <SettingBox icon={Globe2} label="语言 / Locale" theme={theme}>
              <div className="flex gap-2">
                <button className={cn("rounded-sm border px-3 py-2 font-mono text-xs", locale === "zh-CN" ? theme.tabActive : theme.tabInactive)} onClick={() => setLocale("zh-CN")} type="button">
                  zh-CN
                </button>
                <button className={cn("rounded-sm border px-3 py-2 font-mono text-xs", locale === "en" ? theme.tabActive : theme.tabInactive)} onClick={() => setLocale("en")} type="button">
                  en
                </button>
              </div>
            </SettingBox>

            <SettingBox icon={Gauge} label="Worker Default" theme={theme}>
              <div className={cn("font-mono text-sm", theme.cardTitle)}>{resource.data?.policy.workerDefault ?? "—"}</div>
            </SettingBox>

            <SettingBox icon={Gauge} label="Preview Default" theme={theme}>
              <div className={cn("font-mono text-sm", theme.cardTitle)}>{resource.data?.policy.previewDefault ?? "—"}</div>
            </SettingBox>

            <SettingBox icon={Palette} label="Docker" theme={theme}>
              <div className={cn("font-mono text-sm", theme.cardTitle)}>
                {resource.data?.docker.available ? "Docker 就绪" : resource.data?.docker.reason ?? "—"}
              </div>
            </SettingBox>
          </section>
        </div>
      </div>
    </div>
  )
}

function PilotCard({
  active,
  description,
  onClick,
  theme,
  title,
  tone,
}: {
  active: boolean
  description: string
  onClick: () => void
  theme: ReturnType<typeof getPilotTheme>
  title: string
  tone: "rei" | "shinji"
}) {
  return (
    <button
      className={cn(
        "flex items-center rounded-sm border p-5 text-left transition-all",
        active
          ? tone === "rei"
            ? "border-blue-400 bg-blue-50/80 shadow-[0_0_15px_rgba(59,130,246,0.2)]"
            : "border-purple-500 bg-purple-900/40 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
          : theme.inputBg,
      )}
      onClick={onClick}
      type="button"
    >
      <div className={cn("mr-4 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", active ? (tone === "rei" ? "border-blue-500" : "border-purple-500") : "border-slate-400")}>
        {active ? <div className={cn("h-2.5 w-2.5 rounded-full", tone === "rei" ? "bg-blue-500" : "bg-purple-500")} /> : null}
      </div>
      <div>
        <div className={cn("font-mono text-sm font-bold", active ? (tone === "rei" ? "text-blue-700" : "text-green-400") : theme.cardTitle)}>{title}</div>
        <div className={cn("mt-1 font-mono text-[0.65rem]", theme.cardSub)}>{description}</div>
      </div>
    </button>
  )
}

function SettingBox({
  children,
  icon: Icon,
  label,
  theme,
}: {
  children: ReactNode
  icon: ComponentType<{ className?: string }>
  label: string
  theme: ReturnType<typeof getPilotTheme>
}) {
  return (
    <div className={cn("rounded-sm border p-4", theme.cardBg)}>
      <div className={cn("mb-3 flex items-center gap-2 font-mono text-sm font-medium", theme.cardTitle)}>
        <Icon className={cn("h-4 w-4", theme.pageSub)} />
        {label}
      </div>
      {children}
    </div>
  )
}
