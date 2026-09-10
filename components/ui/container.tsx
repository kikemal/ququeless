import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

type ContainerProps = ComponentPropsWithoutRef<"div"> & {
  as?: "div" | "section" | "main" | "header" | "footer" | "nav";
  width?: "default" | "narrow";
};

export function Container({
  as: Component = "div",
  width = "default",
  className,
  children,
  ...props
}: ContainerProps) {
  return (
    <Component
      className={cn(
        "mx-auto w-full px-5 sm:px-6 lg:px-8",
        width === "default" ? "max-w-6xl" : "max-w-3xl",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
