import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../utils/formatters";

interface LoadingSpinnerProps {
  size?: number;
  label?: string;
  className?: string;
  fullPage?: boolean;
}

export function LoadingSpinner({
  size = 20,
  label,
  className,
  fullPage = false,
}: LoadingSpinnerProps) {
  const inner = (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <Loader2 size={size} className="animate-spin text-accent-blue" />
      {label && <span className="text-sm text-text-muted">{label}</span>}
    </div>
  );

  if (fullPage) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-surface-0/60 backdrop-blur-sm z-10">
        {inner}
      </div>
    );
  }
  return inner;
}
