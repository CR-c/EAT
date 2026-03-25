import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-2xl border border-white/55 bg-white/72 px-4 py-2 text-sm text-foreground shadow-sm backdrop-blur-xl transition-colors outline-none placeholder:text-muted-foreground/80 focus-visible:ring-2 focus-visible:ring-cyan-400/25 dark:border-white/10 dark:bg-white/6",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
