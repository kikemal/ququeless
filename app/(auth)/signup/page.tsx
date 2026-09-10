import type { Metadata } from "next";
import Link from "next/link";

import { SignupForm } from "@/components/auth/signup-form";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Sign up",
};

export default function SignupPage() {
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
          Sign up to set up your business and start managing digital queues.
        </p>

        <SignupForm />

        <p className="mt-6 text-sm text-muted">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>
    </Container>
  );
}
