"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { logoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/queues", label: "Queues" },
  { href: "/dashboard/services", label: "Services" },
  { href: "/dashboard/history", label: "History" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/qr", label: "QR Code" },
  { href: "/dashboard/team", label: "Team" },
  { href: "/dashboard/settings", label: "Settings" },
] as const;

type DashboardShellProps = {
  businessName: string;
  userName: string;
  userEmail: string;
  children: React.ReactNode;
};

export function DashboardShell({
  businessName,
  userName,
  userEmail,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !mobileOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setMobileOpen(false);
      }
    };

    const onPointerDown = (event: MouseEvent) => {
      if (menuOpen && !menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [menuOpen, mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  function closeOverlays() {
    setMobileOpen(false);
    setMenuOpen(false);
  }

  return (
    <div className="flex min-h-full flex-1 bg-background">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:flex lg:flex-col">
        <div className="border-b border-border px-5 py-5">
          <Logo href="/dashboard" />
          <p className="mt-3 truncate text-sm font-medium text-foreground">
            {businessName}
          </p>
        </div>
        <nav aria-label="Dashboard" className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeOverlays}
                className={cn(
                  "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:bg-background hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-surface">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:hidden"
                aria-expanded={mobileOpen}
                aria-controls="mobile-dashboard-nav"
                onClick={() => setMobileOpen((value) => !value)}
              >
                <span className="sr-only">
                  {mobileOpen ? "Close navigation" : "Open navigation"}
                </span>
                <span aria-hidden="true" className="flex flex-col gap-1.5">
                  <span className="block h-0.5 w-5 bg-foreground" />
                  <span className="block h-0.5 w-5 bg-foreground" />
                  <span className="block h-0.5 w-5 bg-foreground" />
                </span>
              </button>
              <div className="min-w-0 lg:hidden">
                <Logo href="/dashboard" className="text-lg" />
                <p className="truncate text-xs text-muted">{businessName}</p>
              </div>
              <p className="hidden truncate text-sm font-medium text-foreground lg:block">
                {businessName}
              </p>
            </div>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                className="inline-flex max-w-[12rem] items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:max-w-xs"
                aria-expanded={menuOpen}
                aria-controls={menuId}
                onClick={() => setMenuOpen((value) => !value)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {userName}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {userEmail}
                  </span>
                </span>
              </button>

              {menuOpen ? (
                <div
                  id={menuId}
                  role="menu"
                  className="absolute right-0 mt-2 w-64 rounded-lg border border-border bg-surface p-2"
                >
                  <div className="border-b border-border px-3 py-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {userName}
                    </p>
                    <p className="truncate text-xs text-muted">{userEmail}</p>
                    <p className="mt-1 truncate text-xs text-muted">
                      {businessName}
                    </p>
                  </div>
                  <form action={logoutAction} className="pt-2">
                    <Button
                      type="submit"
                      variant="ghost"
                      className="w-full justify-start"
                    >
                      Log out
                    </Button>
                  </form>
                </div>
              ) : null}
            </div>
          </div>

          {mobileOpen ? (
            <nav
              id="mobile-dashboard-nav"
              aria-label="Dashboard mobile"
              className="border-t border-border px-3 py-3 lg:hidden"
            >
              <ul className="space-y-1">
                {navItems.map((item) => {
                  const active =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname === item.href ||
                        pathname.startsWith(`${item.href}/`);

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={closeOverlays}
                        className={cn(
                          "block rounded-lg px-3 py-2.5 text-sm font-medium",
                          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                          active
                            ? "bg-accent-soft text-accent"
                            : "text-muted hover:bg-background hover:text-foreground",
                        )}
                        aria-current={active ? "page" : undefined}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}
        </header>

        <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </div>
    </div>
  );
}
