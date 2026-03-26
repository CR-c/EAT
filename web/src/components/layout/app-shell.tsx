import { Outlet } from "react-router-dom"

import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { usePreferences } from "@/lib/preferences"
import { getPilotTheme } from "@/lib/pilot-theme"

export function AppShell() {
  const { pilot } = usePreferences()
  const theme = getPilotTheme(pilot)

  return (
    <div className={`relative flex min-h-dvh w-full overflow-hidden ${theme.bg}`}>
      <div
        className="pointer-events-none absolute inset-0 opacity-20 transition-all duration-500"
        style={{ backgroundImage: theme.grid, backgroundSize: "40px 40px" }}
      />
      <div
        className={`pointer-events-none absolute -left-[10%] -top-[20%] h-[50vw] w-[50vw] rounded-full blur-[120px] transition-colors duration-1000 ${theme.blurPrimary}`}
      />
      <div
        className={`pointer-events-none absolute -bottom-[20%] -right-[10%] h-[40vw] w-[40vw] rounded-full blur-[100px] transition-colors duration-1000 ${theme.blurSecondary}`}
      />
      <div
        className={`pointer-events-none absolute right-[20%] top-[30%] h-[20vw] w-[20vw] rounded-full blur-[80px] transition-colors duration-1000 ${theme.blurTertiary}`}
      />
      <AppSidebar />
      <div className="relative z-10 flex min-h-dvh min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
