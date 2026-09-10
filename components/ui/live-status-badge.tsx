"use client";

import { liveStatusLabel, type LiveStatus } from "@/lib/realtime/channels";
import { cn } from "@/lib/utils";

type LiveStatusBadgeProps = {
  status: LiveStatus;
  className?: string;
};

export function LiveStatusBadge({ status, className }: LiveStatusBadgeProps) {
  const label = liveStatusLabel(status);
  if (!label) {
    return null;
  }

  return (
    <p
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        status === "live" ? "text-accent" : "text-muted",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-sm",
          status === "live" ? "bg-accent" : "bg-muted",
        )}
      />
      {label}
    </p>
  );
}
