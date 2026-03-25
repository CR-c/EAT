import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-[1.5rem] border border-white/55 bg-white/72 px-4 py-3 text-sm text-foreground shadow-sm backdrop-blur-xl transition-colors outline-none placeholder:text-muted-foreground/80 focus-visible:ring-2 focus-visible:ring-cyan-400/25 dark:border-white/10 dark:bg-white/6",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
