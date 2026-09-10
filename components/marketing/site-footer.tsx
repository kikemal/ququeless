import Link from "next/link";

import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";

const footerLinks = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/signup", label: "Get started" },
  { href: "/login", label: "Log in" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <Container className="flex flex-col gap-8 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Digital queues for walk-in businesses. Customers join from their
            phone—no app, no account.
          </p>
        </div>

        <nav aria-label="Footer">
          <ul className="flex flex-col gap-2 sm:items-end">
            {footerLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>

      <Container className="border-t border-border py-5">
        <p className="text-xs text-muted">
          © {new Date().getFullYear()} QueueLess. Built as a production-quality
          portfolio product.
        </p>
      </Container>
    </footer>
  );
}
