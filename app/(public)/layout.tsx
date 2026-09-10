import type { ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/ui/logo";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-atmosphere">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-5 sm:px-6 lg:px-8">
          <Logo />
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="border-t border-border py-4">
        <div className="mx-auto flex w-full max-w-6xl justify-between px-5 text-xs text-muted sm:px-6 lg:px-8">
          <span>QueueLess</span>
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
        </div>
      </footer>
    </div>
  );
}
