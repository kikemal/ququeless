import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Log in",
};

type LoginPageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const authError =
    params.error === "auth_callback"
      ? "Email confirmation failed or expired. Please try logging in or signing up again."
      : null;

  return (
    <Container
      as="main"
      width="narrow"
      className="flex flex-1 flex-col justify-center py-16"
    >
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Log in
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Access your QueueLess dashboard with your business account.
        </p>

        <LoginForm nextPath={params.next} authError={authError} />
      </div>
    </Container>
  );
}
