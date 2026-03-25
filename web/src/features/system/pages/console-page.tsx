import { AlertTriangle, BarChart3, Bot, Cpu, FolderKanban, ShieldCheck } from "lucide-react"

import { getAgentHealth, getMetricsSummary, getSystemHealth } from "@/lib/api/system"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useAsyncResource } from "@/hooks/use-async-resource"
import { formatPercent, formatRelativeCount } from "@/lib/format"
import { usePreferences } from "@/lib/preferences"

export function ConsolePage() {
  const { t } = usePreferences()

  const resource = useAsyncResource({
    deps: [],
    load: async (signal) => {
      const [system, agents, metrics] = await Promise.all([
        getSystemHealth(signal),
        getAgentHealth(signal),
        getMetricsSummary(signal),
      ])

      return { agents, metrics, system }
    },
  })

  const summary = resource.data?.metrics.summary
  const agentEntries = Object.entries(resource.data?.agents.agents ?? {})

  return (
    <ScrollArea className="h-full pr-4">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="text-sm uppercase tracking-[0.28em] text-cyan-700/75 dark:text-cyan-200/80">
              {t("overview")}
            </div>
            <CardTitle className="text-4xl">{t("console")}</CardTitle>
            <CardDescription>
              Operational telemetry from the Go backend, rendered in React.
            </CardDescription>
          </CardHeader>
        </Card>

        {resource.isLoading ? (
          <div className="grid gap-5 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-[180px]" />
            ))}
          </div>
        ) : resource.error ? (
          <Card>
            <CardContent className="pt-6">
              <div className="mb-3 text-sm text-red-600 dark:text-red-300">{resource.error}</div>
              <Button variant="secondary" onClick={resource.reload}>
                {t("retry")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-5 lg:grid-cols-4">
              <MetricCard
                icon={Cpu}
                label="Backend"
                tone={resource.data?.system.status === "healthy" ? "ok" : "warn"}
                value={resource.data?.system.status ?? "unknown"}
              />
              <MetricCard
                icon={ShieldCheck}
                label="Docker"
                tone={resource.data?.system.docker.available ? "ok" : "warn"}
                value={resource.data?.system.docker.available ? t("dockerReady") : t("dockerOffline")}
              />
              <MetricCard
                icon={FolderKanban}
                label="Tasks Completed"
                value={formatRelativeCount(summary?.tasksCompleted)}
              />
              <MetricCard
                icon={BarChart3}
                label="Plan Approval Completion"
                value={formatPercent(summary?.completionRateAfterPlanApproval)}
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-cyan-700 dark:text-cyan-200" />
                    {t("availableAgents")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {agentEntries.map(([name, agent]) => (
                    <div
                      key={name}
                      className="rounded-[1.4rem] border border-white/40 bg-white/50 p-4 dark:border-white/10 dark:bg-white/6"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">{name}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{agent.runtimeMode}</div>
                        </div>
                        <Badge variant={agent.available ? "default" : "destructive"}>
                          {agent.available ? "AVAILABLE" : "UNAVAILABLE"}
                        </Badge>
                      </div>
                      <Separator className="my-3" />
                      <div className="grid gap-2 text-sm text-muted-foreground">
                        {agent.checks.map((check) => (
                          <div key={check.name} className="flex items-center justify-between gap-2">
                            <span>{check.name}</span>
                            <span>{check.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="grid gap-5">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("metrics")}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm">
                    <MetricRow label="tasksEnteredExecuting" value={formatRelativeCount(summary?.tasksEnteredExecuting)} />
                    <MetricRow label="workerCrashDetectionRate" value={formatPercent(summary?.workerCrashDetectionRate)} />
                    <MetricRow label="mergeConflictCount" value={formatRelativeCount(summary?.mergeConflictCount)} />
                    <MetricRow label="rebaseRetryCount" value={formatRelativeCount(summary?.rebaseRetryCount)} />
                    <MetricRow label="sandboxLaunchFailureCount" value={formatRelativeCount(summary?.sandboxLaunchFailureCount)} />
                    <MetricRow label="retryToReviewConversionRate" value={formatPercent(summary?.retryToReviewConversionRate)} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-cyan-700 dark:text-cyan-200" />
                      {t("actionRequired")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {summary?.unavailableMetrics?.length ? (
                      summary.unavailableMetrics.map((item) => (
                        <div
                          key={item.metric}
                          className="rounded-[1.3rem] border border-red-400/25 bg-red-400/8 p-4 text-sm"
                        >
                          <div className="font-medium">{item.metric}</div>
                          <div className="mt-2 text-muted-foreground">{item.reason}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground">No unavailable metric definition.</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  )
}

function MetricCard({
  icon: Icon,
  label,
  tone = "neutral",
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  tone?: "neutral" | "ok" | "warn"
  value: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-[1.3rem] ${
            tone === "warn"
              ? "bg-red-400/12 text-red-600 dark:text-red-300"
              : "bg-cyan-500/12 text-cyan-700 dark:text-cyan-200"
          }`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-1 font-heading text-2xl font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[1.1rem] border border-white/40 bg-white/45 px-4 py-3 dark:border-white/10 dark:bg-white/6">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
