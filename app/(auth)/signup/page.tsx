import type { Metadata } from "next";
import Link from "next/link";

import { SignupForm } from "@/components/auth/signup-form";
import { Container } from "@/components/ui/container";
import { getSafeAuthRedirect } from "@/lib/auth/redirect";

export const metadata: Metadata = {
  title: "Sign up",
};

type SignupPageProps = {
  searchParams: Promise<{ next?: string; email?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const nextPath = getSafeAuthRedirect(params.next) ?? undefined;
  const defaultEmail =
    typeof params.email === "string" && params.email.includes("@")
      ? params.email.trim().toLowerCase()
      : undefined;

  const loginHref = nextPath
    ? `/login?next=${encodeURIComponent(nextPath)}`
    : "/login";

  return (
    <Container
      as="main"
      width="narrow"
      className="flex flex-1 flex-col justify-center py-16"
    >
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Create your account
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          {nextPath?.startsWith("/invite/")
            ? "Create an account with the invited email to join the team."
            : "Sign up to set up your business and start managing digital queues."}
        </p>

        <SignupForm nextPath={nextPath} defaultEmail={defaultEmail} />

        <p className="mt-6 text-sm text-muted">
          Already have an account?{" "}
          <Link
            href={loginHref}
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>
    </Container>
  );
}
