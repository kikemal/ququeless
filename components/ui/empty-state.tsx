import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * Shared dashed empty-state shell for dashboard surfaces (Phase 18).
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center",
        className,
      )}
      role="status"
    >
      <h2 className="font-display text-xl font-semibold text-foreground">
        {title}
      </h2>
      {description ? (
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">
          {description}
        </p>
      ) : null}
      {action ? (
        <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>
      ) : null}
    </div>
  );
}
