import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-transparent bg-background px-3 py-1.5 text-sm text-foreground border-shadow outline-none transition-shadow placeholder:text-muted-foreground/80 focus:border-shadow ring-2 ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }