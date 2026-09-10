import type { ReactNode } from "react";

import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";

type PhasePlaceholderProps = {
  title: string;
  description: string;
  phase?: string;
  children?: ReactNode;
  className?: string;
};

export function PhasePlaceholder({
  title,
  description,
  phase = "a later phase",
  children,
  className,
}: PhasePlaceholderProps) {
  return (
    <Container
      as="main"
      width="narrow"
      className={cn("flex flex-1 flex-col justify-center py-16 sm:py-24", className)}
    >
      <p className="mb-3 text-sm font-medium uppercase tracking-[0.14em] text-accent">
        Coming in {phase}
      </p>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h1>
      <p className="mt-4 max-w-prose text-base leading-relaxed text-muted sm:text-lg">
        {description}
      </p>
      {children ? <div className="mt-8">{children}</div> : null}
    </Container>
  );
}
