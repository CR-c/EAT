export interface DesktopHostCapabilities {
  apiBaseUrl?: string
  kind?: string
  shell?: string
}

export interface PlatformContext {
  apiBaseUrl: string
  hasDesktopHost: boolean
  kind: "web" | "desktop-hosted"
  shell: string | null
}

declare global {
  interface Window {
    __EAT_PLATFORM__?: DesktopHostCapabilities
  }
}

function readDesktopHostCapabilities(): DesktopHostCapabilities | null {
  if (typeof window === "undefined") {
    return null
  }
  const payload = window.__EAT_PLATFORM__
  if (!payload || typeof payload !== "object") {
    return null
  }
  return payload
}

function normalizeBaseUrl(value: string | undefined): string {
  const trimmed = (value ?? "").trim()
  if (!trimmed) {
    return ""
  }
  return trimmed.replace(/\/+$/, "")
}

export function getPlatformContext(): PlatformContext {
  const desktopHost = readDesktopHostCapabilities()
  const desktopBaseUrl = normalizeBaseUrl(desktopHost?.apiBaseUrl)
  const envBaseUrl = normalizeBaseUrl(import.meta.env.VITE_EAT_API_BASE_URL)
  const apiBaseUrl = desktopBaseUrl || envBaseUrl
  return {
    apiBaseUrl,
    hasDesktopHost: Boolean(desktopHost),
    kind: desktopHost ? "desktop-hosted" : "web",
    shell: desktopHost?.shell?.trim() || null,
  }
}

export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path
  }
  const { apiBaseUrl } = getPlatformContext()
  if (!apiBaseUrl) {
    return path
  }
  if (!path.startsWith("/")) {
    return `${apiBaseUrl}/${path}`
  }
  return `${apiBaseUrl}${path}`
}
