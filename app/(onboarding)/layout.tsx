import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/ui/logo";
import { getPrimaryBusiness } from "@/lib/auth/business";
import { requireAuthUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireAuthUser();
  const business = await getPrimaryBusiness(user.id);
  if (business) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-atmosphere">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <Logo href="/" />
          <Link
            href="/"
            className="text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Marketing site
          </Link>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
