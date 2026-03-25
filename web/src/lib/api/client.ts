import type { ApiErrorPayload } from "@/lib/types"

const jsonHeaders = {
  Accept: "application/json",
  "Content-Type": "application/json",
} satisfies HeadersInit

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...jsonHeaders,
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    let errorMessage = `${response.status} ${response.statusText}`
    try {
      const payload = (await response.json()) as ApiErrorPayload
      if (payload.error?.message) {
        errorMessage = payload.error.message
      }
    } catch {
      // Ignore JSON parsing errors for non-JSON responses.
    }
    throw new Error(errorMessage)
  }

  return (await response.json()) as T
}

export function postJson<T>(path: string, body?: unknown, init?: RequestInit) {
  return fetchJson<T>(path, {
    ...init,
    body: body === undefined ? undefined : JSON.stringify(body),
    method: "POST",
  })
}

export function putJson<T>(path: string, body: unknown, init?: RequestInit) {
  return fetchJson<T>(path, {
    ...init,
    body: JSON.stringify(body),
    method: "PUT",
  })
}

export function deleteJson<T>(path: string, body?: unknown, init?: RequestInit) {
  return fetchJson<T>(path, {
    ...init,
    body: body === undefined ? undefined : JSON.stringify(body),
    method: "DELETE",
  })
}
