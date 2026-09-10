"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#for-businesses", label: "Businesses" },
  { href: "/#for-customers", label: "Customers" },
  { href: "/#features", label: "Features" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background animate-fade-in">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Logo />

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button href="/login" variant="ghost" size="md">
            Log in
          </Button>
          <Button href="/signup" variant="primary" size="md">
            Get started
          </Button>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-foreground md:hidden"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <span aria-hidden="true" className="flex flex-col gap-1.5">
            <span
              className={cn(
                "block h-0.5 w-5 bg-current transition-transform",
                open && "translate-y-2 rotate-45",
              )}
            />
            <span
              className={cn(
                "block h-0.5 w-5 bg-current transition-opacity",
                open && "opacity-0",
              )}
            />
            <span
              className={cn(
                "block h-0.5 w-5 bg-current transition-transform",
                open && "-translate-y-2 -rotate-45",
              )}
            />
          </span>
        </button>
      </Container>

      <div
        id={menuId}
        hidden={!open}
        className="border-t border-border bg-surface md:hidden"
      >
        <Container className="flex flex-col gap-1 py-4">
          <nav aria-label="Mobile primary" className="flex flex-col">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-3 text-base font-medium text-foreground"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-4">
            <Button href="/login" variant="secondary" className="w-full">
              Log in
            </Button>
            <Button href="/signup" className="w-full">
              Get started
            </Button>
          </div>
        </Container>
      </div>
    </header>
  );
}
