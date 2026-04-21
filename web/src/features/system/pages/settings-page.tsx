import { Gauge, Globe2, Monitor, Palette } from "lucide-react"
import type { ComponentType, ReactNode } from "react"

import { getExecutionBackends, getSandboxPolicy } from "@/lib/api/system"
import { getPlatformContext } from "@/lib/platform"
import { useAsyncResource } from "@/hooks/use-async-resource"
import { getPilotDescription, getPilotTitle } from "@/lib/i18n"
import { usePreferences } from "@/lib/preferences"
import { getPilotTheme } from "@/lib/pilot-theme"
import { cn } from "@/lib/utils"

export function SettingsPage() {
  const { locale, pilot, setLocale, setPilot, t } = usePreferences()
  const theme = getPilotTheme(pilot)
  const platform = getPlatformContext()
  const isRei = pilot === "rei"

  const resource = useAsyncResource({
    deps: [],
    initialData: undefined,
    load: async (signal) => {
      const [executionBackends, policy] = await Promise.all([getExecutionBackends(signal), getSandboxPolicy(signal)])
      return { executionBackends, policy }
    },
  })

  return (
    <div className="relative z-10 h-full overflow-y-auto p-8">
      <div className="mx-auto flex max-w-4xl flex-col">
        <div className={cn("flex items-end justify-between border-b pb-4", theme.sidebarBorder)}>
          <div>
            <div className={cn("mb-1 font-mono text-sm tracking-[0.2em]", theme.pageSub)}>
              {t("settings.subtitle")} {t("common.subtitleSlash")}
            </div>
            <h2 className={cn("font-mono text-3xl font-black tracking-widest", theme.pageTitle)}>{t("settings.title")}</h2>
          </div>
        </div>

        <div className="mt-8 space-y-6">
          <section className={cn("relative rounded-sm border p-6 backdrop-blur-md", theme.cardBg)}>
            <div className={cn("absolute left-0 top-0 px-3 py-0.5 font-mono text-[0.65rem] font-bold tracking-widest", isRei ? "bg-blue-100 text-blue-700" : "bg-purple-900/50 text-purple-300")}>
              {t("settings.sectionTheme")}
            </div>
            <div className="mt-5 space-y-4">
              <label className={cn("block font-mono text-xs", theme.cardSub)}>{t("settings.themeLabel")}</label>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <PilotCard
                  active={pilot === "rei"}
                  description={getPilotDescription(locale, "rei")}
                  onClick={() => setPilot("rei")}
                  theme={theme}
                  title={getPilotTitle(locale, "rei")}
                  tone="rei"
                />
                <PilotCard
                  active={pilot === "shinji"}
                  description={getPilotDescription(locale, "shinji")}
                  onClick={() => setPilot("shinji")}
                  theme={theme}
                  title={getPilotTitle(locale, "shinji")}
                  tone="shinji"
                />
              </div>
            </div>
          </section>

          <section className={cn("grid gap-4 md:grid-cols-2", resource.isLoading && "animate-pulse")}>
            <SettingBox icon={Globe2} label={t("settings.languageLabel")} theme={theme}>
              <div className="flex gap-2">
                <button className={cn("rounded-sm border px-3 py-2 font-mono text-xs", locale === "zh-CN" ? theme.tabActive : theme.tabInactive)} onClick={() => setLocale("zh-CN")} type="button">
                  zh-CN
                </button>
                <button className={cn("rounded-sm border px-3 py-2 font-mono text-xs", locale === "en" ? theme.tabActive : theme.tabInactive)} onClick={() => setLocale("en")} type="button">
                  en
                </button>
              </div>
            </SettingBox>

            <SettingBox icon={Gauge} label={t("settings.workerDefault")} theme={theme}>
              <div className={cn("font-mono text-sm", theme.cardTitle)}>{resource.data?.policy.workerDefault ?? "—"}</div>
            </SettingBox>

            <SettingBox icon={Gauge} label={t("settings.previewDefault")} theme={theme}>
              <div className={cn("font-mono text-sm", theme.cardTitle)}>{resource.data?.policy.previewDefault ?? "—"}</div>
            </SettingBox>

            <SettingBox icon={Monitor} label="Platform" theme={theme}>
              <div className={cn("space-y-1 font-mono text-xs", theme.cardSub)}>
                <div>
                  mode: <span className={theme.cardTitle}>{platform.kind}</span>
                </div>
                <div>
                  shell: <span className={theme.cardTitle}>{platform.shell ?? "web"}</span>
                </div>
                <div>
                  apiBaseUrl: <span className={theme.cardTitle}>{platform.apiBaseUrl || "same-origin"}</span>
                </div>
              </div>
            </SettingBox>

            <div className="md:col-span-2">
              <SettingBox icon={Palette} label={t("settings.executionBackends")} theme={theme}>
                <div className="space-y-3">
                  {(resource.data?.executionBackends.backends ?? []).map((backend) => {
                    const isReducedIsolation = backend.trustLevel === "REDUCED_ISOLATION"
                    return (
                    <div key={backend.kind} className={cn("rounded-sm border p-3 font-mono text-xs", backend.available ? (isReducedIsolation ? "border-amber-500/40 bg-amber-900/20 text-amber-200" : theme.pathBg) : "border-red-500/40 bg-red-900/20 text-red-300")}>
                      <div className={cn("flex flex-wrap items-center gap-2 text-sm font-bold", theme.cardTitle)}>
                        <span>{backend.kind}</span>
                        {backend.default ? (
                          <span className={cn("rounded-sm border px-2 py-0.5 text-[10px]", theme.tabActive)}>
                            {t("settings.backendDefault")}
                          </span>
                        ) : null}
                        {isReducedIsolation ? (
                          <span className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                            REDUCED ISOLATION
                          </span>
                        ) : null}
                      </div>
                      <div className={cn("mt-1", theme.cardSub)}>
                        {backend.available ? t("settings.backendReady") : backend.reason ?? t("settings.backendUnavailable")}
                      </div>
                      <div className={cn("mt-2", theme.cardSub)}>
                        {t("settings.trustLevel")}: {backend.trustLevel}
                      </div>
                      {isReducedIsolation ? (
                        <div className="mt-2 text-[11px] text-amber-200">
                          Host backend 仅用于受信任本机开发环境；它不会提供与 Docker 同级的隔离能力。
                        </div>
                      ) : null}
                      {backend.dependencies?.length ? (
                        <div className={cn("mt-1", theme.cardSub)}>
                          {t("settings.dependencies")}: {backend.dependencies.join(", ")}
                        </div>
                      ) : null}
                    </div>
                    )
                  })}
                </div>
              </SettingBox>
            </div>
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
