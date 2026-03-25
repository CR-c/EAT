import { useEffect, useEffectEvent, useState } from "react"

type AsyncStatus = "idle" | "loading" | "success" | "error"

interface UseAsyncResourceOptions<T> {
  deps: readonly unknown[]
  initialData?: T
  load: (signal: AbortSignal) => Promise<T>
}

interface AsyncResourceState<T> {
  data: T | undefined
  error: string | null
  isLoading: boolean
  reload: () => void
  setData: (next: T | undefined | ((current: T | undefined) => T | undefined)) => void
  status: AsyncStatus
}

export function useAsyncResource<T>({
  deps,
  initialData,
  load,
}: UseAsyncResourceOptions<T>): AsyncResourceState<T> {
  const [data, setDataState] = useState<T | undefined>(initialData)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<AsyncStatus>(initialData === undefined ? "idle" : "success")
  const [reloadToken, setReloadToken] = useState(0)

  const execute = useEffectEvent(async (signal: AbortSignal) => {
    setStatus("loading")
    setError(null)

    try {
      const next = await load(signal)
      if (signal.aborted) {
        return
      }

      setDataState(next)
      setStatus("success")
    } catch (caught) {
      if (signal.aborted) {
        return
      }

      const message = caught instanceof Error ? caught.message : "Unknown request error."
      setError(message)
      setStatus("error")
    }
  })

  useEffect(() => {
    const controller = new AbortController()
    void execute(controller.signal)

    return () => controller.abort()
    // This hook accepts an explicit deps array from callers by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken])

  return {
    data,
    error,
    isLoading: status === "loading",
    reload: () => setReloadToken((value) => value + 1),
    setData: (next) => {
      setDataState((current) =>
        typeof next === "function"
          ? (next as (value: T | undefined) => T | undefined)(current)
          : next,
      )
      setStatus("success")
    },
    status,
  }
}
