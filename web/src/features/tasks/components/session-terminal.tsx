import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"
import { useEffect, useRef, useState } from "react"

import { getSessionOutput } from "@/lib/api/tasks"
import { cn } from "@/lib/utils"

export type SessionOutputSubscriber = (sessionId: string, callback: (chunk: string) => void) => () => void

interface SessionTerminalProps {
  className?: string
  sessionId: string
  subscribe: SessionOutputSubscriber
}

export function SessionTerminal({ className, sessionId, subscribe }: SessionTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) {
      return undefined
    }

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: false,
      disableStdin: true,
      fontFamily: "'Geist Mono', 'SFMono-Regular', Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.35,
      scrollback: 4000,
      theme: {
        background: "#0b1020",
        black: "#0b1020",
        blue: "#60a5fa",
        brightBlack: "#475569",
        brightBlue: "#93c5fd",
        brightCyan: "#67e8f9",
        brightGreen: "#86efac",
        brightMagenta: "#d8b4fe",
        brightRed: "#fca5a5",
        brightWhite: "#f8fafc",
        brightYellow: "#fde68a",
        cursor: "#e2e8f0",
        cyan: "#22d3ee",
        foreground: "#dbeafe",
        green: "#4ade80",
        magenta: "#c084fc",
        red: "#f87171",
        selectionBackground: "#334155",
        white: "#e2e8f0",
        yellow: "#facc15",
      },
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const fit = () => {
      try {
        fitAddon.fit()
      } catch {
        // xterm can throw while its container is detached during route changes.
      }
    }
    const rafId = window.requestAnimationFrame(fit)

    // Live chunks can arrive before the backfill snapshot resolves. Buffer them
    // and flush after the snapshot is written so the terminal stays in order
    // instead of rendering the tail twice / out of order.
    let backfilled = false
    const pendingChunks: string[] = []
    const flushPending = () => {
      backfilled = true
      for (const chunk of pendingChunks) {
        terminal.write(chunk)
      }
      pendingChunks.length = 0
    }

    const controller = new AbortController()
    void getSessionOutput(sessionId, controller.signal)
      .then((payload) => {
        if (payload.output) {
          terminal.write(payload.output)
        }
        if (payload.truncated) {
          terminal.writeln("\r\n[output buffer truncated]")
        }
        flushPending()
      })
      .catch((caught) => {
        if (controller.signal.aborted) {
          return
        }
        // Still surface live output even if the backfill request failed.
        flushPending()
        setError(caught instanceof Error ? caught.message : "Failed to load session output.")
      })

    const unsubscribe = subscribe(sessionId, (chunk) => {
      if (!backfilled) {
        pendingChunks.push(chunk)
        return
      }
      terminal.write(chunk)
    })

    window.addEventListener("resize", fit)
    return () => {
      window.cancelAnimationFrame(rafId)
      controller.abort()
      window.removeEventListener("resize", fit)
      unsubscribe()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionId, subscribe])

  return (
    <div className={cn("relative h-56 min-h-56 overflow-hidden rounded-sm border border-white/10 bg-[#0b1020]", className)}>
      {error ? (
        <div className="absolute inset-x-0 top-0 z-10 border-b border-red-400/30 bg-red-950/90 px-3 py-2 font-mono text-[0.7rem] text-red-100">
          {error}
        </div>
      ) : null}
      <div ref={containerRef} className="h-full w-full p-2" />
    </div>
  )
}
