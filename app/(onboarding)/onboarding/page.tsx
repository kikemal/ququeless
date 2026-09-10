import type { Metadata } from "next";

import { OnboardingForm } from "@/components/auth/onboarding-form";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Business setup",
};

export default function OnboardingPage() {
  return (
    <Container
      as="main"
      width="narrow"
      className="flex flex-1 flex-col justify-center py-16"
    >
      <div className="mx-auto w-full max-w-md">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-accent">
          Step 1 of 1
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-foreground">
          Set up your business
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Create your business profile. You will be assigned as the owner
          automatically—roles are managed securely by QueueLess, not by the
          browser.
        </p>

        <OnboardingForm />
      </div>
    </Container>
  );
}
