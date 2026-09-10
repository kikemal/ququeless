"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signupAction, type AuthActionState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = {};

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initialState);

  if (state.needsEmailConfirmation) {
    return (
      <div
        className="rounded-lg border border-border bg-accent-soft/40 p-5"
        role="status"
      >
        <h2 className="font-display text-lg font-semibold text-foreground">
          Confirm your email
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {state.message ??
            "We sent a confirmation link to your inbox. Confirm your email, then log in."}
        </p>
        <p className="mt-4 text-sm text-muted">
          <Link
            href="/login"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Go to log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-8 space-y-5" noValidate>
      {state.error ? (
        <p
          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      <div>
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          disabled={pending}
          placeholder="Alex Morgan"
        />
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          placeholder="you@business.com"
        />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={pending}
          placeholder="At least 8 characters"
        />
      </div>

      <div>
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={pending}
          placeholder="Repeat your password"
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
