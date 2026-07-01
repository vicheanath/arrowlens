import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/utils/formatters"

/**
 * Inline, tinted notice for in-flow guidance (not a toast or a modal). Replaces
 * the hand-rolled `bg-amber-500/10 …` banners scattered across the app so every
 * caution/info/error note shares one tokenized style.
 */
const calloutVariants = cva(
  "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs [&_svg]:mt-0.5 [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        info: "border-accent-blue/30 bg-accent-blue/10 text-accent-blue",
        warning: "border-warning/30 bg-warning/10 text-warning",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
)

function Callout({
  className,
  variant,
  icon,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof calloutVariants> & { icon?: React.ReactNode }) {
  return (
    <div
      data-slot="callout"
      role="note"
      className={cn(calloutVariants({ variant }), className)}
      {...props}
    >
      {icon}
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  )
}

export { Callout, calloutVariants }
