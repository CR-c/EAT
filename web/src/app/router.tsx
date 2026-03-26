import { createBrowserRouter, Navigate } from "react-router-dom"

import { AppShell } from "@/components/layout/app-shell"
import { ConsolePage } from "@/features/system/pages/console-page"
import { ProjectsPage } from "@/features/projects/pages/projects-page"
import { CreateTaskPage } from "@/features/tasks/pages/create-task-page"
import { ProjectTasksPage } from "@/features/tasks/pages/project-tasks-page"
import { TaskWorkbenchPage } from "@/features/tasks/pages/task-workbench-page"
import { SettingsPage } from "@/features/system/pages/settings-page"

export const appRouter = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/console" replace /> },
      { path: "console", element: <ConsolePage /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "projects/:projectId/tasks", element: <ProjectTasksPage /> },
      { path: "projects/:projectId/tasks/new", element: <CreateTaskPage /> },
      { path: "projects/:projectId/workbench", element: <TaskWorkbenchPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
])
