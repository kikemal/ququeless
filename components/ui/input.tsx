import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

type InputProps = ComponentPropsWithoutRef<"input">;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground",
        "placeholder:text-muted/80",
        "transition-colors hover:border-foreground/20",
        "focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30",
        "disabled:cursor-not-allowed disabled:bg-background disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
}
