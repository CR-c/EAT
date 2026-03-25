import { Outlet } from "react-router-dom"

import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"

export function AppShell() {
  return (
    <div className="flex min-h-dvh">
      <AppSidebar />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="flex-1 overflow-hidden px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
