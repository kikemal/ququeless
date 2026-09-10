import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

type LabelProps = ComponentPropsWithoutRef<"label">;

export function Label({ className, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-sm font-medium text-foreground",
        className,
      )}
      {...props}
    />
  );
}
