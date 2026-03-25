import { Gauge, Globe2, Palette } from "lucide-react"

import { getDockerHealth, getSandboxPolicy } from "@/lib/api/system"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAsyncResource } from "@/hooks/use-async-resource"
import { usePreferences } from "@/lib/preferences"

export function SettingsPage() {
  const { locale, pilot, setLocale, setPilot, t } = usePreferences()

  const resource = useAsyncResource({
    deps: [],
    load: async (signal) => {
      const [docker, policy] = await Promise.all([
        getDockerHealth(signal),
        getSandboxPolicy(signal),
      ])
      return { docker, policy }
    },
  })

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader>
          <div className="text-sm uppercase tracking-[0.28em] text-cyan-700/75 dark:text-cyan-200/80">
            {t("settings")}
          </div>
          <CardTitle className="text-4xl">{t("settings")}</CardTitle>
          <CardDescription>{t("settingsDescription")}</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sandboxPolicy")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <SettingField
            icon={Globe2}
            label={t("locale")}
            control={
              <Select value={locale} onValueChange={(value) => setLocale(value as "zh-CN" | "en")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh-CN">zh-CN</SelectItem>
                  <SelectItem value="en">en</SelectItem>
                </SelectContent>
              </Select>
            }
          />

          <SettingField
            icon={Palette}
            label={t("themePilot")}
            control={
              <Select value={pilot} onValueChange={(value) => setPilot(value as "rei" | "shinji")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rei">{t("pilotRei")}</SelectItem>
                  <SelectItem value="shinji">{t("pilotShinji")}</SelectItem>
                </SelectContent>
              </Select>
            }
          />

          <SettingField
            icon={Gauge}
            label="Worker Default"
            control={<div className="text-sm">{resource.data?.policy.workerDefault ?? "—"}</div>}
          />

          <SettingField
            icon={Gauge}
            label="Preview Default"
            control={<div className="text-sm">{resource.data?.policy.previewDefault ?? "—"}</div>}
          />

          <SettingField
            icon={Gauge}
            label="Docker"
            control={
              <div className="text-sm">
                {resource.data?.docker.available ? t("dockerReady") : resource.data?.docker.reason ?? "—"}
              </div>
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}

function SettingField({
  control,
  icon: Icon,
  label,
}: {
  control: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/40 bg-white/50 p-4 dark:border-white/10 dark:bg-white/6">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-cyan-700 dark:text-cyan-200" />
        {label}
      </div>
      {control}
    </div>
  )
}
