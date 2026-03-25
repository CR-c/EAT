/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide backdrop-blur-md",
  {
    variants: {
      variant: {
        default: "border-cyan-300/60 bg-cyan-400/12 text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200",
        secondary: "border-white/45 bg-white/55 text-slate-700 dark:border-white/10 dark:bg-white/8 dark:text-slate-200",
        destructive: "border-red-400/40 bg-red-400/12 text-red-700 dark:text-red-200",
        outline: "border-white/45 text-muted-foreground dark:border-white/10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ className, variant }))} {...props} />
}

export { Badge, badgeVariants }
