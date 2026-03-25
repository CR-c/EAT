import type { PropsWithChildren } from "react"

import { PreferencesProvider } from "@/lib/preferences"
import { TooltipProvider } from "@/components/ui/tooltip"

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <PreferencesProvider>
      <TooltipProvider delayDuration={120}>{children}</TooltipProvider>
    </PreferencesProvider>
  )
}
