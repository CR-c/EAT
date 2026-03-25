import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-2xl bg-slate-200/70 dark:bg-white/10", className)} {...props} />
}

export { Skeleton }
