"use client";

import { useActionState } from "react";

import { createBusinessAction, type AuthActionState } from "@/app/(auth)/actions";
import { BUSINESS_TYPES } from "@/lib/business/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = {};

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(
    createBusinessAction,
    initialState,
  );

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
        <Label htmlFor="name">Business name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          disabled={pending}
          placeholder="ABC Beauty Salon"
        />
      </div>

      <div>
        <Label htmlFor="businessType">Business type</Label>
        <select
          id="businessType"
          name="businessType"
          required
          disabled={pending}
          defaultValue=""
          className="h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground transition-colors hover:border-foreground/20 focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30 disabled:cursor-not-allowed disabled:bg-background disabled:opacity-70"
        >
          <option value="" disabled>
            Select a type
          </option>
          {BUSINESS_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="phone">
          Phone <span className="font-normal text-muted">(optional)</span>
        </Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          disabled={pending}
          placeholder="+1 555 0100"
        />
      </div>

      <div>
        <Label htmlFor="email">
          Business email <span className="font-normal text-muted">(optional)</span>
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          disabled={pending}
          placeholder="hello@business.com"
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating business…" : "Create business"}
      </Button>
    </form>
  );
}
