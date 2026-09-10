"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, type AuthActionState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = {};

type LoginFormProps = {
  nextPath?: string;
  authError?: string | null;
};

export function LoginForm({ nextPath, authError }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const error = state.error ?? authError ?? null;

  return (
    <form action={formAction} className="mt-8 space-y-5" noValidate>
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

      {error ? (
        <p
          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

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
          autoComplete="current-password"
          required
          disabled={pending}
          placeholder="••••••••"
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Log in"}
      </Button>

      <p className="text-sm text-muted">
        Need an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </form>
  );
}
