/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-lg shadow-cyan-400/20 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-cyan-400/25",
        secondary:
          "border border-white/40 bg-white/50 text-foreground backdrop-blur-xl hover:bg-white/70 dark:border-white/10 dark:bg-white/6 dark:hover:bg-white/10",
        ghost:
          "text-muted-foreground hover:bg-white/45 hover:text-foreground dark:hover:bg-white/8 dark:hover:text-foreground",
        destructive:
          "bg-destructive/12 text-destructive border border-destructive/30 hover:bg-destructive hover:text-destructive-foreground",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-12 px-5 text-sm",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return <Comp className={cn(buttonVariants({ className, size, variant }))} {...props} />
}

export { Button, buttonVariants }
