import type { ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/ui/logo";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Logo href="/admin" />
            <span className="rounded-md bg-accent-soft px-2 py-1 text-xs font-semibold tracking-wide text-accent uppercase">
              Admin
            </span>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            Marketing site
          </Link>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
